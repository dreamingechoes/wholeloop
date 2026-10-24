import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import {
  checkPlanEnvelope,
  type DeliveryPlan,
  type DeliveryPolicy,
  deliveryPlanRoute,
  planWaves,
  validateDeliveryPlan,
} from '../../../src/delivery/plan.js'
import { entry, envelope, fixture, git } from '../../support/delivery.js'

const invalid: { name: string; change: (plan: DeliveryPlan) => void; problem: string }[] = [
  {
    name: 'unknown work dependency',
    change: (p) => {
      entry(p.work, 1).after = ['absent']
    },
    problem: 'unknown-dependency',
  },
  {
    name: 'work dependency cycle',
    change: (p) => {
      entry(p.work, 0).after = ['search']
    },
    problem: 'dependency-cycle',
  },
  {
    name: 'contract before producer',
    change: (p) => {
      entry(p.work, 1).after = []
    },
    problem: 'contract-order',
  },
  {
    name: 'unknown contract',
    change: (p) => {
      entry(p.work, 1).consumes = ['absent']
    },
    problem: 'unknown-contract',
  },
  {
    name: 'duplicate contract ownership',
    change: (p) => {
      entry(p.work, 1).produces = structuredClone(entry(p.work, 0).produces)
    },
    problem: 'duplicate-contract',
  },
  {
    name: 'duplicate criterion ownership',
    change: (p) => {
      entry(p.work, 0).criteria = ['search']
    },
    problem: 'criterion-ownership',
  },
  {
    name: 'unowned criterion',
    change: (p) => {
      entry(p.work, 1).criteria = []
    },
    problem: 'empty-work',
  },
  {
    name: 'uncovered outcome',
    change: (p) => {
      p.scope.outcomes.push({ id: 'other', text: 'Another required behavior.' })
    },
    problem: 'uncovered-outcome',
  },
  {
    name: 'changed verbatim source criterion',
    change: (p) => {
      entry(p.criteria, 0).text = 'Search descriptions instead.'
    },
    problem: 'changed-source-criterion',
  },
  {
    name: 'unknown criterion outcome',
    change: (p) => {
      entry(p.criteria, 0).outcomes = ['absent']
    },
    problem: 'unknown-outcome',
  },
  {
    name: 'unknown repository',
    change: (p) => {
      entry(p.work, 1).repository = 'absent'
    },
    problem: 'unknown-repository',
  },
  {
    name: 'duplicate work IDs',
    change: (p) => {
      entry(p.work, 1).id = 'contract'
    },
    problem: 'duplicate-work',
  },
  {
    name: 'uncovered milestone work',
    change: (p) => {
      entry(p.milestones, 0).work = ['search']
    },
    problem: 'uncovered-milestone',
  },
  {
    name: 'unknown milestone dependency',
    change: (p) => {
      entry(p.milestones, 0).after = ['absent']
    },
    problem: 'unknown-milestone-dependency',
  },
  {
    name: 'milestone cycle',
    change: (p) => {
      entry(p.milestones, 0).after = ['feature']
    },
    problem: 'milestone-cycle',
  },
  {
    name: 'relative repository root',
    change: (p) => {
      entry(p.repositories, 0).root = 'relative'
    },
    problem: 'noncanonical-repository',
  },
  {
    name: 'duplicate repositories',
    change: (p) => {
      p.repositories.push(structuredClone(entry(p.repositories, 0)))
    },
    problem: 'duplicate-repository',
  },
  {
    name: 'unbounded work',
    change: (p) => {
      p.work = Array.from({ length: 101 }, () => entry(p.work, 0))
    },
    problem: 'limit-exceeded',
  },
  {
    name: 'unknown guidance slot',
    change: (p) => {
      entry(p.guidance, 0).slot = 'missing.slot'
    },
    problem: 'unknown-guidance-slot',
  },
  {
    name: 'inconsistent finite budget',
    change: (p) => {
      p.budgets.attemptMs = p.budgets.wallTimeMs + 1
    },
    problem: 'inconsistent-budget',
  },
  {
    name: 'missing initial predecessor',
    change: (p) => {
      p.revision = 2
    },
    problem: 'invalid-predecessor',
  },
  {
    name: 'conflicting intent readiness',
    change: (p) => {
      p.definition.missing = ['User problem remains unknown.']
    },
    problem: 'inconsistent-definition',
  },
  {
    name: 'research code writes',
    change: (p) => {
      p.policy.endpoint = 'research-report'
    },
    problem: 'research-code-work',
  },
  {
    name: 'publication without a remote',
    change: (p) => {
      p.policy.endpoint = 'to-pr'
    },
    problem: 'missing-publication-remote',
  },
]

