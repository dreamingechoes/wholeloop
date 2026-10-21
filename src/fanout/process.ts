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
    readyLine?: (line: string) => boolean
    observe?: (stream: 'stdout' | 'stderr', chunk: Buffer) => void
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
    let inputSent = false
    let readiness = Buffer.alloc(0)
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
      if (options.readyLine && !inputSent) failure ??= 'crashed'
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
      else {
        try {
          options.observe?.(stdout ? 'stdout' : 'stderr', chunk)
        } catch {
          stop('crashed')
        }
        if (stdout && !failure) output.push(chunk)
      }
      if (stdout && options.readyLine && !inputSent && !failure && !done) {
        readiness = Buffer.concat([readiness, chunk])
        const newline = readiness.indexOf(10)
        if ((newline < 0 && readiness.length > 65536) || newline > 65536) stop('overflow')
        else if (newline >= 0) {
          try {
            if (
              options.readyLine(
                readiness.subarray(0, newline).toString('utf8').replace(/\r$/, ''),
              ) !== true
            )
              throw new Error('Native initialization refused')
            if (failure || done || options.signal.aborted) return
            inputSent = true
            readiness = Buffer.alloc(0)
            child.stdin.end(options.input)
          } catch {
            stop('crashed')
          }
        }
      }
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
    // Some native clients expose their actual tool registry before a prompt. Do not deliver
    // assignment data until that bounded startup record satisfies the adapter's policy.
    if (!options.readyLine) {
      inputSent = true
      child.stdin.end(options.input)
    }
    if (options.signal.aborted) aborted()
  })
}
