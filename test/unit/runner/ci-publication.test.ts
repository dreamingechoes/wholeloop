import { expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { continueCiDelivery } from '../../../src/runner/ci-continuation.js'
import { ciCorrectionOrigin } from '../../../src/runner/ci-correction-origin.js'
import { type CiFeedbackRead, ciFeedbackEvidence } from '../../../src/runner/ci-feedback.js'
import { ciPublicationTargets, ciPublishedTarget } from '../../../src/runner/ci-publication.js'
import {
  publicationMarker,
  publicationText,
  RunnerPublisher,
} from '../../../src/runner/publication-stages.js'
import { authorization, git } from '../../support/delivery.js'
import { runnerCiFailureFixture } from '../../support/runner-ci.js'
import { StubCodeHost } from '../../support/runner-publication.js'

it.each(['pass', 'feedback', 'head', 'foreign-pr', 'missing-feedback'] as const)(
  'keeps the original owned PR and topic for %s without creating a replacement',
  async (mode) => {
    await runnerCiFailureFixture(async ({ store, request, input }) => {
      const old = store.record(input.request)
      if (!old.controller) throw new Error('Original fixture owner required')
      store.release(
        { request: input.request, controller: old.controller, generation: old.generation },
        'Close the original fixture controller.',
      )
      store.lifecycle.transition(request.run, {
        to: 'failed',
        outcome: 'failed',
        reason: 'Retain the original synthetic CI failure.',
      })
      continueCiDelivery(
        store.lifecycle,
        request.run,
        { request: input.request, unit: 'search' },
        { operator: 'Fixture Operator', reason: 'Propose only a bounded CI correction.' },
      )
      const next = store.planning.getPlan(request.run, 2),
        grant = store.lifecycle.authority.authorize({
          ...authorization(next.plan, next.digest),
          id: 'authorization-fedcba9876543210',
          effects: store.lifecycle.authority.inspect(request.grant).grant.effects,
        })
      store.lifecycle.track({ run: request.run, revision: 2, grant: grant.grant.id })
      const revised = {
          ...request,
          key: 'ci-publication',
          revision: 2,
          plan: next.digest,
          grant: grant.grant.id,
        },
        digest = store.prepare(revised).digest,
        lease = store.claim(digest, `controller-${'b'.repeat(32)}`),
        origin = ciCorrectionOrigin(store, next.plan),
        original = origin?.proof.target
      if (!original) throw new Error('Fixed original publication required')
      const root = next.plan.repositories[0]?.root
      if (!root) throw new Error('Pinned repository required')
      const head = git(root, [
          'commit-tree',
          git(root, ['rev-parse', 'HEAD^{tree}']),
          '-p',
          original.head,
          '-m',
          'fix: retain a synthetic corrected candidate',
          '-m',
          'Exercise owned effects and original PR reuse without native acceptance.',
        ]),
        target = ciPublicationTargets(store, next.plan, [
          { ...original, path: root, branch: 'wl/new-assembly', head },
        ])[0]
      if (!target) throw new Error('Corrected target required')
      expect(target.branch).toBe(original.branch)
      class Host extends StubCodeHost {
        override async push(value: NonNullable<typeof target>) {
          this.writes.push++
          expect(this.tips.get(value.branch)).toBe(original?.head)
          this.tips.set(value.branch, value.head)
          for (const pr of this.prs) pr.sha = value.head
        }
        async readFeedback(value: NonNullable<typeof target>, pr: string): Promise<CiFeedbackRead> {
          if (mode === 'missing-feedback') throw new Error('Private read error canary')
          const facts: Omit<CiFeedbackRead, 'evidence'> = {
            schema: 'wholeloop/delivery-ci-feedback@1',
            repository: 'https://github.com/fixture/app',
            pr,
            head: value.head,
            base: value.base,
            observedAt: new Date().toISOString(),
            complete: true,
            items:
              mode === 'feedback'
                ? [
                    {
                      identity: 'e'.repeat(64),
                      origin: 'pr-comment',
                      revision: value.head,
                      current: true,
                      adopted: false,
                      source: 'issue-comment',
                      revisionSource: 'current-head-snapshot',
                    },
                  ]
                : [],
            provenance: 'host-observed',
          }
          return { ...facts, evidence: ciFeedbackEvidence(facts) }
        }
      }
      const host = new Host()
      host.tips.set(original.branch, mode === 'head' ? 'd'.repeat(40) : original.head)
      host.prs.push({
        url: mode === 'foreign-pr' ? 'https://github.com/fixture/app/pull/999' : original.pr,
        branch: original.branch,
        base: original.base,
        sha: original.head,
        draft: false,
        state: 'open',
        body: publicationMarker(request.run, original.repository),
      })
      const publication = {
          plan: next.digest,
          ready: true,
          targets: [target],
          texts: [publicationText(next.plan, { decisions: ['a'.repeat(64)] }, target)],
        },
        publisher = new RunnerPublisher(store, host),
        current = () => {
          if (!store.live(lease, false)) throw new Error('Fixture owner no longer current')
        },
        result = await publisher.publish(
          request.run,
          publication,
          current,
          new AbortController().signal,
        )
      expect(result).toBe(mode === 'pass')
      expect(host.writes).toEqual({ push: mode === 'pass' ? 1 : 0, create: 0, ready: 0 })
      expect(host.prs).toHaveLength(1)
      if (mode === 'pass') {
        expect(host.prs[0]?.url).toBe(original.pr)
        expect(host.prs[0]?.sha).toBe(head)
        expect(ciPublishedTarget(store, request.run, publication, target, host.prs)?.pr).toBe(
          original.pr,
        )
        expect(
          ciPublishedTarget(
            store,
            request.run,
            publication,
            target,
            host.prs.map((pr) => ({ ...pr, url: 'https://github.com/fixture/app/pull/999' })),
          ),
        ).toBeUndefined()
        expect(
          ciPublishedTarget(
            store,
            request.run,
            publication,
            target,
            host.prs.map((pr) => ({ ...pr, draft: true })),
          ),
        ).toBeUndefined()
        expect(publisher.records(request.run, publication)[0]).toMatchObject({
          push: { status: 'applied' },
          create: { status: 'applied' },
          ready: { status: 'applied' },
        })
        const events = contractDigest(store.lifecycle.journal.events())
        expect((await publisher.observe(request.run, publication)).complete).toBe(true)
        expect(contractDigest(store.lifecycle.journal.events())).toBe(events)
        expect(host.writes.push).toBe(1)
      }
    })
  },
)
