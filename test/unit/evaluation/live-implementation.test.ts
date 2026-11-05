import { spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DeliveryPlanning } from '../../../src/delivery/planning-store.js'
import { assertAssemblyGit } from '../../../src/integration/git-process.js'
import { campaignReport, type LiveTrial } from '../../evals/campaign/report.js'
import {
  configureTrialCheckout,
  TASK,
  TRIAL_FILES,
  TRIAL_REPOSITORY,
  verifyTrialSeed,
} from '../../evals/live-implementation/fixture.js'
import { trialPlan } from '../../evals/live-implementation/plan.js'
import { fixture, git } from '../../support/delivery.js'

describe('EVAL-09 live implementation trial', () => {
  it('admits the real checkout setup without relaxing the repository-helper guard', async () => {
    await fixture(({ root }) => {
      configureTrialCheckout(root)
      expect(() => assertAssemblyGit(root)).not.toThrow()
      // Even the former null hook path remains forbidden as repository input.
      git(root, ['config', 'core.hooksPath', '/dev/null'])
      expect(() => assertAssemblyGit(root)).toThrow('controller-git-helper-unavailable')
    })
  })
  it.each([
    [[], {}, 'spend-quota-and-publish'],
    [
      [],
      { WHOLELOOP_LIVE_CONFIRM: 'spend-quota-and-publish', WHOLELOOP_LIVE_TARGET: 'other' },
      'reference target',
    ],
    [['--unexpected'], {}, 'Supported options'],
  ] as const)(
    'refuses invalid live input before creating a trial (%s)',
    (args, overrides, reason) => {
      const env = { ...process.env }
      delete env.WHOLELOOP_LIVE_CONFIRM
      const result = spawnSync(
        process.execPath,
        [resolve('scripts/check-live-implementation.mjs'), ...args],
        {
          encoding: 'utf8',
          timeout: 30000,
          env: { ...env, ...overrides },
        },
      )
      expect(result.status).toBe(1)
      expect(result.stderr).toContain(reason)
      expect(result.stdout).not.toContain('retained')
    },
  )

  it('starts with a genuinely failing suite and passes only after the status change', () => {
    const root = mkdtempSync(join(tmpdir(), 'wholeloop-eval09-suite-'))
    try {
      for (const [ref, body] of Object.entries(TRIAL_FILES)) {
        mkdirSync(dirname(join(root, ref)), { recursive: true })
        writeFileSync(join(root, ref), body)
      }
      git(root, ['init', '-b', 'main'])
      git(root, ['config', 'user.name', 'Trial Owner'])
      git(root, ['config', 'user.email', 'trial@example.test'])
      git(root, ['add', '.'])
      git(root, [
        'commit',
        '-m',
        'test: seed the evaluation input',
        '-m',
        'Provide a clean tree for refusing changed campaign inputs before trial launch.',
      ])
      verifyTrialSeed(root)
      const check = () =>
        spawnSync(process.execPath, ['suite.cjs'], { cwd: root, encoding: 'utf8' })
      expect(check().status).toBe(1)
      writeFileSync(join(root, 'status.txt'), 'public fixture')
      expect(check().status).toBe(0)
      writeFileSync(join(root, 'status.txt'), 'public fixture\n')
      expect(check().status).toBe(1)
      expect(() => verifyTrialSeed(root)).toThrow('Changed campaign input: status.txt')
      // A checkout symlink must be rejected before any target bytes are read.
      unlinkSync(join(root, 'status.txt'))
      symlinkSync('suite.cjs', join(root, 'status.txt'))
      expect(() => verifyTrialSeed(root)).toThrow('Non-regular campaign input: status.txt')
      unlinkSync(join(root, 'status.txt'))
      writeFileSync(join(root, 'status.txt'), 'pending')
      writeFileSync(join(root, 'AGENTS.md'), 'Unexpected additional guidance.\n')
      git(root, ['add', 'AGENTS.md'])
      git(root, [
        'commit',
        '-m',
        'test: add unexpected trial guidance',
        '-m',
        'Exercise refusal of additional guidance without loading its content.',
      ])
      expect(() => verifyTrialSeed(root)).toThrow('Unexpected campaign tree')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('pins the source, review rubric, exact private remote and narrow decisions', async () => {
    await fixture(({ root, plan: original, planning }) => {
      git(root, ['remote', 'add', 'origin', `git@github.com:${TRIAL_REPOSITORY}.git`])
      const files = planning.sources.files,
        source = planning.sources.capture(
          {
            schema: 'wholeloop/delivery-source-request@1',
            kind: 'inline',
            ref: 'eval-09',
            body: TASK,
            mapping: [{ id: 'status', role: 'criterion', startLine: 1, endLine: 1 }],
          },
          root,
        ),
        plan = trialPlan(files, {
          run: original.run,
          root,
          base: original.repositories[0]?.base ?? '',
          source: source.id,
        }),
        prepared = new DeliveryPlanning(files.root).preparePlan(plan)
      expect(prepared.digest).toMatch(/^[a-f0-9]{64}$/)
      expect(plan.repositories[0]?.remote?.url).toBe(`https://github.com/${TRIAL_REPOSITORY}`)
      expect(plan.policy).toMatchObject({
        endpoint: 'to-pr',
        intervention: 'none',
        uncertainty: 'blocked',
      })
      expect(plan.policy.delegations.map((entry) => entry.id)).toEqual([
        'approve-build-plan',
        'acceptance',
      ])
      for (const delegation of plan.policy.delegations) {
        const rubric = JSON.parse(readFileSync(join(files.root, delegation.rubric.ref), 'utf8'))
        expect(rubric.rules[0].text).toBe(TASK)
        expect(rubric.unknowns.allowed).toEqual([])
      }
    })
  })

  it('never counts a rehearsal as native campaign evidence', () => {
    expect(() =>
      campaignReport([{ schema: 'wholeloop/rehearsal-trial@1' } as unknown as LiveTrial]),
    ).toThrow('Not a live trial report')
  })
})
