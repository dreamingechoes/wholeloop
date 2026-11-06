import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { contractDigest } from '../contracts/compatibility.js'
import { DeliveryBudgets } from './budgets.js'
import type { DeliveryProjection } from './events.js'
import { readSourceBytes, readSourceFile } from './input.js'
import type { NativeRunReceipt } from './native-assignment-host.js'
import { NativeAssignmentHost, type NativeRunOptions } from './native-assignment-host.js'
import { validateDeliveryShape } from './plan.js'
import type { DeliveryQueue, QueueAssignment } from './queue.js'
import { deliveryQueue, queueAssignment } from './queue-events.js'
import { deliveryAttempts, replayDelivery } from './reducer.js'
import nativeRunSchema from './schemas/native-run-v1.json' with { type: 'json' }
import { currentWorkerAssignment, workerContextForClaim } from './worker-context.js'
import {
  validateWorkerAssignment,
  type WorkerAssignment,
  WorkerProtocolError,
  workerResultArtifacts,
  workerResumePack,
} from './worker-protocol.js'

export type {
  NativeBoundaryHost,
  NativeProcessRunner,
  NativeRunOptions,
  NativeRunReceipt,
} from './native-assignment-host.js'

export interface NativeQueueBinding {
  version: 1
  lease: QueueAssignment
  assignment: WorkerAssignment
  directory: string
  contextRoot: string
  workspace?: string
  provenance: 'fixture' | 'host-observed'
}

/** Queue work keeps its original admission, assignment and settlement behavior. */
export class NativeDeliveryHost {
  readonly budgets: DeliveryBudgets
  constructor(readonly queue: DeliveryQueue) {
    this.budgets = new DeliveryBudgets(
      queue.lifecycle.journal.files.root,
      queue.lifecycle.journal.now,
      queue.budgetClock,
    )
  }

  run(
    lease: QueueAssignment,
    context: Parameters<typeof workerContextForClaim>[2],
    options: NativeRunOptions,
  ) {
    return new NativeAssignmentHost({
      budgets: this.budgets,
      prepare: () => workerContextForClaim(this.queue, lease, context),
      provenance: () =>
        this.queue.inspect(lease.run).find((item) => item.attempt === lease.attempt)?.admission
          ?.provenance,
      current: (assignment, runtime) => currentWorkerAssignment(this.queue, assignment, runtime),
      start: (runtime) => this.queue.start(lease, runtime),
      finish: (action, evidence) => this.queue.finish(lease, action, evidence),
    }).run(context, {
      ...options,
      prepared: ({ assignment, directory }) => {
        const provenance = this.queue
          .inspect(lease.run)
          .find((item) => item.attempt === lease.attempt)?.admission?.provenance
        if (!provenance) throw new WorkerProtocolError('native-admission-missing')
        const binding: NativeQueueBinding = {
          version: 1,
          lease: structuredClone(lease),
          assignment: structuredClone(assignment),
          directory,
          contextRoot: context.contextRoot,
          ...(context.workspace ? { workspace: context.workspace } : {}),
          provenance,
        }
        const files = this.queue.lifecycle.journal.files
        files.locked(() => {
          const path = this.path(lease.attempt)
          // The same original claim must never acquire a second native directory,
          // including after a lost probe reply or a failed parent registration.
          if (existsSync(files.path(path))) throw new WorkerProtocolError('native-already-invoked')
          files.atomic(path, `${JSON.stringify(binding)}\n`)
        })
        options.prepared?.({ assignment, directory })
      },
    })
  }

  private path(attempt: string) {
    if (!/^attempt-[a-f0-9]{16}$/.test(attempt)) throw new WorkerProtocolError('native-attempt')
    return `delivery/native-assignments/${attempt}.json`
  }

  binding(lease: Readonly<QueueAssignment>): NativeQueueBinding | undefined {
    if (!existsSync(this.queue.lifecycle.journal.files.path(this.path(lease.attempt))))
      return undefined
    return this.bindingAt(lease, this.queue.lifecycle.journal.view(lease.run))
  }
  private bindingAt(
    lease: Readonly<QueueAssignment>,
    state: DeliveryProjection,
  ): NativeQueueBinding | undefined {
    const files = this.queue.lifecycle.journal.files,
      path = this.path(lease.attempt)
    if (!existsSync(files.path(path))) return undefined
    const binding = JSON.parse(
      readSourceFile(files.root, path, 2 * 1024 * 1024),
    ) as NativeQueueBinding
    validateWorkerAssignment(binding.assignment)
    const identity = binding.assignment.identity,
      entry = deliveryQueue(state).records.find((record) => record.attempt === lease.attempt)
    if (
      binding.version !== 1 ||
      contractDigest(binding.lease) !== contractDigest(lease) ||
      !entry ||
      contractDigest(queueAssignment(state, entry)) !== contractDigest(lease) ||
      identity.run !== lease.run ||
      identity.plan !== lease.plan ||
      identity.revision !== lease.revision ||
      identity.unit !== lease.unit ||
      identity.role !== lease.role ||
      identity.cell !== lease.cell ||
      identity.attempt !== lease.attempt ||
      identity.generation !== lease.generation ||
      !new RegExp(`^delivery/native/${lease.run}/${lease.attempt}/[a-f0-9-]{36}$`).test(
        binding.directory,
      ) ||
      !['fixture', 'host-observed'].includes(binding.provenance) ||
      entry.admission?.provenance !== binding.provenance
    )
      throw new WorkerProtocolError('native-binding')
    return binding
  }

