import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { contractDigest } from '../contracts/compatibility.js'
import { readSourceFile, safeSourceText } from '../delivery/input.js'
import { validateDeliveryShape } from '../delivery/plan.js'
import { operationGroup } from '../environment/operations.js'
import { operationWrapper } from '../fanout/operation-wrapper.js'
import { type ProcessResult, unmanagedWorkerProcess } from '../fanout/process.js'
import type { StoreFiles } from '../state/files.js'
import { DeliveryRunnerError } from './route.js'
import outcomeSchema from './schemas/process-outcome-v1.json' with { type: 'json' }

const NATIVE_WRAPPER = operationWrapper('wholeloop/delivery-runner-operation-outcome@1')
  .replace('existsSync, openSync', 'existsSync, readFileSync, openSync')
  .replaceAll('existsSync(request.cancel)', 'cancellationRequested()')
  .replace(
    'request = JSON.parse(text)',
    `request = JSON.parse(text)
  const remaining = Date.parse(request.deadline) - Date.now()
  if (!Number.isFinite(remaining) || remaining <= 0) { outcome(null, null, 'not-started'); process.exit(2) }
  request.timeoutMs = Math.min(request.timeoutMs, remaining)`,
  )
  .replace(
    "process.on('SIGTERM'",
    `const cancellationRequested = () => {
  try { return JSON.parse(readFileSync(request.cancel, 'utf8')).nonce === request.nonce }
  catch { return false }
}
// A dead controller's broken pipe cannot kill the owned client or prevent its close receipt.
for (const [sink, source] of [[process.stdout, 'stdout'], [process.stderr, 'stderr']]) {
  sink.on('error', error => {
    if (error.code === 'EPIPE') {
      child?.[source]?.unpipe(sink)
      child?.[source]?.resume()
    } else stop('output-unavailable')
  })
}
process.on('SIGTERM'`,
  )

