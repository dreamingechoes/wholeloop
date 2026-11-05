import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EXIT } from '../../../src/cli/io.js'
import { run } from '../../../src/cli/main.js'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import {
  DELIVERY_PLAN_SCHEMA,
  DELIVERY_PLAN_V2_SCHEMA,
  type DeliveryPlan,
  validateDeliveryPlan,
} from '../../../src/delivery/plan.js'
import { runnerRoute } from '../../../src/runner/route.js'
import baseline from '../../fixtures/contracts/v1-baseline.json' with { type: 'json' }
import { fixture, git, mergePolicy } from '../../support/delivery.js'

function configure(plan: DeliveryPlan, independent = true) {
  if (independent) {
    plan.work = plan.work
      .filter((unit) => unit.id === 'search')
      .map((unit) => ({ ...unit, after: [], consumes: [] }))
    plan.milestones = plan.milestones.map((entry) => ({ ...entry, work: ['search'] }))
  }
  plan.policy.endpoint = 'to-merge'
  plan.policy.merge = mergePolicy()
  for (const repo of plan.repositories) {
    git(repo.root, ['remote', 'add', 'origin', 'https://github.com/fixture/app.git'])
    repo.remote = { name: 'origin', url: 'https://github.com/fixture/app' }
  }
}
const proposed = (plan: DeliveryPlan, previous: string): DeliveryPlan => ({
  ...structuredClone(plan),
  schema: 'wholeloop/delivery-plan@2',
  revision: 2,
  previous,
  // Proposal identifiers are synthetic; preparation grants no continuation or execution.
  corrections: [
    {
      unit: 'search',
      origin: 'ci',
      revision: 2,
      request: 'a'.repeat(64),
      stage: 'ci',
      failure: 'b'.repeat(64),
    },
  ],
})

