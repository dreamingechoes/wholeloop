import { existsSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import type { AcceptancePlan } from '../../../src/acceptance/contracts.js'
import type { AcceptanceHost } from '../../../src/acceptance/store.js'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { StateStore } from '../../../src/state/store.js'
import { acceptanceFixture } from '../../support/acceptance.js'
import { entry } from '../../support/delivery.js'

it('pins complete criteria definitions before execution and restores only a verified missing lookup', () =>
  acceptanceFixture(async ({ acceptance, plan, calls }) => {
    const pinned = acceptance.prepare(plan)
    expect(acceptance.prepare(plan).digest).toBe(pinned.digest)
    expect(calls.count).toBe(0)
    const changed = structuredClone(plan)
    entry(changed.cases, 0).applicability = 'not-applicable'
    expect(() => acceptance.prepare(changed)).toThrow('missing-criterion-coverage')
    entry(changed.cases, 0).applicability = 'applicable'
    entry(changed.cases, 0).actions = ['A changed action.']
    expect(() => acceptance.prepare(changed)).toThrow('pinned-case-definitions')
    const files = acceptance.planning.sources.files
    rmSync(files.path(`delivery/acceptance-index/${pinned.digest}.json`))
    expect(acceptance.prepare(plan).digest).toBe(pinned.digest)
    expect(acceptance.get(pinned.digest).plan).toEqual(plan)
    rmSync(files.path(`delivery/acceptance-plans/${plan.run}/1.json`))
    expect(() => acceptance.get(pinned.digest)).toThrow()
  }))
it.each([
  [
    'missing coverage',
    (p: AcceptancePlan) => {
      entry(p.cases, 0).criteria = ['unknown']
    },
  ],
  [
    'duplicate cases',
    (p: AcceptancePlan) => {
      p.cases.push(structuredClone(entry(p.cases, 0)))
    },
  ],
  [
    'wrong source',
    (p: AcceptancePlan) => {
      p.source = 'f'.repeat(64)
    },
  ],
  [
    'wrong revision',
    (p: AcceptancePlan) => {
      p.revision = 2
    },
  ],
  [
    'human impersonation',
    (p: AcceptancePlan) => {
      entry(p.cases, 0).owner = 'human'
      entry(p.cases, 0).runner.kind = 'human'
    },
  ],
  [
    'invalid expected JSON',
    (p: AcceptancePlan) => {
      entry(entry(p.cases, 0).assertions, 0).expected = 'not-json'
    },
  ],
  [
    'ambiguous absent value',
    (p: AcceptancePlan) => {
      entry(entry(p.cases, 0).assertions, 0).operator = 'absent'
    },
  ],
] as const)('rejects %s without dispatch', (_name, mutate) =>
  acceptanceFixture(async ({ acceptance, plan, calls }) => {
    mutate(plan)
    expect(() => acceptance.prepare(plan)).toThrow()
    expect(calls.count).toBe(0)
  }),
)
it('binds fixture results to their observed invocation and never promotes them to actual delegated acceptance', () =>
  acceptanceFixture(async ({ acceptance, plan, boundary, host, calls }) => {
    const pinned = acceptance.prepare(plan),
      before = new StateStore(acceptance.planning.sources.files.root).events()
    const result = await acceptance.executeCase(
      pinned.digest,
      'find-title',
      'first',
      boundary,
      host,
    )
    expect(result).toMatchObject({
      status: 'passed',
      origin: 'controller-observation',
      provenance: 'fixture',
      sequence: 1,
      invocationState: 'stopped',
    })
    expect(await acceptance.report(pinned.digest, boundary)).toMatchObject({
      status: 'passed',
      acceptance: 'fixture-only',
      publication: 'not-performed',
    })
    expect(
      await acceptance.executeCase(pinned.digest, 'find-title', 'first', boundary, host),
    ).toEqual(result)
    expect(calls.count).toBe(1)
    expect(new StateStore(acceptance.planning.sources.files.root).events()).toEqual(before)
  }))
it('reports candidate changes as stale and refuses reuse of an old case key', () =>
  acceptanceFixture(async ({ acceptance, plan, boundary, bindings, host }) => {
    const pinned = acceptance.prepare(plan)
    await acceptance.executeCase(pinned.digest, 'find-title', 'first', boundary, host)
    entry(bindings.candidates, 0).snapshot = 'f'.repeat(64)
    expect(await acceptance.report(pinned.digest, boundary)).toMatchObject({
      status: 'stale',
      acceptance: 'not-established',
    })
    await expect(
      acceptance.executeCase(pinned.digest, 'find-title', 'first', boundary, host),
    ).rejects.toThrow('case-key-conflict')
  }))
it('does not accept wrong repository bindings or a candidate changed during an execution', () =>
  acceptanceFixture(async ({ acceptance, plan, boundary, bindings, host }) => {
    const pinned = acceptance.prepare(plan)
    entry(bindings.candidates, 0).repository = 'foreign'
    await expect(
      acceptance.executeCase(pinned.digest, 'find-title', 'wrong-repository', boundary, host),
    ).rejects.toThrow('candidate-repository-mismatch')
    entry(bindings.candidates, 0).repository = 'app'
    const execute = host.execute
    host.execute = async (test, context) => {
      const result = await execute(test, context)
      entry(bindings.candidates, 0).snapshot = 'e'.repeat(64)
      return result
    }
    expect(
      await acceptance.executeCase(pinned.digest, 'find-title', 'changed', boundary, host),
    ).toMatchObject({ status: 'unavailable', reason: 'changed-case-inputs' })
  }))
it.each([
  'missing-assertion',
  'duplicate-assertion',
  'unknown-artifact',
  'worker-origin',
  'metadata-override',
] as const)('refuses %s in a host response', (kind) =>
  acceptanceFixture(async ({ acceptance, plan, boundary, host }) => {
    const pinned = acceptance.prepare(plan),
      execute = host.execute
    host.execute = async (test, context) => {
      const value = await execute(test, context)
      if (kind === 'missing-assertion') value.assertions = []
      if (kind === 'duplicate-assertion')
        value.assertions.push(structuredClone(entry(value.assertions, 0)))
      if (kind === 'unknown-artifact') value.artifacts = ['f'.repeat(64)]
      if (kind === 'worker-origin') Object.assign(value, { origin: 'worker-claim' })
      if (kind === 'metadata-override')
        Object.assign(value, { plan: 'f'.repeat(64), provenance: 'host-observed' })
      return value
    }
    expect(
      (await acceptance.executeCase(pinned.digest, 'find-title', 'forged', boundary, host)).status,
    ).not.toBe('passed')
    expect((await acceptance.report(pinned.digest, boundary)).acceptance).toBe('not-established')
  }),
)
it('rejects serialized process metadata as a host and never turns an old artifact into a fresh capture', () =>
  acceptanceFixture(async ({ acceptance, plan, boundary, host }) => {
    const pinned = acceptance.prepare(plan)
    await expect(
      acceptance.executeCase(
        pinned.digest,
        'find-title',
        'json-claim',
        boundary,
        JSON.parse('{"pid":1,"code":0,"status":"passed"}') as AcceptanceHost,
      ),
    ).rejects.toThrow('unavailable-observation-host')
    const first = await acceptance.executeCase(pinned.digest, 'find-title', 'first', boundary, host)
    host.execute = async () => ({
      status: 'passed',
      origin: 'controller-observation',
      invocationState: 'stopped',
      assertions: first.assertions,
      artifacts: first.artifacts,
      reason: 'Attempted reuse without capture.',
    })
    expect(
      await acceptance.executeCase(pinned.digest, 'find-title', 'old-artifact', boundary, host),
    ).toMatchObject({ status: 'unavailable', reason: 'artifact-not-captured-by-invocation' })
  }))
it('does not choose an older pass when a later failure has the same timestamp', () =>
  acceptanceFixture(
    async ({ acceptance, plan, boundary, host }) => {
      const pinned = acceptance.prepare(plan)
      await acceptance.executeCase(pinned.digest, 'find-title', 'first', boundary, host)
      const execute = host.execute
      host.execute = async (test, context) => {
        const result = await execute(test, context)
        result.status = 'failed'
        entry(result.assertions, 0).status = 'failed'
        return result
      }
      const second = await acceptance.executeCase(
        pinned.digest,
        'find-title',
        'second',
        boundary,
        host,
      )
      expect(second.sequence).toBe(2)
      expect(await acceptance.report(pinned.digest, boundary)).toMatchObject({
        status: 'failed',
        acceptance: 'not-established',
      })
    },
    { now: () => '2026-10-25T01:20:00.000Z' },
  ))
it('keeps human-only coverage pending until an explicit current operator note and never dispatches that case', () =>
  acceptanceFixture(
    async ({ acceptance, plan, boundary, bindings, host }) => {
      const pinned = acceptance.prepare(plan)
      expect(await acceptance.report(pinned.digest, boundary)).toMatchObject({
        status: 'pending-human',
        acceptance: 'not-established',
      })
      await expect(
        acceptance.executeCase(pinned.digest, 'find-title', 'machine', boundary, host),
      ).rejects.toThrow('case-not-machine-executable')
      const note = await acceptance.recordHuman(pinned.digest, 'find-title', boundary, {
        schema: 'wholeloop/acceptance-human-request@1',
        by: 'Fixture Owner',
        note: 'Observed the exact fixture candidate through its public entrypoint.',
        status: 'passed',
      })
      expect(note.origin).toBe('operator-note')
      expect(await acceptance.report(pinned.digest, boundary)).toMatchObject({
        status: 'passed',
        acceptance: 'fixture-only',
      })
      entry(bindings.candidates, 0).head = 'f'.repeat(40)
      expect(await acceptance.report(pinned.digest, boundary)).toMatchObject({
        status: 'stale',
        acceptance: 'not-established',
      })
    },
    { human: true },
  ))
it('preserves unresolved case intent and does not dispatch a second possibly mutating request', () =>
  acceptanceFixture(async ({ acceptance, plan, boundary, host, calls }) => {
    const pinned = acceptance.prepare(plan),
      execute = host.execute
    let release: () => void = () => {}
    const waiting = new Promise<void>((resolve) => {
      release = resolve
    })
    let entered: () => void = () => {}
    const ready = new Promise<void>((resolve) => {
      entered = resolve
    })
    host.execute = async (test, context) => {
      entered()
      await waiting
      return execute(test, context)
    }
    const first = acceptance.executeCase(pinned.digest, 'find-title', 'first', boundary, host)
    await ready
    await expect(
      acceptance.executeCase(pinned.digest, 'find-title', 'first', boundary, host),
    ).rejects.toThrow('case-intent-unresolved')
    await expect(
      acceptance.executeCase(pinned.digest, 'find-title', 'second', boundary, host),
    ).rejects.toThrow('prior-case-intent-unresolved')
    release()
    expect((await first).status).toBe('passed')
    expect(calls.count).toBe(1)
  }))
it('retains uncertain invokers after cancellation and refuses a new attempt', () =>
  acceptanceFixture(async ({ acceptance, plan, boundary, host }) => {
    entry(plan.cases, 0).timeoutMs = 1000
    const pinned = acceptance.prepare(plan)
    let entered = false
    host.execute = async () => {
      entered = true
      return new Promise(() => {})
    }
    delete host.stop
    expect(
      await acceptance.executeCase(pinned.digest, 'find-title', 'timeout', boundary, host),
    ).toMatchObject({ status: 'interrupted', invocationState: 'unknown' })
    expect(entered).toBe(true)
    await expect(
      acceptance.executeCase(pinned.digest, 'find-title', 'retry', boundary, host),
    ).rejects.toThrow('prior-invoker-unknown')
  }))
it('keeps exact empty binary artifacts and bounds twenty-MiB objects through existing run accounting', () =>
  acceptanceFixture(async ({ acceptance, plan }) => {
    const empty = acceptance.artifacts.capture(
      plan.run,
      new Uint8Array(),
      'application/octet-stream',
    )
    expect(empty.artifact.bytes).toBe(0)
    const body = Buffer.alloc(20 * 1024 * 1024, 97)
    const captured = acceptance.artifacts.capture(plan.run, body, 'application/octet-stream')
    expect(captured.artifact.bytes).toBe(body.length)
    expect(captured.artifact.chunks).toHaveLength(3)
    expect(acceptance.artifacts.read(plan.run, captured.digest)).toEqual(captured)
    expect(captured.artifact.sharing).toBe('not-authorized')
    expect(captured.artifact.retention).toBe('retain')
    expect(acceptance.artifacts.capture(plan.run, body, 'application/octet-stream')).toEqual(
      captured,
    )
  }))
it('refuses size, media and recognizable credential metadata before storing any artifact bytes', () =>
  acceptanceFixture(async ({ acceptance, plan }) => {
    expect(() =>
      acceptance.artifacts.capture(
        plan.run,
        Buffer.alloc(20 * 1024 * 1024 + 1),
        'application/octet-stream',
      ),
    ).toThrow('artifact-size')
    expect(() =>
      acceptance.artifacts.capture(plan.run, Buffer.from('safe'), 'invalid' as 'text/plain'),
    ).toThrow('artifact-media-type')
    const credential = Buffer.from(['password', String.fromCharCode(120).repeat(12)].join('='))
    expect(() => acceptance.artifacts.capture(plan.run, credential, 'text/plain')).toThrow(
      'credential-bearing-artifact',
    )
    expect(acceptance.budgets.inspect(plan.run).counters.artifactBytes).toBe(0)
  }))
it('rejects changed artifact bytes and symlink aliases instead of reporting acceptance', () =>
  acceptanceFixture(async ({ acceptance, plan, dir }) => {
    const captured = acceptance.artifacts.capture(
      plan.run,
      Buffer.from('Sanitized evidence.'),
      'text/plain',
    )
    const chunk = entry(captured.artifact.chunks, 0),
      files = acceptance.planning.sources.files
    writeFileSync(files.path(chunk.ref), 'Changed evidence.')
    expect(() => acceptance.artifacts.read(plan.run, captured.digest)).toThrow(
      'artifact-bytes-changed',
    )
    rmSync(files.path(chunk.ref))
    const outside = join(dir, 'outside-artifact')
    writeFileSync(outside, 'Sanitized evidence.')
    symlinkSync(outside, files.path(chunk.ref))
    expect(() => acceptance.artifacts.read(plan.run, captured.digest)).toThrow()
  }))
it('retains a finite-budget omission without a falsely complete artifact', () =>
  acceptanceFixture(
    async ({ acceptance, plan }) => {
      expect(() =>
        acceptance.artifacts.capture(plan.run, Buffer.alloc(2048, 97), 'application/octet-stream'),
      ).toThrow('artifact-byte-limit')
      expect(acceptance.budgets.inspect(plan.run).omissions).toHaveLength(1)
      expect(
        existsSync(
          acceptance.planning.sources.files.path(`delivery/acceptance-artifacts/${plan.run}`),
        ),
      ).toBe(false)
    },
    { artifactBytes: 1024 },
  ))
it('refuses a tampered content-addressed artifact manifest', () =>
  acceptanceFixture(async ({ acceptance, plan }) => {
    const captured = acceptance.artifacts.capture(plan.run, Buffer.from('Evidence.'), 'text/plain')
    const path = acceptance.planning.sources.files.path(
      `delivery/acceptance-artifacts/${plan.run}/${captured.digest}.json`,
    )
    const manifest = JSON.parse(readFileSync(path, 'utf8'))
    manifest.bytes++
    writeFileSync(path, JSON.stringify(manifest))
    expect(() => acceptance.artifacts.read(plan.run, captured.digest)).toThrow('artifact-identity')
    expect(contractDigest(manifest)).not.toBe(captured.digest)
  }))

it('requires actual process facts for a CLI case and preserves empty literal arguments in observed metadata', () =>
  acceptanceFixture(async ({ acceptance, plan, boundary, host }) => {
    entry(plan.cases, 0).runner.kind = 'cli'
    const pinned = acceptance.prepare(plan),
      execute = host.execute
    expect(
      await acceptance.executeCase(pinned.digest, 'find-title', 'missing-process', boundary, host),
    ).toMatchObject({ status: 'unavailable', reason: 'missing-observed-process' })
    host.execute = async (test, context) => {
      const result = await execute(test, context)
      const now = new Date().toISOString()
      return {
        ...result,
        process: {
          argv: ['fixture-command', ''],
          cwd: '/fixture',
          startedAt: now,
          endedAt: now,
          pid: process.pid,
          code: 0,
        },
      }
    }
    expect(
      (
        await acceptance.executeCase(
          pinned.digest,
          'find-title',
          'observed-fixture-shape',
          boundary,
          host,
        )
      ).status,
    ).toBe('passed')
    expect((await acceptance.report(pinned.digest, boundary)).acceptance).toBe('fixture-only')
  }))
it('refuses changed result bindings on a fresh controller read', () =>
  acceptanceFixture(async ({ acceptance, plan, boundary, host }) => {
    const pinned = acceptance.prepare(plan)
    await acceptance.executeCase(pinned.digest, 'find-title', 'first', boundary, host)
    const path = acceptance.planning.sources.files.path(
      `delivery/acceptance-cases/${pinned.digest}/find-title/first/result.json`,
    )
    const result = JSON.parse(readFileSync(path, 'utf8'))
    result.bindings.candidates[0].snapshot = 'f'.repeat(64)
    writeFileSync(path, JSON.stringify(result))
    await expect(acceptance.report(pinned.digest, boundary)).rejects.toThrow('changed-case-binding')
  }))
it('retains execution history but refuses new case dispatch after private grant revocation', () =>
  acceptanceFixture(async ({ acceptance, plan, boundary, host, calls }) => {
    const pinned = acceptance.prepare(plan)
    await acceptance.executeCase(pinned.digest, 'find-title', 'first', boundary, host)
    const authority = acceptance.budgets.lifecycle.journal.get(plan.run).grant
    if (!authority) throw Error('Missing fixture grant')
    acceptance.budgets.lifecycle.authority.revoke({
      schema: 'wholeloop/delivery-revocation-request@1',
      grant: authority.id,
      operator: 'Fixture Operator',
      reason: 'Stop further fixture execution.',
    })
    await expect(
      acceptance.executeCase(pinned.digest, 'find-title', 'second', boundary, host),
    ).rejects.toThrow('inactive-acceptance-authority')
    expect(calls.count).toBe(1)
    expect((await acceptance.report(pinned.digest, boundary)).acceptance).toBe('fixture-only')
  }))

it('seals the typed coverage report into a bounded immutable private artifact without publication', () =>
  acceptanceFixture(async ({ acceptance, plan, boundary, host }) => {
    const pinned = acceptance.prepare(plan)
    await acceptance.executeCase(pinned.digest, 'find-title', 'first', boundary, host)
    const sealed = await acceptance.seal(pinned.digest, boundary)
    expect(sealed.report).toMatchObject({
      status: 'passed',
      acceptance: 'fixture-only',
      publication: 'not-performed',
    })
    expect(sealed.artifact).toMatchObject({
      mediaType: 'application/json',
      retention: 'retain',
      sharing: 'not-authorized',
    })
    expect(acceptance.artifacts.read(plan.run, sealed.digest).artifact).toEqual(sealed.artifact)
  }))

it('retains fixture provenance for human notes even when a later boundary claims host observation', () =>
  acceptanceFixture(
    async ({ acceptance, plan, boundary }) => {
      const pinned = acceptance.prepare(plan)
      await acceptance.recordHuman(pinned.digest, 'find-title', boundary, {
        schema: 'wholeloop/acceptance-human-request@1',
        by: 'Fixture Owner',
        note: 'A fixture-only operator observation.',
        status: 'passed',
      })
      const current = { ...boundary, provenance: 'host-observed' as const }
      expect(await acceptance.report(pinned.digest, current)).toMatchObject({
        status: 'passed',
        acceptance: 'fixture-only',
      })
    },
    { human: true },
  ))
it('scans the complete artifact before splitting a recognizable credential across budget chunks', () =>
  acceptanceFixture(async ({ acceptance, plan }) => {
    const text = ['password', String.fromCharCode(120).repeat(12)].join('=')
    const bytes = Buffer.concat([Buffer.alloc(8 * 1024 * 1024 - 4, 97), Buffer.from(text)])
    expect(() => acceptance.artifacts.capture(plan.run, bytes, 'application/octet-stream')).toThrow(
      'credential-bearing-artifact',
    )
    expect(acceptance.budgets.inspect(plan.run).counters.artifactBytes).toBe(0)
  }))

it.each([false, true])(
  'pins definitions before builder admission while allowing unchanged historical reads (pinned=%s)',
  (pinFirst) =>
    acceptanceFixture(async ({ acceptance, plan }) => {
      const { DeliveryQueue } = await import('../../../src/delivery/queue.js')
      const pinned = pinFirst ? acceptance.prepare(plan) : undefined
      const queue = new DeliveryQueue(acceptance.planning.sources.files.root)
      queue.enqueue(plan.run, { unit: 'contract' })
      const receipt = queue.claim('controller-0123456789abcdef0123456789abcdef', () => ({
        ready: true,
        provenance: 'fixture',
        evidence: 'a'.repeat(64),
      }))
      expect(receipt.assignment).toBeDefined()
      if (pinned) expect(acceptance.prepare(plan).digest).toBe(pinned.digest)
      else
        expect(() => acceptance.prepare(plan)).toThrow('acceptance-defined-after-builder-admission')
    }),
)

it('does not reuse an exact-candidate historical supervised testing note as a new human case observation', () =>
  acceptanceFixture(
    async ({ acceptance, plan, boundary, bindings, root }) => {
      const store = new StateStore(acceptance.planning.sources.files.root)
      const item = store.create({
        kind: 'slice',
        title: 'Historical supervised change',
        owner: 'Fixture Owner',
        body: 'Retain this older explicit testing record.',
        repository: root,
      })
      const candidate = entry(bindings.candidates, 0)
      store.transaction((events, append) => {
        append(item.id, {
          type: 'pr.planned',
          data: {
            plan: {
              root,
              repository: 'https://example.test/fixture/app',
              remote: 'origin',
              branch: 'wl/old-change',
              base: 'main',
              head: candidate.head,
              snapshot: candidate.snapshot,
              title: 'fix: retain historical testing',
              body: 'Historical fixture plan.',
              provider: 'fixture',
              convention: { ref: 'fixture:template', origin: 'fixture', digest: 'a'.repeat(64) },
              gated: false,
            },
          },
        })
        append(item.id, {
          type: 'pr.tested',
          data: {
            plan: entry(events, events.length - 1).id,
            by: 'Fixture Owner',
            note: 'Historical explicit testing of this candidate.',
            snapshot: candidate.snapshot,
          },
        })
      })
      const before = store.events(),
        pinned = acceptance.prepare(plan)
      expect(await acceptance.report(pinned.digest, boundary)).toMatchObject({
        status: 'pending-human',
        acceptance: 'not-established',
      })
      expect(store.events()).toEqual(before)
      expect(before.some((event) => event.type === 'pr.tested')).toBe(true)
    },
    { human: true },
  ))

it('rejects recognizable credentials inside encoded runner input before retaining definitions', () =>
  acceptanceFixture(async ({ acceptance, plan }) => {
    entry(plan.cases, 0).runner.input = JSON.stringify({
      password: String.fromCharCode(120).repeat(12),
    })
    expect(() => acceptance.prepare(plan)).toThrow('invalid-or-unsafe-shape')
    expect(
      existsSync(acceptance.planning.sources.files.path(`delivery/acceptance-plans/${plan.run}`)),
    ).toBe(false)
  }))
it('starts finite run accounting before entering the host and supplies its bounded deadline', () =>
  acceptanceFixture(async ({ acceptance, plan, boundary, host }) => {
    const pinned = acceptance.prepare(plan),
      execute = host.execute
    host.execute = async (test, context) => {
      const budget = acceptance.budgets.inspect(plan.run)
      expect(budget.started).toBe(true)
      expect(context.timeoutMs).toBeGreaterThan(0)
      expect(context.timeoutMs).toBeLessThanOrEqual(test.timeoutMs)
      expect(Date.parse(context.deadline)).toBeLessThanOrEqual(Date.parse(budget.deadline ?? ''))
      return execute(test, context)
    }
    expect(
      (await acceptance.executeCase(pinned.digest, 'find-title', 'first', boundary, host)).status,
    ).toBe('passed')
  }))

it('does not dispatch after intent persistence consumes its deadline and retains a readable stopped interruption', async () => {
  let wall = Date.now()
  await acceptanceFixture(
    async ({ acceptance, plan, boundary, host, calls }) => {
      entry(plan.cases, 0).timeoutMs = 50
      const pinned = acceptance.prepare(plan),
        files = acceptance.planning.sources.files
      const atomic = files.atomic.bind(files)
      files.atomic = (path, body) => {
        atomic(path, body)
        if (path.endsWith('/intent.json')) wall += 100
      }
      const result = await acceptance.executeCase(
        pinned.digest,
        'find-title',
        'expired-before-host',
        boundary,
        host,
      )
      expect(result).toMatchObject({
        status: 'interrupted',
        invocationState: 'stopped',
        reason: 'case-cancelled',
      })
      expect(calls.count).toBe(0)
      expect(
        await acceptance.executeCase(
          pinned.digest,
          'find-title',
          'expired-before-host',
          boundary,
          host,
        ),
      ).toEqual(result)
    },
    { now: () => new Date(wall).toISOString() },
  )
})

it.each(['absent', 'claimed'] as const)(
  'refuses %s CLI process metadata without actual repository-diff read receipts',
  (mode) =>
    acceptanceFixture(async ({ acceptance, plan, boundary, host, root }) => {
      const test = entry(plan.cases, 0)
      test.runner = {
        kind: 'cli',
        capability: 'repository.diff',
        input: JSON.stringify({ schema: 'wholeloop/repository-diff-input@1', repository: 'app' }),
      }
      host.id = 'docker-repository-diff'
      host.capability = 'repository.diff'
      if (mode === 'claimed') {
        const execute = host.execute
        host.execute = async (test, context) => {
          const observed = await execute(test, context),
            now = new Date().toISOString()
          return {
            ...observed,
            process: {
              argv: ['git', 'diff-tree'],
              cwd: root,
              pid: process.pid,
              code: 0,
              startedAt: now,
              endedAt: now,
            },
          }
        }
      }
      const pinned = acceptance.prepare(plan)
      const result = await acceptance.executeCase(
        pinned.digest,
        test.id,
        'unowned-diff',
        boundary,
        host,
      )
      expect(result.status).toBe('unavailable')
      expect(result.assertions).toEqual([])
    }),
)
