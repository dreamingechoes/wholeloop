import { readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { DeliveryAcceptance } from '../../../src/acceptance/store.js'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { DeliveryQueue } from '../../../src/delivery/queue.js'
import { deliveryAttempts } from '../../../src/delivery/reducer.js'
import { RunnerArtifactStages } from '../../../src/runner/artifact-stages.js'
import { RunnerNativeScope } from '../../../src/runner/native-scope.js'
import { RunnerStore } from '../../../src/runner/store.js'
import { StoreFiles } from '../../../src/state/files.js'
import { runnerArtifactFixture as setup } from '../../support/runner-artifact.js'

function stages(fixture: Parameters<Parameters<typeof setup>[0]>[0]) {
  return new RunnerArtifactStages(fixture.store, {
    identity: fixture.context.request.host,
    native: (process) => ({ ...fixture.native, process }),
    context: () => fixture.input,
  })
}
describe('owned artifact stages preserve proposals separately from decisions and behavioral evidence', () => {
  it('retains a plan-labelled production artifact as blocked without changing its captured metadata or bytes', async () => {
    await setup(
      async (fixture) => {
        const host = stages(fixture),
          result = await host.execute(fixture.context)
        expect(result.status).toBe('blocked')
        expect(result.prepared).toBeUndefined()
        const binding = JSON.parse(
            readFileSync(
              fixture.store.files.path(
                `delivery/runner-artifacts/${fixture.context.invocation}.json`,
              ),
              'utf8',
            ),
          ),
          directory = fixture.store.files.path(binding.directory),
          receiptFile = readdirSync(directory).find((name) => name.startsWith('receipt-'))
        if (!receiptFile) throw new Error('Original native receipt missing')
        const receiptPath = join(directory, receiptFile),
          original = readFileSync(receiptPath, 'utf8'),
          receipt = JSON.parse(original),
          captured = receipt.artifacts[0],
          bytes = readFileSync(fixture.store.files.path(captured.ref))
        expect(receipt.result.artifacts[0].kind).toBe('plan')
        const record = fixture.store.stage(
          contractDigest(fixture.context.request),
          fixture.context.stage.id,
        )
        if (!record) throw new Error('Original stage missing')
        expect((await host.inspect(fixture.context.request, record)).status).toBe('blocked')
        expect(readFileSync(receiptPath, 'utf8')).toBe(original)
        expect(readFileSync(fixture.store.files.path(captured.ref))).toEqual(bytes)
        expect(
          new RunnerNativeScope(fixture.store.files, fixture.context.invocation).calls(),
        ).toHaveLength(1)
      },
      'host-observed',
      { stage: 'build-plan', mode: 'plan-kind' },
    )
  })

  it('keeps a next-revision acceptance proposal blocked without rewriting its captured bytes', async () => {
    await setup(
      async (fixture) => {
        const host = stages(fixture),
          result = await host.execute(fixture.context),
          root = fixture.store.files.path(`delivery/artifacts/${fixture.context.request.run}`),
          refs = readdirSync(root)
        expect(result.status).toBe('blocked')
        expect(result.prepared).toBeUndefined()
        expect(refs).toHaveLength(1)
        const file = join(root, refs[0] ?? ''),
          original = readFileSync(file, 'utf8')
        expect(JSON.parse(original).revision).toBe(fixture.context.plan.revision + 1)
        const record = fixture.store.stage(
          contractDigest(fixture.context.request),
          fixture.context.stage.id,
        )
        if (!record) throw new Error('Expected retained acceptance producer')
        expect((await host.inspect(fixture.context.request, record)).status).toBe('blocked')
        expect(readFileSync(file, 'utf8')).toBe(original)
        expect(
          new RunnerNativeScope(fixture.store.files, fixture.context.invocation).calls(),
        ).toHaveLength(1)
      },
      'host-observed',
      { mode: 'next-revision' },
    )
  })
  it('pins acceptance response identity to the current plan before invoking its producer', async () => {
    await setup(async (fixture) => {
      await stages(fixture).execute(fixture.context)
      const binding = JSON.parse(
          readFileSync(
            fixture.store.files.path(
              `delivery/runner-artifacts/${fixture.context.invocation}.json`,
            ),
            'utf8',
          ),
        ),
        brief = JSON.parse(binding.lease.assignment.brief)
      for (const [field, value] of Object.entries({
        run: fixture.context.plan.run,
        revision: fixture.context.plan.revision,
        plan: fixture.context.request.plan,
        source: fixture.context.plan.source,
      }))
        expect(brief.response.properties[field].const).toBe(value)
      expect(brief.outputArtifact).toEqual({
        ref: 'artifacts/production.json',
        kind: 'report',
        count: 1,
      })
      expect(brief.instruction).not.toContain('Definition/plan proposals')
      // The core parses every expected value as JSON (assertion-json), but the
      // frozen schema only says string; a live gpt-6.1-sol producer wrote a bare
      // commit hash. The brief must state the rule, and its example must parse.
      expect(brief.instruction).toContain('Every assertion expected value is JSON text')
      const example = /as in ("(?:\\.|[^"\\])*")/.exec(brief.instruction)?.[1]
      expect(example && JSON.parse(JSON.parse(example))).toBe('abc')
    })
  })
  it('supplies the installed acceptance input contract without changing the native assignment scope', async () => {
    await setup(async (fixture) => {
      const execution = { runners: [{ kind: 'api', capability: 'http.request' }] },
        host = new RunnerArtifactStages(fixture.store, {
          identity: fixture.context.request.host,
          native: (process) => ({ ...fixture.native, process }),
          context: () => fixture.input,
          acceptanceContext: () => execution,
        })
      await host.execute(fixture.context)
      const binding = JSON.parse(
          readFileSync(
            fixture.store.files.path(
              `delivery/runner-artifacts/${fixture.context.invocation}.json`,
            ),
            'utf8',
          ),
        ),
        brief = JSON.parse(binding.lease.assignment.brief)
      expect(brief.acceptanceContext).toEqual(execution)
      expect(binding.lease.assignment.tools.broker).toEqual([])
      expect(binding.lease.assignment.tools.workspace).toBe('none')
    })
  })
  it('does not recreate a locator lost before native input or dispatch its consumed attempt', async () => {
    await setup(async (fixture) => {
      const host = new RunnerArtifactStages(fixture.store, {
        identity: fixture.context.request.host,
        context: () => fixture.input,
        native: (process) => {
          const path = fixture.store.files.path(
            `delivery/runner-artifacts/${fixture.context.invocation}.json`,
          )
          renameSync(path, `${path}.retained`)
          return { ...fixture.native, process }
        },
      })
      await expect(host.execute(fixture.context)).rejects.toThrow('artifact-stage-native-binding')
      expect(
        new RunnerNativeScope(fixture.store.files, fixture.context.invocation).calls(),
      ).toEqual([])
      await expect(host.execute(fixture.context)).rejects.toThrow(
        'artifact-stage-original-unresolved',
      )
    })
  })
  it('refuses a workspace changed during context selection before admitting a planner', async () => {
    await setup(
      async (fixture) => {
        const host = new RunnerArtifactStages(fixture.store, {
          identity: fixture.context.request.host,
          native: (process) => ({ ...fixture.native, process }),
          context: () => {
            if (!fixture.workspace) throw new Error('Fixture workspace missing')
            writeFileSync(join(fixture.workspace, 'app.txt'), 'Changed during context selection.')
            return fixture.input
          },
        })
        await expect(host.execute(fixture.context)).rejects.toThrow(
          'artifact-stage-candidate-changed',
        )
        expect(
          deliveryAttempts(
            fixture.store.lifecycle.journal.get(fixture.context.request.run),
          ).records.filter((a) => a.role === 'planner'),
        ).toEqual([])
        expect(
          new RunnerNativeScope(fixture.store.files, fixture.context.invocation).calls(),
        ).toEqual([])
      },
      'fixture',
      { stage: 'build-plan' },
    )
  })
  it('retains exact private cancellation after the original grant is revoked', async () => {
    await setup(async (fixture) => {
      const host = stages(fixture)
      await host.execute(fixture.context)
      const record = fixture.store.stage(
        contractDigest(fixture.context.request),
        fixture.context.stage.id,
      )
      if (!record) throw new Error('Fixture stage missing')
      fixture.store.lifecycle.authority.revoke({
        schema: 'wholeloop/delivery-revocation-request@1',
        grant: fixture.context.request.grant,
        operator: 'Fixture Operator',
        reason: 'End authority without losing original cancellation ownership.',
      })
      await expect(
        host.stop(fixture.context.request, record, new AbortController().signal),
      ).resolves.toBeUndefined()
      expect(
        new RunnerNativeScope(fixture.store.files, fixture.context.invocation).calls(),
      ).toHaveLength(1)
    })
  })
  it('repairs a lost acceptance metadata write while paused without replaying the original model', async () => {
    await setup(async (fixture) => {
      const original = StoreFiles.prototype.atomic
      let failed = false
      const fault = vi.spyOn(StoreFiles.prototype, 'atomic').mockImplementation(function (
        this: StoreFiles,
        path,
        body,
      ) {
        if (!failed && path.startsWith('delivery/acceptance-plans/')) {
          failed = true
          throw new Error('Fixture acceptance metadata write failed')
        }
        return original.call(this, path, body)
      })
      try {
        const first = await stages(fixture).execute(fixture.context)
        expect(first.status).toBe('blocked')
        expect(failed).toBe(true)
      } finally {
        fault.mockRestore()
      }
      fixture.store.lifecycle.transition(fixture.context.request.run, {
        to: 'paused',
        reason: 'Recover only already-produced acceptance metadata.',
      })
      const record = fixture.store.stage(
        contractDigest(fixture.context.request),
        fixture.context.stage.id,
      )
      if (!record) throw new Error('Fixture stage missing')
      const reader = new RunnerArtifactStages(new RunnerStore(fixture.store.files.root), {
        identity: fixture.context.request.host,
        native: () => {
          throw new Error('Metadata recovery cannot construct a model')
        },
        context: () => {
          throw new Error('Metadata recovery cannot select new inputs')
        },
      })
      const recovered = await reader.inspect(fixture.context.request, record)
      expect(recovered).toMatchObject({ status: 'ready', prepared: { kind: 'acceptance' } })
      expect(await reader.inspect(fixture.context.request, record)).toEqual(recovered)
      expect(
        new RunnerNativeScope(fixture.store.files, fixture.context.invocation).calls(),
      ).toHaveLength(1)
      expect(fixture.store.lifecycle.journal.get(fixture.context.request.run).state).toBe('paused')
    })
  })
  it('does not reuse a captured report after its exact bytes change', async () => {
    await setup(async (fixture) => {
      const host = stages(fixture),
        first = await host.execute(fixture.context)
      if (!first.artifact) throw new Error('Fixture report missing')
      writeFileSync(fixture.store.files.path(first.artifact.ref), 'Changed original report bytes.')
      const record = fixture.store.stage(
        contractDigest(fixture.context.request),
        fixture.context.stage.id,
      )
      if (!record) throw new Error('Fixture stage missing')
      expect((await host.inspect(fixture.context.request, record)).status).toBe('unknown')
      expect(
        new RunnerNativeScope(fixture.store.files, fixture.context.invocation).calls(),
      ).toHaveLength(1)
    })
  })
  it('pins complete acceptance definitions before builders without granting approval or acceptance', async () => {
    await setup(async (fixture) => {
      const result = await stages(fixture).execute(fixture.context)
      expect(result).toMatchObject({
        status: 'ready',
        provenance: 'fixture',
        invocationState: 'stopped',
        prepared: { kind: 'acceptance' },
        approvals: 'not-recorded',
        acceptance: 'not-established',
      })
      if (!result.prepared || !result.artifact) throw new Error('Fixture proposal missing')
      const pinned = new DeliveryAcceptance(fixture.store.files.root).get(result.prepared.digest)
      expect(pinned.plan.plan).toBe(fixture.context.request.plan)
      expect(pinned.plan.cases.map((c) => c.criteria)).toEqual([['search']])
      expect(fixture.store.inspect(contractDigest(fixture.context.request)).outcome).toBeNull()
      expect(
        new RunnerNativeScope(fixture.store.files, fixture.context.invocation).calls(),
      ).toHaveLength(1)
    })
  })
  it('recovers the same prepared artifact while paused without constructing another native host', async () => {
    await setup(async (fixture) => {
      const result = await stages(fixture).execute(fixture.context),
        record = fixture.store.stage(
          contractDigest(fixture.context.request),
          fixture.context.stage.id,
        )
      if (!record) throw new Error('Fixture stage missing')
      fixture.store.lifecycle.transition(fixture.context.request.run, {
        to: 'paused',
        reason: 'Recover exact artifact metadata without continuing.',
      })
      const fresh = new RunnerArtifactStages(new RunnerStore(fixture.store.files.root), {
        identity: fixture.context.request.host,
        native: () => {
          throw new Error('Must not construct a new native host')
        },
        context: () => {
          throw new Error('Must not select new inputs')
        },
      })
      expect(await fresh.inspect(fixture.context.request, record)).toEqual(result)
      expect(
        new RunnerNativeScope(fixture.store.files, fixture.context.invocation).calls(),
      ).toHaveLength(1)
    })
  })
  it('produces a build plan bound to the actual owned pre-build candidate without recording legacy approval', async () => {
    await setup(
      async (fixture) => {
        const result = await stages(fixture).execute(fixture.context)
        expect(result).toMatchObject({
          status: 'ready',
          prepared: { kind: 'build-plan' },
          approvals: 'not-recorded',
        })
        expect(fixture.workspace).toBeDefined()
      },
      'fixture',
      { stage: 'build-plan' },
    )
  })
  it('refuses a changed pre-build candidate on fresh observation without another worker', async () => {
    await setup(
      async (fixture) => {
        const host = stages(fixture)
        expect((await host.execute(fixture.context)).status).toBe('ready')
        if (!fixture.workspace) throw new Error('Fixture workspace missing')
        writeFileSync(join(fixture.workspace, 'app.txt'), 'Changed after planning.\n')
        const record = fixture.store.stage(
          contractDigest(fixture.context.request),
          fixture.context.stage.id,
        )
        if (!record) throw new Error('Fixture stage missing')
        await expect(host.inspect(fixture.context.request, record)).rejects.toThrow(
          'artifact-stage-candidate-changed',
        )
        expect(
          new RunnerNativeScope(fixture.store.files, fixture.context.invocation).calls(),
        ).toHaveLength(1)
      },
      'fixture',
      { stage: 'build-plan' },
    )
  })
  it('validates a bounded definition proposal without reserving the next revision before its decisions', async () => {
    await setup(
      async (fixture) => {
        const result = await stages(fixture).execute(fixture.context)
        expect(result).toMatchObject({
          status: 'ready',
          prepared: { kind: 'delivery-plan', revision: 2 },
          approvals: 'not-recorded',
        })
        if (!result.artifact) throw new Error('Fixture proposal missing')
        const proposal = JSON.parse(
          readFileSync(fixture.store.files.path(result.artifact.ref), 'utf8'),
        )
        expect(proposal.previous).toBe(fixture.context.request.plan)
        expect(result.prepared?.disposition).toBe('proposal')
        expect(() => fixture.store.planning.getPlan(fixture.context.request.run, 2)).toThrow()
        expect(fixture.store.lifecycle.journal.get(fixture.context.request.run).basis.digest).toBe(
          fixture.context.request.plan,
        )
      },
      'fixture',
      { stage: 'definition' },
    )
  })
  it('rejects a definition proposal that changes the original endpoint policy', async () => {
    await setup(
      async (fixture) => {
        expect((await stages(fixture).execute(fixture.context)).status).toBe('blocked')
        expect(() => fixture.store.planning.getPlan(fixture.context.request.run, 2)).toThrow()
      },
      'fixture',
      { stage: 'definition', mode: 'policy' },
    )
  })
  it.each(['malformed', 'wrong-basis', 'unknown'] as const)(
    'retains %s production without pinning acceptance or granting another call',
    async (mode) => {
      await setup(
        async (fixture) => {
          const host = stages(fixture),
            first = await host.execute(fixture.context)
          expect(first.status).toBe('blocked')
          expect(first.prepared).toBeUndefined()
          expect(await host.execute(fixture.context)).toEqual(first)
          expect(
            new RunnerNativeScope(fixture.store.files, fixture.context.invocation).calls(),
          ).toHaveLength(1)
        },
        'fixture',
        { mode },
      )
    },
  )
  it('refuses acceptance definitions after original builder admission', async () => {
    await setup(async (fixture) => {
      const queue = new DeliveryQueue(fixture.store.files.root),
        entry = queue.enqueue(fixture.context.request.run, { unit: 'search' })
      expect(
        queue.claim(
          `controller-${'e'.repeat(32)}`,
          () => ({ ready: true, provenance: 'fixture', evidence: 'f'.repeat(64) }),
          { run: fixture.context.request.run, queue: entry.id },
        ).assignment,
      ).toBeTruthy()
      expect((await stages(fixture).execute(fixture.context)).status).toBe('blocked')
    })
  })
  it('keeps a missing consumed descriptor unknown rather than issuing another artifact worker', async () => {
    await setup(async (fixture) => {
      const host = stages(fixture)
      await host.execute(fixture.context)
      const path = fixture.store.files.path(
          `delivery/runner-artifacts/${fixture.context.invocation}.json`,
        ),
        record = fixture.store.stage(
          contractDigest(fixture.context.request),
          fixture.context.stage.id,
        )
      if (!record) throw new Error('Fixture stage missing')
      renameSync(path, `${path}.retained`)
      expect((await host.inspect(fixture.context.request, record)).status).toBe('unknown')
      await expect(host.execute(fixture.context)).rejects.toThrow(
        'artifact-stage-original-unresolved',
      )
      expect(
        new RunnerNativeScope(fixture.store.files, fixture.context.invocation).calls(),
      ).toHaveLength(1)
    })
  })
})
