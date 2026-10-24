import { randomUUID } from 'node:crypto'
import { existsSync, lstatSync } from 'node:fs'
import { resolve } from 'node:path'
import { contractDigest } from '../contracts/compatibility.js'
import { StoreFiles } from '../state/files.js'
import { storePath } from '../state/paths.js'
import { readSourceFile } from './input.js'
import { DeliveryJournalError } from './journal-error.js'
import { validateDeliveryShape } from './plan.js'
import receiptSchema from './schemas/lock-recovery-v1.json' with { type: 'json' }

interface LockOwner {
  pid: number
  started: string
}
type LockStatus =
  | { status: 'clear' }
  | { status: 'held' | 'stopped' | 'unknown'; owner?: LockOwner; digest?: string }
export class DeliveryLockRecovery {
  readonly files: StoreFiles
  constructor(store = storePath()) {
    this.files = new StoreFiles(store)
  }

  inspect(): LockStatus {
    const path = this.files.path('.lock')
    if (path !== resolve(this.files.root, '.lock'))
      throw new DeliveryJournalError('aliased-writer-lock')
    if (!existsSync(path)) return { status: 'clear' }
    if (!lstatSync(path).isDirectory()) return { status: 'unknown' }
    let value: unknown
    try {
      value = JSON.parse(readSourceFile(this.files.root, '.lock/owner.json', 4096))
    } catch {
      return { status: 'unknown' }
    }
    if (
      value === null ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.keys(value).sort().join(',') !== 'pid,started'
    )
      return { status: 'unknown' }
    const owner = value as LockOwner
    if (
      !Number.isSafeInteger(owner.pid) ||
      owner.pid < 1 ||
      typeof owner.started !== 'string' ||
      !Number.isFinite(Date.parse(owner.started)) ||
      new Date(owner.started).toISOString() !== owner.started
    )
      return { status: 'unknown' }
    const digest = contractDigest(owner)
    try {
      process.kill(owner.pid, 0)
      return { status: 'held', owner, digest }
    } catch (error) {
      // An existing/reused/inaccessible PID is never a stopped writer, regardless of elapsed time.
      return {
        status: (error as NodeJS.ErrnoException).code === 'ESRCH' ? 'stopped' : 'unknown',
        owner,
        digest,
      }
    }
  }

  repair(expected: string) {
    if (!/^[a-f0-9]{64}$/.test(expected)) throw new DeliveryJournalError('invalid-lock-observation')
    const controlPath = this.files.path('delivery/lock-recovery-control')
    if (controlPath !== resolve(this.files.root, 'delivery/lock-recovery-control'))
      throw new DeliveryJournalError('aliased-lock-recovery-control')
    const control = new StoreFiles(controlPath)
    // Ordinary writers never steal locks. This separate explicit operation serializes repairers.
    return control.locked(() => {
      const first = this.inspect()
      if (first.status === 'clear') return { status: 'already-clear' as const, retained: null }
      if (first.status !== 'stopped' || first.digest !== expected)
        throw new DeliveryJournalError('writer-not-confirmed-stopped')
      const identity = lstatSync(this.files.path('.lock'))
      const current = this.inspect(),
        after = lstatSync(this.files.path('.lock'))
      if (
        current.status !== 'stopped' ||
        current.digest !== expected ||
        identity.dev !== after.dev ||
        identity.ino !== after.ino
      )
        throw new DeliveryJournalError('changed-writer-lock')
      const retained = `delivery/recovered-locks/${randomUUID()}`
      const receipt = {
        schema: 'wholeloop/delivery-lock-recovery@1',
        owner: first.owner,
        digest: expected,
        retained,
        reason: 'Observed ESRCH for this exact retained writer record.',
      }
      validateDeliveryShape(receipt, receiptSchema)
      this.files.retainLock(retained)
      this.files.atomic(`${retained}.receipt.json`, `${JSON.stringify(receipt, null, 2)}\n`)
      return { status: 'retained-stopped-writer-lock' as const, retained }
    })
  }
}
