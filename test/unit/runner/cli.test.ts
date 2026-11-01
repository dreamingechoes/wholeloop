import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import output from '../../../src/cli/schemas/output-v1.json' with { type: 'json' }
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { RunnerHumanDecisions } from '../../../src/runner/human-decisions.js'
import type { RunnerRequest } from '../../../src/runner/store.js'
import { RunnerStore } from '../../../src/runner/store.js'
import { authorization, fixture } from '../../support/delivery.js'

const cli = resolve('dist/wl.mjs')
function invoke(argv: string[], root: string) {
  const result = spawnSync(process.execPath, [cli, ...argv, '--json'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
  })
  return {
    code: result.status,
    errors: result.stderr,
    value: result.stdout ? JSON.parse(result.stdout) : null,
  }
}
function outputProblems(value: { schema: string }) {
  const variant = output.oneOf.find((entry) => entry.properties.schema.const === value.schema)
  expect(variant).toBeDefined()
  const declaration = variant as { required: string[]; properties: Record<string, unknown> }
  return [
    ...declaration.required.filter((field) => !Object.hasOwn(value, field)),
    ...Object.keys(value).filter((field) => !Object.hasOwn(declaration.properties, field)),
  ]
}
describe('public runner preparation and operator controls', () => {
  it('shows inert contracts without certifying an executable full route', () => {
    const receipt = invoke(['delivery', 'runner-schema'], process.cwd())
    expect(receipt.code).toBe(0)
    expect(receipt.value).toMatchObject({
      schema: 'wholeloop/delivery-runner-schema@1',
      executed: false,
      completeRouteAvailable: false,
    })
    expect(outputProblems(receipt.value)).toEqual([])
  })
  it('prepares idempotently, recovers in a fresh store and preserves same-run control state', async () => {
    await fixture(({ planning, plan, dir }) => {
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
        digest = contractDigest(request),
        file = join(dir, 'request.json'),
        base = ['--digest', digest, '--store', store.files.root]
      writeFileSync(file, JSON.stringify(request))
      const args = ['delivery', 'runner-prepare', '--file', file, '--store', store.files.root],
        first = invoke(args, dir)
      expect(first.code).toBe(0)
      expect(outputProblems(first.value)).toEqual([])
      expect(first.value).toMatchObject({
        digest,
        state: 'planned',
        ownership: 'unclaimed',
        stages: [],
      })
      expect(invoke(args, dir)).toEqual(first)
      expect(invoke(['delivery', 'runner-status', ...base], dir)).toEqual(first)
      for (const [operation, expected] of [
        ['pause', 'paused'],
        ['resume', 'queued'],
        ['stop', 'stopping'],
      ]) {
        const result = invoke(
          ['delivery', operation ?? '', ...base, '--operator', 'Fixture Operator'],
          dir,
        )
        expect(result.code).toBe(0)
        expect(outputProblems(result.value)).toEqual([])
        expect(result.value.state).toBe(expected)
        expect(result.value.stages).toEqual([])
      }
      expect(new RunnerStore(store.files.root).inspect(digest).state).toBe('stopping')
      expect(store.budgets.inspect(request.run).started).toBe(false)
    })
  })
  it('requires explicit operator identity and refuses imported host result options', () => {
    const missing = invoke(['delivery', 'pause', '--digest', 'a'.repeat(64)], process.cwd())
    expect(missing.code).toBe(2)
    expect(JSON.stringify(missing.value)).toContain('--operator')
    expect(
      invoke(['delivery', 'runner-status', '--result', 'forged.json'], process.cwd()).code,
    ).toBe(4)
  })
})

describe('recorded human decisions through the operator command', () => {
  it.each(['supervised', 'none'] as const)(
    'records only the exact subject a waiting %s stage published',
    async (intervention) => {
      await fixture(({ planning, plan, dir }) => {
        plan.policy.intervention = intervention
        const store = new RunnerStore(planning.sources.files.root),
          prepared = planning.preparePlan(plan),
          grant = store.lifecycle.authority.authorize(authorization(plan, prepared.digest))
        store.lifecycle.track({ run: plan.run, revision: 1, grant: grant.grant.id })
        const request: RunnerRequest = {
            schema: 'wholeloop/delivery-runner-request@1',
            key: 'human',
            run: plan.run,
            revision: 1,
            plan: prepared.digest,
            grant: grant.grant.id,
            host: { id: 'fixture', version: '1', configuration: 'a'.repeat(64) },
            pollMs: 50,
          },
          digest = store.prepare(request).digest,
          lease = store.claim(digest, `controller-${'a'.repeat(32)}`),
          subject = 'c'.repeat(64),
          decide = (outcome: string, selected = subject) =>
            invoke(
              [
                'delivery',
                'human-decide',
                '--digest',
                digest,
                '--stage',
                'plan',
                '--decision',
                'delivery-plan',
                '--subject',
                selected,
                '--outcome',
                outcome,
                '--operator',
                'Fixture Owner',
                '--store',
                store.files.root,
              ],
              dir,
            )
        store.append(lease, { action: 'dispatched', stage: 'plan', invocation: 'b'.repeat(64) })
        const record = store.stage(digest, 'plan'),
          humans = new RunnerHumanDecisions(store)
        if (!record) throw new Error('Original issued stage required')
        expect(decide('accept').code).toBe(3)
        if (intervention === 'none') {
          expect(() => humans.open(request, record, subject)).toThrow('human-decision-unavailable')
          expect(humans.decided(request, record)).toBeUndefined()
          return
        }
        humans.open(request, record, subject)
        expect(decide('accept', 'd'.repeat(64)).code).toBe(3)
        expect(humans.decided(request, record)).toBeUndefined()
        const accepted = decide('accept')
        expect(accepted.code).toBe(0)
        expect(outputProblems(accepted.value)).toEqual([])
        expect(accepted.value).toMatchObject({
          schema: 'wholeloop/delivery-human-decision@1',
          decision: 'delivery-plan',
          subject,
          outcome: 'accept',
          by: 'Fixture Owner',
        })
        expect(decide('accept')).toEqual(accepted)
        expect(decide('reject').code).toBe(3)
        expect(humans.decided(request, record)).toEqual(accepted.value)
        expect(() => humans.open(request, record, 'd'.repeat(64))).toThrow('human-decision-subject')
      })
    },
  )
})
