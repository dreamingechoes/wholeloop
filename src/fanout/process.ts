import { spawn } from 'node:child_process'
import { terminateWorker, workerPlatform } from './posix.js'

export type WorkerFailure = 'crashed' | 'timeout' | 'cancelled' | 'overflow'
export interface ProcessResult {
  status: 'succeeded' | WorkerFailure
  stdout: string
  code: number | null
  signal: NodeJS.Signals | null
}
/** Shell-free stdin input and bounded discarded diagnostics avoid leaking prompts through argv/logs. */
export async function workerProcess(
  command: string,
  args: string[],
  options: {
    cwd: string
    input: string
    timeoutMs: number
    signal: AbortSignal
    env: NodeJS.ProcessEnv
  },
): Promise<ProcessResult> {
  if (options.signal.aborted) return { status: 'cancelled', stdout: '', code: null, signal: null }
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      ...workerPlatform(),
    })
    let output: Buffer[] = []
    let bytes = 0
    let failure: WorkerFailure | undefined
    let done = false
    let hard: ReturnType<typeof setTimeout> | undefined
    const stop = (reason: WorkerFailure) => {
      failure ??= reason
      terminateWorker(child, 'SIGTERM')
      hard ??= setTimeout(() => terminateWorker(child, 'SIGKILL'), 300)
    }
    const aborted = () => stop('cancelled')
    options.signal.addEventListener('abort', aborted, { once: true })
    const timer = setTimeout(() => stop('timeout'), options.timeoutMs)
    const finish = (code: number | null, signal: NodeJS.Signals | null) => {
      if (done) return
      done = true
      clearTimeout(timer)
      if (hard) clearTimeout(hard)
      options.signal.removeEventListener('abort', aborted)
      if (failure) terminateWorker(child, 'SIGKILL')
      resolve({
        status: failure ?? (code === 0 && !signal ? 'succeeded' : 'crashed'),
        stdout: failure ? '' : Buffer.concat(output).toString('utf8'),
        code,
        signal,
      })
      output = []
    }
    const capture = (chunk: Buffer, stdout: boolean) => {
      bytes += chunk.length
      if (bytes > 1024 * 1024) stop('overflow')
      else if (stdout && !failure) output.push(chunk)
    }
    child.stdout.on('data', (chunk: Buffer) => capture(chunk, true))
    child.stderr.on('data', (chunk: Buffer) => capture(chunk, false))
    child.on('error', () => {
      failure ??= 'crashed'
      finish(null, null)
    })
    child.on('close', finish)
    child.stdin.on('error', () => {
      /* A crashed reader can close stdin before the assignment is delivered. */
    })
    child.stdin.end(options.input)
    if (options.signal.aborted) aborted()
  })
}
