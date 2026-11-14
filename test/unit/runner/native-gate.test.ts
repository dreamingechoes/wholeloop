import { createHash } from 'node:crypto'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { GatePlan, GateResult } from '../../../src/gates/contracts.js'
import { prepareReviewInput } from '../../../src/review/input.js'
import { gateEvidence, RunnerNativeGateHost } from '../../../src/runner/native-gate.js'
import { RunnerNativeScope } from '../../../src/runner/native-scope.js'
import { RunnerNativeStage } from '../../../src/runner/native-stage.js'
import { nativeGateFixture as setup } from '../../support/native-gate.js'

describe('owned read-only gate workers preserve observed execution boundaries', () => {
  it('selects private audiences after claim and refuses evaluator-only input for a reviewer before copy or launch', async () => {
    await setup(async ({ store, context, engine, options, gate, review }) => {
      const unit = gate.units[0]
      if (!unit) throw new Error('Fixture gate unit missing')
      const text = 'Private evaluator-only fixture input.'
      store.files.atomic('gate-fixture-context/artifacts/private.txt', text)
      await new RunnerNativeStage(store, context).run(async (process) => {
        const selected = options(process),
          original = selected.context
        selected.context = (lease, role) => {
          const value = original(lease, role)
          expect(lease.role).toBe('reviewer')
          return {
            ...value,
            context: [
              ...value.context,
              {
                kind: 'hidden-acceptance',
                audience: 'assignment',
                attempt: lease.attempt,
                artifact: {
                  ref: 'artifacts/private.txt',
                  bytes: Buffer.byteLength(text),
                  sha256: createHash('sha256').update(text).digest('hex'),
                },
              },
            ],
          }
        }
        const host = new RunnerNativeGateHost(store, context, engine, gate, selected)
        await expect(host.inspect(gate, unit, review)).rejects.toThrow('hidden-acceptance')
      })
      expect(new RunnerNativeScope(store.files, context.invocation).calls()).toEqual([])
    })
  })
  it('retains actual fixture output without promoting it into a passing legacy gate result', async () => {
    await setup(async ({ run, gate, review, store, context }) => {
      const unit = gate.units[0]
      if (!unit) throw new Error('Fixture gate unit missing')
      await run(async (host) => {
        await expect(host.inspect(gate, unit, review)).rejects.toThrow(
          'native-gate-evidence-unavailable',
        )
        const entry = host.queue
          .inspect(context.request.run)
          .find((item) => item.role === 'reviewer')
        expect(entry?.status).toBe('complete')
        if (!entry?.attempt)
          throw new Error('The fixture transport must complete independently of gate authority')
        expect(host.native.completed(host.queue.assigned(context.request.run, entry.attempt))).toBe(
          true,
        )
      })
      expect(new RunnerNativeScope(store.files, context.invocation).calls()).toHaveLength(1)
    })
  })
  it('recovers the same exact normalized report without starting another native worker', async () => {
    await setup(
      async ({ run, gate, review, store, context, engine }) => {
        const unit = gate.units[0]
        if (!unit) throw new Error('Fixture gate unit missing')
        await run(async (host) => {
          const result = await host.inspect(gate, unit, review)
          expect(result).toMatchObject({ unit: unit.id, status: 'ok', findings: [] })
          expect(await host.inspect(gate, unit, review)).toEqual(result)
        })
        expect(new RunnerNativeScope(store.files, context.invocation).calls()).toHaveLength(1)
        store.lifecycle.transition(context.request.run, {
          to: 'paused',
          reason: 'Recover exact reviewed output without continuing.',
        })
        const reader = new RunnerNativeGateHost(store, context, engine, gate, undefined, true)
        expect(
          reader.observe(gate, 'reviewer', unit, prepareReviewInput(engine, gate)).value,
        ).toMatchObject({ unit: unit.id, status: 'ok' })
        await expect(reader.inspect(gate, unit, review)).rejects.toThrow('native-gate-read-only')
      },
      'valid',
      'host-observed',
    )
  })
  it('uses an independent refuter for a recorded finding', async () => {
    await setup(
      async ({ run, gate, gates, review, store, context }) => {
        const unit = gate.units[0]
        if (!unit) throw new Error('Fixture gate unit missing')
        await run(async (host) => {
          const result = await host.inspect(gate, unit, review)
          gates.submit(gate.subject, gate.run, gate.round, result)
          const finding = `${unit.id}:defect`
          expect(await host.refute(gate, finding, 1, review)).toMatchObject({
            finding,
            verifier: 1,
            outcome: 'refute',
          })
        })
        expect(new RunnerNativeScope(store.files, context.invocation).calls()).toHaveLength(2)
      },
      'finding',
      'host-observed',
    )
  })
  it('refuses missing findings and out-of-range verifiers before native dispatch', async () => {
    await setup(async ({ run, gate, gates, review, store, context }) => {
      const unit = gate.units[0]
      if (!unit) throw new Error('Fixture gate unit missing')
      // Admission is independent of real worker latency. After the original
      // deadline, a fenced refusal correctly takes precedence over bad input.
      gates.submit(gate.subject, gate.run, gate.round, {
        unit: unit.id,
        status: 'ok',
        evidence: ['Recorded fixture finding for admission checks only.'],
        findings: [
          {
            id: 'defect',
            location: 'app.txt:1',
            text: 'Recorded fixture defect.',
            evidence: ['Fixture line.'],
          },
        ],
      })
      await run(async (host) => {
        await expect(host.refute(gate, 'missing', 1, review)).rejects.toThrow('native-gate-finding')
        await expect(
          host.refute(gate, `${unit.id}:defect`, gate.verifiers + 1, review),
        ).rejects.toThrow('native-gate-finding')
      })
      expect(new RunnerNativeScope(store.files, context.invocation).calls()).toEqual([])
    })
  })
  it.each(['wrong-unit', 'execution', 'outer-unknown', 'mutate'] as const)(
    'refuses %s output without granting acceptance',
    async (mode) => {
      await setup(
        async ({ run, gate, review }) => {
          const unit = gate.units[0]
          if (!unit) throw new Error('Fixture gate unit missing')
          await expect(run((host) => host.inspect(gate, unit, review))).rejects.toThrow(
            mode === 'mutate'
              ? 'git-stage-candidate-not-current'
              : mode === 'outer-unknown'
                ? 'native-gate-evidence-unavailable'
                : 'native-gate-result-scope',
          )
        },
        mode,
        'host-observed',
      )
    },
  )
  it('refuses suite claims and unpinned rubric bytes before any native call', async () => {
    await setup(async ({ run, gate, review, store, context }) => {
      const unit = gate.units[0]
      if (!unit) throw new Error('Fixture gate unit missing')
      await run(async (host) => {
        await expect(
          host.inspect(gate, { ...unit, id: 'suite', lens: 'suite' }, review),
        ).rejects.toThrow('native-gate-suite-forbidden')
        await expect(
          host.inspect(gate, unit, {
            ...review,
            rubric: { ...review.rubric, digest: 'f'.repeat(64) },
          }),
        ).rejects.toThrow('native-gate-review-input')
        const diff = 'An unobserved replacement patch.'
        await expect(
          host.inspect(gate, unit, {
            ...review,
            diff,
            input: { ...review.input, diffDigest: createHash('sha256').update(diff).digest('hex') },
          }),
        ).rejects.toThrow('native-gate-review-input')
      })
      expect(new RunnerNativeScope(store.files, context.invocation).calls()).toHaveLength(0)
    })
  })
})

