import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FlowEngine } from '../../../src/flow/engine.js'
import { FRAME_SECTIONS } from '../../../src/framing/contract.js'
import { ResearchWorkflow } from '../../../src/research/workflow.js'
import { StateStore } from '../../../src/state/store.js'
import { next } from '../../../src/utilities/next.js'

const artifact = readFileSync(new URL('../../fixtures/framing/frame.md', import.meta.url), 'utf8')
function fixture(run: (dir: string, engine: FlowEngine) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-frame-'))
  try {
    run(
      dir,
      new FlowEngine(
        new StateStore(join(dir, 'state')),
        dir,
        join(dir, 'user/config.yml'),
        join(dir, 'home'),
      ),
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('complete framing contract', () => {
  it('requires all eight questions and ownership while unknowns name evidence and an answerer', () =>
    fixture((_dir, engine) => {
      expect(FRAME_SECTIONS).toHaveLength(9)
      const begin = engine.begin('frame-problem', { input: 'Order search', owner: 'Alex' })
      const id = begin.payload.subject?.id ?? ''
      const before = engine.store.events()
      expect(() =>
        engine.complete('frame-problem', id, '## Problem\nSearch\n## Owner\nAlex'),
      ).toThrow('Who it is for')
      expect(() =>
        engine.complete(
          'frame-problem',
          id,
          artifact.replace(
            'TBD: support ticket sample and observed search behavior; who: support lead',
            'TBD',
          ),
        ),
      ).toThrow('TBD must name')
      expect(() =>
        engine.complete(
          'frame-problem',
          id,
          artifact.replace('Customers with more than twenty past orders.', 'unknown'),
        ),
      ).toThrow('unexplained unknown')
      expect(engine.store.events()).toEqual(before)
      const completed = engine.complete('frame-problem', id, artifact)
      expect(completed.publication).toMatchObject({
        docs: { provider: 'local-docs', status: 'stored', ref: completed.artifact },
        tracker: { provider: 'local-tracker', status: 'stored', ref: id },
      })
      expect(engine.store.list()).toHaveLength(1)
      expect(
        engine.store
          .events()
          .some((entry) => entry.type === 'frame.decided' && entry.data.outcome === 'go'),
      ).toBe(true)
    }))

  it('adopts the existing initiative for an equivalent title before and after completion', () =>
    fixture((_dir, engine) => {
      const first = engine.begin('frame-problem', { input: 'Find old orders', owner: 'Alex' })
      const id = first.payload.subject?.id ?? ''
      const repeated = engine.begin('frame-problem', { input: '  find   OLD orders  ' })
      expect(repeated.payload.subject?.id).toBe(id)
      expect(repeated.payload.run).toBe(first.payload.run)
      engine.complete('frame-problem', id, artifact)
      expect(next(engine, 'Find old orders').code).toBe(3)
      expect(engine.begin('frame-problem', { input: 'Find old orders' }).payload.subject?.id).toBe(
        id,
      )
      expect(engine.store.list()).toHaveLength(1)
    }))

  it('keeps identical titles in different repositories separate and asks about unscoped matches', () =>
    fixture((dir, engine) => {
      const first = engine.begin('frame-problem', { input: 'Add search', owner: 'Alex' }).payload
        .subject?.id
      const secondEngine = new FlowEngine(
        engine.store,
        join(dir, 'other-repo'),
        engine.userFile,
        engine.home,
      )
      const second = secondEngine.begin('frame-problem', { input: 'Add search', owner: 'Alex' })
        .payload.subject?.id
      expect(second).not.toBe(first)
      expect(engine.begin('frame-problem', { input: 'Add search' }).payload.subject?.id).toBe(first)
      engine.store.create({
        kind: 'initiative',
        title: 'Unscoped legacy idea',
        owner: 'Alex',
        body: '',
      })
      expect(() => engine.begin('frame-problem', { input: 'Unscoped legacy idea' })).toThrow(
        'confirm it',
      )
    }))

  it('adopts a completed research brief and preserves a durable source relation', () =>
    fixture((_dir, engine) => {
      const brief =
        engine.begin('research', { input: 'Is order retrieval a problem?', owner: 'Alex' }).payload
          .subject?.id ?? ''
      const research = new ResearchWorkflow(engine)
      research.plan(brief)
      const report = research.complete(brief)
      const framing = engine.begin('frame-problem', { from: brief })
      const id = framing.payload.subject?.id ?? ''
      expect(framing.payload.input).toBe('Is order retrieval a problem?')
      expect(framing.payload.owner).toBe('Alex')
      expect(framing.payload.preflight.join('\n')).toContain(report.receipt.artifact)
      expect(
        engine.store
          .events()
          .some(
            (entry) =>
              entry.type === 'frame.sourced' && entry.subject === id && entry.data.brief === brief,
          ),
      ).toBe(true)
      expect(engine.begin('frame-problem', { from: brief }).payload.subject?.id).toBe(id)
      expect(engine.store.list().filter((item) => item.kind === 'initiative')).toHaveLength(1)
    }))

  it.each(['dropped', 'on-hold'] as const)(
    'records an argued %s outcome and prevents an implicit restart',
    (outcome) =>
      fixture((_dir, engine) => {
        const id =
          engine.begin('frame-problem', { input: 'Order search', owner: 'Alex' }).payload.subject
            ?.id ?? ''
        const before = engine.store.events()
        if (outcome === 'on-hold') {
          expect(() =>
            engine.complete('frame-problem', id, artifact, {
              outcome,
              reason: 'Insufficient evidence',
            }),
          ).toThrow('reopening condition')
          expect(engine.store.events()).toEqual(before)
        }
        const completed = engine.complete('frame-problem', id, artifact, {
          outcome,
          reason: 'Insufficient evidence',
          ...(outcome === 'on-hold' ? { reopen: 'Support confirms ten affected customers' } : {}),
        })
        expect(completed.next.next).toBeNull()
        expect(engine.store.get(id)).toMatchObject({ status: 'closed' })
        expect(engine.store.get(id).notes.at(-1)?.text).toContain('Insufficient evidence')
        expect(() => engine.begin('frame-problem', { input: 'Order search' })).toThrow('closed')
        expect(() => next(engine, id)).toThrow('closed')
        engine.store.update(id, { status: 'open' })
        expect(engine.begin('frame-problem', { subject: id }).payload.subject?.id).toBe(id)
      }),
  )

  it('keeps remote publication pending and records the handoff instead of claiming a write', () =>
    fixture((dir, engine) => {
      const folder = join(dir, '.wholeloop/providers/team-docs')
      mkdirSync(folder, { recursive: true })
      writeFileSync(
        join(folder, 'provider.json'),
        JSON.stringify({
          schema: 1,
          id: 'team-docs',
          name: 'Team docs',
          description: 'Docs destination',
          access: {
            mcp: {
              server: 'team-docs',
              install: { transport: 'http', url: 'https://docs.example.com/mcp' },
            },
          },
          capabilities: ['docs'],
          operations: { 'docs.create': { tool: 'create_document' } },
          degrade: { 'docs.create': 'handoff-artifact' },
        }),
      )
      writeFileSync(
        join(dir, '.wholeloop/config.yml'),
        'version: 1\nproviders: {docs: team-docs}\n',
      )
      const id =
        engine.begin('frame-problem', { input: 'Order search', owner: 'Alex' }).payload.subject
          ?.id ?? ''
      const completed = engine.complete('frame-problem', id, artifact)
      expect(completed.publication).toMatchObject({
        docs: { provider: 'team-docs', status: 'pending' },
      })
      expect(engine.store.get(id).notes.at(-1)?.text).toContain('Publication pending: team-docs')
    }))

  it('runs brief adoption and no-go through the compiled CLI', () =>
    fixture((dir) => {
      const env = {
        ...process.env,
        XDG_CONFIG_HOME: join(dir, 'config'),
        XDG_STATE_HOME: join(dir, 'cli-state'),
        WL_WORKSPACE: '',
      }
      const cli = (...args: string[]) => {
        const response = spawnSync(process.execPath, [resolve('dist/wl.mjs'), ...args, '--json'], {
          cwd: dir,
          env,
          encoding: 'utf8',
        })
        return { code: response.status, value: JSON.parse(response.stdout) }
      }
      const brief = cli(
        'step',
        'begin',
        'research',
        '--input',
        'Should we build search?',
        '--owner',
        'Alex',
      ).value.subject.id
      cli('research', 'plan', '--for', brief)
      expect(cli('research', 'complete', '--for', brief).code).toBe(0)
      const id = cli('step', 'begin', 'frame-problem', '--from', brief).value.subject.id
      const file = join(dir, 'frame.md')
      writeFileSync(file, artifact)
      expect(
        cli(
          'step',
          'complete',
          'frame-problem',
          '--for',
          id,
          '--artifact',
          file,
          '--no-go',
          'on-hold',
          '--reason',
          'Need evidence',
        ).code,
      ).toBe(4)
      const completed = cli(
        'step',
        'complete',
        'frame-problem',
        '--for',
        id,
        '--artifact',
        file,
        '--no-go',
        'on-hold',
        '--reason',
        'Need evidence',
        '--reopen',
        'Ten support cases',
      )
      expect(completed.code).toBe(0)
      expect(completed.value.outcome).toMatchObject({
        outcome: 'on-hold',
        reopen: 'Ten support cases',
      })
      expect(cli('status', id).value.items[0].status).toBe('closed')
    }))
})
