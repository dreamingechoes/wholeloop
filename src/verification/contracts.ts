// Suite plans, results and verification events.
import { isObject, validate } from '../config/schema.js'
import { type Criterion, parseCriteria } from '../definition/criteria.js'
import type { CommandAsset } from '../discovery/types.js'
import executionSchema from './schemas/execution-v1.json' with { type: 'json' }
import setupSchema from './schemas/setup-v1.json' with { type: 'json' }
import startSchema from './schemas/start-v1.json' with { type: 'json' }
import schema from './schemas/suite-v1.json' with { type: 'json' }
import type { SuiteStartFailure } from './start.js'

export interface SuitePlan {
  commands: CommandAsset[]
  timeoutMs: number
}
export interface SuiteResult {
  status: 'passed' | 'failed' | 'interrupted'
  commands: { ref: string; exitCode: number; signal: string; stdout: string; stderr: string }[]
  unchanged: boolean
}
/** Where a supervised suite ran, written with its intent so a crash cannot lose it (ADR-0257). */
export interface SuiteExecution {
  run: string
  round: number
  isolation: 'docker' | 'host'
  source: 'default' | 'run' | 'repository'
  image?: string
  imageId?: string
}
/** A round whose container ran, or reused, a declared setup with network (ADR-0260). */
export interface SuiteSetup {
  run: string
  round: number
  argv: string[]
  network: 'bridge'
  ran: boolean
}
export type VerificationEventData =
  | { type: 'verify.agreed'; data: { criteria: Criterion[]; by: string; source: string } }
  | { type: 'verify.suite-planned'; data: { run: string; round: number; plan: SuitePlan } }
  | { type: 'verify.suite-finished'; data: { run: string; round: number; result: SuiteResult } }
  | { type: 'verify.suite-unavailable'; data: SuiteStartFailure }
  | { type: 'verify.suite-execution'; data: SuiteExecution }
  | { type: 'verify.suite-setup'; data: SuiteSetup }
export function validVerificationData(type: string, data: Record<string, unknown>): boolean {
  try {
    if (type === 'verify.suite-unavailable') return !validate(data, startSchema).length
    if (type === 'verify.suite-setup') return !validate(data, setupSchema).length
    if (type === 'verify.suite-execution')
      return (
        !validate(data, executionSchema).length &&
        (data.isolation === 'docker'
          ? typeof data.image === 'string' && typeof data.imageId === 'string'
          : data.image === undefined && data.imageId === undefined)
      )
    if (type === 'verify.agreed') {
      if (
        Object.keys(data).some((key) => !['criteria', 'by', 'source'].includes(key)) ||
        typeof data.by !== 'string' ||
        !data.by.trim() ||
        typeof data.source !== 'string' ||
        !data.source.trim()
      )
        return false
      parseCriteria({ schema: 'wholeloop/criteria@1', criteria: data.criteria })
      return true
    }
    const rule = Object.entries(schema.properties).find(([key]) => key === type)?.[1]
    return !!rule && !validate(data, rule).length
  } catch {
    return false
  }
}
export function verificationCriteria(
  events: readonly { subject: string; type: string; data: unknown }[],
  subject: string,
): Criterion[] | undefined {
  const entry = [...events]
    .reverse()
    .find((event) => event.subject === subject && event.type === 'verify.agreed')
  return isObject(entry?.data)
    ? parseCriteria({ schema: 'wholeloop/criteria@1', criteria: entry.data.criteria })
    : undefined
}
