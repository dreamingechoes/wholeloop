import { isObject, validate } from '../config/schema.js'
import { type Criterion, parseCriteria } from '../definition/criteria.js'
import type { CommandAsset } from '../discovery/types.js'
import schema from './schemas/suite-v1.json' with { type: 'json' }

export interface SuitePlan {
  commands: CommandAsset[]
  timeoutMs: number
}
export interface SuiteResult {
  status: 'passed' | 'failed' | 'interrupted'
  commands: { ref: string; exitCode: number; signal: string; stdout: string; stderr: string }[]
  unchanged: boolean
}
export type VerificationEventData =
  | { type: 'verify.agreed'; data: { criteria: Criterion[]; by: string; source: string } }
  | { type: 'verify.suite-planned'; data: { run: string; round: number; plan: SuitePlan } }
  | { type: 'verify.suite-finished'; data: { run: string; round: number; result: SuiteResult } }
export function validVerificationData(type: string, data: Record<string, unknown>): boolean {
  try {
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
