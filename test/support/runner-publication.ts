import type { DeliveryPlan } from '../../src/delivery/plan.js'
import {
  publicationText,
  type RunnerCodeHost,
  type RunnerPublication,
  type RunnerPublicationTarget,
  RunnerPublisher,
  type RunnerPullRequest,
} from '../../src/runner/publication-stages.js'
import { RunnerStore } from '../../src/runner/store.js'
import { authorization, fixture, git } from './delivery.js'

type Step = 'push' | 'create' | 'ready'
/** An in-memory stub code host: no network, account or hosted semantics are certified. */
export class StubCodeHost implements RunnerCodeHost {
  readonly provenance = 'host-observed' as const
  readonly tips = new Map<string, string>()
  readonly prs: RunnerPullRequest[] = []
  readonly writes: Record<Step, number> = { push: 0, create: 0, ready: 0 }
  readonly lose = new Set<Step>()
  readonly fail = new Set<Step | 'read'>()
  async remoteHead(target: Readonly<RunnerPublicationTarget>) {
    if (this.fail.has('read')) throw new Error('Incomplete stub read.')
    return this.tips.get(target.branch) ?? null
  }
  async push(target: Readonly<RunnerPublicationTarget>) {
    this.writes.push++
    if (this.fail.has('push')) throw new Error('Stub push rejected.')
    const tip = this.tips.get(target.branch)
    if (tip && tip !== target.head) throw new Error('Stub non-fast-forward rejection.')
    this.tips.set(target.branch, target.head)
    if (this.lose.has('push')) throw new Error('Stub lost push response.')
  }
  async pullRequests(target: Readonly<RunnerPublicationTarget>) {
    if (this.fail.has('read')) throw new Error('Incomplete stub read.')
    return structuredClone(this.prs.filter((pr) => pr.branch === target.branch))
  }
  async create(
    target: Readonly<RunnerPublicationTarget>,
    text: Readonly<{ title: string; body: string }>,
  ) {
    this.writes.create++
    this.prs.push({
      url: `https://github.com/fixture/app/pull/${this.prs.length + 1}`,
      branch: target.branch,
      base: target.base,
      sha: target.head,
      draft: true,
      state: 'open',
      body: text.body,
    })
    if (this.lose.has('create')) throw new Error('Stub lost create response.')
  }
  async ready(_target: Readonly<RunnerPublicationTarget>, url: string) {
    this.writes.ready++
    const pr = this.prs.find((entry) => entry.url === url)
    if (pr) pr.draft = false
    if (this.lose.has('ready')) throw new Error('Stub lost ready response.')
  }
}
export async function publicationFixture(
  run: (input: {
    store: RunnerStore
    plan: DeliveryPlan
    host: StubCodeHost
    publisher: RunnerPublisher
    publication: RunnerPublication
    target: RunnerPublicationTarget
    grant: string
  }) => Promise<void>,
  options: { effects?: string[]; ready?: boolean; endpoint?: 'to-pr' | 'to-merge' } = {},
) {
  await fixture(async ({ planning, plan, root }) => {
    git(root, ['remote', 'add', 'origin', 'https://github.com/fixture/app.git'])
    const repository = plan.repositories[0]
    if (!repository) throw new Error('Fixture repository required')
    repository.remote = { name: 'origin', url: 'https://github.com/fixture/app' }
    plan.policy.endpoint = options.endpoint ?? 'to-pr'
    const prepared = planning.preparePlan(plan),
      store = new RunnerStore(planning.sources.files.root),
      request = authorization(plan, prepared.digest)
    request.effects = (options.effects ?? [
      ...request.effects,
      'git.push',
      'pr.create',
      'pr.ready',
    ]) as typeof request.effects
    const grant = store.lifecycle.authority.authorize(request)
    store.lifecycle.track({ run: plan.run, revision: 1, grant: grant.grant.id })
    store.lifecycle.transition(plan.run, { to: 'queued', reason: 'Publish a fixture candidate.' })
    const host = new StubCodeHost(),
      target: RunnerPublicationTarget = {
        repository: 'app',
        path: root,
        remote: 'origin',
        branch: 'wl/integration-fixture',
        base: 'main',
        head: git(root, ['rev-parse', 'HEAD']).trim(),
      }
    await run({
      store,
      plan,
      host,
      target,
      grant: grant.grant.id,
      publisher: new RunnerPublisher(store, host),
      publication: {
        plan: prepared.digest,
        ready: options.ready ?? false,
        targets: [target],
        texts: [publicationText(plan, { decisions: ['d'.repeat(64)] }, target)],
      },
    })
  })
}
