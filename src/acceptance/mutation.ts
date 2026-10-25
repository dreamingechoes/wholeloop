import { contractDigest } from '../contracts/compatibility.js'
import { acceptanceShape } from './contracts.js'
import type { DockerBehaviorRuntime } from './docker-runtime.js'
import type { PrivateAcceptancePlan } from './private-input.js'
import schema from './schemas/mutation-counters-v1.json' with { type: 'json' }

export const MUTATION_COUNTER_SCHEMA = schema
export interface MutationCounters {
  schema: 'wholeloop/mutation-counters@1'
  engine: string
  version: string
  complete: true
  total: number
  killed: number
  survived: number
  timedOut: number
  uncovered: number
  errors: number
}
/** These counters are reported by a repository-native tool, not an independent semantic proof. */
export function mutationCounters(value: unknown): MutationCounters {
  acceptanceShape(value, schema)
  const report = value as MutationCounters
  if (
    report.total !==
    report.killed + report.survived + report.timedOut + report.uncovered + report.errors
  )
    throw new Error('Inconsistent mutation counters')
  return structuredClone(report)
}
export async function observeMutation(
  runtime: DockerBehaviorRuntime,
  selection: PrivateAcceptancePlan['sensitivity']['mutation'],
) {
  if (!selection)
    return {
      status: 'unavailable' as const,
      reason: 'not-declared',
      semanticSensitivity: 'unknown' as const,
    }
  if (
    !runtime.recipe.commands.some(
      (c) => c.id === selection.command && c.service === selection.service && c.phase === 'test',
    )
  )
    return {
      status: 'unavailable' as const,
      reason: 'native-command-unavailable',
      semanticSensitivity: 'unknown' as const,
    }
  // Once dispatched, an uncertain optional command still fences recovery; do not swallow it as an absent capability.
  const result = await runtime.command(selection.service, selection.command, '', 120000)
  let reported: MutationCounters | undefined
  try {
    reported = mutationCounters(JSON.parse(result.application.stdout))
  } catch {}
  return {
    status: 'observed' as const,
    reason:
      result.application.code !== 0
        ? 'native-command-failed'
        : !reported
          ? 'native-report-unavailable'
          : reported.total === 0
            ? 'native-report-has-no-mutants'
            : 'native-counters-reported',
    semanticSensitivity: 'unknown' as const,
    reportOrigin: 'repository-reported' as const,
    command: selection,
    applicationExit: result.application.code,
    execution: result.execution,
    ...(result.process ? { process: result.process } : {}),
    stdout: contractDigest(result.application.stdout),
    stderr: contractDigest(result.application.stderr),
    ...(reported ? { reported } : {}),
  }
}
