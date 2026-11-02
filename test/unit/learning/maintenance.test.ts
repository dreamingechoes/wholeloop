import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  inspectRepository,
  type MaintenanceInspection,
  MaintenanceProposals,
  maintenanceProposal,
  type RecurringEnvelope,
  recurringAdmission,
} from '../../../src/learning/maintenance.js'
import { StoreFiles } from '../../../src/state/files.js'
import { fixture, git } from '../../support/delivery.js'

const input = (scope = ['docs/search.md']) => ({
  behavior: 'Search documentation names the current flags.',
  scope,
  criteria: [
    { id: 'docs', text: 'Docs name the current flag.', test: 'Grep the docs for the old flag.' },
  ],
  validation: 'Run the documentation check.',
  risks: ['Users of the old flag need a note.'],
})
async function setup(
  run: (value: {
    root: string
    inspection: MaintenanceInspection
    proposals: MaintenanceProposals
  }) => void,
) {
  await fixture(({ root, dir }) => {
    writeFileSync(
      join(root, 'search.md'),
      'Use --legacy-search to search.\nTODO: describe archived tasks.\n',
    )
    git(root, ['add', '.'])
    git(root, [
      'commit',
      '-m',
      'docs: add search notes',
      '-m',
      'Seed a stale documentation finding.',
    ])
    run({
      root,
      inspection: {
        id: 'stale-search-docs',
        category: 'stale-docs',
        repository: 'app',
        root,
        command: ['git', 'grep', '-n', 'TODO'],
        rule: 'Open TODO notes in documentation are stale.',
      },
      proposals: new MaintenanceProposals(new StoreFiles(join(dir, 'store'))),
    })
  })
}

describe('maintenance proposals (LEARN-05)', () => {
  it('turns an actual local inspection into one current proposal and retains its dismissal', () =>
    setup(({ root, inspection, proposals }) => {
      const finding = inspectRepository(inspection)
      if (!finding) throw new Error('Finding expected')
      expect(finding.lines).toEqual(['search.md:2:TODO: describe archived tasks.'])
      expect(finding.base).toBe(git(root, ['rev-parse', 'HEAD']).trim())
      const proposal = maintenanceProposal(finding, input())
      expect(proposal).toMatchObject({
        protected: [],
        effects: { code: 'not-changed', tracker: 'not-written' },
      })
      expect(proposals.record(proposal).status).toBe('recorded')
      const again = inspectRepository(inspection)
      if (!again) throw new Error('Finding expected')
      expect(proposals.record(maintenanceProposal(again, input())).status).toBe('duplicate')
      expect(proposals.current(proposal, again)).toBe(true)
      expect(() => proposals.dismiss(proposal.key, '', 'x')).toThrow('operator and reason')
      proposals.dismiss(
        proposal.key,
        'Fixture Operator',
        'Archived tasks are out of scope this quarter.',
      )
      expect(proposals.record(proposal).status).toBe('dismissed')
      expect(proposals.current(proposal, again)).toBe(false)
    }))
  it('expires a proposal when its evidence changes and finds nothing when the repository is clean', () =>
    setup(({ root, inspection, proposals }) => {
      const finding = inspectRepository(inspection)
      if (!finding) throw new Error('Finding expected')
      const proposal = maintenanceProposal(finding, input())
      proposals.record(proposal)
      writeFileSync(join(root, 'search.md'), 'TODO: describe ranked search.\n')
      git(root, ['commit', '-am', 'docs: change the note', '-m', 'Change the finding evidence.'])
      expect(proposals.current(proposal, inspectRepository(inspection))).toBe(false)
      writeFileSync(join(root, 'search.md'), 'Search is described.\n')
      git(root, ['commit', '-am', 'docs: resolve the note', '-m', 'Remove the finding.'])
      expect(inspectRepository(inspection)).toBeUndefined()
    }))
  it('refuses an untestable proposal', () =>
    setup(({ inspection }) => {
      const finding = inspectRepository(inspection)
      if (!finding) throw new Error('Finding expected')
      expect(() => maintenanceProposal(finding, { ...input(), criteria: [] })).toThrow(
        'testable criteria',
      )
    }))
})

describe('bounded recurring admission (LEARN-06)', () => {
  const envelope: RecurringEnvelope = {
    operator: 'Fixture Operator',
    categories: ['stale-docs'],
    repositories: ['app'],
    protectedPaths: ['db/migrations/**'],
    perRun: { maxScope: 2, maxCriteria: 2 },
    aggregate: { maxRuns: 2, windowMs: 7 * 86400000 },
    endpoint: 'local-handoff',
  }
  it.each([
    ['its own policy', ['enforcement.yml']],
    ['harness guidance', ['harness/protocols/delivery-integration.md']],
    ['an evaluation rubric', ['policy/review-rubric.json']],
    ['evaluation fixtures', ['test/evals/runner/faults.ts']],
    ['an operator-protected path', ['db/migrations/005.sql']],
  ])('refuses a proposal that would edit %s', (_name, scope) =>
    setup(({ inspection }) => {
      const finding = inspectRepository(inspection)
      if (!finding) throw new Error('Finding expected')
      const [result] = recurringAdmission({
        envelope,
        proposals: [maintenanceProposal(finding, input(scope))],
        admitted: [],
        now: '2026-11-02T00:00:00.000Z',
      })
      expect(result).toMatchObject({ admitted: false, reasons: ['protected-path'] })
    }),
  )
  it('enforces category, repository, per-run and aggregate limits with independent run identities', () =>
    setup(({ inspection }) => {
      const finding = inspectRepository(inspection)
      if (!finding) throw new Error('Finding expected')
      const base = maintenanceProposal(finding, input()),
        other = { ...base, key: 'c'.repeat(64) },
        third = { ...base, key: 'd'.repeat(64) },
        wide = { ...base, key: 'e'.repeat(64), scope: ['a.md', 'b.md', 'c.md'] },
        foreign = { ...base, key: 'f'.repeat(64), finding: { ...base.finding, repository: 'web' } },
        results = recurringAdmission({
          envelope,
          proposals: [base, wide, foreign, other, third],
          admitted: [{ at: '2026-10-01T00:00:00.000Z' }],
          now: '2026-11-02T00:00:00.000Z',
        })
      expect(results.map((entry) => [entry.admitted, entry.reasons])).toEqual([
        [true, []],
        [false, ['per-run-scope']],
        [false, ['repository']],
        [true, []],
        [false, ['aggregate-limit']],
      ])
      const runs = results.flatMap((entry) => (entry.admitted ? [entry.run] : []))
      expect(new Set(runs).size).toBe(2)
      expect(runs.every((run) => /^delivery-[a-f0-9]{16}$/.test(run))).toBe(true)
      expect(results[0]).toMatchObject({ grant: 'separate-exact-plan-grant-required' })
      expect(() =>
        recurringAdmission({
          envelope: { ...envelope, operator: '' },
          proposals: [],
          admitted: [],
          now: '2026-11-02T00:00:00.000Z',
        }),
      ).toThrow('operator')
    }))
})