describe('verify-gate evidence for read-only verifiers', () => {
  it('carries the controller suite result and changed file bytes, never worker claims', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-verify-evidence-')))
    try {
      writeFileSync(join(root, 'status.txt'), 'public fixture\n')
      const plan = {
          gate: 'verify',
          repository: root,
          base: { ref: 'refs/heads/main', sha: 'a'.repeat(40) },
          inputs: { paths: ['status.txt', 'removed.txt'], languages: [], slots: [] },
        } as unknown as GatePlan,
        suite: GateResult = {
          unit: 'suite',
          status: 'ok',
          execution: { status: 'passed' },
          evidence: ['suite: exit 0'],
          findings: [],
        },
        claim: GateResult = { unit: 'criteria/status', status: 'ok', evidence: [], findings: [] }
      // A Codex verifier has no read tool; this is all it can judge from.
      const cases = [{ id: 'public-status', criteria: ['status'], capability: 'http.request' }]
      // Pinned acceptance coverage travels with its rule, so a verifier does not
      // block on runtime behavior that the acceptance stage observes later.
      expect(gateEvidence(plan, [suite], cases)?.acceptance).toMatchObject({
        cases,
        rule: expect.stringContaining('observed by the controller at the acceptance stage'),
      })
      expect(gateEvidence(plan, [suite])).toMatchObject({ acceptance: { cases: [] } })
      expect(gateEvidence(plan, [claim, suite])).toMatchObject({
        suite,
        changes: { base: 'a'.repeat(40), paths: ['status.txt', 'removed.txt'], complete: true },
        files: [
          { path: 'status.txt', text: 'public fixture\n' },
          { path: 'removed.txt', available: false },
        ],
        omitted: 0,
      })
      // A worker's own result is never presented as the controller's suite.
      expect(gateEvidence(plan, [claim])?.suite).toBeNull()
      // A review worker gets the complete change set and bytes, never the suite.
      const review = gateEvidence({ ...plan, gate: 'review' }, [suite])
      expect(review).toMatchObject({
        changes: { complete: true },
        files: [{ path: 'status.txt', text: 'public fixture\n' }, { path: 'removed.txt' }],
      })
      expect(review).not.toHaveProperty('suite')
      expect(review).not.toHaveProperty('acceptance')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
