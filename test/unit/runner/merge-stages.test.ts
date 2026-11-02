import { existsSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { DeliveryPlan } from '../../../src/delivery/plan.js'
import { RunnerAcceptanceStages } from '../../../src/runner/acceptance-stages.js'
import { RunnerAssemblyReadiness } from '../../../src/runner/assembly-readiness.js'
import type { CiObservation, RunnerCiHost } from '../../../src/runner/ci-observations.js'
import type { RunnerStageContext } from '../../../src/runner/engine.js'
import { RunnerFeatureReadiness } from '../../../src/runner/feature-readiness.js'
import { RunnerIntegrationStages } from '../../../src/runner/integration-stages.js'
import type {
  RunnerMergeFacts,
  RunnerMergeFactsHost,
  RunnerMergeHost,
  RunnerMergeRead,
  RunnerMergeTarget,
} from '../../../src/runner/merge-execution.js'
import { RunnerCiStages, RunnerMergeStages } from '../../../src/runner/merge-stages.js'
import { RunnerMilestoneReadiness } from '../../../src/runner/milestone-readiness.js'
import {
  RunnerPublicationStages,
  type RunnerPublicationTarget,
} from '../../../src/runner/publication-stages.js'
import { runnerRoute } from '../../../src/runner/route.js'
import { RunnerStageDispatcher } from '../../../src/runner/stage-dispatcher.js'
import type { RunnerRequest, RunnerStore } from '../../../src/runner/store.js'
import { git, mergePolicy } from '../../support/delivery.js'
import { runnerGitFixture } from '../../support/runner-git.js'
import { StubCodeHost } from '../../support/runner-publication.js'

const ISSUER = 'github-app:15368',
  PR = 'https://github.com/fixture/app/pull/7'
/** Only `published()` is replaced; a complete accepted publication is covered by its own tests. */
class PublishedFixture extends RunnerPublicationStages {
  value: Awaited<ReturnType<RunnerPublicationStages['published']>>
  override async published() {
    return structuredClone(this.value)
  }
}
/** In-memory stub CI host: no hosted check, protection or review semantics are certified. */
class StubCi implements RunnerCiHost {
  conclusion: 'success' | 'failure' = 'success'
  reads = 0
  async observe(target: Readonly<{ head: string }>, pr: string): Promise<CiObservation> {
    this.reads++
    return {
      schema: 'wholeloop/delivery-ci@1',
      codeHost: 'github',
      repository: 'https://github.com/fixture/app',
      pr,
      candidate: target.head,
      head: target.head,
      base: 'main',
      observedAt: new Date().toISOString(),
      complete: true,
      checks: [
        {
          name: 'test',
          issuer: ISSUER,
          attempt: 1,
          head: target.head,
          status: 'completed',
          conclusion: this.conclusion,
        },
      ],
      protection: {
        status: 'observed',
        required: [{ name: 'test', issuer: ISSUER }],
        strict: true,
      },
      reviews: { status: 'observed', required: 0, approvals: 0 },
      provenance: 'host-observed',
    }
  }
}
class StubFacts implements RunnerMergeFactsHost {
  readonly provenance = 'host-observed' as const
  change: Partial<RunnerMergeFacts> = {}
  async facts(target: Readonly<RunnerMergeTarget>): Promise<RunnerMergeFacts> {
    return {
      state: 'open',
      draft: false,
      head: target.head,
      base: 'main',
      mergeable: true,
      files: ['src/search.ts'],
      unresolvedDiscussions: 0,
      allowedMethods: ['squash'],
      baseCurrent: true,
      observedAt: new Date().toISOString(),
      ...this.change,
    }
  }
}
class StubMerge implements RunnerMergeHost {
  readonly provenance = 'host-observed' as const
  readonly prs = new Map<string, RunnerMergeRead>()
  merges = 0
  other = false
  async actor() {
    return 'wholeloop-operator'
  }
  async read(target: Readonly<RunnerMergeTarget>) {
    return structuredClone(this.prs.get(target.pr) ?? { state: 'open' as const, head: target.head })
  }
  async merge(target: Readonly<RunnerMergeTarget>) {
    this.merges++
    this.prs.set(target.pr, {
      state: 'merged',
      head: target.head,
      mergeCommit: 'd'.repeat(40),
      mergedBy: this.other ? 'someone-else' : 'wholeloop-operator',
    })
  }
}

const remote = (plan: DeliveryPlan) => {
  for (const repository of plan.repositories) {
    git(repository.root, ['remote', 'add', 'origin', 'https://github.com/fixture/app.git'])
    repository.remote = { name: 'origin', url: 'https://github.com/fixture/app' }
  }
}
function compose(store: RunnerStore, identity: RunnerRequest['host'], allowsMerge = true) {
  const deny = () => {
      throw new Error('CI and merge never select a model or judgment')
    },
    publication = new PublishedFixture(
      store,
      new RunnerAcceptanceStages(
        store,
        new RunnerFeatureReadiness(
          store,
          new RunnerIntegrationStages(
            store,
            new RunnerAssemblyReadiness(store, new RunnerMilestoneReadiness(store, new Map())),
          ),
        ),
        { identity, requests: deny, host: deny },
      ),
      { identity, host: new StubCodeHost() },
    ),
    ci = new StubCi(),
    facts = new StubFacts(),
    merge = new StubMerge(),
    dispatcher = new RunnerStageDispatcher(store, identity, {
      publication,
      ci: new RunnerCiStages(store, publication, {
        identity,
        host: ci,
        clock: { now: () => Date.now(), sleep: async () => undefined },
      }),
      merge: new RunnerMergeStages(store, publication, {
        identity,
        facts,
        ci,
        merge,
        runtime: { allowsMerge },
      }),
    })
  return { publication, ci, facts, merge, dispatcher }
}
async function setup(
  run: (input: {
    store: RunnerStore
    request: RunnerRequest
    digest: string
    root: string
    dispatch(id: string): RunnerStageContext
    pass(id: string): void
    composed: ReturnType<typeof compose>
    target: RunnerPublicationTarget & { pr: string }
  }) => Promise<void>,
) {
  await runnerGitFixture(
    async ({ store, request, digest, root, dispatch, observe }) => {
      const composed = compose(store, request.host),
        target = {
          repository: 'app',
          path: root,
          remote: 'origin',
          branch: 'wl/integration-fixture',
          base: 'main',
          head: git(root, ['rev-parse', 'HEAD']).trim(),
          pr: PR,
        }
      composed.publication.value = {
        invocation: 'a'.repeat(64),
        evidence: 'b'.repeat(64),
        ready: true,
        targets: [target],
      }
      // Synthetic stage records stand in for evidence the stage tests cover; they
      // certify nothing beyond this composition.
      const pass = (id: string) => {
        const context = dispatch(id)
        context.started({ backend: 'fixture', instance: context.invocation, worker: id })
        observe({
          schema: 'wholeloop/delivery-runner-stage-observation@1',
          request: digest,
          plan: request.plan,
          stage: id,
          invocation: context.invocation,
          status: 'passed',
          invocationState: 'stopped',
          evidence: 'c'.repeat(64),
          provenance: 'host-observed',
          reason: 'Synthetic evidence for composition only.',
        })
      }
      await run({ store, request, digest, root, dispatch, pass, composed, target })
    },
    {
      singleUnit: true,
      effects: ['git.push', 'pr.create', 'pr.ready', 'pr.merge'],
      configure: (plan) => {
        plan.policy.endpoint = 'to-merge'
        plan.policy.merge = mergePolicy()
        remote(plan)
      },
    },
  )
}
const EVIDENCE = [
  'verification:search',
  'review:search',
  'reverification:search',
  'integration:feature',
  'acceptance',
]
const observeStage = async (
  composed: ReturnType<typeof compose>,
  dispatch: (id: string) => RunnerStageContext,
  store: RunnerStore,
  digest: string,
  id: string,
) => {
  const context = dispatch(id),
    value = await composed.dispatcher.execute(context)
  store.append(leaseOf(store, digest), {
    action: 'observed',
    stage: value.stage,
    invocation: value.invocation,
    status: value.status,
    evidence: value.evidence,
    provenance: value.provenance,
    reason: value.reason,
  })
  return value
}
const leaseOf = (store: RunnerStore, digest: string) => {
  const status = store.inspect(digest)
  return { request: digest, controller: status.controller ?? '', generation: status.generation }
}

describe('to-merge route composition (ADR-0199, stub code host)', () => {
  it('routes publication, CI and merge before the handoff and needs the runtime allowance', () =>
    setup(async ({ store, request, digest }) => {
      const plan = store.basis(request).plan
      expect(
        runnerRoute(plan)
          .map((stage) => stage.id)
          .slice(-4),
      ).toEqual(['publication', 'ci', 'merge', 'handoff'])
      const allowed = compose(store, request.host).dispatcher,
        denied = compose(store, request.host, false).dispatcher
      for (const id of ['publication', 'ci', 'merge', 'handoff'])
        expect(allowed.coverage(plan).unsupported).not.toContain(id)
      const preflight = (dispatcher: RunnerStageDispatcher) =>
        dispatcher.preflight(
          request,
          plan,
          store.inspect(digest).route,
          new AbortController().signal,
        )
      expect(await preflight(denied)).toMatchObject({
        available: false,
        reason: 'dispatcher-merge-runtime-denied',
      })
      expect((await preflight(allowed)).reason).not.toBe('dispatcher-merge-runtime-denied')
    }))
  it('waits for passing CI, merges once at the exact head and hands off its own merge', () =>
    setup(async ({ store, request, digest, dispatch, pass, composed, target }) => {
      for (const id of EVIDENCE) pass(id)
      expect(await observeStage(composed, dispatch, store, digest, 'ci')).toMatchObject({
        status: 'passed',
      })
      const merged = await observeStage(composed, dispatch, store, digest, 'merge')
      expect(merged).toMatchObject({ status: 'passed', invocationState: 'stopped' })
      expect(composed.merge.merges).toBe(1)
      expect(composed.merge.prs.get(PR)).toMatchObject({ state: 'merged', head: target.head })
      expect(await observeStage(composed, dispatch, store, digest, 'handoff')).toMatchObject({
        status: 'passed',
      })
      const plan = store.basis(request).plan
      expect(
        await composed.dispatcher.endpoint(request, plan, new AbortController().signal),
      ).toMatchObject({ outcome: 'merged', current: true, provenance: 'host-observed' })
      // Inspecting again never issues another merge.
      const record = store.stage(digest, 'merge')
      if (!record) throw new Error('Merge record required')
      await composed.dispatcher.inspect(request, record, new AbortController().signal)
      expect(composed.merge.merges).toBe(1)
    }))
  it('fails CI with a retained repair request and never reaches the merge', () =>
    setup(async ({ store, request, digest, dispatch, pass, composed }) => {
      for (const id of EVIDENCE) pass(id)
      composed.ci.conclusion = 'failure'
      expect(await observeStage(composed, dispatch, store, digest, 'ci')).toMatchObject({
        status: 'failed',
      })
      const repairs = store.files.path(`delivery/runner-ci-repairs/${request.run}`)
      expect(existsSync(repairs) && readdirSync(repairs).length).toBe(1)
      expect(await observeStage(composed, dispatch, store, digest, 'merge')).toMatchObject({
        status: 'blocked',
        invocationState: 'not-started',
      })
      expect(composed.merge.merges).toBe(0)
    }))
  it.each([
    ['a sensitive path', { files: ['.github/workflows/release.yml'] }],
    ['unknown discussions', { unresolvedDiscussions: 'unknown' as const }],
    ['a stale base', { baseCurrent: false }],
    ['unknown mergeability', { mergeable: 'unknown' as const }],
    ['a disallowed method', { allowedMethods: ['merge' as const] }],
    ['a draft PR', { draft: true }],
  ])('refuses to merge with %s and claims nothing', (_name, change) =>
    setup(async ({ store, digest, dispatch, pass, composed }) => {
      for (const id of EVIDENCE) pass(id)
      await observeStage(composed, dispatch, store, digest, 'ci')
      composed.facts.change = change
      expect(await observeStage(composed, dispatch, store, digest, 'merge')).toMatchObject({
        status: 'blocked',
      })
      expect(composed.merge.merges).toBe(0)
    }),
  )
  it('refuses without complete evidence for the final candidate', () =>
    setup(async ({ store, digest, dispatch, pass, composed }) => {
      for (const id of EVIDENCE.filter((entry) => entry !== 'acceptance')) pass(id)
      await observeStage(composed, dispatch, store, digest, 'ci')
      expect(await observeStage(composed, dispatch, store, digest, 'merge')).toMatchObject({
        status: 'blocked',
      })
      expect(composed.merge.merges).toBe(0)
    }))
  it('never hands off a merge someone else performed', () =>
    setup(async ({ store, request, digest, dispatch, pass, composed }) => {
      for (const id of EVIDENCE) pass(id)
      await observeStage(composed, dispatch, store, digest, 'ci')
      composed.merge.other = true
      expect(await observeStage(composed, dispatch, store, digest, 'merge')).toMatchObject({
        status: 'unknown',
      })
      await expect(
        composed.dispatcher.endpoint(
          request,
          store.basis(request).plan,
          new AbortController().signal,
        ),
      ).rejects.toThrow('merge-endpoint-unavailable')
    }))
})
