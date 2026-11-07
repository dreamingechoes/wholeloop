// Runs one native stage under its root registration and deadline.
import { basename } from 'node:path'
import { contractDigest } from '../contracts/compatibility.js'
import type { NativeProcessRunner } from '../delivery/native-host.js'
import { workerProcess } from '../fanout/process.js'
import type { RunnerStageContext } from './engine.js'
import { RunnerNativeScope } from './native-scope.js'
import { DeliveryRunnerError } from './route.js'
import type { RunnerStore } from './store.js'

/** Boundary controls and models share the original root registration and deadline. */
export class RunnerNativeStage {
  readonly scope: RunnerNativeScope
  constructor(
    readonly store: RunnerStore,
    readonly context: RunnerStageContext,
    readonly observed?: (invocation: string) => void,
  ) {
    this.scope = new RunnerNativeScope(store.files, context.invocation)
  }
  run<T>(operation: (process: NativeProcessRunner) => Promise<T>) {
    const context = this.context
    let registered =
      this.store.stage(contractDigest(context.request), context.stage.id)?.runtime !== undefined
    const process: NativeProcessRunner = async (command, args, options) => {
      const remaining = Date.parse(context.deadline) - Date.now()
      if (remaining <= 0 || context.signal.aborted || !context.current())
        throw new DeliveryRunnerError('native-stage-no-longer-current')
      const result = await workerProcess(command, args, {
        ...options,
        timeoutMs: Math.max(1, Math.min(options.timeoutMs, remaining)),
        started: (pid) => {
          if (!registered) {
            context.started({
              backend: 'owned-native',
              instance: context.invocation,
              worker: `pid-${pid}`,
            })
            registered = true
          }
          options.started?.(pid)
        },
      })
      const observation = (
          result as { ownership?: { invocation?: string; invocationState?: string } }
        ).ownership,
        ownership = observation?.invocationState
      if (this.observed && this.scope.clients.includes(basename(command))) {
        if (!observation?.invocation || !/^[a-f0-9]{64}$/.test(observation.invocation))
          throw new DeliveryRunnerError('native-stage-call-observation')
        this.observed(observation.invocation)
      }
      return {
        ...result,
        ownership: {
          invocationState:
            ownership === 'stopped' || ownership === 'not-started' ? ownership : 'unknown',
        },
      }
    }
    return this.scope.run(
      () => !context.signal.aborted && context.current(),
      () => operation(process),
    )
  }
}
