import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { RunnerAcceptanceStages } from '../../../src/runner/acceptance-stages.js'
import { RunnerAssemblyReadiness } from '../../../src/runner/assembly-readiness.js'
import { RunnerFeatureReadiness } from '../../../src/runner/feature-readiness.js'
import { RunnerHandoffStages } from '../../../src/runner/handoff-stages.js'
import { RunnerIntegrationStages } from '../../../src/runner/integration-stages.js'
import { RunnerMilestoneReadiness } from '../../../src/runner/milestone-readiness.js'
import { RunnerStore } from '../../../src/runner/store.js'
import { git } from '../../support/delivery.js'
import { runnerGitFixture } from '../../support/runner-git.js'

it.each([
  'cancelled',
  'expired',
  'fenced',
  'invalid-deadline',
  'captured-signal',
  'unaccepted-product',
  'remote-endpoint',
  'revoked',
  'lost-report',
  'flags-only',
  'foreign-reader',
] as const)('refuses %s local handoff without a report or code-ready endpoint', async (mode) => {
  await runnerGitFixture(
    async ({ store, request, dispatch, observe }) => {
      const context = dispatch('handoff'),
        abort = new AbortController(),
        selected =
          mode === 'foreign-reader'
            ? new RunnerStore(join(store.files.root, '..', 'foreign-state'))
            : store
      let selections = 0
      const deny = () => {
          selections++
          throw new Error('Local handoff cannot select a model or judgment')
        },
        acceptance = new RunnerAcceptanceStages(
          selected,
          new RunnerFeatureReadiness(
            selected,
            new RunnerIntegrationStages(
              selected,
              new RunnerAssemblyReadiness(
                selected,
                new RunnerMilestoneReadiness(selected, new Map()),
              ),
            ),
          ),
          { identity: request.host, requests: deny, host: deny },
        ),
        before = contractDigest(store.lifecycle.journal.events())
      if (mode === 'foreign-reader') {
        expect(() => new RunnerHandoffStages(store, acceptance)).toThrow(
          'handoff-stage-fixed-acceptance-required',
        )
        expect(contractDigest(store.lifecycle.journal.events())).toBe(before)
        return
      }
      context.signal = abort.signal
      if (mode === 'cancelled') abort.abort()
      if (mode === 'expired') context.deadline = new Date(Date.now() - 1).toISOString()
      if (mode === 'fenced') context.current = () => false
      if (mode === 'invalid-deadline') context.deadline = 'tomorrow'
      if (mode === 'revoked')
        store.lifecycle.authority.revoke({
          schema: 'wholeloop/delivery-revocation-request@1',
          grant: request.grant,
          operator: 'Fixture Operator',
          reason: 'No local completion after revoking the original authority.',
        })
      if (mode === 'lost-report')
        store.files.atomic(
          `delivery/runner-handoffs/${context.invocation}/consumed`,
          `${'a'.repeat(64)}\n`,
        )
      if (mode === 'flags-only') {
        context.started({
          backend: 'owned-core',
          instance: context.invocation,
          worker: `pid-${process.pid}`,
        })
        observe({
          schema: 'wholeloop/delivery-runner-stage-observation@1',
          request: contractDigest(request),
          plan: request.plan,
          stage: context.stage.id,
          invocation: context.invocation,
          status: 'passed',
          invocationState: 'stopped',
          provenance: 'host-observed',
          evidence: 'f'.repeat(64),
          reason: 'A root flag alone is not an observed accepted product or report.',
        })
      }
      const original = contractDigest(store.lifecycle.journal.events()),
        stage = new RunnerHandoffStages(store, acceptance)
      if (['cancelled', 'expired', 'fenced', 'invalid-deadline'].includes(mode))
        await expect(stage.execute(context)).rejects.toThrow('handoff-stage-not-current')
      else if (mode === 'captured-signal') {
        const pending = stage.execute(context)
        abort.abort()
        context.signal = new AbortController().signal
        await expect(pending).rejects.toThrow('handoff-stage-not-current')
      } else if (mode === 'revoked')
        await expect(stage.execute(context)).rejects.toThrow('inactive-runner-basis')
      else {
        const record = store.stage(contractDigest(request), 'handoff')
        if (!record) throw new Error('Original fixture handoff stage required')
        const result =
          mode === 'flags-only'
            ? await stage.inspect(request, record)
            : await stage.execute(context)
        expect(result.status).toBe(
          mode === 'lost-report' || mode === 'flags-only' ? 'unknown' : 'blocked',
        )
        const endpoint = await stage.endpoint(request, context.plan, new AbortController().signal)
        expect(endpoint.current).toBe(false)
        expect(endpoint.provenance).toBe('fixture')
      }
      expect(selections).toBe(0)
      expect(
        existsSync(store.files.path(`delivery/runner-handoffs/${context.invocation}/binding.json`)),
      ).toBe(false)
      expect(contractDigest(store.lifecycle.journal.events())).toBe(original)
    },
    {
      singleUnit: true,
      configure(plan) {
        if (mode === 'remote-endpoint') {
          const repository = plan.repositories[0]
          if (!repository) throw new Error('Original fixture repository required')
          repository.remote = { name: 'origin', url: 'https://github.com/example/tasks' }
          git(repository.root, ['remote', 'add', 'origin', repository.remote.url])
          plan.policy.endpoint = 'to-pr'
        }
      },
    },
  )
})
