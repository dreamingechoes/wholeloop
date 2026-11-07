// The private launch record that admits one owned foreground controller.
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { basename, dirname } from 'node:path'
import { contractDigest } from '../contracts/compatibility.js'
import { readSourceBytes, readSourceFile } from '../delivery/input.js'
import { validateDeliveryShape } from '../delivery/plan.js'
import { processPresence } from '../environment/operations.js'
import { workerGroupMember } from '../fanout/posix.js'
import { canonicalPath } from '../state/paths.js'
import { cancellationNonce, writeCancellationRequest } from './cancellation.js'
import { type ManagedProcessObservation, ManagedRunnerProcess } from './native-process.js'
import { DeliveryRunnerError } from './route.js'
import schema from './schemas/foreground-invocation-v1.json' with { type: 'json' }
import type { RunnerLease, RunnerStore } from './store.js'

export const FOREGROUND_INVOCATION_SCHEMA = schema
export const FOREGROUND_ARGUMENT = '--internal-delivery-foreground'
export interface ForegroundInvocation {
  schema: 'wholeloop/delivery-foreground-invocation@1'
  lease: RunnerLease
  invocation: string
  store: string
  nonce: string
  parent: number
  core: { path: string; sha256: string }
  deadline: string
}
export function foregroundInvocation(lease: RunnerLease): string {
  return contractDigest({ kind: 'owned-foreground-controller', ...lease })
}
function coreIdentity(path: string) {
  const canonical = canonicalPath(path),
    bytes = readSourceBytes(dirname(canonical), basename(canonical), 64 * 1024 * 1024)
  return { path: canonical, sha256: createHash('sha256').update(bytes).digest('hex') }
}
/** Only a private exact launch record can admit one controller; stdin is never a host-result import. */
export class ForegroundOwner {
  readonly invocation: string
  readonly manager: ManagedRunnerProcess
  readonly path: string
  constructor(
    readonly store: RunnerStore,
    readonly lease: RunnerLease,
  ) {
    this.invocation = foregroundInvocation(lease)
    this.manager = new ManagedRunnerProcess(store.files, this.invocation)
    this.path = `delivery/runner-foreground/${this.invocation}`
  }
  static claim(store: RunnerStore, digest: string, core: string) {
    coreIdentity(core)
    let owner: ForegroundOwner | undefined, invocation: ForegroundInvocation | undefined
    try {
      store.claim(digest, `controller-${randomBytes(16).toString('hex')}`, (lease) => {
        owner = new ForegroundOwner(store, lease)
        invocation = owner.publish(core)
      })
    } catch (error) {
      // The journal may have committed before a disposable cache write failed.
      // This original caller has not invoked any process while claim is returning.
      if (owner) {
        try {
          const record = store.record(digest)
          if (
            record.controller === owner.lease.controller &&
            record.generation === owner.lease.generation &&
            record.ownership === 'active'
          )
            store.release(
              owner.lease,
              'The original caller confirmed no process launch occurred before its claim returned an error.',
            )
        } catch {
          /* An unreadable/locked journal retains uncertain ownership for recovery. */
        }
      }
      throw error
    }
    if (!owner || !invocation) throw new DeliveryRunnerError('foreground-owner-not-published')
    return { owner, invocation }
  }
  read(): ForegroundInvocation | undefined {
    if (!existsSync(this.store.files.path(`${this.path}/invocation.json`))) return undefined
    const value = JSON.parse(
      readSourceFile(this.store.files.root, `${this.path}/invocation.json`, 65536),
    )
    validateDeliveryShape(value, schema)
    const record = value as ForegroundInvocation
    if (
      contractDigest(record.lease) !== contractDigest(this.lease) ||
      record.invocation !== this.invocation ||
      record.store !== this.store.files.root ||
      new Date(record.deadline).toISOString() !== record.deadline
    )
      throw new DeliveryRunnerError('foreground-invocation-binding')
    return record
  }
  prepare(core: string): ForegroundInvocation {
    return this.store.files.locked(() => {
      if (!this.store.current(this.lease)) throw new DeliveryRunnerError('foreground-not-admitted')
      return this.publish(core)
    })
  }
  private publish(core: string): ForegroundInvocation {
    const request = this.store.get(this.lease.request),
      identity = coreIdentity(core),
      budget = this.store.budgets.inspect(request.run),
      deadline = budget.deadline,
      grant = this.store.lifecycle.authority.inspect(request.grant)
    if (!deadline || grant.status !== 'active')
      throw new DeliveryRunnerError('foreground-not-admitted')
    const prior = this.read()
    if (prior) {
      if (prior.parent !== process.pid || contractDigest(prior.core) !== contractDigest(identity))
        throw new DeliveryRunnerError('foreground-already-owned')
      return prior
    }
    const value: ForegroundInvocation = {
      schema: 'wholeloop/delivery-foreground-invocation@1',
      lease: this.lease,
      invocation: this.invocation,
      store: this.store.files.root,
      nonce: randomUUID(),
      parent: process.pid,
      core: identity,
      deadline: new Date(
        Math.min(Date.parse(deadline), Date.parse(grant.grant.expiresAt)),
      ).toISOString(),
    }
    validateDeliveryShape(value, schema)
    this.store.files.atomic(`${this.path}/invocation.json`, JSON.stringify(value))
    return value
  }
  current(dispatch = false, draining = false): boolean {
    try {
      const record = this.read()
      if (
        !record ||
        cancellationNonce(this.store.files, `${this.path}/cancel.json`) === record.nonce
      )
        return false
      // Releasing dispatch must not truncate the controller's final pipe drain.
      // This only keeps the already registered original group alive, never admits work.
      return draining && !dispatch
        ? this.store.currentForDrain(this.lease, this.invocation)
        : this.store.current(this.lease, dispatch, false)
    } catch {
      return false
    }
  }
  register(pid: number) {
    if (!this.current() || !Number.isSafeInteger(pid) || pid < 1)
      throw new DeliveryRunnerError('foreground-registration-refused')
    this.store.append(this.lease, {
      action: 'registered',
      invocation: this.invocation,
      runtime: { backend: 'wholeloop:foreground', instance: this.invocation, worker: `pid-${pid}` },
    })
  }
  consume(value: unknown, core: string): ForegroundInvocation {
    validateDeliveryShape(value, schema)
    return this.store.files.locked(() => {
      const record = this.read(),
        owner = this.store.record(this.lease.request).owner
      if (
        !record ||
        contractDigest(record) !== contractDigest(value) ||
        contractDigest(record.core) !== contractDigest(coreIdentity(core)) ||
        !this.current(true) ||
        owner?.invocation !== this.invocation ||
        owner.runtime.backend !== 'wholeloop:foreground' ||
        owner.runtime.instance !== this.invocation ||
        !/^pid-[1-9]\d*$/.test(owner.runtime.worker) ||
        workerGroupMember(process.pid, Number(owner.runtime.worker.slice(4))) !== true
      )
        throw new DeliveryRunnerError('foreground-consumer-binding')
      const consumed = `${this.path}/consumed.json`
      if (existsSync(this.store.files.path(consumed)))
        throw new DeliveryRunnerError('foreground-input-already-consumed')
      this.store.files.atomic(
        consumed,
        JSON.stringify({ invocation: this.invocation, nonce: record.nonce, pid: process.pid }),
      )
      return record
    })
  }
  requestCancellation() {
    const record = this.read()
    if (!record) throw new DeliveryRunnerError('foreground-owner-unavailable')
    // Fence a not-yet-started original parent before asking any live wrapper to cancel.
    writeCancellationRequest(this.store.files, `${this.path}/cancel.json`, record.nonce)
    if (existsSync(this.store.files.path(`${this.manager.relative}/intent.json`)))
      this.manager.requestCancellation()
  }
  observe(): ManagedProcessObservation {
    const record = this.read()
    if (!record) return this.manager.observe()
    if (existsSync(this.store.files.path(`${this.manager.relative}/intent.json`)))
      return this.manager.observe()
    const parent = processPresence(record.parent)
    return {
      invocation: this.invocation,
      invocationState: parent === 'absent' ? 'not-started' : 'unknown',
      reason:
        parent === 'absent'
          ? 'original-parent-absent-before-native-intent'
          : 'original-parent-not-confirmed-absent',
      evidence: contractDigest({ record, parent, nativeIntent: 'absent' }),
    }
  }
}
