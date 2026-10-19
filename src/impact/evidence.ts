import { createHash } from 'node:crypto'
import { isObject } from '../config/schema.js'
import type { Registry } from '../providers/load.js'
import { numericEvidence, safeEvidenceReference } from '../providers/numeric.js'
import type { ProviderHost } from '../providers/operations.js'
import { querySource } from '../providers/sources.js'
import { type ImpactObservation, type ImpactPlan, impactWindow } from './contracts.js'

/** The core fixes all source queries; independent source reads may run concurrently. */
export async function collectImpact(
  plan: ImpactPlan,
  registry: Registry,
  owner: string,
  host: ProviderHost,
) {
  const metrics = Promise.all(
    plan.source.plan.metrics.map(async (metric): Promise<ImpactObservation> => {
      const window = impactWindow(plan.at, metric.window.days, metric.window.timezone)
      const provider = registry.providers.find(
        (entry) => entry.manifest.id === metric.source.provider,
      )
      const result = await numericEvidence(
        provider,
        { ...metric.source, owner, window },
        metric.unit,
        host,
      )
      const { unit, ...observed } = result
      return { id: metric.id, window, unit, ...observed }
    }),
  )
  const qualitative = Promise.all(
    plan.qualitative.map(async (query): Promise<ImpactObservation> => {
      const window = impactWindow(plan.at, query.days, query.timezone)
      const row = { id: query.id, window }
      const missing = (reason: string): ImpactObservation => ({
        ...row,
        status: 'unknown',
        missing: reason,
      })
      const provider = registry.providers.find((entry) => entry.manifest.id === query.provider)
      if (!provider)
        return missing(
          'The qualitative source provider is unavailable; confirm access with the owner',
        )
      try {
        const result = await querySource(
          provider,
          { operation: query.operation, query: query.query, owner, window },
          host,
        )
        if (result.status !== 'observed' || !result.evidence)
          return missing(result.question?.missing ?? 'No qualitative observation')
        const { content, ref } = result.evidence
        if (content.length > 16384 || !safeEvidenceReference(ref))
          return missing(
            'Qualitative output/reference is incompatible; request a bounded sanitized quote',
          )
        const data: unknown = JSON.parse(content)
        if (!isObject(data) || typeof data.text !== 'string' || !data.text.trim())
          return missing('No normalized qualitative text observation')
        return {
          ...row,
          status: 'observed',
          text: data.text,
          ref,
          bodyDigest: createHash('sha256').update(content).digest('hex'),
        }
      } catch {
        return missing('No normalized qualitative text observation')
      }
    }),
  )
  const [metricRows, qualitativeRows] = await Promise.all([metrics, qualitative])
  return { run: plan.run, metrics: metricRows, qualitative: qualitativeRows }
}
