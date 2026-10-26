import { DeliveryBudgets } from './budgets.js'
import { NativeAssignmentHost, type NativeRunOptions } from './native-assignment-host.js'
import type { DeliveryQueue, QueueAssignment } from './queue.js'
import { currentWorkerAssignment, workerContextForClaim } from './worker-context.js'

export type {
  NativeBoundaryHost,
  NativeProcessRunner,
  NativeRunOptions,
  NativeRunReceipt,
} from './native-assignment-host.js'

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
    }).run(context, options)
  }
}
