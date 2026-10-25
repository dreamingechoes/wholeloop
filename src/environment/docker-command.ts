import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { workerProcess } from '../fanout/process.js'
import { DOCKER_OPERATION_WRAPPER } from './operation-wrapper.js'
import type { DockerOperationRegistration } from './operations.js'

export interface DockerResult {
  status: 'succeeded' | 'crashed' | 'timeout' | 'cancelled' | 'overflow'
  stdout: string
  code: number | null
  digest: string
  failure?: 'output-limit'
}
export interface DockerProcessObservation {
  pid: number
  argv: string[]
  cwd: string
  startedAt: string
  endedAt: string
  code: number | null
  signal: NodeJS.Signals | null
}
export interface DockerCallOptions {
  input?: string
  timeoutMs?: number
  signal?: AbortSignal
  outputBytes?: number
  registration?: DockerOperationRegistration
  observe?: (stream: 'stdout' | 'stderr', bytes: Buffer) => void
  process?: (observation: DockerProcessObservation) => void
}
export interface DockerTransport {
  provenance: 'fixture' | 'host-observed'
  call(args: string[], options?: DockerCallOptions): Promise<DockerResult>
}
/** Docker authenticates through its own native store; application containers receive none of this environment. */
export class DockerCli implements DockerTransport {
  readonly provenance = 'host-observed' as const
  constructor(
    readonly command = 'docker',
    readonly env: NodeJS.ProcessEnv = process.env,
  ) {}
  async call(args: string[], options: DockerCallOptions = {}): Promise<DockerResult> {
    const env = dockerCliEnvironment(this.env)
    const hash = createHash('sha256')
    let output = 0
    let overflow = false
    const registration = options.registration
    const command = registration ? process.execPath : this.command
    const argv = registration ? ['--input-type=module', '-e', DOCKER_OPERATION_WRAPPER] : args
    let observed: { pid: number; startedAt: string } | undefined
    const result = await workerProcess(command, argv, {
      cwd: homedir(),
      env,
      input: registration
        ? JSON.stringify({
            operation: registration.operation,
            nonce: registration.nonce,
            cancel: registration.cancel,
            outcome: registration.outcome,
            command: this.command,
            args,
            input: options.input ?? '',
            timeoutMs: options.timeoutMs ?? 10000,
          })
        : (options.input ?? ''),
      ...(registration || options.process
        ? {
            started: (pid: number) => {
              registration?.started(pid)
              observed = { pid, startedAt: new Date().toISOString() }
            },
          }
        : {}),
      timeoutMs: options.timeoutMs ?? 10000,
      signal: options.signal ?? new AbortController().signal,
      observe: (stream, bytes) => {
        hash.update(stream).update(bytes)
        output += bytes.length
        if (output > (options.outputBytes ?? 1024 * 1024)) {
          overflow = true
          throw new Error('Bounded Docker output exceeded')
        }
        options.observe?.(stream, bytes)
      },
    })
    if (observed)
      options.process?.({
        ...observed,
        argv: [command, ...argv],
        cwd: homedir(),
        endedAt: new Date().toISOString(),
        code: result.code,
        signal: result.signal,
      })
    return {
      ...result,
      digest: hash.digest('hex'),
      ...(overflow ? { failure: 'output-limit' as const } : {}),
    }
  }
}
export function dockerCliEnvironment(input: NodeJS.ProcessEnv = process.env) {
  if (
    input.DOCKER_HOST &&
    (!input.DOCKER_HOST.startsWith('unix:///') || /[\r\n\0]/.test(input.DOCKER_HOST))
  )
    throw new DockerEnvironmentError('local-unix-daemon-required')
  const env: NodeJS.ProcessEnv = { PATH: input.PATH, HOME: input.HOME ?? homedir() }
  for (const key of [
    'DOCKER_HOST',
    'DOCKER_CONTEXT',
    'DOCKER_CONFIG',
    'DOCKER_CERT_PATH',
    'DOCKER_TLS_VERIFY',
  ])
    if (input[key]) env[key] = input[key]
  return env
}
export class DockerEnvironmentError extends Error {
  constructor(readonly problem: string) {
    super(`Docker environment unavailable: ${problem}; diagnostics omitted`)
  }
}
export function dockerJson(result: DockerResult): unknown {
  if (result.status !== 'succeeded') throw new DockerEnvironmentError(`docker-${result.status}`)
  try {
    return JSON.parse(result.stdout) as unknown
  } catch {
    throw new DockerEnvironmentError('invalid-docker-json')
  }
}
