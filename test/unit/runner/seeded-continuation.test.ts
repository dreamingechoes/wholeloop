import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { DeliveryWorkspaces } from '../../../src/delivery/workspaces.js'
import { continueDelivery } from '../../../src/runner/continuation.js'
import {
  DeliveryRunner,
  type DeliveryRunnerHost,
  type RunnerStageObservation,
} from '../../../src/runner/engine.js'
import { RunnerGitStages } from '../../../src/runner/git-stages.js'
import { type RunnerRequest, RunnerStore } from '../../../src/runner/store.js'
import { authorization, fixture, git } from '../../support/delivery.js'

const FAILURE = 'f'.repeat(64)

/**
 * Real owned Git workspace and commit stages; every other stage is a
 * synthetic observation. The first run's implementation edits the unit and
 * its integration fails; the continuation's implementation changes nothing.
 */
function hybridHost(store: RunnerStore, identity: RunnerRequest['host']) {
  const git = new RunnerGitStages(store),
    issued = new Map<string, RunnerStageObservation>(),
    state = { failing: true, edit: true }
  const host: DeliveryRunnerHost = {
    identity,
    preflight: async () => ({
      available: true,
      interactive: 'disabled',
      humanRequired: false,
      reason: 'The explicit hybrid controller protocol is available.',
    }),
    execute: async (context) => {
      if (['workspace', 'commit'].includes(context.stage.kind)) return git.execute(context)
      context.started({
        backend: 'fixture',
        instance: context.invocation,
        worker: context.stage.id,
      })
      if (context.stage.kind === 'implementation' && state.edit)
        writeFileSync(
          join(git.workspace(context.request, 'search').repository.path, 'app.txt'),
          'Original owned implementation.\n',
        )
      const failed = state.failing && context.stage.kind === 'integration',
        observation: RunnerStageObservation = {
          schema: 'wholeloop/delivery-runner-stage-observation@1',
          plan: contractDigest(context.plan),
          request: contractDigest(context.request),
          stage: context.stage.id,
          invocation: context.invocation,
          status: failed ? 'failed' : 'passed',
          invocationState: 'stopped',
          evidence: failed ? FAILURE : contractDigest({ stage: context.stage.id }),
          provenance: 'fixture',
          reason: failed
            ? 'Original bounded product QA fails at the current QA-ready assembly.'
            : 'The selected normalized fixture host observed its exact stage.',
        }
      issued.set(context.invocation, observation)
      return observation
    },
    inspect: async (request, record) => {
      if (['workspace:', 'commit:'].some((prefix) => record.id.startsWith(prefix)))
        return git.inspect(request, record)
      const observation = issued.get(record.invocation)
      if (!observation) throw new Error('Unknown invocation')
      return structuredClone(observation)
    },
    endpoint: async () => {
      throw new Error('No endpoint is certified by the hybrid host.')
    },
  }
  return { host, state, git }
}

describe('seeded workspaces in a correction continuation (ADR-0208)', () => {
  it('starts the corrected unit at its failed head and commits even an unchanged pass', () =>
    fixture(async ({ planning, plan }) => {
      plan.work = plan.work
        .filter((work) => work.id === 'search')
        .map((work) => ({ ...work, after: [], consumes: [] }))
      plan.milestones = plan.milestones.map((milestone) => ({ ...milestone, work: ['search'] }))
      plan.policy.intervention = 'supervised'
      const store = new RunnerStore(planning.sources.files.root),
        prepared = planning.preparePlan(plan),
        grant = store.lifecycle.authority.authorize(authorization(plan, prepared.digest))
      store.lifecycle.track({ run: plan.run, revision: 1, grant: grant.grant.id })
      const request: RunnerRequest = {
          schema: 'wholeloop/delivery-runner-request@1',
          key: 'first',
          run: plan.run,
          revision: 1,
          plan: prepared.digest,
          grant: grant.grant.id,
          host: { id: 'fixture', version: '1', configuration: 'a'.repeat(64) },
          pollMs: 50,
        },
        hybrid = hybridHost(store, request.host),
        first = store.prepare(request),
        result = await new DeliveryRunner(store).run(first.digest, hybrid.host),
        failure = result.stages.find((stage) => stage.id.startsWith('integration:'))
      expect(failure?.status).toBe('failed')
      const failed = hybrid.git.candidate(request, 'search')
      expect(
        continueDelivery(
          store.lifecycle,
          plan.run,
          { request: first.digest, stage: failure?.id ?? '', unit: 'search' },
          { operator: 'Fixture Operator', reason: 'Repair the failed integration case.' },
        ).accepted,
      ).toBe(true)
      const next = store.planning.getPlan(plan.run, 2),
        renewed = store.lifecycle.authority.authorize({
          ...authorization(next.plan, next.digest),
          id: 'authorization-fedcba9876543210',
        })
      store.lifecycle.track({ run: plan.run, revision: 2, grant: renewed.grant.id })
      hybrid.state.failing = false
      hybrid.state.edit = false
      const successor = store.prepare({
          ...request,
          key: 'continuation-1',
          revision: 2,
          plan: next.digest,
          grant: renewed.grant.id,
        }),
        continued = await new DeliveryRunner(store).run(successor.digest, hybrid.host),
        renewedRequest = store.get(successor.digest)
      for (const id of ['workspace:search', 'commit:search'])
        expect(continued.stages.find((stage) => stage.id === id)).toMatchObject({
          status: 'passed',
        })
      // The new topic, under the new grant, starts at exactly the failed head.
      const seeded = hybrid.git.workspace(renewedRequest, 'search'),
        corrected = hybrid.git.candidate(renewedRequest, 'search')
      expect(seeded.grant).toBe(renewed.grant.id)
      expect(seeded.seed?.head).toBe(failed.receipt.head)
      expect(seeded.repository.branch).not.toBe(failed.allocation.repository.branch)
      // Nothing changed on top of it, so the owned commit is empty but its own.
      expect(corrected.receipt.parent).toBe(failed.receipt.head)
      expect(corrected.receipt.head).not.toBe(failed.receipt.head)
      expect(
        git(seeded.repository.path, [
          'diff',
          '--stat',
          failed.receipt.head,
          corrected.receipt.head,
        ]),
      ).toBe('')
      expect(new DeliveryWorkspaces(store.files.root).get(seeded.digest).seed).toEqual(seeded.seed)
    }))
})
