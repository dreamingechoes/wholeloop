import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { RunnerNativeScope } from '../../../src/runner/native-scope.js'
import { runnerDecisionFixture } from '../../support/runner-decision.js'

it('retains original independent acceptance explanations after revocation without restoring authority', async () => {
  await runnerDecisionFixture(
    async ({ stages, store, context, decision, host }) => {
      const result = await stages.execute(context, [decision], host),
        record = store.stage(contractDigest(context.request), context.stage.id)
      expect(result.status).toBe('blocked')
      if (!record) throw new Error('Original stage required')
      const feedback = stages.originalFeedback(context.request, record)
      expect(feedback).toMatchObject([
        {
          decision: 'acceptance',
          status: 'blocked',
          provenance: 'fixture',
          judgment: {
            outcome: 'accept',
            rationale: 'The independent fixture report preserves pinned evidence.',
          },
          challenge: {
            verdict: 'rejected',
            rationale: 'The independent fixture report preserves pinned evidence.',
          },
        },
      ])
      expect(Object.keys(feedback[0] ?? {}).sort()).toEqual([
        'challenge',
        'decision',
        'digest',
        'historical',
        'judgment',
        'provenance',
        'status',
      ])
      store.lifecycle.authority.revoke({
        schema: 'wholeloop/delivery-revocation-request@1',
        grant: context.request.grant,
        operator: 'Fixture Operator',
        reason: 'Read historical feedback without reopening authority.',
      })
      expect(() => store.basis(context.request)).toThrow('inactive-runner-basis')
      const before = contractDigest(store.lifecycle.journal.events()),
        calls = new RunnerNativeScope(store.files, context.invocation).calls().length
      expect(stages.originalFeedback(context.request, record)).toEqual(feedback)
      expect(contractDigest(store.lifecycle.journal.events())).toBe(before)
      expect(new RunnerNativeScope(store.files, context.invocation).calls()).toHaveLength(calls)
    },
    'acceptance',
    { decision: 'acceptance', mode: 'rejected' },
  )
})

it.each(['scope', 'lost-binding', 'lost-receipt', 'damaged-receipt'] as const)(
  'refuses %s original acceptance feedback instead of substituting another decision',
  async (mode) => {
    await runnerDecisionFixture(
      async ({ stages, store, context, decision, host }) => {
        const result = await stages.execute(context, [decision], host),
          record = store.stage(contractDigest(context.request), context.stage.id),
          binding = store.files.path(`delivery/runner-decisions/${context.invocation}.json`),
          key = store.files.path(`delivery/decision-keys/${decision.run}/${decision.key}.json`),
          head = store.files.path(
            `delivery/decision-heads/${decision.run}/${decision.plan}/${decision.decision}.json`,
          )
        if (!record) throw new Error('Original stage required')
        if (mode === 'scope') {
          const value = JSON.parse(readFileSync(binding, 'utf8'))
          value.requests[0].grant = 'authorization-fedcba9876543210'
          writeFileSync(binding, JSON.stringify(value))
        } else if (mode === 'lost-binding') renameSync(binding, `${binding}.retained`)
        else if (mode === 'lost-receipt') {
          renameSync(key, `${key}.retained`)
          renameSync(head, `${head}.retained`)
        } else {
          const path = store.files.path(`delivery/decisions/${result.decisions[0]}.json`),
            value = JSON.parse(readFileSync(path, 'utf8'))
          value.judgment.rationale = 'Substituted feedback'
          writeFileSync(path, JSON.stringify(value))
        }
        expect(() => stages.originalFeedback(context.request, record)).toThrow()
      },
      'acceptance',
      { decision: 'acceptance', mode: 'rejected' },
    )
  },
)
