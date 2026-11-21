import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FlowEngine } from '../../../src/flow/engine.js'
import type {
  OperationCall,
  OperationResult,
  ProviderHost,
} from '../../../src/providers/operations.js'
import { ResearchWorkflow } from '../../../src/research/workflow.js'
import {
  canonicalSharedUrl,
  linkedSharedItem,
  sharingState,
} from '../../../src/sharing/contracts.js'
import { SharingWorkflow } from '../../../src/sharing/workflow.js'
import { contextPack } from '../../../src/state/resume.js'
import { StateStore } from '../../../src/state/store.js'
import { next } from '../../../src/utilities/next.js'

async function fixture(
  run: (context: {
    dir: string
    engine: FlowEngine
    workflow: SharingWorkflow
  }) => void | Promise<void>,
) {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-sharing-'))
  const root = join(dir, 'repo')
  mkdirSync(root)
  const engine = new FlowEngine(
    new StateStore(join(dir, 'state', 'wholeloop')),
    root,
    join(dir, 'user/config.yml'),
    join(dir, 'home'),
  )
  try {
    await run({ dir, engine, workflow: new SharingWorkflow(engine) })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
const source = 'https://docs.example.test/work/42'
const read: OperationResult = {
  status: 'succeeded',
  ref: source,
  complete: true,
  revision: 'source-1',
  body: '# Shared idea\n\nImported context.',
}
const options = { provider: 'notion', kind: 'docs' as const, owner: 'Alex' }
const target = { key: 'team-docs', provider: 'notion', kind: 'docs' as const }
const frame = readFileSync(new URL('../../fixtures/framing/frame.md', import.meta.url), 'utf8')
function initiative(engine: FlowEngine) {
  return engine.store.create({
    kind: 'initiative',
    owner: 'Alex',
    title: 'Shared work',
    body: 'Fixture context',
    repository: engine.root,
  }).id
}
function complete(engine: FlowEngine, subject: string) {
  engine.begin('frame-problem', { subject })
  return engine.complete('frame-problem', subject, frame)
}
function documents(kind: 'docs' | 'tracker' = 'docs') {
  const calls: OperationCall[] = []
  const bodies = new Map<string, string>()
  let version = 0
  let lose = false
  const host: ProviderHost = {
    invoke: async (call) => {
      calls.push(call)
      const ref = String(call.args.ref ?? `https://docs.example.test/published/${bodies.size + 1}`)
      if (['docs.read', 'tracker.read-item'].includes(call.operation))
        return {
          status: 'succeeded',
          ref,
          revision: `r${version}`,
          complete: true,
          body:
            kind === 'tracker'
              ? JSON.stringify({ title: 'Existing', body: bodies.get(ref) ?? '' })
              : (bodies.get(ref) ?? ''),
        }
      if (call.operation.endsWith('update') || call.operation === 'tracker.update-item')
        expect(call.args.revision).toBe(`r${version}`)
      bodies.set(ref, String(call.args.body))
      version++
      if (lose) {
        lose = false
        throw new Error('Response lost after write')
      }
      return { status: 'succeeded', ref }
    },
  }
  return {
    host,
    calls,
    bodies,
    loseNext: () => {
      lose = true
    },
  }
}

describe('URL adoption and explicit shared publication', () => {
  it('normalizes tracking/fragment variants without conflating semantic queries', () => {
    expect(canonicalSharedUrl(`${source}/?utm_source=fixture#intro`)).toBe(source)
    expect(canonicalSharedUrl(`${source}?b=2&a=1`)).toBe(`${source}?a=1&b=2`)
    for (const url of [
      'http://docs.example.test/work',
      'https://person:password@docs.example.test/work',
      `${source}?api_key=credential`,
    ])
      expect(() => canonicalSharedUrl(url)).toThrow()
  })
  it('adopts once, reuses stored identity without a second host read and fabricates no approval', () =>
    fixture(async ({ engine, workflow }) => {
      let reads = 0
      const host: ProviderHost = {
        invoke: async () => {
          reads++
          return read
        },
      }
      const first = await workflow.adopt(source, options, host)
      const second = await workflow.adopt(`${source}/?utm_source=mail#section`, options, host)
      expect(first.subject).toBe(second.subject)
      expect(second.cached).toBe(true)
      expect(reads).toBe(1)
      expect(engine.store.list()).toHaveLength(1)
      expect(
        engine.store
          .events()
          .some((event) => event.type === 'step.completed' || event.type === 'decision.recorded'),
      ).toBe(false)
      expect(engine.store.get(first.subject ?? '').body).toContain('Imported context only')
      expect(
        engine.store.events().find((event) => event.type === 'share.adopted')?.data,
      ).toMatchObject({ origin: 'host', revision: 'source-1' })
    }))
  it('asks all missing identity facts before writing and imports tracker ownership', () =>
    fixture(({ engine, workflow }) => {
      const missing = workflow.importRead(
        source,
        { ...read, body: 'Context without heading' },
        { provider: 'notion', kind: 'docs' },
      )
      expect(missing.questions.map((q) => q.id)).toEqual(['owner', 'title'])
      expect(engine.store.events()).toEqual([])
      const adopted = workflow.importRead(
        source,
        {
          ...read,
          body: JSON.stringify({ title: 'Imported item', body: 'Preserve context', owner: 'Sam' }),
        },
        { provider: 'github-issues', kind: 'tracker' },
      )
      expect(engine.store.get(adopted.subject ?? '')).toMatchObject({
        title: 'Imported item',
        owner: 'Sam',
      })
    }))
  it.each([
    { complete: false },
    { revision: '' },
    { ref: 'https://docs.example.test/other' },
    { status: 'pending' as const },
    { body: ' ' },
    { body: 'x'.repeat(1024 * 1024 + 1) },
  ])('rejects incomplete/unmatched adoption %j', (change) =>
    fixture(({ engine, workflow }) => {
      expect(() => workflow.importRead(source, { ...read, ...change }, options)).toThrow()
      expect(engine.store.events()).toEqual([])
    }),
  )
  it('uses stored links and asks before importing an unknown URL', () =>
    fixture(({ engine }) => {
      expect(next(engine, source).code).toBe(2)
      expect(engine.store.events()).toEqual([])
      const id = initiative(engine)
      engine.store.link(id, source)
      expect(linkedSharedItem(engine.store.events(), `${source}#title`)).toBe(id)
      const routed = next(engine, source)
      expect(routed.code).toBe(0)
      expect(engine.store.list()).toHaveLength(1)
      const other = initiative(engine)
      engine.store.link(other, source)
      expect(() => next(engine, source)).toThrow(/several initiatives/)
    }))
  it('defaults to local and switches to shared by publishing existing artifacts once', () =>
    fixture(async ({ engine, workflow }) => {
      const id = initiative(engine)
      complete(engine, id)
      expect(workflow.report(id)).toMatchObject({ mode: 'local', publications: [] })
      const remote = documents()
      const report = await workflow.mode(id, 'shared', 'Alex', [target], remote.host)
      expect(report.publications).toHaveLength(1)
      expect(report.publications[0]?.status).toBe('published')
      expect(engine.store.get(id).links).toContain(report.publications[0]?.ref)
      expect(remote.calls.map((call) => call.operation)).toEqual(['docs.create', 'docs.read'])
      await workflow.flush(id, remote.host)
      expect(remote.calls).toHaveLength(2)
    }))
  it('queues atomically on completion and the conductor completion wrapper flushes it', () =>
    fixture(async ({ engine, workflow }) => {
      const id = initiative(engine)
      workflow.setMode(id, 'shared', 'Alex', [target])
      expect(workflow.report(id).publications).toEqual([])
      engine.begin('frame-problem', { subject: id })
      const remote = documents()
      const result = await workflow.complete('frame-problem', id, frame, remote.host)
      expect(result.sharing?.publications[0]?.status).toBe('published')
      expect(remote.bodies.values().next().value).toContain('Framing outcome: go')
    }))
  it.each(['docs', 'tracker'] as const)(
    'preserves unrelated %s content through a fresh revision read',
    (kind) =>
      fixture(async ({ engine, workflow }) => {
        const id = initiative(engine)
        complete(engine, id)
        const remote = documents(kind)
        remote.bodies.set(source, '# Human notes\n\nRetain this edit.')
        const destination = {
          ...target,
          kind,
          provider: kind === 'docs' ? 'notion' : 'github-issues',
          ref: source,
        }
        const report = await workflow.mode(id, 'shared', 'Alex', [destination], remote.host)
        expect(report.publications[0]?.status).toBe('published')
        expect(remote.bodies.get(source)).toContain('Retain this edit.')
        expect(remote.calls.map((call) => call.operation)).toEqual(
          kind === 'docs'
            ? ['docs.read', 'docs.update', 'docs.read']
            : ['tracker.read-item', 'tracker.update-item', 'tracker.read-item'],
        )
      }),
  )
  it('retains a lost-write intent and reconciles through reads without duplicate writes', () =>
    fixture(async ({ engine, workflow }) => {
      const id = initiative(engine)
      complete(engine, id)
      workflow.setMode(id, 'shared', 'Alex', [target])
      const remote = documents()
      remote.loseNext()
      const report = await workflow.flush(id, remote.host)
      const entry = report.publications[0]
      expect(entry?.status).toBe('ambiguous')
      expect(engine.store.get(id).links).toEqual([])
      await workflow.flush(id, remote.host)
      expect(remote.calls).toHaveLength(1)
      expect(workflow.request(id, entry?.key ?? '').request).toBeNull()
      const ref = [...remote.bodies.keys()][0] ?? ''
      await workflow.reconcile(id, entry?.key ?? '', ref, remote.host)
      expect(workflow.report(id).publications[0]?.status).toBe('published')
      expect(remote.calls.map((call) => call.operation)).toEqual(['docs.create', 'docs.read'])
    }))
  it('requires complete exact content instead of trusting write success or a marker alone', () =>
    fixture(async ({ engine, workflow }) => {
      const id = initiative(engine)
      complete(engine, id)
      workflow.setMode(id, 'shared', 'Alex', [{ ...target, ref: source }])
      const remote = documents()
      const entry = workflow.requests(id).publications[0]
      workflow.request(id, entry?.key ?? '')
      remote.bodies.set(source, (entry?.chunk ?? '').split('\n')[0] ?? '')
      await expect(workflow.reconcile(id, entry?.key ?? '', source, remote.host)).rejects.toThrow(
        /complete same-reference/,
      )
      await expect(
        workflow.reconcile(id, entry?.key ?? '', `${source}/other`, remote.host),
      ).rejects.toThrow(/exact reference/)
      expect(workflow.report(id).publications[0]?.status).toBe('ambiguous')
    }))
  it('pauses queued writes in local mode and retains pinned target identity', () =>
    fixture(async ({ engine, workflow }) => {
      const id = initiative(engine)
      complete(engine, id)
      workflow.setMode(id, 'shared', 'Alex', [target])
      workflow.setMode(id, 'local', 'Alex', [target])
      const remote = documents()
      await expect(workflow.flush(id, remote.host)).rejects.toThrow(/Switch to shared/)
      expect(() => workflow.request(id, workflow.report(id).publications[0]?.key ?? '')).toThrow(
        /current authorized/,
      )
      expect(() => workflow.setMode(id, 'shared', 'Alex', [{ ...target, key: 'changed' }])).toThrow(
        /pinned shared destinations/,
      )
      expect(remote.calls).toEqual([])
      await workflow.mode(id, 'shared', 'Alex', [target], remote.host)
      expect(workflow.report(id).publications[0]?.status).toBe('published')
    }))
  it('rejects forged outbox receipts and rebuilds projections and bounded resume references', () =>
    fixture(({ engine, workflow }) => {
      const id = initiative(engine)
      complete(engine, id)
      workflow.setMode(id, 'shared', 'Alex', [target])
      const entry = workflow.report(id).publications[0]
      expect(() =>
        engine.store.transaction((_events, append) =>
          append(id, {
            type: 'share.published',
            data: { key: entry?.key ?? '', ref: source, origin: 'host' },
          }),
        ),
      ).toThrow(/prior intent/)
      const before = engine.store.files.read(`items/${id}/sharing.json`)
      engine.store.rebuild()
      expect(engine.store.files.read(`items/${id}/sharing.json`)).toBe(before)
      expect(contextPack(engine.store.events(), id).subject).toMatchObject({
        sharing: `items/${id}/sharing.json`,
      })
      expect(sharingState(engine.store.events()).queue.size).toBe(1)
    }))
  it('queues adopted research without publishing an unowned standalone brief', () =>
    fixture(async ({ engine, workflow }) => {
      const brief =
        engine.begin('research', { input: 'Who needs shared search?', owner: 'Alex' }).payload
          .subject?.id ?? ''
      const research = new ResearchWorkflow(engine)
      research.plan(brief, { sources: ['native-code', 'native-web'] })
      research.complete(brief)
      expect(sharingState(engine.store.events()).queue.size).toBe(0)
      const id = engine.begin('frame-problem', { from: brief }).payload.subject?.id ?? ''
      const remote = documents()
      await workflow.mode(id, 'shared', 'Alex', [target], remote.host)
      expect(workflow.report(id).publications[0]?.subject).toBe(brief)
      expect(workflow.report(id).publications[0]?.status).toBe('published')
      expect(engine.store.get(brief).links).toEqual(engine.store.get(id).links)
    }))
  it('deduplicates concurrent host adoption and redacts malformed tracker imports', () =>
    fixture(async ({ engine, workflow }) => {
      const host: ProviderHost = { invoke: async () => read }
      const results = await Promise.all([
        workflow.adopt(source, options, host),
        workflow.adopt(source, options, host),
      ])
      expect(results[0]?.subject).toBe(results[1]?.subject)
      expect(engine.store.list()).toHaveLength(1)
      const other = 'https://docs.example.test/other'
      expect(() =>
        workflow.importRead(
          other,
          { ...read, ref: other, body: 'private broken tracker payload' },
          { provider: 'github-issues', kind: 'tracker', owner: 'Alex' },
        ),
      ).toThrow('contents omitted')
    }))
  it(
    'runs compiled next URL imports and the explicit request/reconciliation handoff',
    () =>
      fixture(({ dir, engine }) => {
        const env = {
          ...process.env,
          XDG_CONFIG_HOME: join(dir, 'user'),
          XDG_STATE_HOME: join(dir, 'state'),
          WL_WORKSPACE: '',
        }
        const cli = (...args: string[]) => {
          const result = spawnSync(process.execPath, [resolve('dist/wl.mjs'), ...args, '--json'], {
            cwd: engine.root,
            env,
            encoding: 'utf8',
          })
          expect(result.stderr).toBe('')
          return { code: result.status, payload: JSON.parse(result.stdout) }
        }
        const file = join(dir, 'read.json')
        writeFileSync(
          file,
          JSON.stringify({
            schema: 'wholeloop/shared-read@1',
            ref: source,
            provider: 'notion',
            kind: 'docs',
            result: read,
          }),
        )
        const adopted = cli(
          'next',
          source,
          '--file',
          file,
          '--provider',
          'notion',
          '--kind',
          'docs',
          '--owner',
          'Alex',
        )
        expect(adopted.code).toBe(0)
        const id = adopted.payload.contract.subject.id
        expect(cli('next', `${source}#same`).payload.contract.subject.id).toBe(id)
        expect(engine.store.list()).toHaveLength(1)
        engine.complete('frame-problem', id, frame)
        const targets = join(dir, 'targets.json')
        writeFileSync(targets, JSON.stringify([target]))
        const shared = cli(
          'share',
          'mode',
          '--for',
          id,
          '--mode',
          'shared',
          '--by',
          'Alex',
          '--file',
          targets,
        )
        expect(shared.code).toBe(0)
        const request = cli('share', 'requests', '--for', id).payload.publications[0]
        expect(cli('share', 'request', '--for', id, '--key', request.key).payload.status).toBe(
          'authorized',
        )
        expect(
          cli('share', 'request', '--for', id, '--key', request.key).payload.request,
        ).toBeNull()
        writeFileSync(
          file,
          JSON.stringify({
            schema: 'wholeloop/shared-read@1',
            ref: source,
            provider: 'notion',
            kind: 'docs',
            result: { ...read, body: request.chunk },
          }),
        )
        expect(
          cli(
            'share',
            'reconcile',
            '--for',
            id,
            '--key',
            request.key,
            '--ref',
            source,
            '--file',
            file,
          ).payload.publications[0].status,
        ).toBe('published')
        expect(
          engine.store.events().find((event) => event.type === 'share.published')?.data,
        ).toMatchObject({ origin: 'import' })
      }),
    15000,
  )
})