  /** Recover only the original journal-selected receipt, never the newest file. */
  retained(lease: Readonly<QueueAssignment>) {
    if (!existsSync(this.queue.lifecycle.journal.files.path(this.path(lease.attempt))))
      return undefined
    return this.retainedAt(lease, this.queue.lifecycle.journal.view(lease.run))
  }
  private retainedAt(lease: Readonly<QueueAssignment>, state: DeliveryProjection) {
    const binding = this.bindingAt(lease, state)
    if (!binding) return undefined
    const journal = this.queue.lifecycle.journal,
      attempt = deliveryAttempts(state).records.find((item) => item.id === lease.attempt),
      entry = deliveryQueue(state).records.find((item) => item.attempt === lease.attempt)
    if (
      !attempt?.evidence ||
      !['completed', 'failed', 'stopped'].includes(attempt.state) ||
      entry?.evidence !== attempt.evidence
    )
      return { binding }
    const receipt = JSON.parse(
      readSourceFile(
        journal.files.root,
        `${binding.directory}/receipt-${attempt.evidence}.json`,
        2 * 1024 * 1024,
      ),
    ) as NativeRunReceipt
    validateDeliveryShape(receipt, nativeRunSchema)
    if (
      contractDigest(receipt) !== attempt.evidence ||
      receipt.directory !== binding.directory ||
      receipt.assignment !== binding.assignment.assignment ||
      receipt.run !== lease.run ||
      receipt.attempt !== lease.attempt ||
      (receipt.execution &&
        (contractDigest(receipt.execution.identity) !==
          contractDigest(binding.assignment.identity) ||
          receipt.execution.assignment !== binding.assignment.assignment ||
          receipt.execution.provenance !== binding.provenance ||
          contractDigest(receipt.execution.runtime) !== contractDigest(attempt.runtime)))
    )
      throw new WorkerProtocolError('native-receipt-binding')
    return { binding, receipt }
  }

  /** Transport completion supplies neither current candidate acceptance nor semantic QA. */
  completed(lease: Readonly<QueueAssignment>): boolean {
    try {
      if (!this.completeAt(lease, this.queue.lifecycle.journal.view(lease.run))) return false
      // Do not promote an original result if its slot advanced during the byte audit.
      const current = this.queue.lifecycle.journal.view(lease.run),
        entry = deliveryQueue(current).records.find((entry) => entry.attempt === lease.attempt),
        attempt = deliveryAttempts(current).records.find((attempt) => attempt.id === lease.attempt)
      return (
        !!entry &&
        entry.status === 'complete' &&
        attempt?.state === 'completed' &&
        contractDigest(queueAssignment(current, entry)) === contractDigest(lease)
      )
    } catch {
      return false
    }
  }
  /** Audit an immutable original completion; this never grants a current lease or semantic QA. */
  historical(lease: Readonly<QueueAssignment>) {
    try {
      if (!existsSync(this.queue.lifecycle.journal.files.path(this.path(lease.attempt))))
        return undefined
      const events = this.queue.lifecycle.journal.events(),
        selected = events.filter(
          (event) =>
            event.run === lease.run &&
            event.payload.schema === 'wholeloop/delivery-queue-event@1' &&
            event.payload.action === 'settled' &&
            event.payload.outcome === 'complete' &&
            event.payload.id === lease.queue &&
            event.payload.attempt === lease.attempt &&
            event.payload.generation === lease.generation,
        )
      if (selected.length !== 1) return undefined
      const settlement = selected[0]
      if (!settlement) return undefined
      const state = replayDelivery(events.slice(0, events.indexOf(settlement) + 1)).get(lease.run)
      if (!state) return undefined
      const observed = this.completeAt(lease, state)
      return observed
        ? { ...observed, settlement: { event: settlement.digest, sequence: settlement.sequence } }
        : undefined
    } catch {
      return undefined
    }
  }
  private completeAt(lease: Readonly<QueueAssignment>, state: DeliveryProjection) {
    const retained = this.retainedAt(lease, state)
    if (!retained?.receipt) return undefined
    const { binding, receipt } = retained,
      attempt = deliveryAttempts(state).records.find((item) => item.id === lease.attempt),
      entry = deliveryQueue(state).records.find((item) => item.attempt === lease.attempt)
    if (
      attempt?.state !== 'completed' ||
      entry?.status !== 'complete' ||
      receipt.status !== 'succeeded' ||
      receipt.result?.status !== 'complete' ||
      receipt.execution?.status !== 'succeeded' ||
      receipt.execution.code !== 0 ||
      receipt.execution.result !== contractDigest(receipt.result) ||
      receipt.observation?.provenance !== binding.provenance
    )
      return undefined
    for (const root of [
      binding.contextRoot,
      join(this.queue.lifecycle.journal.files.path(binding.directory), 'inputs'),
    ])
      workerResumePack(binding.assignment, (artifact) =>
        readSourceBytes(root, artifact.ref, 1024 * 1024),
      )
    const artifacts = receipt.artifacts ?? []
    if (artifacts.length !== receipt.result.artifacts.length) return undefined
    workerResultArtifacts(binding.assignment, receipt.result, (artifact) => {
      const matched = artifacts.filter((item) => item.worker === artifact.ref)
      if (matched.length !== 1) throw new WorkerProtocolError('native-artifact-binding')
      const captured = matched[0]
      if (!captured || captured.digest !== artifact.sha256 || captured.bytes !== artifact.bytes)
        throw new WorkerProtocolError('native-artifact-binding')
      const bytes = readSourceBytes(
        this.queue.lifecycle.journal.files.root,
        captured.ref,
        1024 * 1024,
      )
      if (
        bytes.length !== captured.bytes ||
        createHash('sha256').update(bytes).digest('hex') !== captured.digest
      )
        throw new WorkerProtocolError('native-artifact-binding')
      return bytes
    })
    return { binding, receipt }
  }
}
