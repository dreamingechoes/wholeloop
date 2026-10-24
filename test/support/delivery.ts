import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DEFAULT_DELIVERY_BUDGETS,
  type DeliveryEnvelope,
  type DeliveryPlan,
} from '../../src/delivery/plan.js'
import { DeliveryPlanning } from '../../src/delivery/planning-store.js'
import type { SourceSnapshot } from '../../src/delivery/source.js'
import { StateStore } from '../../src/state/store.js'

export function entry<T>(values: readonly T[], index: number): T {
  const value = values[index]
  if (value === undefined) throw new Error('Fixture requires the selected entry')
  return value
}
export function git(root: string, args: string[]): string {
  const result = spawnSync(
    'git',
    ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', ...args],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
    },
  )
  if (result.status !== 0) throw new Error(result.stderr)
  return result.stdout.trim()
}
export async function fixture(
  run: (context: {
    root: string
    dir: string
    planning: DeliveryPlanning
    source: SourceSnapshot
    plan: DeliveryPlan
    state: StateStore
  }) => void | Promise<void>,
) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-delivery-plan-')))
  const root = join(dir, 'repo')
  mkdirSync(root)
  git(root, ['init', '-b', 'main'])
  git(root, ['config', 'user.name', 'Fixture Owner'])
  git(root, ['config', 'user.email', 'fixture@example.test'])
  writeFileSync(join(root, 'app.txt'), 'Original application.\n')
  git(root, ['add', 'app.txt'])
  git(root, [
    'commit',
    '-m',
    'feat: seed a disposable application',
    '-m',
    'Provide an isolated repository for delivery planning tests.',
  ])
  const planning = new DeliveryPlanning(join(dir, 'state'))
  const source = planning.sources.capture(
    {
      schema: 'wholeloop/delivery-source-request@1',
      kind: 'inline',
      ref: 'search',
      body: 'Find tasks by title.',
      mapping: [{ id: 'search', role: 'criterion', startLine: 1, endLine: 1 }],
    },
    root,
  )
  const plan: DeliveryPlan = {
    schema: 'wholeloop/delivery-plan@1',
    run: 'delivery-0123456789abcdef',
    revision: 1,
    source: source.id,
    owner: 'Fixture Owner',
    scope: {
      outcomes: [{ id: 'locate', text: 'Locate tasks using their titles.' }],
      exclusions: ['Descriptions are excluded.'],
    },
    repositories: [
      { id: 'app', root, target: 'refs/heads/main', base: git(root, ['rev-parse', 'HEAD']) },
    ],
    guidance: [{ slot: 'review.rubric', ref: 'fixture:review', sha256: 'a'.repeat(64) }],
    policy: {
      endpoint: 'local-handoff',
      intervention: 'supervised',
      uncertainty: 'blocked',
      delegations: [],
    },
    budgets: { ...DEFAULT_DELIVERY_BUDGETS },
    capabilities: [],
    definition: { ready: true, missing: [] },
    criteria: [
      {
        id: 'search',
        text: source.body,
        test: 'Seed two tasks, search one title, and compare the returned task IDs.',
        outcomes: ['locate'],
        acceptance: 'machine',
      },
    ],
    work: [
      {
        id: 'contract',
        repository: 'app',
        role: 'contract',
        criteria: [],
        after: [],
        consumes: [],
        produces: [
          {
            id: 'search-api',
            revision: 'v1',
            sha256: 'b'.repeat(64),
            description: 'Title query and matching task IDs.',
          },
        ],
      },
      {
        id: 'search',
        repository: 'app',
        role: 'implementation',
        criteria: ['search'],
        after: ['contract'],
        consumes: ['search-api'],
        produces: [],
      },
    ],
    milestones: [
      {
        id: 'feature',
        work: ['contract', 'search'],
        criteria: ['search'],
        after: [],
        procedure:
          'Run the application and search seeded task titles through its public entrypoint.',
      },
    ],
  }
  try {
    await run({
      root,
      dir,
      planning,
      source,
      plan,
      state: new StateStore(planning.sources.files.root),
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
export function envelope(plan: DeliveryPlan): DeliveryEnvelope {
  const {
    schema: _schema,
    run: _run,
    revision: _revision,
    previous: _previous,
    envelope: _envelope,
    definition: _definition,
    criteria: _criteria,
    work: _work,
    milestones: _milestones,
    ...basis
  } = plan
  return {
    ...structuredClone(basis),
    schema: 'wholeloop/delivery-envelope@1',
    limits: { work: 100, criteria: 1000, revisions: 10 },
  }
}