describe('closed delivery plans and dependency contracts (AUTH-01–AUTH-04, INT-02)', () => {
  it('preserves every valid explicit source selector ID including case and dots', () =>
    fixture(({ plan, planning, root }) => {
      const source = planning.sources.capture(
        {
          schema: 'wholeloop/delivery-source-request@1',
          kind: 'inline',
          ref: 'search',
          body: entry(plan.criteria, 0).text,
          mapping: [{ id: 'Search.title', role: 'criterion', startLine: 1, endLine: 1 }],
        },
        root,
      )
      plan.source = source.id
      entry(plan.criteria, 0).id = 'Search.title'
      entry(plan.work, 1).criteria = ['Search.title']
      entry(plan.milestones, 0).criteria = ['Search.title']
      expect(validateDeliveryPlan(plan, source)).toEqual(plan)
    }))
  it('prepares source-defined build work without creating Define approvals or a second hierarchy', () =>
    fixture(({ plan, planning, state }) => {
      const receipt = planning.preparePlan(plan)
      expect(receipt.route).toEqual({ next: 'build', reason: 'explicit-criteria' })
      expect(receipt.waves).toEqual([['contract'], ['search']])
      expect(receipt.authority).toBe('not-granted')
      expect(receipt.workers).toBe('not-started')
      expect(state.events()).toEqual([])
      expect(state.list()).toEqual([])
      expect(planning.preparePlan(plan)).toEqual(receipt)
    }))

  it.each(invalid)('refuses $name', ({ change, problem }) =>
    fixture(({ plan, source }) => {
      change(plan)
      expect(() => validateDeliveryPlan(plan, source)).toThrow(problem)
    }),
  )

  it('rejects a malformed authority field and source identity without exposing values', () =>
    fixture(({ plan, source }) => {
      expect(() => validateDeliveryPlan({ ...plan, approvedBy: 'Owner' }, source)).toThrow(
        'invalid-shape',
      )
      expect(() => validateDeliveryPlan({ ...plan, source: 'a'.repeat(64) }, source)).toThrow(
        'source-mismatch',
      )
      expect(() => validateDeliveryPlan({ ...plan, owner: ' ' }, source)).toThrow('invalid-text')
    }))

  it('refuses recognizable credentials before storing a proposal and omits their text from errors', () =>
    fixture(({ plan, planning }) => {
      const value = `password=${'example'.repeat(3)}`
      plan.scope.exclusions.push(value)
      try {
        planning.preparePlan(plan)
        throw new Error('Expected refusal')
      } catch (error) {
        expect((error as Error).message).toContain('unsafe-or-oversized-content')
        expect((error as Error).message).not.toContain(value)
      }
      expect(existsSync(planning.sources.files.path('delivery/plans'))).toBe(false)
    }))

  it('binds exact source/criteria/guidance/policy/base inputs and rejects replacement of a revision', () =>
    fixture(({ plan, planning, root }) => {
      const first = planning.preparePlan(plan)
      for (const mutate of [
        (p: DeliveryPlan) => {
          entry(p.guidance, 0).sha256 = 'c'.repeat(64)
        },
        (p: DeliveryPlan) => {
          entry(p.criteria, 0).test = 'Search seeded titles through the public CLI.'
        },
        (p: DeliveryPlan) => {
          p.policy.intervention = 'none'
        },
        (p: DeliveryPlan) => {
          entry(p.repositories, 0).base = 'c'.repeat(40)
        },
      ]) {
        const changed = structuredClone(plan)
        mutate(changed)
        expect(contractDigest(changed)).not.toBe(first.digest)
        expect(() => planning.preparePlan(changed)).toThrow('revision-conflict')
      }
      const next = { ...structuredClone(plan), revision: 2, previous: first.digest }
      entry(next.guidance, 0).sha256 = 'c'.repeat(64)
      const second = planning.preparePlan(next)
      expect(second.digest).not.toBe(first.digest)
      expect(planning.getPlan(plan.run, 1)).toEqual(first)
      expect(planning.getPlan(plan.run, 2)).toEqual(second)
      writeFileSync(join(root, 'app.txt'), 'The target advances.\n')
      git(root, ['add', 'app.txt'])
      git(root, [
        'commit',
        '-m',
        'feat: advance the disposable base',
        '-m',
        'Exercise historical plan reads after target movement.',
      ])
      expect(planning.getPlan(plan.run, 1)).toEqual(first)
      expect(() => planning.preparePlan({ ...plan, run: 'delivery-aaaaaaaaaaaaaaaa' })).toThrow(
        'stale-or-missing-base',
      )
      expect(() =>
        planning.preparePlan({ ...next, revision: 3, previous: 'd'.repeat(64) }),
      ).toThrow('predecessor-mismatch')
    }))

  it('refuses damaged records and preserves their bytes', () =>
    fixture(({ plan, planning }) => {
      planning.preparePlan(plan)
      const path = planning.sources.files.path(`delivery/plans/${plan.run}/1.json`)
      const raw = JSON.parse(readFileSync(path, 'utf8'))
      raw.value.owner = 'Changed owner'
      writeFileSync(path, JSON.stringify(raw))
      expect(() => planning.getPlan(plan.run, 1)).toThrow('damaged-record')
      expect(JSON.parse(readFileSync(path, 'utf8')).value.owner).toBe('Changed owner')
    }))

  it('checks two actual repositories and refuses treating two worktrees as separate repositories', () =>
    fixture(({ plan, planning, root, dir }) => {
      const second = join(dir, 'second')
      git(dir, ['clone', '--no-hardlinks', root, second])
      plan.repositories.push({
        id: 'api',
        root: second,
        target: 'refs/heads/main',
        base: git(second, ['rev-parse', 'HEAD']),
      })
      entry(plan.work, 0).repository = 'api'
      expect(planning.preparePlan(plan).waves).toEqual([['contract'], ['search']])
      const worktree = join(dir, 'shared-worktree')
      git(root, ['worktree', 'add', '-b', 'parallel', worktree, 'main'])
      const other = structuredClone(plan)
      other.run = 'delivery-dddddddddddddddd'
      other.repositories[1] = {
        id: 'api',
        root: worktree,
        target: 'refs/heads/parallel',
        base: git(worktree, ['rev-parse', 'HEAD']),
      }
      expect(() => planning.preparePlan(other)).toThrow('stale-or-missing-base')
    }))

  it('checks the actual configured remote without fetching and preserves an old plan after configuration changes', () =>
    fixture(({ plan, planning, root }) => {
      git(root, ['remote', 'add', 'origin', 'https://github.com/example/tasks.git'])
      entry(plan.repositories, 0).remote = {
        name: 'origin',
        url: 'https://github.com/example/tasks',
      }
      plan.policy.endpoint = 'to-pr'
      const first = planning.preparePlan(plan)
      git(root, ['remote', 'set-url', 'origin', 'https://github.com/example/other.git'])
      expect(planning.getPlan(plan.run, 1)).toEqual(first)
      expect(() => planning.preparePlan({ ...plan, run: 'delivery-eeeeeeeeeeeeeeee' })).toThrow(
        'stale-or-missing-base',
      )
    }))

  it('retains prepared plans across rebuilding legacy projections', () =>
    fixture(({ plan, planning, state }) => {
      const first = planning.preparePlan(plan)
      state.rebuild()
      expect(planning.getPlan(plan.run, 1)).toEqual(first)
      expect(state.events()).toEqual([])
    }))

  it('retains existing work IDs without recording human approval', () =>
    fixture(({ plan, planning, state, root }) => {
      const item = state.create({
        kind: 'slice',
        title: 'Search task titles',
        body: 'Explicit work.',
        owner: 'Fixture Owner',
        repository: root,
      })
      const before = state.events()
      entry(plan.work, 1).subject = item.id
      expect(planning.preparePlan(plan).plan.work[1]?.subject).toBe(item.id)
      expect(state.events()).toEqual(before)
      expect(() =>
        planning.preparePlan({
          ...plan,
          run: 'delivery-bbbbbbbbbbbbbbbb',
          work: plan.work.map((unit) => ({ ...unit, subject: 'slice-ffffffff' })),
        }),
      ).toThrow('duplicate-subject')
      const missing = structuredClone(plan)
      missing.run = 'delivery-cccccccccccccccc'
      entry(missing.work, 1).subject = 'slice-ffffffff'
      expect(() => planning.preparePlan(missing)).toThrow('unknown-subject')
    }))

  it('enforces milestone dependency closure rather than listing independently green work', () =>
    fixture(({ plan, source }) => {
      plan.criteria.push({
        id: 'contract-shape',
        text: 'The title query contract returns task IDs.',
        test: 'Validate the response schema against its examples.',
        outcomes: ['locate'],
        acceptance: 'machine',
      })
      entry(plan.work, 0).criteria = ['contract-shape']
      plan.milestones = [
        {
          id: 'interface',
          work: ['contract'],
          criteria: ['contract-shape'],
          after: [],
          procedure: 'Validate contract examples.',
        },
        {
          id: 'feature',
          work: ['search'],
          criteria: ['search'],
          after: [],
          procedure: 'Run the application search.',
        },
      ]
      expect(() => validateDeliveryPlan(plan, source)).toThrow('milestone-order')
      entry(plan.milestones, 1).after = ['interface']
      expect(validateDeliveryPlan(plan, source)).toEqual(plan)
    }))

  it('keeps dense generated DAG waves deterministic and rejects a back edge', () =>
    fixture(({ plan, source }) => {
      plan.work = Array.from({ length: 60 }, (_, index) => ({
        id: `unit-${index}`,
        repository: 'app',
        role: 'contract' as const,
        criteria: index === 59 ? ['search'] : [],
        after: Array.from({ length: index }, (_, dep) => `unit-${dep}`),
        consumes: [],
        produces: [
          {
            id: `contract-${index}`,
            revision: 'v1',
            sha256: 'e'.repeat(64),
            description: 'A pinned interface example.',
          },
        ],
      }))
      entry(plan.milestones, 0).work = plan.work.map((unit) => unit.id)
      expect(planWaves(validateDeliveryPlan(plan, source))).toEqual(
        plan.work.map((unit) => [unit.id]),
      )
      entry(plan.work, 0).after = ['unit-59']
      expect(() => validateDeliveryPlan(plan, source)).toThrow('dependency-cycle')
    }))
})

