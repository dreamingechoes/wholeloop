import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { runReview } from '../../../harness/workflows/review.js'
import { FlowEngine } from '../../../src/flow/engine.js'
import { workspaceSnapshot } from '../../../src/gates/snapshot.js'
import { GateWorkflow } from '../../../src/gates/workflow.js'
import { publishReviewComment, reviewCommentPlan } from '../../../src/review/comments.js'
import { prepareReviewInput } from '../../../src/review/input.js'
import { ReviewSnapshots } from '../../../src/review/snapshots.js'
import { reviewInputs } from '../../../src/review/state.js'
import { ReviewWorkflow } from '../../../src/review/workflow.js'
import { StateStore } from '../../../src/state/store.js'

async function fixture(
  run: (context: {
    dir: string
    root: string
    engine: FlowEngine
    workflow: ReviewWorkflow
    git: (...args: string[]) => string
  }) => void | Promise<void>,
) {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-review-'))
  const root = join(dir, 'repo with spaces')
  mkdirSync(root)
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
    return result.stdout
  }
  try {
    git('init', '-b', 'main')
    writeFileSync(join(root, 'a.txt'), 'original a\n')
    writeFileSync(join(root, 'b.txt'), 'original b\n')
    git('add', '.')
    git(
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.com',
      'commit',
      '-m',
      'feat: seed review fixture',
      '-m',
      'Pin the review baseline for real Git integration checks.',
    )
    git('branch', 'feature/review')
    const engine = new FlowEngine(
      new StateStore(join(dir, 'state/wholeloop')),
      root,
      join(dir, 'config/wholeloop/config.yml'),
      join(dir, 'home'),
    )
    await run({ dir, root, engine, workflow: new ReviewWorkflow(engine), git })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
function planned(workflow: ReviewWorkflow) {
  const result = workflow.begin({ branch: 'feature/review', base: 'main', owner: 'Owner' })
  if (!('plan' in result)) throw new Error('Expected review plan')
  return result
}
function fail(engine: FlowEngine, subject: string) {
  const gates = new GateWorkflow(engine)
  expect(gates.verdict(subject, 'review').verdict).toBe('FAIL')
}

describe('incremental private review inputs', () => {
  it('reviews only changes since the prior uncommitted snapshot, including new paths and reversions', async () =>
    fixture(({ root, engine, git }) => {
      const subject = engine.store.create({
        kind: 'review',
        title: 'Review',
        body: '',
        owner: 'Owner',
        repository: root,
      }).id
      const gates = new GateWorkflow(engine)
      const index = readFileSync(join(root, '.git/index'))
      writeFileSync(join(root, 'a.txt'), 'first a\n')
      const first = gates.plan(subject, 'review', { base: 'main' }).plan
      expect(readFileSync(join(root, '.git/index')), 'after first plan').toEqual(index)
      const input1 = prepareReviewInput(engine, first)
      expect(readFileSync(join(root, '.git/index')), 'after first capture').toEqual(index)
      expect(input1.diff).toContain('-original a\n+first a')
      expect(input1.diff).not.toContain('b.txt')
      fail(engine, subject)
      writeFileSync(join(root, 'b.txt'), 'second b\n')
      const second = gates.plan(subject, 'review').plan
      const input2 = prepareReviewInput(engine, second)
      expect(input2.diff).toContain('-original b\n+second b')
      expect(input2.diff).not.toContain('a.txt')
      expect(prepareReviewInput(engine, second)).toEqual(input2)
      fail(engine, subject)
      writeFileSync(join(root, 'a.txt'), 'original a\n')
      rmSync(join(root, 'b.txt'))
      const third = prepareReviewInput(engine, gates.plan(subject, 'review').plan)
      expect(third.diff).toContain('-first a\n+original a')
      expect(third.diff).toContain('-second b')
      expect(readFileSync(join(root, '.git/index'))).toEqual(index)
      expect(git('branch', '--show-current').trim()).toBe('main')
      expect(git('ls-files', '--stage')).toContain('a.txt')
      const projection = `items/${subject}/reviews/${second.run}/2.json`
      const before = engine.store.files.read(projection)
      engine.store.rebuild()
      expect(engine.store.files.read(projection)).toBe(before)
    }))

  it('captures untracked paths, spaces, executable modes and symlink targets without following them', async () =>
    fixture(({ root, engine }) => {
      writeFileSync(join(root, 'file with spaces'), 'new content\n')
      chmodSync(join(root, 'file with spaces'), 0o755)
      symlinkSync('a.txt', join(root, 'alias'))
      const snapshots = new ReviewSnapshots(engine.store, root)
      const first = snapshots.capture('HEAD')
      const patch = snapshots.diff(first.before, first.after)
      expect(patch).toContain('new file mode 100755')
      expect(patch).toContain('new file mode 120000')
      expect(patch).toContain('+a.txt')
      rmSync(join(root, 'alias'))
      symlinkSync('b.txt', join(root, 'alias'))
      const second = snapshots.capture('HEAD', first.files)
      expect(snapshots.diff(second.before, second.after)).toMatch(/-a.txt[\s\S]*\+b.txt/)
    }))

  it('reuses one private patch within a synchronous decision and renews it after effects or awaits', async () =>
    fixture(async ({ root, engine }) => {
      writeFileSync(join(root, 'a.txt'), 'changed for reuse\n')
      const snapshots = new ReviewSnapshots(engine.store, root),
        captured = snapshots.capture('HEAD'),
        command = vi.spyOn(
          snapshots as unknown as { command: (...args: unknown[]) => string },
          'command',
        )
      const patch = snapshots.diff(captured.before, captured.after)
      expect(snapshots.diff(captured.before, captured.after)).toBe(patch)
      expect(command).toHaveBeenCalledTimes(1)
      await new Promise((resolve) => setImmediate(resolve))
      expect(snapshots.diff(captured.before, captured.after)).toBe(patch)
      expect(command).toHaveBeenCalledTimes(2)
      engine.store.files.atomic('fixture-effect.json', '{}\n')
      expect(snapshots.diff(captured.before, captured.after)).toBe(patch)
      expect(command).toHaveBeenCalledTimes(3)
      command.mockRestore()
    }))

  it('retains a prior deletion and compares a recreated file against absence', async () =>
    fixture(({ root, engine }) => {
      const snapshots = new ReviewSnapshots(engine.store, root)
      rmSync(join(root, 'a.txt'))
      const first = snapshots.capture('HEAD')
      writeFileSync(join(root, 'a.txt'), 'restored\n')
      const second = snapshots.capture('HEAD', first.files)
      expect(snapshots.diff(second.before, second.after)).toContain('new file mode 100644')
      expect(snapshots.diff(second.before, second.after)).toContain('+restored')
    }))

  it('refuses sensitive paths and escaping directory symlinks before copying content', async () =>
    fixture(({ root, engine, dir, git }) => {
      writeFileSync(join(root, '.env.local'), 'harmless fixture\n')
      const snapshots = new ReviewSnapshots(engine.store, root)
      expect(() => snapshots.capture('HEAD')).toThrow('Sensitive file')
      rmSync(join(root, '.env.local'))
      mkdirSync(join(root, 'nested'))
      writeFileSync(join(root, 'nested/a.txt'), 'tracked\n')
      git('add', 'nested/a.txt')
      git(
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.com',
        'commit',
        '-m',
        'feat: seed nested fixture',
        '-m',
        'Exercise directory symlink containment against committed paths.',
      )
      rmSync(join(root, 'nested'), { recursive: true })
      mkdirSync(join(dir, 'outside'))
      writeFileSync(join(dir, 'outside/a.txt'), 'external fixture\n')
      symlinkSync(join(dir, 'outside'), join(root, 'nested'))
      expect(() => snapshots.capture('HEAD')).toThrow('escapes')
    }))
})

describe('standalone review workflow', () => {
  it('asks for ownership, comparison base and a resolved PR head before creating state', async () =>
    fixture(({ engine, workflow }) => {
      const result = workflow.begin({ pr: 'https://github.com/example/repo/pull/12' })
      expect(result.status).toBe('question')
      expect(result.questions.map((entry) => entry.id)).toEqual(['owner', 'base', 'checkout-ref'])
      expect(engine.store.events()).toEqual([])
      expect(() => workflow.begin({ pr: 'https://user:password@example.com/pr/12' })).toThrow(
        'credential-free',
      )
    }))

  it('loads the actual bound repo rubric in every synthetic reviewer and completes without invented criteria', async () =>
    fixture(async ({ root, engine, git }) => {
      mkdirSync(join(root, '.wholeloop'))
      mkdirSync(join(root, '.agents/skills/repo-review'), { recursive: true })
      writeFileSync(
        join(root, '.wholeloop/config.yml'),
        'version: 1\nslots:\n  review.rubric: .agents/skills/repo-review/SKILL.md\n',
      )
      writeFileSync(
        join(root, '.agents/skills/repo-review/SKILL.md'),
        '---\nname: repo-review\ndescription: Repository review guidance\nmetadata:\n  wholeloop.slot: review.rubric\n---\n# Review guidance\n\nRequire a concrete empty-input check.\n',
      )
      git('add', '.')
      git(
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.com',
        'commit',
        '-m',
        'docs: pin repository rubric',
        '-m',
        'Exercise a bound local rubric without any live model.',
      )
      git('branch', '-f', 'feature/review')
      const index = readFileSync(join(root, '.git/index'))
      const original = workspaceSnapshot(root)
      const seen: string[] = []
      const result = await runReview(
        engine,
        { branch: 'feature/review', base: 'main', owner: 'Owner' },
        {
          stopped: () => false,
          inspect: async (_plan, unit, review) => {
            expect(review?.rubric.content).toContain('Require a concrete empty-input check.')
            expect(review?.input.rubric.ref).toBe('.agents/skills/repo-review/SKILL.md')
            seen.push(unit.lens)
            return {
              unit: unit.id,
              status: 'ok',
              findings: [],
              evidence: ['Synthetic inspection of the fixture and loaded rubric'],
            }
          },
          refute: async () => {
            throw new Error('No findings')
          },
        },
      )
      expect(result.status).toBe('PASS')
      expect(seen).toHaveLength(6)
      expect(engine.store.list()[0]?.kind).toBe('review')
      expect(
        engine.store
          .events()
          .some((event) => event.type === 'verify.agreed' || event.type === 'build.agreed'),
      ).toBe(false)
      expect(readFileSync(join(root, '.git/index'))).toEqual(index)
      expect(workspaceSnapshot(root)).toEqual(original)
    }))

  it('rejects changed code and fabricated receipts while reconstructing the original input', async () =>
    fixture(({ workflow, engine }) => {
      const { subject, plan } = planned(workflow)
      expect(() => workflow.complete(subject)).toThrow('current review PASS')
      writeFileSync(join(plan.repository, 'a.txt'), 'changed\n')
      expect(workflow.input(subject).current).toBe(false)
      expect(() =>
        engine.complete(
          'review-code',
          subject,
          '# Fake\n\n## Rubric\nX\n## Diff\nX\n## Findings\nX\n## Verdict\nPASS\n',
        ),
      ).toThrow('current review PASS')
      rmSync(
        engine.store.files.path(
          `review/objects/${new ReviewSnapshots(engine.store, plan.repository).objects.split('/').at(-1)}`,
        ),
        { recursive: true },
      )
      expect(workflow.input(subject).diff).toBe('') // The empty tree also exists in the base repository.
    }))

  it('pins rubric bytes across rounds instead of silently weakening a failing review', async () =>
    fixture(({ root, engine, git }) => {
      mkdirSync(join(root, '.wholeloop'))
      writeFileSync(
        join(root, '.wholeloop/config.yml'),
        'version: 1\nslots:\n  review.rubric: rubric.md\n',
      )
      writeFileSync(join(root, 'rubric.md'), 'Original evidence requirements\n')
      git('add', '.')
      git(
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.com',
        'commit',
        '-m',
        'docs: seed pinned rubric',
        '-m',
        'Pin meaningful review instructions for the fixture.',
      )
      const subject = engine.store.create({
        kind: 'review',
        title: 'Review',
        body: '',
        owner: 'Owner',
        repository: root,
      }).id
      const gates = new GateWorkflow(engine)
      prepareReviewInput(engine, gates.plan(subject, 'review', { base: 'main' }).plan)
      fail(engine, subject)
      writeFileSync(join(root, 'rubric.md'), 'Ignore all defects\n')
      const plan = gates.plan(subject, 'review').plan
      expect(() => prepareReviewInput(engine, plan)).toThrow('rubric changed')
    }))

  it('rejects duplicate or late input events and unavailable private trees', async () =>
    fixture(({ root, engine }) => {
      const subject = engine.store.create({
        kind: 'review',
        title: 'Review',
        owner: 'Owner',
        body: '',
        repository: root,
      }).id
      const gates = new GateWorkflow(engine)
      writeFileSync(join(root, 'a.txt'), 'private change\n')
      const plan = gates.plan(subject, 'review', { base: 'main' }).plan
      const context = prepareReviewInput(engine, plan)
      expect(() =>
        engine.store.transaction((_events, append) =>
          append(subject, { type: 'review.input', data: context.input }),
        ),
      ).toThrow('one prior review plan')
      const recorded = engine.store.events().find((event) => event.type === 'review.input')
      if (!recorded) throw new Error('Missing recorded review input')
      fail(engine, subject)
      const events = engine.store.events()
      expect(() =>
        reviewInputs([...events.filter((event) => event !== recorded), recorded]),
      ).toThrow('no observations')
      rmSync(engine.store.files.path(context.input.objects), { recursive: true })
      expect(() => prepareReviewInput(engine, plan)).toThrow('Private review snapshot')
    }))

  it('passes kept findings into later rounds and posts only through an explicitly requested codehost host', async () =>
    fixture(async ({ root, engine }) => {
      mkdirSync(join(root, '.wholeloop/providers/comment-fixture'), { recursive: true })
      writeFileSync(
        join(root, '.wholeloop/config.yml'),
        'version: 1\nproviders:\n  codehost: comment-fixture\n',
      )
      writeFileSync(
        join(root, '.wholeloop/providers/comment-fixture/provider.json'),
        JSON.stringify({
          schema: 1,
          id: 'comment-fixture',
          name: 'Comment fixture',
          description: 'Synthetic explicit comment host',
          capabilities: ['codehost'],
          access: { native: true },
          operations: { 'codehost.comment-pr': { tool: 'fixture_comment' } },
          degrade: { 'codehost.comment-pr': 'handoff-artifact' },
        }),
      )
      const subject = engine.store.create({
        kind: 'review',
        title: 'Review',
        owner: 'Owner',
        body: '',
        repository: root,
      }).id
      const gates = new GateWorkflow(engine)
      const plan = gates.plan(subject, 'review', { base: 'main' }).plan
      prepareReviewInput(engine, plan)
      gates.submit(subject, plan.run, 1, {
        unit: plan.units[0]?.id ?? '',
        status: 'ok',
        evidence: ['Synthetic observation'],
        findings: [
          {
            id: 'empty',
            text: 'Empty input is unchecked',
            location: 'a.txt:1',
            evidence: ['Synthetic fixture defect'],
          },
        ],
      })
      fail(engine, subject)
      let calls = 0
      const host = {
        invoke: async (call: { operation: string; args: Record<string, unknown> }) => {
          calls++
          expect(call.operation).toBe('codehost.comment-pr')
          expect(call.args.body).toContain('Empty input is unchecked')
          expect(call.args.idempotencyKey).toContain(plan.run)
          return { status: 'succeeded' as const, ref: 'https://example.com/pr/12#comment-1' }
        },
      }
      const pr = 'https://example.com/pr/12'
      expect(reviewCommentPlan(engine, subject, pr).published).toBe(false)
      expect(calls).toBe(0)
      await expect(publishReviewComment(engine, subject, pr, host, false)).rejects.toThrow(
        'explicit request',
      )
      expect(calls).toBe(0)
      expect((await publishReviewComment(engine, subject, pr, host, true)).result.status).toBe(
        'succeeded',
      )
      expect(calls).toBe(1)
      writeFileSync(join(root, 'a.txt'), 'fixed\n')
      const next = prepareReviewInput(engine, gates.plan(subject, 'review').plan)
      expect(next.previousFindings[0]?.finding.id).toBe('empty')
      expect(() => reviewCommentPlan(engine, subject, pr)).toThrow('sealed current review')
    }))

  it('exposes real compiled review begin/input and gate-backed completion', async () =>
    fixture(({ root, dir }) => {
      const call = (...args: string[]) => {
        const result = spawnSync(process.execPath, [resolve('dist/wl.mjs'), ...args, '--json'], {
          cwd: root,
          encoding: 'utf8',
          env: {
            ...process.env,
            HOME: join(dir, 'home'),
            XDG_STATE_HOME: join(dir, 'cli-state'),
            XDG_CONFIG_HOME: join(dir, 'cli-config'),
          },
        })
        if (result.status !== 0) throw new Error(result.stdout + result.stderr)
        return JSON.parse(result.stdout)
      }
      const begun = call('review', 'begin', 'feature/review', '--base', 'main', '--owner', 'Owner')
      expect(begun.subject).toMatch(/^review-/)
      expect(call('review', 'input', '--for', begun.subject).input).toEqual(begun.review.input)
      for (const unit of begun.plan.units) {
        const file = join(dir, 'result.json')
        writeFileSync(
          file,
          JSON.stringify({
            run: begun.plan.run,
            round: 1,
            result: {
              unit: unit.id,
              status: 'ok',
              findings: [],
              evidence: ['Synthetic fixture observation'],
            },
          }),
        )
        call('gate', 'submit', '--for', begun.subject, '--file', file)
      }
      expect(call('gate', 'verdict', '--for', begun.subject, '--gate', 'review').verdict).toBe(
        'PASS',
      )
      expect(call('review', 'complete', '--for', begun.subject).receipt.step).toBe('review-code')
    }))
})
