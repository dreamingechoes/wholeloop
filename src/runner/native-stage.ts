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
      const ownership = (result as { ownership?: { invocationState?: string } }).ownership
        ?.invocationState
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
