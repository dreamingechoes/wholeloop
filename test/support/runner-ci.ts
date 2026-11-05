import assert from 'node:assert/strict'
import { contractDigest } from '../../src/contracts/compatibility.js'
import { RunnerAcceptanceStages } from '../../src/runner/acceptance-stages.js'
import { RunnerAssemblyReadiness } from '../../src/runner/assembly-readiness.js'
import type { originalCiFailure } from '../../src/runner/ci-failure.js'
import type { CiCheck, CiObservation } from '../../src/runner/ci-observations.js'
import { RunnerFeatureReadiness } from '../../src/runner/feature-readiness.js'
import { RunnerIntegrationStages } from '../../src/runner/integration-stages.js'
import { RunnerCiStages } from '../../src/runner/merge-stages.js'
import { RunnerMilestoneReadiness } from '../../src/runner/milestone-readiness.js'
import {
  type PublicationBinding,
  publicationText,
  RunnerPublicationStages,
  RunnerPublisher,
} from '../../src/runner/publication-stages.js'
import { git, mergePolicy } from './delivery.js'
import { runnerGitFixture } from './runner-git.js'
import { StubCodeHost } from './runner-publication.js'

class PublishedFixture extends RunnerPublicationStages {
  value: Awaited<ReturnType<RunnerPublicationStages['published']>>
  override async published() {
    return structuredClone(this.value)
  }
}
/** Synthetic acceptance, actual publisher effects and fixed CI stage, stub remote only. */
export async function runnerCiFailureFixture(
  run: (input: {
    store: Parameters<typeof originalCiFailure>[0]
    input: Parameters<typeof originalCiFailure>[1]
    request: Parameters<RunnerCiStages['inspect']>[0]
    paths: string[]
    publication: string
    reads(): number
    writes(): unknown
  }) => void | Promise<void>,
  overrides: Partial<CiObservation> = {},
  conclusion: CiCheck['conclusion'] | null = 'failure',
) {
  await runnerGitFixture(
    async ({ store, request, root, digest, dispatch, observe }) => {
      const host = new StubCodeHost(),
        publisher = new RunnerPublisher(store, host),
        context = dispatch('publication'),
        target = {
          repository: 'app',
          path: root,
          remote: 'origin',
          branch: 'wl/ci-history',
          base: 'main',
          head: git(root, ['rev-parse', 'HEAD']),
        },
        binding: PublicationBinding = {
          version: 1,
          request: digest,
          plan: request.plan,
          stage: 'publication',
          invocation: context.invocation,
          at: new Date().toISOString(),
          acceptance: 'a'.repeat(64),
          ready: true,
          targets: [target],
          texts: [publicationText(context.plan, { decisions: ['b'.repeat(64)] }, target)],
        },
        base = `delivery/runner-publications/${context.invocation}`
      // Synthetic acceptance and stage binding; actual publisher effects and the
      // actual CI stage below. This component fixture certifies no hosted route.
      store.files.atomic(`${base}/consumed`, `${contractDigest(binding)}\n`)
      store.files.atomic(`${base}/binding.json`, `${JSON.stringify(binding)}\n`)
      context.started({
        backend: 'owned-core',
        instance: context.invocation,
        worker: `pid-${process.pid}`,
      })
      assert.equal(
        await publisher.publish(request.run, binding, () => undefined, context.signal),
        true,
      )
      const evidence = contractDigest({
        binding,
        effects: publisher.records(request.run, binding),
        accepted: true,
      })
      observe({
        schema: 'wholeloop/delivery-runner-stage-observation@1',
        request: digest,
        plan: request.plan,
        stage: 'publication',
        invocation: context.invocation,
        status: 'passed',
        invocationState: 'stopped',
        evidence,
        provenance: 'host-observed',
        reason: 'Synthetic accepted publication with actual owned effects against a stub host.',
      })
      const deny = () => {
          throw new Error('Historical reads never select a decision')
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
            { identity: request.host, requests: deny, host: deny },
          ),
          { identity: request.host, host },
        )
      publication.value = {
        invocation: context.invocation,
        evidence,
        ready: true,
        targets: [{ ...target, pr: host.prs[0]?.url ?? '' }],
      }
      let reads = 0
      let at = Date.now()
      const ci = new RunnerCiStages(store, publication, {
          identity: request.host,
          clock: {
            now: () => at,
            sleep: async (ms) => {
              at += ms
            },
          },
          host: {
            observe: async (target, pr): Promise<CiObservation> => {
              reads++
              return {
                schema: 'wholeloop/delivery-ci@1',
                codeHost: 'github',
                repository: 'https://github.com/fixture/app',
                pr,
                candidate: target.head,
                head: target.head,
                base: target.base,
                observedAt: new Date().toISOString(),
                complete: true,
                checks: [
                  {
                    name: 'test',
                    issuer: 'github-app:15368',
                    attempt: 1,
                    head: target.head,
                    status: 'completed',
                    ...(conclusion ? { conclusion } : {}),
                  },
                ],
                protection: {
                  status: 'observed',
                  required: [{ name: 'test', issuer: 'github-app:15368' }],
                },
                reviews: { status: 'observed', required: 0, approvals: 0 },
                provenance: 'host-observed',
                ...overrides,
              }
            },
          },
        }),
        ciContext = dispatch('ci'),
        observed = await ci.execute(ciContext)
      observe(observed)
      const ciBase = `delivery/runner-ci-stages/${ciContext.invocation}`,
        result = JSON.parse(store.files.read(`${ciBase}/result.json`) ?? ''),
        entry = result.targets[0]
      await run({
        store,
        request,
        input: { request: digest, failure: observed.evidence, repository: 'app' },
        publication: evidence,
        paths: [
          `${base}/consumed`,
          `${base}/binding.json`,
          `${ciBase}/consumed`,
          `${ciBase}/binding.json`,
          `${ciBase}/result.json`,
          `delivery/runner-ci/${request.run}/${entry.observations[0]}.json`,
          ...(entry.repair
            ? [`delivery/runner-ci-repairs/${request.run}/${entry.repair}.json`]
            : []),
        ],
        reads: () => reads,
        writes: () => ({ ...host.writes }),
      })
    },
    {
      singleUnit: true,
      effects: ['git.push', 'pr.create', 'pr.ready'],
      configure: (plan) => {
        plan.policy.endpoint = 'to-merge'
        plan.policy.merge = mergePolicy()
        for (const repo of plan.repositories) {
          git(repo.root, ['remote', 'add', 'origin', 'https://github.com/fixture/app.git'])
          repo.remote = { name: 'origin', url: 'https://github.com/fixture/app' }
        }
      },
    },
  )
}
