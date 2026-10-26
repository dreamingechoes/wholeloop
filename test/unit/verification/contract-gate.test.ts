import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sourceHash } from '../../../src/delivery/input.js'
import { FlowEngine } from '../../../src/flow/engine.js'
import { GateWorkflow } from '../../../src/gates/workflow.js'
import { StateStore } from '../../../src/state/store.js'
import {
  contractGateInput,
  contractGateUnits,
  sameContractGateUnits,
} from '../../../src/verification/contract-gate.js'
import { fixture, git } from '../../support/delivery.js'

async function setup(
  run: (
    f: Parameters<Parameters<typeof fixture>[0]>[0] & {
      engine: FlowEngine
      gates: GateWorkflow
      subject: string
      input: { run: string; revision: number; unit: string; refs: Record<string, string> }
    },
  ) => void,
) {
  await fixture((f) => {
    const body = 'Title query returns matching task IDs.\n'
    for (const ref of ['search-contract.txt', 'search-contract-copy.txt'])
      writeFileSync(join(f.root, ref), body)
    git(f.root, ['add', '.'])
    git(f.root, [
      'commit',
      '-m',
      'test: pin contract gate inputs',
      '-m',
      'Preserve actual declared bytes independently from product criteria.',
    ])
    for (const repo of f.plan.repositories) repo.base = git(f.root, ['rev-parse', 'HEAD'])
    const declared = f.plan.work.find((work) => work.id === 'contract')?.produces[0]
    if (!declared) throw new Error('Fixture contract missing')
    declared.sha256 = sourceHash(body)
    f.planning.preparePlan(f.plan)
    const engine = new FlowEngine(
        new StateStore(f.planning.sources.files.root),
        f.root,
        join(f.dir, 'config.yml'),
        join(f.dir, 'home'),
      ),
      subject = engine.store.create({
        kind: 'review',
        title: 'Inspect the exact contract',
        owner: 'Fixture Owner',
        body: 'Machine contract verification creates no human criteria agreement.',
        repository: f.root,
      }).id
    run({
      ...f,
      engine,
      subject,
      gates: new GateWorkflow(engine),
      input: {
        run: f.plan.run,
        revision: 1,
        unit: 'contract',
        refs: { 'search-api': 'search-contract.txt' },
      },
    })
  })
}
describe('independent contract verification requirements', () => {
  it('retains ordinary verification refusal when agreed product criteria are missing', async () => {
    await setup(({ gates, subject }) => {
      expect(() => gates.plan(subject, 'verify', { base: 'main' })).toThrow('agreed criteria')
    })
  })
  it('pins a fail-safe independent contract unit and the actual suite without inventing product criteria', async () => {
    await setup(({ gates, subject, input, engine, plan }) => {
      const result = gates.plan(subject, 'verify', { base: 'main', contracts: input }).plan
      expect(result.units.find((unit) => unit.id === 'suite')).toMatchObject({
        lens: 'suite',
        failSafe: true,
      })
      expect(result.units.find((unit) => unit.id === 'contracts/search-api')).toMatchObject({
        lens: 'contract',
        failSafe: true,
        origin: 'delivery:contracts',
      })
      expect(result.units.filter((unit) => unit.origin === 'agreed:criteria')).toEqual([])
      expect(engine.store.events().filter((event) => event.type === 'verify.agreed')).toEqual([])
      expect(plan.work.find((work) => work.id === 'contract')?.criteria).toEqual([])
      expect(contractGateInput(result.units)).toEqual(input)
      const fresh = contractGateUnits(engine.store.files.root, result.repository, input)
      expect(sameContractGateUnits(result.units, fresh.units)).toBe(true)
    })
  })
  it('recovers the same original paths from retained units without a fresh selector', async () => {
    await setup(({ gates, subject, input }) => {
      const original = gates.plan(subject, 'verify', { base: 'main', contracts: input }).plan
      expect(gates.plan(subject, 'verify').plan).toEqual(original)
    })
  })
  it('refuses replacing product requirements with contract-only inspection', async () => {
    await setup(({ gates, subject, input }) => {
      expect(() =>
        gates.plan(subject, 'verify', {
          base: 'main',
          contracts: input,
          criteria: [
            {
              id: 'search',
              text: 'Find a title.',
              test: 'Search seeded task titles and compare IDs.',
            },
          ],
        }),
      ).toThrow('cannot replace or invent agreed product criteria')
    })
  })
  it('refuses a different matching file midway through the same gate', async () => {
    await setup(({ gates, subject, input }) => {
      gates.plan(subject, 'verify', { base: 'main', contracts: input })
      expect(() =>
        gates.plan(subject, 'verify', {
          contracts: { ...input, refs: { 'search-api': 'search-contract-copy.txt' } },
        }),
      ).toThrow('Declared verification contracts changed mid-run')
    })
  })
  it('refuses silently replacing the declared contract revision in an existing gate', async () => {
    await setup(({ gates, subject, input, planning, plan }) => {
      gates.plan(subject, 'verify', { base: 'main', contracts: input })
      const next = structuredClone(plan),
        previous = planning.getPlan(plan.run, 1)
      next.revision = 2
      next.previous = previous.digest
      const declared = next.work.find((work) => work.id === 'contract')?.produces[0]
      if (!declared) throw new Error('Fixture contract missing')
      declared.revision = 'v2'
      planning.preparePlan(next)
      expect(() => gates.plan(subject, 'verify', { contracts: { ...input, revision: 2 } })).toThrow(
        'Declared verification contracts changed mid-run',
      )
    })
  })
  it('refuses changed bytes before any gate unit can claim mechanical identity', async () => {
    await setup(({ gates, subject, input, root }) => {
      writeFileSync(join(root, 'search-contract.txt'), 'Changed contract bytes.\n')
      git(root, ['add', '.'])
      git(root, [
        'commit',
        '-m',
        'test: change a contract candidate',
        '-m',
        'A clean candidate must still match its declared checksum.',
      ])
      expect(() => gates.plan(subject, 'verify', { base: 'main', contracts: input })).toThrow(
        'contract-checksum-mismatch',
      )
    })
  })
  it('refuses malformed retained contract locators', async () => {
    await setup(({ gates, subject, input }) => {
      const original = gates.plan(subject, 'verify', { base: 'main', contracts: input }).plan,
        changed = original.units.map((unit) =>
          unit.origin === 'delivery:contracts'
            ? { ...unit, asks: JSON.stringify({ run: input.run }) }
            : unit,
        )
      expect(() => contractGateInput(changed)).toThrow('contract-gate-locators')
    })
  })
})
