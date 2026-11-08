// The framing probe: drives the existing `wl conformance` scenario for one client and keeps only
// its report and redacted diagnostics, so the probe adds no judgement of its own.
import { spawn } from 'node:child_process'
import { isObject } from '../../../src/config/schema.js'

export interface FramingResult {
  status: 'PASS' | 'FAIL' | 'BLOCKED'
  reasons: string[]
  run?: string
  report?: Record<string, unknown>
  diagnostics?: Record<string, unknown>
}

function wl(core: string, args: string[], timeoutMs: number, signal?: AbortSignal) {
  return new Promise<{ code: number | null; stdout: string }>((resolve) => {
    const child = spawn(process.execPath, [core, ...args], {
      shell: false,
      stdio: ['ignore', 'pipe', 'ignore'],
      ...(signal ? { signal } : {}),
    })
    const chunks: Buffer[] = []
    let bytes = 0
    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length
      if (bytes <= 4 * 1024 * 1024) chunks.push(chunk)
    })
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs)
    child.once('error', () => resolve({ code: null, stdout: '' }))
    child.once('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout: Buffer.concat(chunks).toString('utf8') })
    })
  })
}
const json = (text: string) => {
  try {
    const value: unknown = JSON.parse(text)
    return isObject(value) ? value : undefined
  } catch {
    return
  }
}

/** Map the conformance verdict without reinterpreting it: only PASS with live evidence passes. */
export function framingStatus(
  report: Record<string, unknown> | undefined,
): FramingResult['status'] {
  if (!report || report.status === 'UNRUN') return 'BLOCKED'
  return report.status === 'PASS' && report.evidence === 'live-process-and-journal'
    ? 'PASS'
    : 'FAIL'
}

export async function framingProbe(options: {
  core: string
  client: string
  version: string
  timeoutMs: number
  signal?: AbortSignal
}): Promise<FramingResult> {
  const prepared = json(
    (
      await wl(
        options.core,
        ['conformance', 'prepare', '--target', options.client, '--pin', options.version, '--json'],
        60000,
        options.signal,
      )
    ).stdout,
  )
  const run = typeof prepared?.id === 'string' ? prepared.id : undefined
  if (!run)
    return { status: 'BLOCKED', reasons: ['wl conformance prepare did not return a run ID.'] }
  const report = json(
    (
      await wl(
        options.core,
        ['conformance', 'run', run, '--live', '--timeout', String(options.timeoutMs), '--json'],
        options.timeoutMs + 60000,
        options.signal,
      )
    ).stdout,
  )
  const status = framingStatus(report)
  const diagnostics =
    status === 'PASS'
      ? undefined
      : json(
          (
            await wl(
              options.core,
              ['conformance', 'diagnose', run, '--json'],
              60000,
              options.signal,
            )
          ).stdout,
        )
  const missing = Array.isArray(report?.missing) ? report.missing : []
  return {
    status,
    run,
    reasons:
      status === 'PASS'
        ? ['The live scenario passed with process and journal evidence.']
        : status === 'BLOCKED'
          ? ['The scenario did not run; see the diagnostics categories.']
          : [
              `The scenario failed${missing.length ? `; missing events: ${missing.join(', ')}` : ''}.`,
            ],
    ...(report ? { report } : {}),
    ...(diagnostics ? { diagnostics } : {}),
  }
}