export { NATIVE_WRAPPER as RUNNER_NATIVE_WRAPPER }
export interface ManagedProcessObservation {
  invocation: string
  invocationState: 'stopped' | 'not-started' | 'unknown'
  reason: string
  code?: number
  signal?: string
  evidence: string
}
interface NativeIntent {
  invocation: string
  nonce: string
  cwd: string
  command: string
  deadline: string
}
/** Private nonce-bound cancellation is recoverable; no controller ever signals a stored PID. */
export class ManagedRunnerProcess {
  readonly relative: string
  constructor(
    readonly files: StoreFiles,
    readonly invocation: string,
  ) {
    if (!/^[a-f0-9]{64}$/.test(invocation))
      throw new DeliveryRunnerError('invalid-native-invocation')
    this.relative = `delivery/runner-native/${invocation}`
  }
  private read(name: string): Record<string, unknown> | undefined {
    const path = `${this.relative}/${name}.json`
    return existsSync(this.files.path(path))
      ? (JSON.parse(readSourceFile(this.files.root, path, 65536)) as Record<string, unknown>)
      : undefined
  }
  async invoke(
    command: string,
    args: string[],
    input: string,
    options: {
      cwd: string
      env: NodeJS.ProcessEnv
      timeoutMs: number
      signal: AbortSignal
      current(): boolean
      started?(pid: number): void
      observe?(stream: 'stdout' | 'stderr', chunk: Buffer): void
    },
  ): Promise<ProcessResult & { ownership: ManagedProcessObservation }> {
    if (this.read('intent')) throw new DeliveryRunnerError('native-invocation-already-issued')
    if (
      !Number.isSafeInteger(options.timeoutMs) ||
      options.timeoutMs < 1 ||
      options.timeoutMs > 2147482647 ||
      Buffer.byteLength(input) > 2 * 1024 * 1024 ||
      options.signal.aborted ||
      !options.current()
    )
      throw new DeliveryRunnerError('native-invocation-not-admitted')
    safeSourceText(JSON.stringify({ command, args, cwd: options.cwd }), 65536)
    const intent: NativeIntent = {
      invocation: this.invocation,
      nonce: randomUUID(),
      cwd: options.cwd,
      command: contractDigest({ command, args, input: contractDigest(input) }),
      deadline: new Date(Date.now() + options.timeoutMs).toISOString(),
    }
    mkdirSync(this.files.path(this.relative), { recursive: true, mode: 0o700 })
    this.files.locked(() => {
      if (this.read('intent')) throw new DeliveryRunnerError('native-invocation-already-issued')
      this.files.atomic(`${this.relative}/intent.json`, JSON.stringify(intent))
    })
    const cancel = () =>
        this.files.atomic(`${this.relative}/cancel.json`, JSON.stringify({ nonce: intent.nonce })),
      watch = setInterval(() => {
        if (!options.current()) cancel()
      }, 100)
    options.signal.addEventListener('abort', cancel, { once: true })
    try {
      const result = await unmanagedWorkerProcess(
        process.execPath,
        ['--input-type=module', '-e', NATIVE_WRAPPER],
        {
          cwd: options.cwd,
          env: options.env,
          timeoutMs: options.timeoutMs + 1000,
          signal: options.signal,
          input: JSON.stringify({
            operation: this.invocation,
            nonce: intent.nonce,
            cancel: this.files.path(`${this.relative}/cancel.json`),
            outcome: this.files.path(`${this.relative}/outcome.json`),
            command,
            args,
            input,
            timeoutMs: options.timeoutMs,
            deadline: intent.deadline,
          }),
          started: (pid) => {
            if (!options.current())
              throw new DeliveryRunnerError('native-invocation-no-longer-current')
            this.files.atomic(
              `${this.relative}/started.json`,
              JSON.stringify({
                pid,
                nonce: intent.nonce,
                invocation: this.invocation,
                intent: contractDigest(intent),
              }),
            )
            options.started?.(pid)
          },
          ...(options.observe ? { observe: options.observe } : {}),
        },
      )
      const ownership = this.observe()
      return {
        ...result,
        status:
          ownership.reason === 'timeout'
            ? 'timeout'
            : ownership.reason === 'cancelled'
              ? 'cancelled'
              : result.status,
        code: ownership.invocationState === 'unknown' ? null : (ownership.code ?? null),
        signal: ownership.signal
          ? (ownership.signal as NodeJS.Signals)
          : ownership.invocationState === 'unknown'
            ? result.signal
            : null,
        ownership,
      }
    } finally {
      clearInterval(watch)
      options.signal.removeEventListener('abort', cancel)
    }
  }
  requestCancellation(): void {
    const intent = this.read('intent')
    if (!intent || intent.invocation !== this.invocation || typeof intent.nonce !== 'string')
      throw new DeliveryRunnerError('unknown-native-intent')
    const started = this.read('started')
    if (started && (started.nonce !== intent.nonce || started.intent !== contractDigest(intent)))
      throw new DeliveryRunnerError('changed-native-registration')
    // This file is only a request. The original live wrapper checks it and owns any signal it sends.
    this.files.atomic(`${this.relative}/cancel.json`, JSON.stringify({ nonce: intent.nonce }))
  }
  observe(): ManagedProcessObservation {
    const intent = this.read('intent'),
      started = this.read('started'),
      outcome = this.read('outcome')
    const unknown = (reason: string): ManagedProcessObservation => ({
      invocation: this.invocation,
      invocationState: 'unknown',
      reason,
      evidence: contractDigest({ invocation: this.invocation, reason }),
    })
    if (
      !intent ||
      intent.invocation !== this.invocation ||
      !started ||
      started.invocation !== this.invocation ||
      started.nonce !== intent.nonce ||
      started.intent !== contractDigest(intent) ||
      !Number.isSafeInteger(started.pid) ||
      Number(started.pid) < 1
    )
      return unknown('original-native-registration-unavailable')
    const group = operationGroup(Number(started.pid))
    if (group.status !== 'absent') return unknown('original-native-group-not-confirmed-absent')
    if (!outcome)
      return {
        invocation: this.invocation,
        invocationState: 'stopped',
        reason: 'original-native-group-absent-without-semantic-result',
        evidence: contractDigest({ intent, started, group }),
      }
    try {
      validateDeliveryShape(outcome, outcomeSchema)
    } catch {
      return unknown('original-native-outcome-unavailable')
    }
    if (
      outcome.operation !== this.invocation ||
      outcome.nonce !== intent.nonce ||
      outcome.pid !== started.pid
    )
      return unknown('original-native-outcome-binding')

    return {
      invocation: this.invocation,
      invocationState: outcome.reason === 'not-started' ? 'not-started' : 'stopped',
      reason: String(outcome.reason),
      ...(typeof outcome.code === 'number' ? { code: outcome.code } : {}),
      ...(typeof outcome.signal === 'string' ? { signal: outcome.signal } : {}),
      evidence: contractDigest({ intent, started, outcome, group }),
    }
  }
}
