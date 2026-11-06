import { createHash } from 'node:crypto'
import { request } from 'node:http'
import type { DockerCallOptions, DockerResult } from './docker-command.js'

/**
 * Read-only Docker Engine queries answered in this process (ADR-0244).
 *
 * Only container, volume and network inspection by identifier is served: an
 * object that lives on another daemon answers 404 and takes the CLI path. Each request uses the endpoint and
 * API version that this transport's own Docker CLI reported during preflight, so the returned objects are
 * the ones the CLI would print. Anything else, and every response that is not a
 * complete 200, returns undefined so the caller runs the original CLI path with
 * its original failure semantics. Docker's configuration files are never read.
 */
export interface EngineTarget {
  socket: string
  version: string
}
const INSPECTED = {
  container: '/containers/%s/json',
  volume: '/volumes/%s',
  network: '/networks/%s',
}
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/

export function engineRequests(
  args: readonly string[],
): { paths: string[]; render(values: unknown[]): string | undefined } | undefined {
  // Daemon identity (info) always goes through the CLI: it guards effects and
  // must observe the daemon the CLI targets now, not a socket learned earlier.
  const kind = args[0] as keyof typeof INSPECTED
  if (!(kind in INSPECTED) || args[1] !== 'inspect') return undefined
  const ids = args.slice(2)
  if (!ids.length || ids.length > 16 || ids.some((id) => !IDENTIFIER.test(id))) return undefined
  return {
    paths: ids.map((id) => INSPECTED[kind].replace('%s', encodeURIComponent(id))),
    render: (values) => `${JSON.stringify(values)}\n`,
  }
}

/**
 * Learn the endpoint and negotiated API version from this transport's own
 * owned preflight answers, never from Docker's files or an extra launch.
 */
export function observeEngineTarget(
  args: readonly string[],
  stdout: string,
  current: Partial<EngineTarget>,
): Partial<EngineTarget> {
  let value: unknown
  try {
    value = JSON.parse(stdout)
  } catch {
    return current
  }
  if (args.join('\0') === 'context\0inspect\0--format\0{{json .Endpoints.docker.Host}}')
    return typeof value === 'string' && value.startsWith('unix:///') && !/[\r\n\0]/.test(value)
      ? { ...current, socket: value.slice('unix://'.length) }
      : current.version
        ? { version: current.version }
        : {}
  if (args.join('\0') === 'version\0--format\0{{json .}}') {
    const version = (value as { Client?: { ApiVersion?: unknown } } | null)?.Client?.ApiVersion
    return typeof version === 'string' && /^\d+\.\d+$/.test(version)
      ? { ...current, version }
      : current.socket
        ? { socket: current.socket }
        : {}
  }
  return current
}

function get(
  target: EngineTarget,
  path: string,
  limit: number,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<Buffer | undefined> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(undefined)
      return
    }
    let settled = false
    const finish = (value: Buffer | undefined) => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', abort)
      clearTimeout(timer)
      resolve(value)
    }
    const call = request(
      { socketPath: target.socket, path: `/v${target.version}${path}`, method: 'GET' },
      (response) => {
        const chunks: Buffer[] = []
        let size = 0
        response.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > limit) {
            call.destroy()
            finish(undefined)
          } else chunks.push(chunk)
        })
        response.on('end', () =>
          finish(
            response.statusCode === 200 && response.complete ? Buffer.concat(chunks) : undefined,
          ),
        )
        response.on('error', () => finish(undefined))
      },
    )
    const abort = () => {
      call.destroy()
      finish(undefined)
    }
    const timer = setTimeout(abort, timeoutMs)
    signal.addEventListener('abort', abort, { once: true })
    call.on('error', () => finish(undefined))
    call.end()
  })
}

/** Serve one inert query in-process, or return undefined for the original CLI path. */
export async function engineQuery(
  target: EngineTarget | undefined,
  args: readonly string[],
  options: Pick<DockerCallOptions, 'timeoutMs' | 'signal' | 'outputBytes'> = {},
): Promise<DockerResult | undefined> {
  const shape = target ? engineRequests(args) : undefined
  if (!target || !shape) return undefined
  const limit = options.outputBytes ?? 1024 * 1024,
    timeoutMs = options.timeoutMs ?? 10000,
    signal = options.signal ?? new AbortController().signal
  const values: unknown[] = []
  let total = 0
  for (const path of shape.paths) {
    const body = await get(target, path, limit - total, timeoutMs, signal)
    if (!body) return undefined
    total += body.length
    try {
      values.push(JSON.parse(body.toString('utf8')))
    } catch {
      return undefined
    }
  }
  const stdout = shape.render(values)
  if (stdout === undefined || Buffer.byteLength(stdout) > limit) return undefined
  return {
    status: 'succeeded',
    stdout,
    code: 0,
    // Same digest framing as the CLI transport: stream name, then its bytes.
    digest: createHash('sha256').update('stdout').update(stdout).digest('hex'),
  }
}
