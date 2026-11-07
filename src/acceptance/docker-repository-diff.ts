// The host that observes committed repository changes through the original controller.
import { contractDigest } from '../contracts/compatibility.js'
import { type BehaviorObservation, observeAssertion } from './assertions.js'
import { type AcceptanceCase, AcceptanceError } from './contracts.js'
import { type CollectedDockerObservation, DockerObservedHost } from './docker-effect.js'
import type { DockerBehaviorRuntime } from './docker-runtime.js'
import { observeRepositoryDiff, type RepositoryDiffReader } from './repository-diff.js'
import { repositoryDiffFixture, repositoryDiffInput } from './repository-diff-input.js'
import type { AcceptanceHost } from './store.js'

/** Observe committed scope through the original controller owner, never worker commands. */
export class DockerRepositoryDiffHost extends DockerObservedHost {
  readonly id = 'docker-repository-diff'
  constructor(
    args: ConstructorParameters<typeof DockerObservedHost>,
    readonly reader?: RepositoryDiffReader,
  ) {
    super(...args)
    repositoryDiffInput(this.test)
    if (!reader) throw new AcceptanceError('repository-diff-owner-unavailable')
  }
  protected async observe(
    test: AcceptanceCase,
    context: Parameters<AcceptanceHost['execute']>[1],
    runtime: DockerBehaviorRuntime,
  ): Promise<CollectedDockerObservation> {
    const input = repositoryDiffInput(test),
      { plan } = this.acceptance.get(this.digest),
      repository = this.acceptance.planning
        .getPlan(plan.run, plan.revision)
        .plan.repositories.find((repository) => repository.id === input.repository),
      environment = runtime.records.get(runtime.environment).record,
      candidate = environment.candidates.find(
        (candidate) => candidate.repository === input.repository,
      ),
      binding = context.bindings.candidates.find(
        (candidate) => candidate.repository === input.repository,
      )
    if (
      !repository ||
      !candidate ||
      !binding ||
      !this.reader ||
      binding.head !== candidate.head ||
      binding.snapshot !== candidate.snapshot ||
      contractDigest(test.fixture) !==
        contractDigest(repositoryDiffFixture(repository.id, repository.base))
    )
      throw new AcceptanceError('repository-diff-binding')
    const result = await observeRepositoryDiff(
      {
        repository: repository.id,
        path: candidate.path,
        base: repository.base,
        head: candidate.head,
        snapshot: candidate.snapshot,
      },
      { invocation: context.invocation, deadline: runtime.deadline, signal: runtime.signal },
      this.reader,
      runtime.current,
    )
    const observation: BehaviorObservation = {
      application: { code: 0, stdout: JSON.stringify(result.observation), stderr: '' },
      requests: [],
    }
    return {
      ...result,
      assertions: test.assertions.map((assertion) => {
        const result = observeAssertion(assertion, observation)
        return { id: result.id, status: result.status }
      }),
    }
  }
}