describe('explicit version-two CI correction plan', () => {
  it('preserves old declarations and original bytes while preparing and reading the new identity', async () => {
    await fixture(({ planning, plan }) => {
      configure(plan)
      const original = planning.preparePlan(plan),
        originalBytes = readFileSync(
          planning.sources.files.path(`delivery/plans/${plan.run}/1.json`),
        ),
        value = proposed(plan, original.digest),
        next = planning.preparePlan(value),
        path = planning.sources.files.path(`delivery/plans/${plan.run}/2.json`)
      expect(contractDigest(DELIVERY_PLAN_SCHEMA)).toBe(
        baseline.contracts['schema:wholeloop/delivery-plan@1'],
      )
      expect(DELIVERY_PLAN_V2_SCHEMA.$id).toBe('wholeloop/delivery-plan@2')
      expect(original.schema).toBe('wholeloop/delivery-plan-prepared@1')
      expect(next).toMatchObject({
        schema: 'wholeloop/delivery-plan-prepared@2',
        plan: value,
        authority: 'not-granted',
        workers: 'not-started',
      })
      expect(planning.getPlan(plan.run, 2)).toEqual(next)
      const record = JSON.parse(readFileSync(path, 'utf8'))
      expect(record.schema).toBe('wholeloop/delivery-planning-record@2')
      writeFileSync(
        path,
        JSON.stringify({ ...record, schema: 'wholeloop/delivery-planning-record@1' }),
      )
      expect(() => planning.getPlan(plan.run, 2)).toThrow('damaged-record')
      writeFileSync(path, JSON.stringify(record))
      expect(planning.getPlan(plan.run, 1)).toEqual(original)
      expect(
        readFileSync(planning.sources.files.path(`delivery/plans/${plan.run}/1.json`)),
      ).toEqual(originalBytes)
    })
  })
  it.each([
    [
      'a CI origin in version one',
      (v: DeliveryPlan) => {
        v.schema = 'wholeloop/delivery-plan@1'
      },
    ],
    [
      'an initial version-two plan',
      (v: DeliveryPlan) => {
        v.revision = 1
        delete v.previous
      },
    ],
    [
      'no CI origin',
      (v: DeliveryPlan) => {
        if (v.corrections?.[0]) {
          v.corrections[0].origin = 'acceptance'
          v.corrections[0].stage = 'acceptance'
        }
      },
    ],
    [
      'a mislabeled CI stage',
      (v: DeliveryPlan) => {
        if (v.corrections?.[0]) v.corrections[0].stage = 'acceptance'
      },
    ],
    [
      'a non-CI endpoint',
      (v: DeliveryPlan) => {
        v.policy.endpoint = 'to-pr'
        delete v.policy.merge
      },
    ],
  ] as const)('refuses %s as a proposal', async (_name, change) => {
    await fixture(({ planning, plan, source }) => {
      configure(plan)
      const value = proposed(plan, planning.preparePlan(plan).digest)
      change(value)
      expect(() => validateDeliveryPlan(value, source)).toThrow()
      expect(() => planning.preparePlan(value)).toThrow()
      expect(existsSync(planning.sources.files.path(`delivery/plans/${plan.run}/2.json`))).toBe(
        false,
      )
    })
  })
  it.each([
    [
      'an absent producer revision',
      (v: DeliveryPlan) => {
        if (v.corrections?.[0]) delete v.corrections[0].revision
      },
    ],
    [
      'a future producer revision',
      (v: DeliveryPlan) => {
        if (v.corrections?.[0]) v.corrections[0].revision = 3
      },
    ],
    [
      'a second correction for the same producer',
      (v: DeliveryPlan) => {
        if (v.corrections?.[0])
          v.corrections.push({
            ...v.corrections[0],
            request: 'c'.repeat(64),
            failure: 'd'.repeat(64),
          })
      },
    ],
  ] as const)('refuses %s instead of silently skipping its worker', async (_name, change) => {
    await fixture(({ planning, plan, source }) => {
      configure(plan)
      const value = proposed(plan, planning.preparePlan(plan).digest)
      change(value)
      expect(() => validateDeliveryPlan(value, source)).toThrow('correction-producer-revision')
    })
  })
  it('keeps the conservative independent-unit restriction for CI corrections', async () => {
    await fixture(({ planning, plan, source }) => {
      configure(plan, false)
      const value = proposed(plan, planning.preparePlan(plan).digest)
      expect(() => validateDeliveryPlan(value, source)).toThrow('correction-stage')
    })
  })
  it('refuses another dependent code unit even when the selected CI owner is independent', async () => {
    await fixture(({ planning, plan, source }) => {
      configure(plan, false)
      const value = proposed(plan, planning.preparePlan(plan).digest)
      const entry = value.corrections?.[0]
      if (!entry) throw new Error('CI correction entry required')
      entry.unit = 'contract'
      expect(() => validateDeliveryPlan(value, source)).toThrow('correction-stage')
    })
  })
  it('requires explicit wire-version selection before CLI persistence and on inspection', async () => {
    await fixture(({ planning, plan, root }) => {
      configure(plan)
      const first = planning.preparePlan(plan),
        value = proposed(plan, first.digest),
        file = join(root, 'ci-proposal.json'),
        store = planning.sources.files.root,
        call = (args: string[]) => {
          const out: string[] = [],
            error: string[] = [],
            code = run(
              [...args, '--json'],
              { out: (text) => out.push(text), err: (text) => error.push(text) },
              root,
            )
          return { code, out: out[0] ? JSON.parse(out[0]) : null, error: error.join('\n') }
        }
      writeFileSync(file, JSON.stringify(value))
      expect(call(['delivery', 'plan', '--file', file, '--store', store]).code).toBe(
        EXIT.precondition,
      )
      expect(existsSync(planning.sources.files.path(`delivery/plans/${plan.run}/2.json`))).toBe(
        false,
      )
      expect(call(['delivery', 'plan-schema']).out).toMatchObject({
        schema: 'wholeloop/delivery-planning-schema@1',
        planSchema: { $id: 'wholeloop/delivery-plan@1' },
      })
      expect(call(['delivery', 'plan-schema', '--schema-version', '2']).out).toMatchObject({
        schema: 'wholeloop/delivery-planning-schema@2',
        planSchema: { $id: 'wholeloop/delivery-plan@2' },
      })
      expect(call(['delivery', 'plan-schema', '--schema-version', '3']).code).toBe(EXIT.input)
      expect(
        call(['delivery', 'plan', '--file', file, '--store', store, '--schema-version', '2']),
      ).toMatchObject({
        code: 0,
        out: { schema: 'wholeloop/delivery-plan-prepared@2', plan: value },
      })
      const inspect = [
        'delivery',
        'inspect-plan',
        '--run',
        plan.run,
        '--revision',
        '2',
        '--store',
        store,
      ]
      expect(call(inspect).code).toBe(EXIT.precondition)
      expect(call([...inspect, '--schema-version', '2'])).toMatchObject({
        code: 0,
        out: { schema: 'wholeloop/delivery-plan-prepared@2', plan: value },
      })
      expect(
        call(['delivery', 'inspect-plan', '--run', plan.run, '--revision', '1', '--store', store])
          .out,
      ).toEqual(first)
    })
  })
})

it('schedules only the current version-two correction while preserving every original index and version-one route', async () => {
  await fixture(({ planning, plan }) => {
    configure(plan)
    const first = planning.preparePlan(plan),
      second = proposed(plan, first.digest),
      next = planning.preparePlan(second),
      third: DeliveryPlan = {
        ...next.plan,
        revision: 3,
        previous: next.digest,
        corrections: [
          ...(next.plan.corrections ?? []),
          {
            unit: 'search',
            origin: 'ci',
            revision: 3,
            request: 'c'.repeat(64),
            stage: 'ci',
            failure: 'd'.repeat(64),
          },
        ],
      },
      ids = runnerRoute(third).map((stage) => stage.id)
    expect(ids).toContain('correction-2:search')
    expect(ids).not.toContain('correction-1:search')
    expect(ids.indexOf('correction-2:search')).toBeLessThan(ids.indexOf('verification:search'))
    const legacy: DeliveryPlan = {
      ...third,
      schema: 'wholeloop/delivery-plan@1',
      corrections: (third.corrections ?? []).map(({ revision: _revision, ...entry }) => ({
        ...entry,
        origin: 'integration',
        stage: 'integration:feature',
      })),
    }
    expect(
      runnerRoute(legacy)
        .filter((stage) => stage.kind === 'correction')
        .map((stage) => stage.id),
    ).toEqual(['correction-1:search', 'correction-2:search'])
  })
})
