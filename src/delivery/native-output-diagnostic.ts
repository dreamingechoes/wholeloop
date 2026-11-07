// Classifies rejected native output without keeping its text.
import { workerProposalFailure } from './worker-proposal.js'
import { WorkerProtocolError } from './worker-protocol.js'

const PHASES = ['frame', 'proposal', 'result', 'execution'] as const
export type NativeOutputPhase = (typeof PHASES)[number]
const PROBLEMS = new Set([
  'output-limit',
  'output-encoding',
  'truncated-or-invalid-output',
  'invalid-or-unsafe-shape',
  'invalid-or-unsafe-proposal',
  'invalid-or-unsafe-proposal-artifact',
  'result-identity',
  'result-scope',
  'unknown-evidence',
  'output-overwrites-input',
  'artifact-boundary',
  'output-artifact-limit',
  'unobserved-output-artifact',
  'changed-output-artifact',
  'unobserved-success',
  'execution-time',
  'unobserved-boundary',
])

/** Private diagnostics classify rejected bytes; they retain no response or exception text. */
export function nativeOutputDiagnostic(
  assignment: string,
  stdout: string,
  phase: NativeOutputPhase,
  error: unknown,
) {
  if (
    !/^[a-f0-9]{64}$/.test(assignment) ||
    !/^[a-f0-9]{64}$/.test(stdout) ||
    !PHASES.includes(phase)
  )
    throw new Error('Invalid native diagnostic binding')
  const detail = phase === 'proposal' ? workerProposalFailure(error) : undefined
  return {
    schema: 'wholeloop/native-output-diagnostic@1',
    assignment,
    stdout,
    phase,
    problem:
      error instanceof WorkerProtocolError && PROBLEMS.has(error.problem)
        ? error.problem
        : 'unclassified',
    ...(detail ? { detail } : {}),
  }
}
