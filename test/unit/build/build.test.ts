import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { stringify } from 'yaml'
import { type BuildHost, runBuild, runBuildGroup } from '../../../harness/workflows/build.js'
import type { BuilderPlan } from '../../../src/build/contracts.js'
import { BuildWorkflow } from '../../../src/build/workflow.js'
import { EnvironmentLedger } from '../../../src/environment/ledger.js'
import { FlowEngine } from '../../../src/flow/engine.js'
import { workspaceSnapshot } from '../../../src/gates/snapshot.js'
import { gateRuns } from '../../../src/gates/state.js'
import { GateWorkflow } from '../../../src/gates/workflow.js'
import { StateStore } from '../../../src/state/store.js'

const criteria = [
  {
    id: 'empty',
    text: 'Return status 400 for empty input',
    test: 'Pass empty input and assert status 400',
  },
]
const plan: BuilderPlan = {
  schema: 'wholeloop/builder-plan@1',
  steps: ['Read the existing request handler', 'Reject empty input at the boundary'],
  tests: ['Execute the empty-request assertion'],
  assumptions: [
    {
      text: 'Requests reach this handler',
      status: 'verified',
      evidence: 'app.ts exports the request entry point',
    },
  ],
}
async function fixture(
  run: (context: {
    dir: string
    root: string
    engine: FlowEngine
    workflow: BuildWorkflow
    subject: string
    put: (path: string, data: string | object) => void
  }) => void | Promise<void>,
) {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-build-'))
  const root = join(dir, 'repo with spaces')
  mkdirSync(root)
  const put = (path: string, data: string | object) => {
    const file = join(root, path)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, typeof data === 'string' ? data : stringify(data))
  }
  const git = (...args: string[]) => {
    const result = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: join(dir, 'no-global-config'),
      },
    })
    if (result.status !== 0) throw new Error(`Fixture Git failed: ${result.stderr}`)
  }
  try {
    git('init', '-b', 'main')
    put('app.ts', 'export const response = 500\n')
    put(
      '.agents/skills/backend/SKILL.md',
      '---\nname: backend\ndescription: Follow the repository request boundary conventions\nmetadata:\n  wholeloop.slot: build.backend\n---\n# Backend\n\nValidate input before calling domain code.\n',
    )
    git('add', '.')
    git(
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.com',
      'commit',
      '-m',
      'feat: seed builder fixture',
      '-m',
      'Provide a committed code and guidance base for build integration.',
    )
    const engine = new FlowEngine(
      new StateStore(join(dir, 'state/wholeloop')),
      root,
      join(dir, 'config/wholeloop/config.yml'),
      join(dir, 'home'),
    )
    const workflow = new BuildWorkflow(engine)
    const subject = workflow.agree('Reject empty requests', 'Fixture Owner', {
      criteria,
      by: 'Fixture Owner',
      source: { kind: 'sentence', ref: 'Reject empty requests' },
    }).subject
    await run({ dir, root, engine, workflow, subject, put })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
function host(engine: FlowEngine, extra: Partial<BuildHost> = {}): BuildHost {
  return {
    async plan(context) {
      expect(
        context.preflight.guidance.some(
          (entry) =>
            entry.slot === 'build.backend' && entry.content.includes('Validate input before'),
        ),
      ).toBe(true)
      return plan
    },
    async implement(context) {
      expect(
        engine.store
          .events()
          .some(
            (event) =>
              event.subject === context.preflight.subject && event.type === 'build.planned',
          ),
      ).toBe(true)
      writeFileSync(join(context.workspace.path, 'app.ts'), 'export const response = 400\n')
    },
    async inspect(gate, unit) {
      expect(readFileSync(join(gate.repository, 'app.ts'), 'utf8')).toContain('400')
      return {
        unit: unit.id,
        status: 'ok',
        evidence: ['Synthetic worker inspected the actual fixture handler'],
        findings: [],
      }
    },
    async refute(_gate, finding, verifier) {
      return {
        finding,
        verifier,
        outcome: 'confirm',
        reason: 'Fixture counterexample remains valid',
        evidence: ['Synthetic independent fixture observation'],
      }
    },
    stopped() {
      return false
    },
    ...extra,
  }
}

describe('repository-first build orchestration', () => {
  it.each(['native', 'sequential'] as const)(
    'runs agreed ad-hoc work through both gates in %s mode and preserves the personal checkout',
    async (mode) =>
      fixture(async ({ engine, workflow, subject, root }) => {
        new EnvironmentLedger(engine.store).declare(subject, {
          key: 'fixture-data',
          resource: 'fixture://local-database/orders',
          effect: 'Seeded synthetic orders',
          undo: { cwd: root, argv: ['fixture-db', 'remove-seed', '--name', 'orders'] },
          by: 'Fixture owner',
        })
        const personal = workspaceSnapshot(root)
        const result = await runBuild(workflow, subject, host(engine), { base: 'main', mode })
        expect(result.status).toBe('green')
        expect(workspaceSnapshot(root)).toEqual(personal)
        expect(
          gateRuns(engine.store.events()).map((run) => [
            run.gate,
            run.rounds.at(-1)?.decision?.report.verdict,
          ]),
        ).toEqual([
          ['verify', 'PASS'],
          ['review', 'PASS'],
        ])
        expect(engine.plan(subject).next).toBe('open-pr')
        const receipt = engine.store
          .events()
          .findLast(
            (event) =>
              event.subject === subject &&
              event.type === 'step.completed' &&
              event.data.step === 'build-slice',
          )
        expect(receipt?.type === 'step.completed' ? receipt.data.artifact.content : '').toContain(
          'fixture-db',
        )
        expect(receipt?.type === 'step.completed' ? receipt.data.artifact.content : '').toContain(
          'remove-seed',
        )
        expect(engine.store.get(subject).status).toBe('open')
        const complete = engine.store
          .events()
          .find((event) => event.type === 'step.completed' && event.data.step === 'build-slice')
        expect(complete?.type === 'step.completed' ? complete.data.artifact.content : '').toContain(
          'Human testing is still pending',
        )
        expect(
          engine.store.events().filter((event) => event.type === 'decision.recorded'),
        ).toHaveLength(0)
        expect(workflow.route(subject).candidates).toEqual([])
      }),
  )

  // This integration case intentionally runs three builder attempts and five real Git gate rounds.
  it(
    'repairs verify findings and review findings, rerunning verify after a review repair',
    async () =>
      fixture(async ({ engine, workflow, subject }) => {
        let repairs = 0
        const calls: string[] = []
        const worker = host(engine, {
          async implement(context, findings) {
            repairs++
            if (repairs > 1) expect(findings).toHaveProperty('kept')
            writeFileSync(
              join(context.workspace.path, 'app.ts'),
              `export const response = 400 // attempt ${repairs}\n`,
            )
          },
          async inspect(gate, unit) {
            calls.push(`${gate.gate}:${gate.round}:${unit.id}`)
            const defect =
              (gate.gate === 'verify' && repairs === 1 && unit.id === 'criteria/empty') ||
              (gate.gate === 'review' && repairs === 2 && unit.id === 'design-fit')
            return {
              unit: unit.id,
              status: 'ok',
              evidence: ['Synthetic fixture check'],
              findings: defect
                ? [
                    {
                      id: 'missing-guard',
                      location: 'app.ts:1',
                      text: 'Fixture guard needs repair',
                      evidence: ['Synthetic failing request path'],
                    },
                  ]
                : [],
            }
          },
        })
        expect((await runBuild(workflow, subject, worker, { base: 'main' })).status).toBe('green')
        expect(repairs).toBe(3)
        expect(gateRuns(engine.store.events()).map((run) => [run.gate, run.rounds.length])).toEqual(
          [
            ['verify', 2],
            ['review', 2],
            ['verify', 1],
          ],
        )
        expect(calls).toContain('review:2:design-fit')
      }),
    20000,
  )

  it('stops on unknown assumptions until a revision-bound human decision is recorded', async () =>
    fixture(async ({ engine, workflow, subject }) => {
      let implemented = false
      const worker = host(engine, {
        async plan() {
          return {
            ...plan,
            assumptions: [
              {
                text: 'The external service accepts this schema',
                status: 'unknown',
                evidence: 'No service contract is available',
              },
            ],
          }
        },
        async implement() {
          implemented = true
        },
      })
      await expect(runBuild(workflow, subject, worker, { base: 'main' })).rejects.toThrow(
        'approve-build-plan',
      )
      expect(implemented).toBe(false)
      expect(
        engine.plan(subject).pending.some((decision) => decision.id === 'approve-build-plan'),
      ).toBe(true)
      engine.answer('decision.approve-build-plan', 'approved', {
        subject,
        scope: 'run',
        by: 'Fixture Owner',
      })
      expect(() => workflow.ready(subject)).not.toThrow()
      const context = workflow.prepare(subject)
      workflow.recordPlan(
        subject,
        {
          ...plan,
          assumptions: [
            { text: 'A second unknown', status: 'unknown', evidence: 'New missing contract' },
          ],
        },
        context.snapshot,
      )
      expect(() => workflow.ready(subject)).toThrow('approve-build-plan')
    }))

  it('rejects code written while drafting the plan and retains the violating bytes', async () =>
    fixture(async ({ workflow, subject, engine }) => {
      let workspace = ''
      await expect(
        runBuild(
          workflow,
          subject,
          host(engine, {
            async plan(context) {
              workspace = context.workspace.path
              writeFileSync(join(workspace, 'app.ts'), 'Changed too early\n')
              return plan
            },
          }),
          { base: 'main' },
        ),
      ).rejects.toThrow('before recording its plan')
      expect(readFileSync(join(workspace, 'app.ts'), 'utf8')).toBe('Changed too early\n')
      expect(engine.store.events().some((event) => event.type === 'build.planned')).toBe(false)
    }))

  it('detects a host writing in the personal checkout and preserves the evidence', async () =>
    fixture(async ({ root, workflow, subject, engine }) => {
      await expect(
        runBuild(
          workflow,
          subject,
          host(engine, {
            async implement() {
              writeFileSync(join(root, 'app.ts'), 'Personal checkout violation\n')
            },
          }),
          { base: 'main' },
        ),
      ).rejects.toThrow('Personal checkout changed')
      expect(readFileSync(join(root, 'app.ts'), 'utf8')).toBe('Personal checkout violation\n')
      expect(engine.store.events().some((event) => event.type === 'step.completed')).toBe(false)
    }))

  it('exhausts without extending, completes no receipt and does not build again on resume', async () =>
    fixture(async ({ workflow, subject, engine, put }) => {
      put('.wholeloop/config.yml', { version: 1, gates: { verify: { rounds: 1 } } })
      let builds = 0
      const worker = host(engine, {
        async implement(context) {
          builds++
          writeFileSync(join(context.workspace.path, 'app.ts'), '400\n')
        },
        async inspect(_gate, unit) {
          return {
            unit: unit.id,
            status: 'unavailable',
            reason: 'Synthetic unavailable worker',
            evidence: [],
            findings: [],
          }
        },
      })
      expect((await runBuild(workflow, subject, worker, { base: 'main' })).status).toBe('exhausted')
      expect(() => workflow.complete(subject)).toThrow('current verify PASS')
      expect((await runBuild(workflow, subject, worker)).status).toBe('exhausted')
      expect(builds).toBe(1)
      expect(engine.store.events().some((event) => event.type === 'gate.extended')).toBe(false)
    }))

  it('resumes a partial gate without rebuilding or repeating submitted units', async () =>
    fixture(async ({ workflow, subject, engine }) => {
      const prepared = workflow.prepare(subject, { base: 'main' })
      workflow.recordPlan(subject, plan, prepared.snapshot)
      writeFileSync(join(prepared.workspace.path, 'app.ts'), 'export const response = 400\n')
      const gates = new GateWorkflow(engine)
      const gate = gates.plan(subject, 'verify').plan
      gates.submit(subject, gate.run, 1, {
        unit: 'suite',
        status: 'ok',
        evidence: ['Synthetic suite receipt'],
        findings: [],
      })
      const inspected: string[] = []
      const worker = host(engine, {
        async plan() {
          throw new Error('Plan must be resumed')
        },
        async implement() {
          throw new Error('Code must not be rebuilt during a pending gate')
        },
        async inspect(_gate, unit) {
          inspected.push(unit.id)
          return {
            unit: unit.id,
            status: 'ok',
            evidence: ['Synthetic resumed observation'],
            findings: [],
          }
        },
      })
      expect((await runBuild(workflow, subject, worker)).status).toBe('green')
      expect(inspected.filter((unit) => unit === 'suite')).toHaveLength(0)
    }))

  it('honors a stop before provisioning or scheduling workers', async () =>
    fixture(async ({ workflow, subject, engine }) => {
      const count = engine.store.events().length
      expect(
        (
          await runBuild(
            workflow,
            subject,
            host(engine, {
              stopped() {
                return true
              },
            }),
            { base: 'main' },
          )
        ).status,
      ).toBe('stopped')
      expect(engine.store.events()).toHaveLength(count)
    }))

  it('refuses direct completion without current gates and refuses direct free-text entry without criteria', async () =>
    fixture(({ workflow, subject, engine }) => {
      const prepared = workflow.prepare(subject, { base: 'main' })
      workflow.recordPlan(subject, plan, prepared.snapshot)
      expect(() => workflow.complete(subject)).toThrow('current verify PASS')
      expect(() =>
        engine.begin('build-slice', { input: 'Untestable shortcut', owner: 'Owner' }),
      ).toThrow('Agree ad-hoc criteria')
      expect(() => engine.complete('build-slice', subject, '# Fake receipt')).toThrow()
    }))
})

describe('build routing and host conformance fixtures', () => {
  it.each(['guided', 'staged', 'parallel'])(
    'schedules two ready slices in %s pace with identical coverage',
    async (pace) =>
      fixture(async ({ workflow, engine, root, put }) => {
        put('.wholeloop/config.yml', { version: 1, profile: { pace } })
        const scope = engine.store.create({
          kind: 'scope',
          title: 'Requests',
          owner: 'Fixture Owner',
          body: '',
        }).id
        const slices = ['First request', 'Second request'].map(
          (title) =>
            engine.store.create({
              kind: 'slice',
              parent: scope,
              title,
              owner: 'Fixture Owner',
              body: '',
              repository: root,
            }).id,
        )
        for (const id of slices)
          engine.store.transaction((_events, append) =>
            append(id, {
              type: 'build.agreed',
              data: {
                criteria,
                by: 'Fixture Owner',
                source: { kind: 'sentence', ref: 'Confirmed fixture criteria' },
              },
            }),
          )
        const order: string[] = []
        const result = await runBuildGroup(
          workflow,
          scope,
          (id) =>
            host(engine, {
              async implement(context) {
                order.push(`build:${id}`)
                writeFileSync(join(context.workspace.path, 'app.ts'), '400\n')
              },
              async inspect(gate, unit) {
                order.push(`gate:${gate.subject}:${gate.gate}`)
                return {
                  unit: unit.id,
                  status: 'ok',
                  evidence: ['Synthetic pace observation'],
                  findings: [],
                }
              },
            }),
          { base: 'main' },
        )
        expect(result.results.map(({ status }) => status)).toEqual(['green', 'green'])
        expect(
          gateRuns(engine.store.events())
            .map((run) => run.rounds[0]?.plan.units.length)
            .sort(),
        ).toEqual([2, 2, 6, 6])
        if (pace === 'guided')
          expect(order.indexOf(`build:${slices[1]}`)).toBeGreaterThan(
            order.lastIndexOf(`gate:${slices[0]}:review`),
          )
        if (pace === 'staged') {
          const gates = order.filter((event) => event.startsWith('gate:'))
          for (const id of slices)
            for (const kind of ['verify', 'review']) {
              const label = `gate:${id}:${kind}`
              const positions = gates.flatMap((event, index) => (event === label ? [index] : []))
              expect((positions.at(-1) ?? 0) - (positions[0] ?? 0) + 1).toBe(positions.length)
            }
        }
        expect(workflow.route(scope).candidates).toEqual([])
      }),
    20000,
  )

  it('pins a complete issue read and requires explicit agreement before creating a slice', async () =>
    fixture(async ({ workflow, put, engine }) => {
      expect(workflow.route()).toHaveProperty('kind', 'question')
      expect(workflow.route('https://github.com/example/project/issues/7')).toHaveProperty(
        'kind',
        'issue',
      )
      expect(workflow.route('Reject empty input')).toHaveProperty('kind', 'sentence')
      put('.wholeloop/config.yml', { version: 1, providers: { tracker: 'github-issues' } })
      const ref = 'https://github.com/example/project/issues/7'
      const count = engine.store.events().length
      const issue = await workflow.readIssue(ref, {
        async invoke(call) {
          expect(call.operation).toBe('tracker.read-item')
          expect(call.tool).toBe('issue_read')
          return {
            status: 'succeeded',
            ref,
            body: 'Observed issue body with a confirmed empty-request case',
            revision: 'fixture-v1',
            complete: true,
          }
        },
      })
      expect(engine.store.events()).toHaveLength(count)
      expect(
        workflow.agree('Reject empty input', 'Owner', {
          by: 'Owner',
          criteria,
          source: issue.source,
        }).subject,
      ).toMatch(/^slice-/)
      await expect(
        workflow.readIssue(ref, {
          async invoke() {
            return { status: 'pending', ref }
          },
        }),
      ).rejects.toThrow('complete same-reference')
      await expect(
        workflow.readIssue('https://token@example.com/issue', {
          async invoke() {
            throw new Error('Must not invoke')
          },
        }),
      ).rejects.toThrow('credential-free')
    }))

  it('exposes compiled CLI agreement, preflight, preparation, plan schema and guarded completion', async () =>
    fixture(({ workflow, dir, root }) => {
      const binary = resolve('dist/wl.mjs')
      const invoke = (expected: number, ...args: string[]) => {
        const result = spawnSync(process.execPath, [binary, ...args, '--json'], {
          cwd: root,
          encoding: 'utf8',
          env: {
            ...process.env,
            XDG_STATE_HOME: join(dir, 'state'),
            XDG_CONFIG_HOME: join(dir, 'config'),
            HOME: join(dir, 'home'),
          },
        })
        expect(result.stderr).toBe('')
        expect(result.status).toBe(expected)
        return JSON.parse(result.stdout)
      }
      const file = join(dir, 'criteria.json')
      writeFileSync(file, JSON.stringify({ schema: 'wholeloop/criteria@1', criteria }))
      const agreed = invoke(
        0,
        'build',
        'agree',
        'CLI empty request',
        '--owner',
        'Owner',
        '--by',
        'Owner',
        '--criteria',
        file,
      )
      const preflight = invoke(0, 'build', 'preflight', agreed.subject)
      expect(preflight.guidance[0].content).toContain('Validate input before')
      const prepared = invoke(0, 'build', 'prepare', agreed.subject, '--base', 'main')
      writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan))
      invoke(
        0,
        'build',
        'plan',
        agreed.subject,
        '--file',
        join(dir, 'plan.json'),
        '--basis',
        prepared.snapshot,
      )
      invoke(3, 'build', 'complete', agreed.subject)
      expect(invoke(0, 'build', 'schema').plan.required).toContain('assumptions')
      expect(workflow.ready(agreed.subject).plan).toEqual(plan)
    }))
})

