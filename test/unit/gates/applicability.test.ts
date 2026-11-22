// Optional review lenses apply by change size and paths; mandatory lenses always run (ADR-0258).
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FlowEngine } from '../../../src/flow/engine.js'
import { optionalLensExclusion, TINY_CHANGE_LINES } from '../../../src/gates/lenses.js'
import { GateWorkflow } from '../../../src/gates/workflow.js'
import { StateStore } from '../../../src/state/store.js'

const inputs = (paths: string[]) => ({ paths, languages: [], slots: [] })

describe('optional lens applicability', () => {
  it.each([
    ['design-fit', ['README.md', 'docs/guide.md'], 40, 'only documentation changed'],
    ['performance', ['docs/a.txt'], 2, 'only documentation changed'],
    ['simplicity', ['CHANGELOG.md'], 400, 'only documentation changed'],
    ['change-shape', ['README.md'], 400, undefined],
    ['change-shape', ['src/app.ts'], TINY_CHANGE_LINES, '10 changed lines in one file'],
    ['simplicity', ['src/app.ts'], 1, '1 changed line in one file'],
    ['change-shape', ['src/app.ts'], TINY_CHANGE_LINES + 1, undefined],
    ['change-shape', ['src/a.ts', 'src/b.ts'], 2, undefined],
    ['change-shape', ['src/app.ts'], undefined, undefined],
    ['performance', ['src/app.ts'], 1, undefined],
    ['design-fit', ['src/app.ts'], 1, undefined],
    ['design-fit', [], 0, undefined],
  ] as const)('%s on %j with %s lines', (id, paths, lines, reason) => {
    const excluded = optionalLensExclusion(id, inputs([...paths]), lines)
    if (reason) expect(excluded).toContain(reason)
    else expect(excluded).toBeUndefined()
  })
})

function planned<T>(
  change: (root: string) => void,
  rigor: 'quick' | 'standard' | 'deep' | undefined,
  inspect: (context: {
    result: ReturnType<GateWorkflow['plan']>
    workflow: GateWorkflow
    store: StateStore
    subject: string
  }) => T,
): T {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-lenses-'))
  const root = join(dir, 'repo')
  mkdirSync(root)
  const git = (...args: string[]) => {
    const result = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(dir, 'none') },
    })
    if (result.status !== 0) throw new Error(result.stderr)
  }
  try {
    git('init', '-b', 'main')
    writeFileSync(join(root, 'app.ts'), 'export const a = 1\nexport const b = 2\n')
    writeFileSync(join(root, 'README.md'), '# Fixture\n')
    git('add', '.')
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', 'commit', '-m', 'seed')
    change(root)
    const store = new StateStore(join(dir, 'state/wholeloop'))
    const engine = new FlowEngine(store, root, join(dir, 'config.yml'), join(dir, 'home'))
    const subject = store.create({
      kind: 'review',
      title: 'Review a change',
      owner: 'Fixture Owner',
      body: '',
      repository: root,
    }).id
    const workflow = new GateWorkflow(engine)
    const result = workflow.plan(subject, 'review', { base: 'main', ...(rigor ? { rigor } : {}) })
    return inspect({ result, workflow, store, subject })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const plan = (change: (root: string) => void) =>
  planned(change, undefined, ({ result }) => result.plan)

describe('planned review lenses', () => {
  it('skips change-shape and simplicity for a two-line change and keeps the mandatory lenses', () => {
    const planned = plan((root) =>
      writeFileSync(join(root, 'app.ts'), 'export const a = 3\nexport const b = 2\n'),
    )
    expect(planned.units.map(({ id }) => id)).toEqual([
      'correctness',
      'design-fit',
      'performance',
      'security',
    ])
    expect(planned.excluded).toEqual([
      { id: 'simplicity', reason: 'Not applicable: 2 changed lines in one file' },
      { id: 'change-shape', reason: 'Not applicable: 2 changed lines in one file' },
    ])
  })

  it('keeps only correctness, security and change-shape for a documentation-only change', () => {
    const planned = plan((root) =>
      writeFileSync(join(root, 'README.md'), `# Fixture\n\n${'More text.\n'.repeat(20)}`),
    )
    expect(planned.units.map(({ id }) => id).sort()).toEqual([
      'change-shape',
      'correctness',
      'security',
    ])
  })

  it('keeps every lens when an untracked file leaves the size unknown', () => {
    const planned = plan((root) => writeFileSync(join(root, 'new.ts'), 'export {}\n'))
    expect(planned.units).toHaveLength(6)
    expect(planned.excluded).toEqual([])
  })
})

describe('rigor', () => {
  const edit = (root: string) =>
    writeFileSync(join(root, 'app.ts'), 'export const a = 3\nexport const b = 2\n')
  it('stays standard by default, proposes quick for a tiny change and records the choice', () => {
    planned(edit, undefined, ({ result, store }) => {
      expect(result.rigor).toMatchObject({
        rigor: 'standard',
        proposed: 'quick',
        source: 'default',
      })
      expect(result.rigor.coverage).toContain('Standard: every applicable lens; 3 independent')
      expect(store.events().filter((event) => event.type === 'gate.rigor')).toHaveLength(1)
    })
  })
  it('skips every optional lens under quick and keeps the mandatory ones and quorum', () => {
    planned(edit, 'quick', ({ result }) => {
      expect(result.plan.units.map(({ id }) => id)).toEqual(['correctness', 'security'])
      expect(result.plan.excluded.map(({ reason }) => reason)).toContain(
        'Skipped: quick rigor was chosen for this run',
      )
      expect(result.plan.verifiers).toBe(3)
      expect(result.rigor).toMatchObject({ rigor: 'quick', source: 'person' })
    })
  })
  it('raises the quorum to five under deep and pins the rigor for the run', () => {
    planned(edit, 'deep', ({ result, workflow, subject }) => {
      expect(result.plan).toMatchObject({ verifiers: 5, refutations: 3 })
      expect(() => workflow.plan(subject, 'review', { rigor: 'quick' })).toThrow(
        'Rigor is fixed at deep for this run',
      )
      expect(workflow.plan(subject, 'review').rigor).toMatchObject({ rigor: 'deep' })
    })
  })
})
