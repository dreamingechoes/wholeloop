import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import output from '../../../src/cli/schemas/output-v1.json' with { type: 'json' }
import { DeliverySources } from '../../../src/delivery/source.js'
import {
  inspectRepository,
  type MaintenanceInspection,
  MaintenanceProposals,
  maintenanceProposal,
  type RecurringEnvelope,
} from '../../../src/learning/maintenance.js'
import { admitMaintenanceProposals } from '../../../src/learning/maintenance-intake.js'
import { StoreFiles } from '../../../src/state/files.js'
import { fixture, git } from '../../support/delivery.js'

const proposalInput = {
  behavior: 'Search documentation describes archived tasks.',
  scope: ['search.md'],
  criteria: [
    {
      id: 'archived-docs',
      text: 'The search notes describe archived tasks.',
      test: 'The TODO inspection finds nothing in search.md.',
    },
  ],
  validation: 'Run the pinned TODO inspection and the documentation check.',
  risks: ['Readers of the old note need the archived behavior.'],
}
const envelope: RecurringEnvelope = {
  operator: 'Fixture Operator',
  categories: ['stale-docs'],
  repositories: ['app'],
  protectedPaths: [],
  perRun: { maxScope: 2, maxCriteria: 2 },
  aggregate: { maxRuns: 3, windowMs: 7 * 86400000 },
  endpoint: 'local-handoff',
}
async function setup(
  run: (value: {
    root: string
    dir: string
    store: string
    inspection: MaintenanceInspection
    wl: (args: string[]) => {
      status: number | null
      stdout: string
      stderr: string
      json: ReturnType<typeof JSON.parse>
    }
  }) => void,
) {
  await fixture(({ root, dir }) => {
    writeFileSync(join(root, 'search.md'), 'Search by title.\nTODO: describe archived tasks.\n')
    git(root, ['add', '.'])
    git(root, ['commit', '-m', 'docs: add search notes', '-m', 'Seed a stale note.'])
    const store = join(dir, 'maintenance-store'),
      inspection: MaintenanceInspection = {
        id: 'stale-search-docs',
        category: 'stale-docs',
        repository: 'app',
        root,
        command: ['git', 'grep', '-n', 'TODO'],
        rule: 'Open TODO notes in documentation are stale.',
      }
    writeFileSync(join(dir, 'inspection.json'), JSON.stringify(inspection))
    writeFileSync(join(dir, 'inspections.json'), JSON.stringify([inspection]))
    writeFileSync(join(dir, 'proposal.json'), JSON.stringify(proposalInput))
    writeFileSync(join(dir, 'envelope.json'), JSON.stringify(envelope))
    const wl = (args: string[]) => {
      const result = spawnSync(
        process.execPath,
        [
          resolve('dist/wl.mjs'),
          ...args,
          // Inspection reads a repository only; it has no store option.
          ...(args[1] === 'inspect' ? [] : ['--store', store]),
          '--json',
        ],
        { cwd: dir, encoding: 'utf8' },
      )
      let json: ReturnType<typeof JSON.parse>
      try {
        json = JSON.parse(result.stdout)
      } catch {
        json = undefined
      }
      if (json) {
        // Every emitted value must match its declared, versioned output variant.
        const variant = output.oneOf.find(
          (entry) => entry.properties.schema.const === (json as { schema: string }).schema,
        )
        expect(variant).toBeDefined()
        for (const field of variant?.required ?? []) expect(json).toHaveProperty(field)
        for (const field of Object.keys(json))
          expect(Object.keys(variant?.properties ?? {})).toContain(field)
      }
      return { status: result.status, stdout: result.stdout, stderr: result.stderr, json }
    }
    run({ root, dir, store, inspection, wl })
  })
}