describe('build dependency safety', () => {
  // A complete Git build plus scope/dependency replay needs a separate integration timeout.
  it(
    'unblocks a declared dependent after green without closing the source, and blocks again during a rebuild',
    async () =>
      fixture(async ({ workflow, engine, root }) => {
        const scope = engine.store.create({
          kind: 'scope',
          title: 'Dependent requests',
          owner: 'Owner',
          body: '',
        }).id
        const first = engine.store.create({
          kind: 'slice',
          title: 'First request',
          parent: scope,
          owner: 'Owner',
          body: '',
          repository: root,
        }).id
        const second = engine.store.create({
          kind: 'slice',
          title: 'Second request',
          parent: scope,
          owner: 'Owner',
          body: '',
          repository: root,
        }).id
        engine.store.transaction((_events, append) => {
          append(first, {
            type: 'build.agreed',
            data: {
              criteria,
              by: 'Owner',
              source: { kind: 'sentence', ref: 'Confirmed first request' },
            },
          })
          append(second, {
            type: 'slice.defined',
            data: {
              scope,
              run: 'run-0123456789abcdef',
              definition: {
                key: 'second',
                title: 'Second request',
                objective: 'Reject empty requests',
                outcomes: ['Empty input returns 400'],
                demonstration: {
                  entry: 'Request handler',
                  steps: ['Send empty input'],
                  expected: 'Status 400',
                },
                criteria,
                tests: [
                  {
                    id: 'empty-test',
                    criteria: ['empty'],
                    steps: ['Send empty input'],
                    expected: 'Status 400',
                  },
                ],
                repositories: ['app'],
              },
              repositories: [{ key: 'app', path: root }],
              blockedBy: [first],
              parts: [],
              tracker: {
                provider: 'local-tracker',
                operation: 'tracker.create-item',
                status: 'stored',
                ref: second,
              },
            },
          })
        })
        expect(workflow.route(scope).candidates).toEqual([first])
        expect((await runBuild(workflow, first, host(engine), { base: 'main' })).status).toBe(
          'green',
        )
        expect(engine.store.get(first).status).toBe('open')
        expect(workflow.route(scope).candidates).toEqual([second])
        engine.begin('build-slice', { subject: first })
        expect(workflow.route(second).candidates).toEqual([])
      }),
    10000,
  )

  it('rejects stacking on uncommitted predecessor files instead of silently omitting them', async () =>
    fixture(({ workflow, subject, engine }) => {
      const first = workflow.prepare(subject, { base: 'main' })
      writeFileSync(join(first.workspace.path, 'app.ts'), 'Uncommitted predecessor\n')
      const second = workflow.agree('Second request', 'Owner', {
        criteria,
        by: 'Owner',
        source: { kind: 'sentence', ref: 'Second request' },
      }).subject
      expect(() => workflow.prepare(second, { after: subject })).toThrow('uncommitted files')
      expect(
        engine.store
          .events()
          .some((event) => event.subject === second && event.type === 'worktree.planned'),
      ).toBe(false)
    }))
})
