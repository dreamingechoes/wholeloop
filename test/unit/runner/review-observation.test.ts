import { appendFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { journalLayout } from '../../../src/delivery/journal-layout.js'
import * as segments from '../../../src/delivery/journal-segment.js'
import { GateWorkflow } from '../../../src/gates/workflow.js'
import { RunnerNativeGateHost } from '../../../src/runner/native-gate.js'
import { RunnerNativeScope } from '../../../src/runner/native-scope.js'
import { RunnerReviewStages } from '../../../src/runner/review-stages.js'
import { StoreFiles } from '../../../src/state/files.js'
import { nativeGateFixture as setup } from '../../support/native-gate.js'

describe('fresh composed review observations', () => {
  it.each(['sealed', 'lost-decision', 'changed-during-audit'] as const)(
    'shares exact sealed inputs while preserving %s behavior',
    async (mode) => {
      await setup(
        async ({ store, context, engine, options }) => {
          const stages = new RunnerReviewStages(store, {
              identity: context.request.host,
              engine: () => engine,
              gate: options,
            }),
            record = store.stage(contractDigest(context.request), context.stage.id)
          if (!record) throw new Error('Original review stage required')
          if (mode === 'lost-decision') {
            const verdict = vi.spyOn(GateWorkflow.prototype, 'verdict').mockImplementation(() => {
              throw new Error('Lose the original final decision before its write')
            })
            try {
              await expect(stages.execute(context)).rejects.toThrow('Lose the original final')
            } finally {
              verdict.mockRestore()
            }
          } else expect((await stages.execute(context)).status).toBe('passed')
          const calls = new RunnerNativeScope(store.files, context.invocation).calls()
          stages.options.gate = () => {
            throw new Error('Observation cannot construct a native worker')
          }
          if (mode === 'changed-during-audit') {
            const original = RunnerNativeGateHost.prototype.observe,
              observe = vi
                .spyOn(RunnerNativeGateHost.prototype, 'observe')
                .mockImplementation(function (this: RunnerNativeGateHost, ...args) {
                  const proof = original.apply(this, args)
                  appendFileSync(join(args[0].repository, 'app.txt'), 'Concurrent edit.\n')
                  return proof
                })
            try {
              const result = await stages.inspect(context.request, record).catch(() => undefined)
              expect(result?.status).not.toBe('passed')
            } finally {
              observe.mockRestore()
            }
          } else {
            const first = await stages.inspect(context.request, record)
            expect(first).toMatchObject({ status: 'passed', provenance: 'host-observed' })
            const names = journalLayout(readdirSync(store.files.path('delivery/journal'))).map(
                (file) => file.name,
              ),
              reads = vi.spyOn(segments, 'readJournalSegment'),
              locks = vi.spyOn(StoreFiles.prototype, 'locked')
            try {
              // Two independent observations each capture and finally revalidate
              // every segment. Neither may borrow the previous call's authority.
              expect(await stages.inspect(context.request, record)).toEqual(first)
              expect(await stages.inspect(context.request, record)).toEqual(first)
              const counts = new Map<string, number>()
              for (const [, , name] of reads.mock.calls)
                counts.set(name, (counts.get(name) ?? 0) + 1)
              expect([...counts.keys()].sort()).toEqual(names.sort())
              expect([...new Set(counts.values())]).toEqual([4])
              expect(locks).not.toHaveBeenCalled()
            } finally {
              reads.mockRestore()
              locks.mockRestore()
            }
          }
          expect(new RunnerNativeScope(store.files, context.invocation).calls()).toEqual(calls)
        },
        'valid',
        'host-observed',
      )
    },
  )
})
