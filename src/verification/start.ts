// A known startup failure is not a code verdict; unknown interrupted intents remain ambiguous.
import { stripVTControlCharacters } from 'node:util'
import type { SuiteResult } from './contracts.js'

export interface SuiteStartFailure {
  run: string
  round: number
  unchanged: true
  commands: SuiteResult['commands']
  cause: { ref: string; executable: string; code: string }
}

export class SuiteStartError extends Error {
  constructor(readonly failure: SuiteStartFailure) {
    super(
      `Suite command ${failure.cause.ref} (${failure.cause.executable}) could not start: ${failure.cause.code}. No evaluation round was spent. Fix the environment and request a new verify plan; the recorded intent will not run again.`,
    )
  }
}

export function startupCode(
  receipt: SuiteResult['commands'][number],
  spawnCode?: string,
): string | undefined {
  if (receipt.signal) return undefined
  if (spawnCode) return spawnCode
  if (receipt.exitCode === 126) return 'not executable (exit 126)'
  if (receipt.exitCode === 127) return 'command not found (exit 127)'
  return undefined
}

export function validStartupFailure(failure: SuiteStartFailure): boolean {
  const last = failure.commands.at(-1)
  return (
    !!last &&
    failure.unchanged === true &&
    !last.signal &&
    last.ref === failure.cause.ref &&
    (last.exitCode < 0
      ? /^(?:E[A-Z0-9_]+|SPAWN_ERROR)$/.test(failure.cause.code)
      : startupCode(last) === failure.cause.code && [126, 127].includes(last.exitCode))
  )
}

/** Output stays transient, including bounded finding excerpts; journals keep hashes only. */
export function suiteOutputTail(output: readonly { stdout: string; stderr: string }[]): string {
  const last = output.at(-1)
  if (!last) return ''
  return stripVTControlCharacters(`${last.stdout}\n${last.stderr}`)
    .replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu, (character) => (character === '\n' ? '\n' : ' '))
    .split('\n')
    .slice(-20)
    .join('\n')
    .trim()
    .slice(-2048)
}

export function namedSuiteHashes(commands: SuiteResult['commands']) {
  return commands.map(({ stdout, stderr, ...command }) => ({
    ...command,
    stdoutSha256: stdout,
    stderrSha256: stderr,
  }))
}
