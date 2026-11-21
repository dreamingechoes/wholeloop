import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import { describe, expect, it } from 'vitest'
import { bundledCanonical } from '../../../src/adapters/canonical.js'
import { ADAPTERS, generateAdapter } from '../../../src/adapters/generate.js'
import { run } from '../../../src/cli/main.js'
import { terminalCells } from '../../../src/display/render.js'
import { statusDisplay, statusSummary } from '../../../src/display/status.js'
import { FlowEngine } from '../../../src/flow/engine.js'
import { flowPlan, readFlows } from '../../../src/flow/plan.js'
import type { GatePlan, GateResult } from '../../../src/gates/contracts.js'
import { gateReport } from '../../../src/gates/report.js'
import { projectOverview } from '../../../src/overview/project.js'
import { readOverview } from '../../../src/overview/read.js'
import { type EventData, event, replay } from '../../../src/state/events.js'
import { StateStore } from '../../../src/state/store.js'
import { statusItems } from '../../../src/status/project.js'
import { overviewFixture } from '../../support/overview-fixtures.js'

const at = '2026-11-21T10:00:00.000Z',
  rootId = 'init-00000001',
  scopeId = 'scope-00000001',
  sliceId = 'slice-00000001'
const options = { at, additions: [], checkpoints: ['launch', 'd7', 'd30'] }
function fixture(check: (store: StateStore, dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-status-'))
  try {
    check(new StateStore(join(dir, 'state', 'wholeloop')), dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
const created = (
  kind: 'initiative' | 'scope' | 'slice',
  title: string,
  parent?: string,
): EventData => ({
  type: 'item.created',
  data: {
    kind,
    title,
    owner: 'Fixture Owner',
    body: 'Synthetic work.',
    ...(parent ? { parent } : {}),
  },
})
const projection = (store: StateStore) => statusItems(store.list(), store.events(), options)
function nested(store: StateStore, dir: string) {
  store.transaction((_events, append) => {
    append(rootId, created('initiative', 'Search orders'))
    append(scopeId, created('scope', 'Date filter', rootId))
    append(sliceId, created('slice', 'Accept a date range', scopeId))
    append('slice-00000002', created('slice', 'Closed prototype', scopeId))
    append('slice-00000002', { type: 'item.closed', data: {} })
    append(sliceId, {
      type: 'step.started',
      data: {
        step: 'review-code',
        run: 'run-0000000000000001',
        mode: 'standalone',
        input: 'Review the fixture.',
      },
    })
    const plan: GatePlan = {
        schema: 'wholeloop/gate-round@1',
        subject: sliceId,
        run: 'gate-0000000000000001',
        gate: 'review',
        round: 1,
        budget: 3,
        policy: 'c'.repeat(64),
        repository: dir,
        base: { ref: 'main', sha: 'a'.repeat(40) },
        snapshot: { digest: 'b'.repeat(64), head: 'a'.repeat(40), branch: 'main' },
        inputs: { paths: [], languages: [], slots: [] },
        excluded: [],
        verifiers: 3,
        refutations: 2,
        units: [
          {
            id: 'correctness',
            lens: 'correctness',
            asks: 'Check correctness.',
            prompt: 'Synthetic review.',
            failSafe: false,
            origin: 'fixture',
          },
        ],
      },
      result: GateResult = {
        unit: 'correctness',
        status: 'ok',
        evidence: ['fixture.ts:1'],
        findings: [
          {
            id: 'missing-range',
            location: 'fixture.ts:1',
            text: 'Empty date range is accepted.',
            evidence: ['fixture.ts:1'],
          },
        ],
      }
    append(sliceId, { type: 'gate.planned', data: { plan } })
    append(sliceId, { type: 'gate.submitted', data: { run: plan.run, round: 1, result } })
    append(sliceId, {
      type: 'gate.decided',
      data: {
        run: plan.run,
        round: 1,
        observed: plan.snapshot.digest,
        report: gateReport(plan, [result], [], plan.snapshot.digest),
      },
    })
    append(sliceId, {
      type: 'worktree.planned',
      data: {
        allocation: {
          repository: dir,
          commonDir: join(dir, '.git'),
          repoKey: 'a'.repeat(16),
          mode: 'worktree',
          path: join(dir, 'workspace'),
          branch: `wl/${sliceId}`,
          base: { ...plan.base, ref: 'refs/heads/main' },
          target: { ...plan.base, ref: 'refs/heads/main' },
          original: { sha: plan.base.sha },
          ports: { start: 3000, end: 3009 },
        },
      },
    })
    append(sliceId, { type: 'worktree.ready', data: {} })
  })
}

describe('status observation and attention tree', () => {
  it('projects real nested fixture stores, recorded failures and active-child focus without writing', () =>
    fixture((store, dir) => {
      nested(store, dir)
      const before = store.events(),
        items = projection(store),
        payload = { items, unreadCount: 0 }
      expect(items.find(({ id }) => id === rootId)).toMatchObject({
        parent: null,
        children: { total: 1, open: 1, closed: 0 },
        focus: { subject: sliceId, step: 'review-code' },
        flow: { next: 'frame-problem' },
      })
      expect(items.find(({ id }) => id === scopeId)).toMatchObject({
        parent: rootId,
        children: { total: 2, open: 1, closed: 1 },
      })
      expect(items.find(({ id }) => id === sliceId)).toMatchObject({
        gate: { round: 1, verdict: 'FAIL', openFindings: 1, recorded: true },
        workspace: { status: 'active', mode: 'worktree' },
      })
      expect(statusSummary(payload, { columns: 180 })).toMatchSnapshot('nested with failed review')
      expect(statusSummary(payload)).not.toContain('slice-00000002')
      expect(statusSummary(payload, { all: true, columns: 180 })).toContain('slice-00000002')
      expect(statusDisplay(payload).text).toBe(statusSummary(payload))
      expect(store.events()).toEqual(before)
    }))
  it('distinguishes upcoming own and inherited approvals, then offers only decisions accepted by the core', () =>
    fixture((store, dir) => {
      store.transaction((_events, append) => {
        append(rootId, created('initiative', 'Specify search'))
        append(scopeId, created('scope', 'Search scope', rootId))
        append(rootId, {
          type: 'step.started',
          data: {
            step: 'write-spec',
            run: 'run-0000000000000001',
            mode: 'standalone',
            input: 'Specify search.',
          },
        })
      })
      const engine = new FlowEngine(store, dir, join(dir, 'user.yml'), dir),
        overview = () =>
          projectOverview(
            readOverview({
              root: dir,
              store: store.files.root,
              userFile: join(dir, 'user.yml'),
              at,
            }),
          )
      const upcoming = projection(store)
      for (const item of upcoming)
        expect(item.flow.pending[0]).toMatchObject({
          id: 'approve-spec',
          subject: rootId,
          state: 'upcoming',
        })
      expect(statusSummary({ items: upcoming, unreadCount: 0 })).not.toContain('Waiting on you')
      expect(overview().attention.filter(({ reason }) => reason === 'item-decision')).toEqual([])
      expect(() =>
        engine.answer('decision.approve-spec', 'approved', {
          subject: rootId,
          by: 'Fixture Owner',
          scope: 'run',
        }),
      ).toThrow('Complete write-spec')
      engine.skip('write-spec', rootId, 'Use the existing fixture specification.')
      const actionable = projection(store),
        view = overview(),
        decisions = view.attention.filter(({ reason }) => reason === 'item-decision')
      expect(actionable[0]?.flow.pending[0]?.state).toBe('actionable')
      expect(statusSummary({ items: actionable, unreadCount: 0 })).toContain('Waiting on you')
      expect(decisions).toHaveLength(1)
      const command = decisions[0]?.next[0]
      if (!command) throw new Error('Expected an actionable fixture command')
      const argv = command.argv.map((part) =>
          typeof part === 'string'
            ? part
            : `${part.prefix ?? ''}${part.input === 'operator' ? 'Fixture Owner' : 'approved'}`,
        ),
        output: string[] = []
      // Execute the exact suggested command with declared person/choice inputs against the same store.
      const oldState = process.env.XDG_STATE_HOME
      process.env.XDG_STATE_HOME = join(dir, 'state')
      try {
        expect(
          run(
            [...argv.slice(1), '--json'],
            { out: (text) => output.push(text), err: (text) => output.push(text) },
            dir,
          ),
        ).toBe(0)
      } finally {
        if (oldState === undefined) delete process.env.XDG_STATE_HOME
        else process.env.XDG_STATE_HOME = oldState
      }
      expect(JSON.parse(output[0] ?? '{}')).toMatchObject({ value: 'approved' })
      expect(overview().attention.filter(({ reason }) => reason === 'item-decision')).toEqual([])
    }))
  it('groups due measurements before recent ordinary work and retains schedule meanings', () => {
    const source = overviewFixture('due-checkpoint'),
      events = source.journals.state,
      items = statusItems([...replay(events).values()], events, { ...options, at: source.at })
    expect(items.find(({ id }) => id === scopeId)?.dueCheckpoints).toEqual(['launch', 'd7', 'd30'])
    const text = statusSummary({ items, unreadCount: 2 }, { columns: 180 })
    expect(text).toMatchSnapshot('due checkpoint tree')
    expect(text).toContain('Due\n')
  })
  it('sorts sibling subtrees by attention and then observed recency, keeping each item once', () =>
    fixture((store) => {
      store.transaction((_events, append) => {
        append(rootId, created('initiative', 'Parent'))
        for (const [id, title] of [
          ['scope-00000001', 'Old', '2026-10-01T00:00:00.000Z'],
          ['scope-00000002', 'Recent', at],
          ['scope-00000003', 'Waiting', '2026-09-01T00:00:00.000Z'],
        ] as const)
          append(id, created('scope', title, rootId))
        append('scope-00000003', {
          type: 'step.skipped',
          data: {
            step: 'write-spec',
            run: 'run-0000000000000001',
            reason: 'Existing specification.',
          },
        })
      })
      const text = statusSummary({
        items: projection(store).map((item) => ({
          ...item,
          updatedAt: item.id === 'scope-00000002' ? at : '2026-09-01T00:00:00.000Z',
        })),
        unreadCount: 0,
      })
      expect(text.indexOf('scope-00000003')).toBeLessThan(text.indexOf('scope-00000002'))
      expect(text.indexOf('scope-00000002')).toBeLessThan(text.indexOf('scope-00000001'))
      for (const item of store.list()) expect(text.split(item.id)).toHaveLength(2)
    }))
  it.each([1, 12, 40, 80, 120])(
    'clips every row to %s cells while preserving Unicode and removing controls',
    (columns) =>
      fixture((store) => {
        store.transaction((_events, append) =>
          append(rootId, created('initiative', '漢字 e\u0301 👩‍💻 title\u001b[31m\nInjected')),
        )
        const text = statusSummary({ items: projection(store), unreadCount: 0 }, { columns })
        expect(text).not.toContain('\u001b')
        expect(text).not.toContain('\nInjected')
        if (columns === 120) expect(text).toContain('e\u0301 👩‍💻')
        for (const line of text.split('\n'))
          expect(terminalCells(line)).toBeLessThanOrEqual(columns)
      }),
  )
  it.each([
    [{ isTTY: false, forceColor: '1' }, false],
    [{ isTTY: true, forceColor: '0' }, false],
    [{ isTTY: true, noColor: true, forceColor: '1' }, false],
    [{ isTTY: true }, true],
  ] as const)('honours terminal-only colour for %j', (terminal, colored) =>
    fixture((store) => {
      store.transaction((_events, append) => append(rootId, created('initiative', 'Readable work')))
      const text = statusSummary({ items: projection(store), unreadCount: 0 }, terminal)
      expect(text.includes('\u001b')).toBe(colored)
      expect(stripVTControlCharacters(text)).toBe(
        statusSummary({ items: projection(store), unreadCount: 0 }),
      )
    }),
  )
  it('keeps JSON complete when closed items are hidden and shares the plain tree through all seven clients', () =>
    fixture((store, dir) => {
      nested(store, dir)
      const env = {
          ...process.env,
          XDG_STATE_HOME: join(dir, 'state'),
          XDG_CONFIG_HOME: join(dir, 'config'),
          NO_COLOR: '1',
          FORCE_COLOR: '1',
          WL_WORKSPACE: '',
        },
        cli = (...args: string[]) =>
          spawnSync(process.execPath, [resolve('dist/wl.mjs'), ...args], {
            cwd: dir,
            env,
            encoding: 'utf8',
          })
      const human = cli('status'),
        machine = cli('status', '--json'),
        all = cli('status', '--all'),
        selected = cli('status', scopeId, '--json')
      expect(human.status).toBe(0)
      const payload = JSON.parse(machine.stdout)
      expect(payload.items).toHaveLength(4)
      expect(payload.display.text).toBe(human.stdout.trimEnd())
      expect(human.stdout).not.toContain('slice-00000002')
      expect(all.stdout).toContain('slice-00000002')
      expect(JSON.parse(cli('status', '--all', '--json').stdout).display.text).toBe(
        all.stdout.trimEnd(),
      )
      expect(JSON.parse(selected.stdout).items[0]).toMatchObject({
        children: { total: 2 },
        parent: rootId,
      })
      expect(machine.stdout).not.toContain('\\u001b')
      for (const adapter of ADAPTERS) {
        const files = generateAdapter(
            adapter.id,
            bundledCanonical(),
            '#!/usr/bin/env node\n',
            '0.0.0',
          ),
          skill = files.files.get(adapter.paths('skill', 'status'))?.content
        expect(skill, adapter.id).toContain('display.text')
      }
    }))
  it('reads an empty store without unrelated configuration validation or creating state', () =>
    fixture((store, dir) => {
      mkdirSync(join(dir, '.wholeloop'))
      writeFileSync(join(dir, '.wholeloop', 'config.yml'), 'version: 999\n')
      const env = {
          ...process.env,
          XDG_STATE_HOME: join(dir, 'state'),
          XDG_CONFIG_HOME: join(dir, 'config'),
          WL_WORKSPACE: '',
        },
        invoke = (...args: string[]) =>
          spawnSync(process.execPath, [resolve('dist/wl.mjs'), ...args], {
            cwd: dir,
            env,
            encoding: 'utf8',
          }),
        result = invoke('status', '--json')
      expect(result.status).toBe(0)
      expect(JSON.parse(result.stdout)).toMatchObject({ items: [], unreadCount: 0 })
      expect(invoke('config', 'show', '--json').status).not.toBe(0)
      expect(store.events()).toEqual([])
    }))
  it('indexes one read without weakening global flow results or retaining decisions between observations', () => {
    const rows = [100, 400].map((size) => {
      const events = Array.from({ length: size }, (_, index) =>
        event(
          `init-${index.toString(16).padStart(8, '0')}`,
          created('initiative', 'Synthetic work'),
          at,
        ),
      )
      let reads = 0
      const observed = events.map(
        (entry) =>
          new Proxy(entry, {
            get(target, property, receiver) {
              if (property === 'subject') reads++
              return Reflect.get(target, property, receiver)
            },
          }),
      )
      const reference = events.map((entry) => flowPlan(observed, entry.subject)),
        before = reads
      reads = 0
      const reader = readFlows(observed),
        actual = events.map((entry) => reader.plan(entry.subject)),
        after = reads
      expect(actual.map(({ schema: _schema, subject: _subject, ...plan }) => plan)).toEqual(
        reference,
      )
      return { size, before, after }
    })
    console.info('Status flow observation subject reads:', JSON.stringify(rows))
    expect(rows[1]?.after).toBeLessThanOrEqual((rows[0]?.after ?? 0) * 4.1)
    expect(rows[1]?.after).toBeLessThan((rows[1]?.before ?? 0) / 10)
  })
})