describe('request envelopes and intervention routing', () => {
  it('preserves an initial envelope without authority and accepts only structurally bounded plans', () =>
    fixture(({ plan, planning, state }) => {
      const initial = planning.prepareEnvelope(envelope(plan))
      expect(planning.getEnvelope(initial.digest)).toEqual(initial)
      plan.envelope = initial.digest
      expect(planning.preparePlan(plan).digest).toBe(contractDigest(plan))
      expect(state.events()).toEqual([])
      for (const change of [
        (p: DeliveryPlan) => {
          entry(p.scope.outcomes, 0).text = 'Another intent.'
        },
        (p: DeliveryPlan) => {
          p.budgets.wallTimeMs++
        },
        (p: DeliveryPlan) => {
          p.policy.endpoint = 'to-merge'
        },
        (p: DeliveryPlan) => {
          p.guidance = []
        },
        (p: DeliveryPlan) => {
          p.owner = 'Another owner'
        },
      ]) {
        const changed = structuredClone(plan)
        change(changed)
        expect(() => checkPlanEnvelope(changed, initial.envelope)).toThrow('outside-envelope')
      }
    }))

  it.each(['supervised', 'on-exception', 'none'] as const)(
    'routes incomplete intent under %s without inventing a human decision',
    (intervention) =>
      fixture(({ plan, source }) => {
        plan.definition = { ready: false, missing: ['Observed user difficulty remains unknown.'] }
        plan.policy.intervention = intervention
        validateDeliveryPlan(plan, source)
        expect(deliveryPlanRoute(plan).next).toBe(
          intervention === 'none' ? 'blocked' : 'needs-input',
        )
        plan.policy.delegations = ['frame-outcome', 'approve-spec', 'approve-scopes'].map((id) => ({
          id: id as DeliveryPolicy['delegations'][number]['id'],
          rubric: { ref: 'fixture:definition', sha256: 'f'.repeat(64) },
          evidence: ['Independent challenge of the exact artifact.'],
          fallback: 'blocked',
        }))
        expect(deliveryPlanRoute(plan).next).toBe('define')
        entry(plan.criteria, 0).acceptance = 'human'
        expect(deliveryPlanRoute(plan).next).toBe(intervention === 'none' ? 'blocked' : 'define')
      }),
  )

  it('supports research without a code repository and requires research-specific delegation for incomplete intent', () =>
    fixture(({ plan, source }) => {
      plan.policy.endpoint = 'research-report'
      plan.policy.intervention = 'none'
      plan.repositories = []
      plan.work = [
        {
          id: 'research',
          role: 'research',
          criteria: ['search'],
          after: [],
          consumes: [],
          produces: [],
        },
      ]
      entry(plan.milestones, 0).work = ['research']
      expect(deliveryPlanRoute(validateDeliveryPlan(plan, source)).next).toBe('research')
      plan.definition = { ready: false, missing: ['Select permitted source angles.'] }
      expect(deliveryPlanRoute(plan).next).toBe('blocked')
      plan.policy.delegations = ['research-plan', 'research-sources'].map((id) => ({
        id: id as DeliveryPolicy['delegations'][number]['id'],
        rubric: { ref: 'fixture:research', sha256: 'f'.repeat(64) },
        evidence: ['Independent source-backed challenge.'],
        fallback: 'blocked',
      }))
      expect(deliveryPlanRoute(validateDeliveryPlan(plan, source)).next).toBe('research')
    }))
})