describe('maintenance commands (LEARN-05)', () => {
  it('inspects, proposes once, lists and retains a dismissal through the compiled CLI', () =>
    setup(({ wl }) => {
      const inspected = wl(['maintenance', 'inspect', '--file', 'inspection.json'])
      expect(inspected.status, inspected.stderr).toBe(0)
      expect(inspected.json).toMatchObject({
        finding: { lines: ['search.md:2:TODO: describe archived tasks.'] },
        effects: { code: 'not-changed', tracker: 'not-written' },
      })
      const propose = () =>
        wl(['maintenance', 'propose', '--inspection', 'inspection.json', '--file', 'proposal.json'])
      const first = propose()
      expect(first.status, first.stderr).toBe(0)
      expect(first.json).toMatchObject({ status: 'recorded', protected: [] })
      expect(propose().json).toMatchObject({ status: 'duplicate', key: first.json.key })
      expect(wl(['maintenance', 'proposals']).json).toMatchObject({
        proposals: [{ key: first.json.key, status: 'open' }],
        currency: 'not-inspected',
      })
      const missing = wl(['maintenance', 'dismiss', '--key', first.json.key, '--operator', 'x'])
      expect(missing.status).toBe(2)
      const dismissed = wl([
        'maintenance',
        'dismiss',
        '--key',
        first.json.key,
        '--operator',
        'Fixture Operator',
        '--reason',
        'Archived tasks are out of scope.',
      ])
      expect(dismissed.status, dismissed.stderr).toBe(0)
      expect(propose().json).toMatchObject({ status: 'dismissed' })
      expect(wl(['maintenance', 'proposals']).json.proposals[0]).toMatchObject({
        status: 'dismissed',
        dismissal: { operator: 'Fixture Operator', reason: 'Archived tasks are out of scope.' },
      })
      const admit = wl([
        'maintenance',
        'admit',
        '--envelope',
        'envelope.json',
        '--inspections',
        'inspections.json',
      ])
      expect(admit.json.results).toEqual([
        { key: first.json.key, admitted: false, reasons: ['dismissed'] },
      ])
    }))
  it('takes the finding from a fresh run, never from a supplied file', () =>
    setup(({ root, wl }) => {
      writeFileSync(join(root, 'search.md'), 'Search by title.\n')
      git(root, ['commit', '-am', 'docs: resolve the note', '-m', 'Remove the finding.'])
      const result = wl([
        'maintenance',
        'propose',
        '--inspection',
        'inspection.json',
        '--file',
        'proposal.json',
      ])
      expect(result.json).toEqual({
        schema: 'wholeloop/maintenance-propose@1',
        status: 'no-finding',
        key: null,
      })
    }))
  it.each([
    ['an extra inspection field', 'inspection.json', { extra: true }],
    ['a relative inspection root', 'inspection.json', { root: 'repo' }],
    ['an unknown category', 'inspection.json', { category: 'anything' }],
  ])('refuses %s without echoing it', (_name, file, change) =>
    setup(({ dir, wl, inspection }) => {
      writeFileSync(join(dir, file), JSON.stringify({ ...inspection, ...change }))
      const result = wl(['maintenance', 'inspect', '--file', file])
      expect(result.status).toBe(3)
      expect(result.json.message).toBe('Invalid maintenance inspection; contents omitted')
      expect(result.stdout).not.toContain(String(Object.values(change)[0]))
    }),
  )
})

