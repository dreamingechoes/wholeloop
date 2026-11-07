import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { contractDigest } from '../contracts/compatibility.js'
import { readSourceFile, safeSourceText, sourceHash } from '../delivery/input.js'
import { validateDeliveryShape } from '../delivery/plan.js'
import { type operationGroup, operationGroups } from '../environment/operations.js'
import { operationWrapper } from '../fanout/operation-wrapper.js'
import { type ProcessResult, unmanagedWorkerProcess } from '../fanout/process.js'
import type { StoreFiles } from '../state/files.js'
import { assertObservationWritable, groupReadResources } from '../state/read-observation.js'
import { NATIVE_CANCELLATION_READER, writeCancellationRequest } from './cancellation.js'
import { DeliveryRunnerError } from './route.js'
import outcomeSchema from './schemas/process-outcome-v1.json' with { type: 'json' }

const NATIVE_WRAPPER = operationWrapper('wholeloop/delivery-runner-operation-outcome@1')
  .replace(
    'existsSync, openSync',
    'existsSync, constants, fstatSync, lstatSync, readSync, openSync',
  )
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
    `${NATIVE_CANCELLATION_READER}
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
// A witnessed original group cannot revive when its numeric ID is reused.
// Keep this fact only in this process, bound to freshly reread original bytes;
// a file claiming closure must never reconstruct it in a cold controller.
const closedGroups = new Map<string, { input: string; evidence: string }>()
const CLOSED_GROUP_LIMIT = 1024
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
  private original(name: string) {
    const path = `${this.relative}/${name}.json`
    if (!existsSync(this.files.path(path))) return undefined
    const bytes = readSourceFile(this.files.root, path, 65536)
    return { value: JSON.parse(bytes) as Record<string, unknown>, digest: sourceHash(bytes) }
  }
  private read(name: string): Record<string, unknown> | undefined {
    return this.original(name)?.value
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
    assertObservationWritable()
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
    this.files.directory(this.relative)
    this.files.locked(() => {
      if (this.read('intent')) throw new DeliveryRunnerError('native-invocation-already-issued')
      this.files.atomic(`${this.relative}/intent.json`, JSON.stringify(intent))
    })
    const cancel = () =>
        writeCancellationRequest(this.files, `${this.relative}/cancel.json`, intent.nonce),
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
    assertObservationWritable()
    const intent = this.read('intent')
    if (!intent || intent.invocation !== this.invocation || typeof intent.nonce !== 'string')
      throw new DeliveryRunnerError('unknown-native-intent')
    const started = this.read('started')
    if (started && (started.nonce !== intent.nonce || started.intent !== contractDigest(intent)))
      throw new DeliveryRunnerError('changed-native-registration')
    // This file is only a request. The original live wrapper checks it and owns any signal it sends.
    writeCancellationRequest(this.files, `${this.relative}/cancel.json`, intent.nonce)
  }
  static observeAll(
    files: StoreFiles,
    invocations: readonly string[],
  ): ManagedProcessObservation[] {
    if (invocations.length > 1000) throw new DeliveryRunnerError('native-observation-limit')
    const selected = invocations.map((invocation) => {
        const manager = new ManagedRunnerProcess(files, invocation)
        groupReadResources(
          JSON.stringify(['native-registration', files.root, invocation]),
          ['intent', 'started', 'outcome'].map(
            (name) => `filesystem:${join(files.root, manager.relative, `${name}.json`)}`,
          ),
        )
        const intent = manager.original('intent'),
          started = manager.original('started'),
          outcome = manager.original('outcome')
        return {
          manager,
          input: {
            intent: intent?.value,
            started: started?.value,
            outcome: outcome?.value,
          },
          digest: contractDigest([
            intent?.digest ?? null,
            started?.digest ?? null,
            outcome?.digest ?? null,
          ]),
        }
      }),
      // Read all exact registrations before observing process groups together.
      // A failed table remains unknown for every member; no per-member retry
      // may turn an unavailable common observation into a positive closure.
      groups = operationGroups(
        selected.flatMap(({ input }) =>
          Number.isSafeInteger(input.started?.pid) && Number(input.started?.pid) > 0
            ? [Number(input.started?.pid)]
            : [],
        ),
      )
    return selected.map(({ manager, input, digest }) =>
      manager.observation(input, groups.get(Number(input.started?.pid)), digest),
    )
  }
  observe(): ManagedProcessObservation {
    const observed = ManagedRunnerProcess.observeAll(this.files, [this.invocation])[0]
    if (!observed) throw new DeliveryRunnerError('native-observation-unavailable')
    return observed
  }
  private observation(
    input: {
      intent: Record<string, unknown> | undefined
      started: Record<string, unknown> | undefined
      outcome: Record<string, unknown> | undefined
    },
    group: ReturnType<typeof operationGroup> | undefined,
    digest: string,
  ): ManagedProcessObservation {
    const { intent, started, outcome } = input
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
    const key = JSON.stringify([this.files.root, this.invocation]),
      retained = closedGroups.get(key),
      // Still require an available fresh common table. Only a previously
      // witnessed, byte-identical original may outlive numeric group reuse.
      originalGroup =
        group?.status === 'present' && retained?.input === digest
          ? { status: 'absent' as const, evidence: retained.evidence }
          : group
    if (originalGroup?.status !== 'absent')
      return unknown('original-native-group-not-confirmed-absent')
    if (!outcome)
      return {
        invocation: this.invocation,
        invocationState: 'stopped',
        reason: 'original-native-group-absent-without-semantic-result',
        evidence: contractDigest({ intent, started, group: originalGroup }),
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

    closedGroups.delete(key)
    closedGroups.set(key, { input: digest, evidence: originalGroup.evidence })
    if (closedGroups.size > CLOSED_GROUP_LIMIT) {
      const oldest = closedGroups.keys().next().value
      if (oldest !== undefined) closedGroups.delete(oldest)
    }

    return {
      invocation: this.invocation,
      invocationState: outcome.reason === 'not-started' ? 'not-started' : 'stopped',
      reason: String(outcome.reason),
      ...(typeof outcome.code === 'number' ? { code: outcome.code } : {}),
      ...(typeof outcome.signal === 'string' ? { signal: outcome.signal } : {}),
      evidence: contractDigest({ intent, started, outcome, group: originalGroup }),
    }
  }
}
