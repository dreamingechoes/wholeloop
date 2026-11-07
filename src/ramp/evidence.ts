// Collects flag and check observations into a ramp evidence window.
import { isObject } from '../config/schema.js'
import type { Registry } from '../providers/load.js'
import { numericEvidence, safeEvidenceReference } from '../providers/numeric.js'
import { type ProviderHost, performOperation } from '../providers/operations.js'
import {
  type CheckObservation,
  type FlagObservation,
  queryDigest,
  type RampEvidence,
  type RampPlan,
  satisfies,
} from './contracts.js'

export function observationTime(at = new Date().toISOString()) {
  if (
    !/^\d{4}-\d\d-\d\dT.+(?:Z|[+-]\d\d:\d\d)$/.test(at) ||
    !Number.isFinite(Date.parse(at)) ||
    Date.parse(at) > Date.now()
  )
    throw new Error('Use a valid historical timestamp with timezone for the evidence window end')
  return new Date(at).toISOString()
}
export async function flagEvidence(
  plan: RampPlan,
  registry: Registry,
  providerId: string | undefined,
  host: ProviderHost,
): Promise<FlagObservation> {
  if (!plan.flag)
    return { status: 'manual', environment: plan.environment, ref: 'manual-exposure-control' }
  const unknown = (missing: string): FlagObservation => ({
    status: 'unknown',
    flag: plan.flag ?? '',
    environment: plan.environment,
    ref: 'unavailable',
    missing,
  })
  const provider = registry.providers.find(
    (entry) => entry.manifest.id === providerId && entry.manifest.operations['flags.read-state'],
  )
  if (!provider)
    return unknown('No configured provider can read the named flag; its exposure is unknown')
  try {
    const result = await performOperation(
      provider,
      'flags.read-state',
      { flag: plan.flag, environment: plan.environment },
      host,
    )
    if (
      result.status !== 'succeeded' ||
      !result.complete ||
      !result.body ||
      !result.revision?.trim() ||
      !safeEvidenceReference(result.ref)
    )
      return unknown('Flag state did not return a complete revision-bound observation')
    const value: unknown = JSON.parse(result.body)
    if (
      !isObject(value) ||
      value.flag !== plan.flag ||
      value.environment !== plan.environment ||
      typeof value.enabled !== 'boolean' ||
      typeof value.exposure !== 'number' ||
      !Number.isFinite(value.exposure) ||
      value.exposure < 0 ||
      value.exposure > 100 ||
      typeof value.audience !== 'string' ||
      !value.audience.trim()
    )
      return unknown(
        'Flag identity/environment or exposure fields are missing; no current state was inferred',
      )
    return {
      status: 'observed',
      flag: plan.flag,
      environment: plan.environment,
      ref: result.ref,
      revision: result.revision,
      enabled: value.enabled,
      exposure: value.exposure,
      audience: value.audience,
    }
  } catch {
    return unknown('Flag read failed; verify permissions and normalization in the host')
  }
}
export async function collectRampEvidence(
  run: string,
  plan: RampPlan,
  stage: number,
  registry: Registry,
  flagsProvider: string | undefined,
  owner: string,
  host: ProviderHost,
  at?: string,
  exposureSince?: string,
): Promise<RampEvidence> {
  const end = observationTime(at)
  const target = plan.stages[stage]
  if (!target) throw new Error('Ramp has no remaining stage')
  const readChecks = Promise.all(
    target.checks.map(async (check): Promise<CheckObservation> => {
      const window = {
        start: new Date(Date.parse(end) - Math.round(check.lookbackHours * 3600000)).toISOString(),
        end,
        timezone: check.timezone,
      }
      const provider = registry.providers.find((entry) => entry.manifest.id === check.provider)
      if (exposureSince && Date.parse(window.start) < Date.parse(exposureSince))
        return {
          key: check.key,
          provider: check.provider,
          operation: check.operation,
          query: check.query,
          queryDigest: queryDigest(check.query),
          window,
          unit: check.unit,
          status: 'unknown',
          missing: `The lookback starts before the confirmed exposure; wait until ${new Date(Date.parse(exposureSince) + Math.round(check.lookbackHours * 3600000)).toISOString()}`,
        }
      const scalar = await numericEvidence(
        provider,
        { operation: check.operation, query: check.query, owner, window },
        check.unit,
        host,
      )
      const row = {
        key: check.key,
        provider: check.provider,
        operation: check.operation,
        query: check.query,
        queryDigest: queryDigest(check.query),
        window,
        unit: check.unit,
      }
      return scalar.status === 'observed'
        ? {
            ...row,
            status: satisfies(scalar.value, check.operator, check.threshold) ? 'pass' : 'fail',
            value: scalar.value,
            ref: scalar.ref,
            bodyDigest: scalar.bodyDigest,
          }
        : { ...row, status: 'unknown', missing: scalar.missing ?? 'No observed scalar' }
    }),
  )
  const [flag, checks] = await Promise.all([
    flagEvidence(plan, registry, flagsProvider, host),
    readChecks,
  ])
  return { run, stage, at: end, flag, checks }
}