describe('recurring delivery intake (LEARN-06)', () => {
  it('admits a current proposal once as its own delivery source with a separate grant', () =>
    setup(({ dir, store, wl }) => {
      const key = wl([
        'maintenance',
        'propose',
        '--inspection',
        'inspection.json',
        '--file',
        'proposal.json',
      ]).json.key
      const admit = () =>
        wl([
          'maintenance',
          'admit',
          '--envelope',
          'envelope.json',
          '--inspections',
          'inspections.json',
          '--at',
          '2026-11-02T10:00:00.000Z',
        ])
      const first = admit()
      expect(first.status, first.stderr).toBe(0)
      expect(first.json).toMatchObject({
        at: '2026-11-02T10:00:00.000Z',
        grant: 'separate-exact-plan-grant-required',
        execution: 'not-started',
        results: [{ key, admitted: true, reasons: [] }],
      })
      const [result] = first.json.results
      expect(result.run).toMatch(/^delivery-[a-f0-9]{16}$/)
      const source = new DeliverySources(store).get(result.source)
      expect(source).toMatchObject({
        kind: 'inline',
        ref: `inline:maintenance-${key.slice(0, 16)}`,
      })
      expect(source.body).toContain('archived-docs: The search notes describe archived tasks.')
      const criterion = source.mapping.find((entry) => entry.id === 'archived-docs')
      expect(criterion?.role).toBe('criterion')
      expect(source.body.split('\n')[(criterion?.startLine ?? 0) - 1]).toContain('archived-docs')
      // No run, plan, grant or queue entry is created by admission.
      expect(existsSync(join(store, 'delivery', 'plans'))).toBe(false)
      expect(existsSync(join(store, 'delivery', 'journal.jsonl'))).toBe(false)
      const again = admit()
      expect(again.json.results).toEqual([
        {
          key,
          admitted: false,
          reasons: ['already-admitted'],
          run: result.run,
          source: result.source,
        },
      ])
      expect(readdirSync(join(store, 'learning', 'admissions'))).toEqual([`${key}.json`])
      expect(JSON.parse(readFileSync(join(dir, 'envelope.json'), 'utf8'))).toEqual(envelope)
    }))
  it('refuses stale evidence, an unpinned inspection and a merge envelope', () =>
    setup(({ root, dir, wl, inspection }) => {
      wl(['maintenance', 'propose', '--inspection', 'inspection.json', '--file', 'proposal.json'])
      writeFileSync(
        join(dir, 'other.json'),
        JSON.stringify([{ ...inspection, id: 'other-inspection' }]),
      )
      expect(
        wl(['maintenance', 'admit', '--envelope', 'envelope.json', '--inspections', 'other.json'])
          .json.results[0].reasons,
      ).toEqual(['inspection-not-pinned'])
      writeFileSync(join(root, 'search.md'), 'TODO: describe ranked search.\n')
      git(root, ['commit', '-am', 'docs: change the note', '-m', 'Change the evidence.'])
      expect(
        wl([
          'maintenance',
          'admit',
          '--envelope',
          'envelope.json',
          '--inspections',
          'inspections.json',
        ]).json.results[0].reasons,
      ).toEqual(['stale-evidence'])
      writeFileSync(join(dir, 'merge.json'), JSON.stringify({ ...envelope, endpoint: 'to-merge' }))
      const merge = wl([
        'maintenance',
        'admit',
        '--envelope',
        'merge.json',
        '--inspections',
        'inspections.json',
      ])
      expect(merge.status).toBe(3)
      expect(merge.json.message).toBe('Invalid recurring envelope; contents omitted')
    }))
  it('writes nothing when another admission lands while it inspects', () =>
    setup(({ store, inspection }) => {
      const competing = {
        schema: 'wholeloop/maintenance-admission@1',
        key: 'a'.repeat(64),
        run: 'delivery-aaaaaaaaaaaaaaaa',
        source: 'b'.repeat(64),
        envelope: 'c'.repeat(64),
        operator: 'Other Operator',
        endpoint: 'local-handoff',
        at: '2026-11-02T09:59:00.000Z',
        grant: 'separate-exact-plan-grant-required',
      }
      // The pinned command itself records the competing admission, deterministically
      // between the initial read and the locked write.
      const racing: MaintenanceInspection = {
        ...inspection,
        command: [
          'sh',
          '-c',
          `mkdir -p '${store}/learning/admissions' && printf '%s\\n' '${JSON.stringify(competing)}' > '${store}/learning/admissions/${competing.key}.json' && git grep -n TODO`,
        ],
      }
      // The evidence binds the pinned command, so the proposal comes from this one.
      const finding = inspectRepository(racing)
      if (!finding) throw new Error('Finding expected')
      new MaintenanceProposals(new StoreFiles(store)).record(
        maintenanceProposal(finding, proposalInput),
      )
      rmSync(join(store, 'learning', 'admissions', `${competing.key}.json`))
      expect(() =>
        admitMaintenanceProposals({
          store,
          envelope,
          inspections: [racing],
          now: '2026-11-02T10:00:00.000Z',
        }),
      ).toThrow('Concurrent maintenance admission')
      expect(readdirSync(join(store, 'learning', 'admissions'))).toEqual([`${competing.key}.json`])
    }))
})
