import { chmodSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { sourceHash } from '../../../src/delivery/input.js'
import {
  acceptanceDefinitions,
  RunnerAcceptanceStages,
} from '../../../src/runner/acceptance-stages.js'
import { RunnerAssemblyReadiness } from '../../../src/runner/assembly-readiness.js'
import { RunnerFeatureReadiness } from '../../../src/runner/feature-readiness.js'
import { RunnerHumanDecisions } from '../../../src/runner/human-decisions.js'
import { RunnerIntegrationStages } from '../../../src/runner/integration-stages.js'
import { RunnerMilestoneReadiness } from '../../../src/runner/milestone-readiness.js'
import { RunnerNativeScope } from '../../../src/runner/native-scope.js'
import { RunnerNativeStage } from '../../../src/runner/native-stage.js'
import { RunnerStore } from '../../../src/runner/store.js'
import { acceptanceFixture } from '../../support/acceptance.js'
import { runnerGitFixture } from '../../support/runner-git.js'

it('cancels the original acceptance prefix after revocation without its input locator', async () => {
  await runnerGitFixture(
    async ({ store, request, dispatch }) => {
      const context = dispatch('acceptance'),
        ready = store.files.path('acceptance-control-ready'),
        binary = store.files.path('acceptance-control/codex')
      context.current = () => true
      store.files.atomic(
        'acceptance-control/codex',
        `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(ready)},'started');setInterval(()=>{},100)\n`,
      )
      chmodSync(binary, 0o700)
      const pending = new RunnerNativeStage(store, context).run((invoke) =>
          invoke(binary, [], {
            cwd: store.files.root,
            input: '',
            env: { PATH: process.env.PATH },
            timeoutMs: 5000,
            signal: context.signal,
          }),
        ),
        scope = new RunnerNativeScope(store.files, context.invocation)
      try {
        const until = Date.now() + 3000
        while (!existsSync(ready) && Date.now() < until)
          await new Promise((resolve) => setTimeout(resolve, 10))
        expect(existsSync(ready)).toBe(true)
        const record = store.stage(contractDigest(request), 'acceptance')
        if (!record) throw new Error('Original acceptance stage required')
        store.lifecycle.authority.revoke({
          schema: 'wholeloop/delivery-revocation-request@1',
          grant: request.grant,
          operator: 'Fixture Operator',
          reason: 'Cancel only the original owned acceptance process after revocation.',
        })
        const readiness = new RunnerFeatureReadiness(
            store,
            new RunnerIntegrationStages(
              store,
              new RunnerAssemblyReadiness(store, new RunnerMilestoneReadiness(store, new Map())),
            ),
          ),
          deny = () => {
            throw new Error('Cancellation cannot select judgment')
          }
        await new RunnerAcceptanceStages(store, readiness, {
          identity: request.host,
          requests: deny,
          host: deny,
        }).stop(request, record, new AbortController().signal)
        const result = await pending
        expect(result.ownership.invocationState).toBe('stopped')
        expect(scope.inspect()).toHaveLength(1)
        expect(scope.inspect()[0]?.observed.reason).toBe('cancelled')
        expect(
          existsSync(
            store.files.path(`delivery/runner-acceptance/${context.invocation}/binding.json`),
          ),
        ).toBe(false)
      } finally {
        scope.requestCancellation()
        await pending
      }
    },
    { singleUnit: true },
  )
})

it.each([
  'cancelled',
  'expired',
  'fenced',
  'invalid-deadline',
  'unverified-product',
  'supervised',
  'missing-grant',
  'missing-delegation',
  'revoked',
  'captured-signal',
  'revoked-during-read',
  'lost-input',
  'foreign-reader',
] as const)(
  'refuses %s acceptance before selecting judgment or consuming product inputs',
  async (mode) => {
    const delegated = !['supervised', 'missing-delegation', 'missing-grant'].includes(mode)
    await runnerGitFixture(
      async ({ store, request, dispatch }) => {
        const context = dispatch('acceptance'),
          abort = new AbortController(),
          selected =
            mode === 'foreign-reader'
              ? new RunnerStore(join(store.files.root, '..', 'foreign-state'))
              : store,
          reader = new RunnerFeatureReadiness(
            selected,
            new RunnerIntegrationStages(
              selected,
              new RunnerAssemblyReadiness(
                selected,
                new RunnerMilestoneReadiness(selected, new Map()),
              ),
            ),
          )
        let selections = 0,
          afterRevocation: string | undefined
        const deny = () => {
            selections++
            throw new Error(
              'Acceptance must not select judgment without actual authorized product inputs',
            )
          },
          options = { identity: request.host, requests: deny, host: deny }
        if (mode === 'foreign-reader') {
          expect(() => new RunnerAcceptanceStages(store, reader, options)).toThrow(
            'acceptance-stage-fixed-product-reader-required',
          )
          return
        }
        context.signal = abort.signal
        if (mode === 'cancelled') abort.abort()
        if (mode === 'expired') context.deadline = new Date(Date.now() - 1).toISOString()
        if (mode === 'fenced') context.current = () => false
        if (mode === 'invalid-deadline') context.deadline = 'tomorrow'
        if (mode === 'revoked') {
          store.lifecycle.authority.revoke({
            schema: 'wholeloop/delivery-revocation-request@1',
            grant: request.grant,
            operator: 'Fixture Operator',
            reason: 'A live controller cannot infer acceptance after revocation.',
          })
          context.current = () => true
        }
        if (mode === 'captured-signal') {
          const inspect = reader.inspect.bind(reader)
          reader.inspect = async (...args) => {
            const value = await inspect(...args)
            abort.abort()
            context.signal = new AbortController().signal
            return value
          }
        }
        if (mode === 'revoked-during-read') {
          const inspect = reader.inspect.bind(reader)
          context.current = () => true
          reader.inspect = async (...args) => {
            const value = await inspect(...args)
            store.lifecycle.authority.revoke({
              schema: 'wholeloop/delivery-revocation-request@1',
              grant: request.grant,
              operator: 'Fixture Operator',
              reason: 'Recheck authority after asynchronous product inspection.',
            })
            afterRevocation = contractDigest(store.lifecycle.journal.events())
            return value
          }
        }
        if (mode === 'lost-input')
          store.files.atomic(
            `delivery/runner-acceptance/${context.invocation}/consumed`,
            `${'a'.repeat(64)}\n`,
          )
        const before = contractDigest(store.lifecycle.journal.events()),
          stage = new RunnerAcceptanceStages(store, reader, options)
        if (
          ['cancelled', 'expired', 'fenced', 'invalid-deadline', 'captured-signal'].includes(mode)
        )
          await expect(stage.execute(context)).rejects.toThrow('acceptance-stage-not-current')
        else if (mode === 'revoked' || mode === 'revoked-during-read')
          await expect(stage.execute(context)).rejects.toThrow('inactive-runner-basis')
        else if (mode === 'lost-input')
          expect((await stage.execute(context)).status).toBe('unknown')
        else expect((await stage.execute(context)).status).toBe('blocked')
        expect(selections).toBe(0)
        expect(
          existsSync(store.files.path(`delivery/runner-acceptance/${context.invocation}/consumed`)),
        ).toBe(mode === 'lost-input')
        expect(contractDigest(store.lifecycle.journal.events())).toBe(afterRevocation ?? before)
      },
      {
        singleUnit: true,
        decisions: delegated ? ['acceptance'] : [],
        configure(plan, files) {
          plan.policy.intervention = mode === 'supervised' ? 'supervised' : 'none'
          if (mode === 'supervised' || mode === 'missing-delegation') return
          const body = JSON.stringify({
              schema: 'wholeloop/delegated-decision-rubric@1',
              decision: 'acceptance',
              purpose: 'Accept only the complete original product and its observed criteria.',
              rules: [
                {
                  id: 'product',
                  text: 'Require current original product QA and independent judgment.',
                },
              ],
              outcomes: ['accept', 'reject'],
              unknowns: { allowed: [], defaults: [] },
              timeoutMs: 10000,
            }),
            ref = 'rubrics/acceptance.json'
          files.atomic(ref, body)
          plan.policy.delegations = [
            {
              id: 'acceptance',
              rubric: { ref, sha256: sourceHash(body) },
              evidence: ['production'],
              fallback: 'blocked',
            },
          ]
        },
      },
    )
  },
)

it('opens no supervised human acceptance until the complete current product is ready', async () => {
  await runnerGitFixture(
    async ({ store, request, dispatch }) => {
      const context = dispatch('acceptance'),
        humans = new RunnerHumanDecisions(store),
        reader = new RunnerFeatureReadiness(
          store,
          new RunnerIntegrationStages(
            store,
            new RunnerAssemblyReadiness(store, new RunnerMilestoneReadiness(store, new Map())),
          ),
        ),
        deny = () => {
          throw new Error('Supervised acceptance never selects a delegated judgment')
        },
        stages = new RunnerAcceptanceStages(store, reader, {
          identity: request.host,
          requests: deny,
          host: deny,
          humans,
        }),
        before = contractDigest(store.lifecycle.journal.events())
      expect(
        () =>
          new RunnerAcceptanceStages(store, reader, {
            identity: request.host,
            requests: deny,
            host: deny,
            humans: new RunnerHumanDecisions(new RunnerStore(store.files.path('foreign-state'))),
          }),
      ).toThrow('acceptance-stage-human-decisions-store')
      expect(await stages.execute(context)).toMatchObject({
        status: 'blocked',
        invocationState: 'not-started',
      })
      const record = store.stage(contractDigest(request), 'acceptance')
      if (!record) throw new Error('Original acceptance stage required')
      expect(record.runtime).toBeUndefined()
      expect(humans.pending(request, record)).toBeUndefined()
      expect(new RunnerNativeScope(store.files, context.invocation).calls()).toEqual([])
      expect(contractDigest(store.lifecycle.journal.events())).toBe(before)
    },
    { singleUnit: true },
  )
})

it('shows the acceptance judge what each reported case asserted, never a private objective', async () => {
  await acceptanceFixture(async ({ acceptance, plan }) => {
    const pinned = acceptance.prepare(plan),
      test = plan.cases[0]
    if (!test) throw new Error('Fixture case required')
    // A live judge saw only statuses and digests and could not tell what was observed.
    const definitions = acceptanceDefinitions(acceptance.planning.sources.files.root, {
      acceptancePlan: pinned.digest,
      cases: [{ id: test.id }, { id: 'unknown-case' }],
    })
    expect(definitions.meaning).toContain('controller observations')
    expect(definitions.cases[0]).toEqual({
      id: test.id,
      criteria: test.criteria,
      capability: test.runner.capability,
      assertions: test.assertions.map(({ id, description, subject, operator, path, expected }) => ({
        id,
        description,
        subject,
        operator,
        ...(path === undefined ? {} : { path }),
        ...(expected === undefined ? {} : { expected }),
      })),
    })
    expect(definitions.cases[1]).toEqual({ id: 'unknown-case', private: true })
  })
})
