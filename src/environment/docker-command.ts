import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { workerProcess } from '../fanout/process.js'

export interface DockerResult {
  status: 'succeeded' | 'crashed' | 'timeout' | 'cancelled' | 'overflow'
  stdout: string
  code: number | null
  digest: string
  failure?: 'output-limit'
}
export interface DockerTransport {
  provenance: 'fixture' | 'host-observed'
  call(
    args: string[],
    options?: { input?: string; timeoutMs?: number; signal?: AbortSignal; outputBytes?: number },
  ): Promise<DockerResult>
}
/** Docker authenticates through its own native store; application containers receive none of this environment. */
export class DockerCli implements DockerTransport {
  readonly provenance = 'host-observed' as const
  constructor(
    readonly command = 'docker',
    readonly env: NodeJS.ProcessEnv = process.env,
  ) {}
  async call(
    args: string[],
    options: {
      input?: string
      timeoutMs?: number
      signal?: AbortSignal
      outputBytes?: number
    } = {},
  ): Promise<DockerResult> {
    if (
      this.env.DOCKER_HOST &&
      (!this.env.DOCKER_HOST.startsWith('unix:///') || /[\r\n\0]/.test(this.env.DOCKER_HOST))
    )
      throw new DockerEnvironmentError('local-unix-daemon-required')
    const env: NodeJS.ProcessEnv = { PATH: this.env.PATH, HOME: this.env.HOME ?? homedir() }
    for (const key of [
      'DOCKER_HOST',
      'DOCKER_CONTEXT',
      'DOCKER_CONFIG',
      'DOCKER_CERT_PATH',
      'DOCKER_TLS_VERIFY',
    ])
      if (this.env[key]) env[key] = this.env[key]
    const hash = createHash('sha256')
    let output = 0
    let overflow = false
    const result = await workerProcess(this.command, args, {
      cwd: homedir(),
      env,
      input: options.input ?? '',
      timeoutMs: options.timeoutMs ?? 10000,
      signal: options.signal ?? new AbortController().signal,
      observe: (stream, bytes) => {
        hash.update(stream).update(bytes)
        output += bytes.length
        if (output > (options.outputBytes ?? 1024 * 1024)) {
          overflow = true
          throw new Error('Bounded Docker output exceeded')
        }
      },
    })
    return {
      ...result,
      digest: hash.digest('hex'),
      ...(overflow ? { failure: 'output-limit' as const } : {}),
    }
  }
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
