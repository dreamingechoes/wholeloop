import { type BehaviorObservation, observeAssertion } from './assertions.js'
import { behaviorInput } from './behavior-input.js'
import type { AcceptanceCase } from './contracts.js'
import { type CollectedDockerObservation, DockerObservedHost } from './docker-effect.js'
import type { DockerBehaviorRuntime } from './docker-runtime.js'
import { observeHttp } from './http.js'
import type { AcceptanceHost } from './store.js'

/** Fixed CLI/API adapter over the shared scoped observation effect. */
export class DockerBehaviorHost extends DockerObservedHost {
  readonly id = 'docker-behavior'
  constructor(...args: ConstructorParameters<typeof DockerObservedHost>) {
    super(...args)
    behaviorInput(this.test)
  }
  protected async observe(
    test: AcceptanceCase,
    context: Parameters<AcceptanceHost['execute']>[1],
    runtime: DockerBehaviorRuntime,
  ): Promise<CollectedDockerObservation> {
    const input = behaviorInput(test)
    const observation: BehaviorObservation = { requests: [] }
    let command: Awaited<ReturnType<DockerBehaviorRuntime['command']>> | undefined
    if (input.kind === 'cli') {
      command = await runtime.command(input.service, input.command ?? '', input.stdin)
      observation.application = command.application
    } else {
      let bytes = 0
      for (const step of input.steps ?? []) {
        runtime.current()
        if (step.kind === 'restart') await runtime.restart(input.service)
        else {
          const origin = await runtime.origin(input.service, input.port)
          const response = await observeHttp(
            origin,
            step,
            context.signal,
            runtime.recipe.limits.outputBytes - bytes,
          )
          bytes += Buffer.byteLength(response.text)
          observation.requests.push(response)
        }
      }
    }
    const assertions = test.assertions.map((a) => {
      const result = observeAssertion(
        a,
        observation,
        input.targets?.find((t) => t.assertion === a.id)?.step,
      )
      return { id: result.id, status: result.status }
    })
    const process = command?.process
    return {
      observation,
      assertions,
      ...(command ? { execution: command.execution } : {}),
      ...(process
        ? {
            process: {
              argv: process.argv,
              cwd: process.cwd,
              pid: process.pid,
              startedAt: process.startedAt,
              endedAt: process.endedAt,
              ...(process.code !== null ? { code: process.code } : {}),
              ...(process.signal ? { signal: process.signal } : {}),
            },
          }
        : {}),
    }
  }
}
