// Reads a native client's subscription usage window before dispatch, where the client reports one
// without a model call (ADR-0209). Only the listed clients have a signal; every other one stays unknown.
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

/** Exhausted windows name their reset; unknown means "no signal", never "available". */
export type NativeUsageWindow =
  | { state: 'available' }
  | { state: 'exhausted'; resetsAt: string }
  | { state: 'unknown' }

export interface NativeUsageWindowClient {
  target: string
  client: string
  /** The signed-in client home. API-key accounts have no subscription window to read. */
  store: string
}
export type NativeUsageWindowReader = (
  client: Readonly<NativeUsageWindowClient>,
  signal: AbortSignal,
) => Promise<NativeUsageWindow>

interface CodexWindow {
  usedPercent?: unknown
  resetsAt?: unknown
}
/**
 * Codex's `account/rateLimits/read` result (0.166.0): a primary and an optional
 * secondary window, each with a used percentage and a reset in epoch seconds,
 * plus the kind of limit already reached, if any. A window at 100 percent, or a
 * reached limit, is exhausted until the latest reset among the full windows.
 */
export function codexUsageWindow(result: unknown): NativeUsageWindow {
  if (typeof result !== 'object' || result === null) return { state: 'unknown' }
  const limits = (result as { rateLimits?: unknown }).rateLimits
  if (typeof limits !== 'object' || limits === null) return { state: 'unknown' }
  const { primary, secondary, rateLimitReachedType } = limits as {
    primary?: CodexWindow | null
    secondary?: CodexWindow | null
    rateLimitReachedType?: unknown
  }
  const windows = [primary, secondary].filter(
    (window): window is CodexWindow =>
      typeof window === 'object' &&
      window !== null &&
      typeof window.usedPercent === 'number' &&
      typeof window.resetsAt === 'number' &&
      Number.isFinite(window.resetsAt),
  )
  if (!windows.length) return { state: 'unknown' }
  const reached = rateLimitReachedType !== null && rateLimitReachedType !== undefined,
    full = windows.filter((window) => (window.usedPercent as number) >= 100)
  if (!full.length && !reached) return { state: 'available' }
  // A reached limit without a full window names no reset of its own; wait for the latest one.
  const resets = (full.length ? full : windows).map((window) => window.resetsAt as number)
  return { state: 'exhausted', resetsAt: new Date(Math.max(...resets) * 1000).toISOString() }
}

/**
 * Starts the client's app server, asks only for its rate limits and stops it.
 * No thread or turn starts, so no model is called. Any failure is unknown.
 */
export const readCodexUsageWindow: NativeUsageWindowReader = (client, signal) =>
  new Promise((resolve) => {
    if (signal.aborted) return resolve({ state: 'unknown' })
    const child = spawn(client.client, ['app-server'], {
      shell: false,
      stdio: ['pipe', 'pipe', 'ignore'],
      env: {
        PATH: '/usr/bin:/bin',
        HOME: process.env.HOME ?? client.store,
        CODEX_HOME: client.store,
        LANG: 'C',
      },
    })
    let settled = false
    const finish = (window: NativeUsageWindow) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      child.kill()
      resolve(window)
    }
    const abort = () => finish({ state: 'unknown' })
    const timer = setTimeout(abort, 15000)
    signal.addEventListener('abort', abort, { once: true })
    child.once('error', abort)
    child.once('close', abort)
    const send = (message: object) => child.stdin.write(`${JSON.stringify(message)}\n`)
    createInterface({ input: child.stdout }).on('line', (line) => {
      let message: { id?: unknown; result?: unknown }
      try {
        message = JSON.parse(line)
      } catch {
        return finish({ state: 'unknown' })
      }
      if (message.id === 1) {
        send({ method: 'initialized' })
        send({ id: 2, method: 'account/rateLimits/read', params: {} })
      } else if (message.id === 2) finish(codexUsageWindow(message.result))
    })
    send({
      id: 1,
      method: 'initialize',
      params: { clientInfo: { name: 'wholeloop-usage-window', version: '1' } },
    })
  })

/** Clients with a verified no-model window signal. Claude Code has none (2.1.319). */
export const NATIVE_USAGE_WINDOW_READERS: Readonly<Record<string, NativeUsageWindowReader>> = {
  codex: readCodexUsageWindow,
}
