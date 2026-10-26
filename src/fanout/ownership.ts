import { AsyncLocalStorage } from 'node:async_hooks'
import type { workerProcess } from './process.js'

export type OwnedWorkerInvocation = (
  command: string,
  args: string[],
  options: Parameters<typeof workerProcess>[2],
) => ReturnType<typeof workerProcess>
const ownership = new AsyncLocalStorage<OwnedWorkerInvocation>()
/** Fixed controller scopes can retain native invocations without widening any adapter's tool policy. */
export function withWorkerOwnership<T>(
  invoke: OwnedWorkerInvocation,
  operation: () => Promise<T>,
): Promise<T> {
  return ownership.run(invoke, operation)
}
export function currentWorkerOwnership(): OwnedWorkerInvocation | undefined {
  return ownership.getStore()
}