describe('compiled planning process', () => {
  it('serializes two simultaneous proposals and recovers the exact plan in a fresh process', () =>
    fixture(async ({ root, planning, plan, state }) => {
      writeFileSync(join(root, 'plan.json'), JSON.stringify(plan))
      const args = [
        resolve('dist/wl.mjs'),
        'delivery',
        'plan',
        '--file',
        join(root, 'plan.json'),
        '--root',
        root,
        '--store',
        planning.sources.files.root,
        '--json',
      ]
      const call = () =>
        new Promise<string>((resolve, reject) => {
          const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] })
          let stdout = '',
            stderr = ''
          child.stdout.on('data', (chunk) => {
            stdout += String(chunk)
          })
          child.stderr.on('data', (chunk) => {
            stderr += String(chunk)
          })
          child.on('error', reject)
          child.on('close', (code) => (code === 0 ? resolve(stdout) : reject(new Error(stderr))))
        })
      const [a, b] = await Promise.all([call(), call()])
      expect(JSON.parse(a)).toEqual(JSON.parse(b))
      const inspect = spawnSync(
        process.execPath,
        [
          resolve('dist/wl.mjs'),
          'delivery',
          'inspect-plan',
          '--run',
          plan.run,
          '--revision',
          '1',
          '--store',
          planning.sources.files.root,
          '--json',
        ],
        { encoding: 'utf8' },
      )
      expect(inspect.status, inspect.stderr).toBe(0)
      expect(JSON.parse(inspect.stdout)).toEqual(JSON.parse(a))
      expect(state.events()).toEqual([])
      expect(git(root, ['status', '--porcelain'])).toBe('?? plan.json')
      expect(existsSync(join(root, 'runtime'))).toBe(false)
    }))
})
