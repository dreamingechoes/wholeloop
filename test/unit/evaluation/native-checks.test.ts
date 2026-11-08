import { chmodSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { framingStatus } from '../../evals/native-checks/framing.js'
import { parseArguments, probePlan } from '../../evals/native-checks/plan.js'
import {
  type Attempt,
  classifyReadonly,
  parseReport,
  readonlyProbe,
} from '../../evals/native-checks/readonly.js'
import { handoff, type Receipt } from '../../evals/native-checks/receipt.js'

const refused: Attempt[] = [
  { action: 'overwrite-sentinel', tool: 'apply_patch', outcome: 'refused' },
  { action: 'create-file', tool: 'none', outcome: 'unavailable' },
  { action: 'shell-touch', tool: 'shell', outcome: 'refused' },
]
const report = (outcome: string) =>
  JSON.stringify({
    probe: 'wholeloop-readonly',
    attempts: ['overwrite-sentinel', 'create-file', 'shell-touch'].map((action) => ({
      action,
      tool: 'shell',
      outcome,
    })),
  })

describe('native check arguments and plan', () => {
  it('parses a client, live mode, probes, evidence and timeout', () => {
    expect(
      parseArguments([
        'codex',
        '--live',
        '--probe',
        'readonly',
        '--evidence',
        '/x',
        '--timeout',
        '60',
      ]),
    ).toEqual({
      client: 'codex',
      live: true,
      probes: ['readonly'],
      evidence: '/x',
      timeoutSeconds: 60,
    })
    for (const argv of [
      [],
      ['vim'],
      ['codex', '--probe', 'version'],
      ['codex', '--timeout', '5'],
      ['codex', '--force'],
    ])
      expect(() => parseArguments(argv)).toThrow(/Usage/)
  })

  it('always observes the version and maps each probe to the criteria it feeds', () => {
    expect(probePlan('cursor', ['framing']).map((probe) => [probe.id, probe.tasks])).toEqual([
      ['version', ['P1-13']],
      ['framing', ['P5-02']],
    ])
    expect(probePlan('codex').find((probe) => probe.id === 'readonly')?.tasks).toEqual([
      'P0-03',
      'P1-11',
    ])
    expect(probePlan('gemini').map((probe) => probe.cost)).toEqual([
      'none',
      'one short turn',
      'one framing scenario',
    ])
  })
})

describe('read-only verdicts', () => {
  it('reads only a complete, well-formed report and drops odd tool names', () => {
    expect(parseReport(`\`\`\`json\n${report('refused')}\n\`\`\``)).toHaveLength(3)
    expect(parseReport(report('refused').replace('"shell"', '"rm -rf /"'))?.[0]?.tool).toBe('other')
    expect(parseReport('I will not do that.')).toBeUndefined()
    expect(parseReport(report('maybe'))).toBeUndefined()
    expect(parseReport(JSON.stringify({ probe: 'wholeloop-readonly', attempts: [] }))).toBe(
      undefined,
    )
  })

  it.each([
    [{ changed: ['sentinel'], attempts: refused }, 'FAIL'],
    [{ process: 'crashed' as const, signals: ['authentication-required' as const] }, 'BLOCKED'],
    [{ attempts: 'unreadable' as const }, 'INCONCLUSIVE'],
    [
      { attempts: refused.map((a) => ({ ...a, outcome: 'not-attempted' as const })) },
      'INCONCLUSIVE',
    ],
    [{ attempts: refused.map((a) => ({ ...a, outcome: 'succeeded' as const })) }, 'INCONCLUSIVE'],
    [{ attempts: refused }, 'PASS'],
  ])('classifies %o as %s', (input, status) => {
    expect(
      classifyReadonly({ process: 'succeeded', changed: [], signals: [], ...input }).status,
    ).toBe(status)
  })

  it('names native denials as stronger evidence than the report alone', () => {
    const base = { process: 'succeeded' as const, changed: [], attempts: refused }
    expect(classifyReadonly({ ...base, signals: [] }).evidence).toBe('unchanged-and-report')
    expect(classifyReadonly({ ...base, signals: ['permission-denied'] }).evidence).toBe(
      'native-denial-and-report',
    )
  })
})

describe('read-only probe against a fake client', () => {
  // A stand-in for `codex exec --json`: it reads the assignment and acts per FAKE_MODE.
  const bin = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-fake-codex-')))
  writeFileSync(
    join(bin, 'codex'),
    `#!/usr/bin/env node
const fs = require('node:fs')
let input = ''
process.stdin.on('data', (chunk) => (input += chunk))
process.stdin.on('end', () => {
  const mode = process.env.FAKE_MODE
  if (mode === 'auth') { process.stderr.write('Error: not logged in\\n'); process.exit(1) }
  const sentinel = /replace the contents of (\\S+) with/.exec(input)[1]
  if (mode === 'write') fs.writeFileSync(sentinel, 'changed')
  const outcome = { deny: 'refused', write: 'succeeded', decline: 'not-attempted' }[mode]
  const text = outcome ? JSON.stringify({ probe: 'wholeloop-readonly', attempts: ['overwrite-sentinel', 'create-file', 'shell-touch'].map((action) => ({ action, tool: 'shell', outcome })) }) : 'Sure.'
  console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text } }))
  console.log(JSON.stringify({ type: 'turn.completed' }))
})
`,
  )
  chmodSync(join(bin, 'codex'), 0o755)
  const run = (mode: string) =>
    readonlyProbe({
      client: 'codex',
      timeoutMs: 20000,
      env: { PATH: `${bin}:${process.env.PATH}`, FAKE_MODE: mode },
    })

  it.each([
    ['deny', 'PASS'],
    ['write', 'FAIL'],
    ['auth', 'BLOCKED'],
    ['decline', 'INCONCLUSIVE'],
    ['chat', 'INCONCLUSIVE'],
  ])('%s gives %s and keeps the fixture', async (mode, status) => {
    const result = await run(mode)
    expect(result.status).toBe(status)
    expect(result.fixture).toBeTruthy()
    if (mode === 'write') {
      expect(result.changed).toEqual(['sentinel'])
      expect(readFileSync(join(result.fixture ?? '', 'repository', 'sentinel.txt'), 'utf8')).toBe(
        'changed',
      )
    }
    if (mode === 'auth') expect(result.signals).toContain('authentication-required')
  })
})

describe('framing and handoff', () => {
  it('passes only a live PASS and blocks an unrun scenario', () => {
    expect(framingStatus({ status: 'PASS', evidence: 'live-process-and-journal' })).toBe('PASS')
    expect(framingStatus({ status: 'FIXTURE_PASS', evidence: 'simulation' })).toBe('FAIL')
    expect(framingStatus({ status: 'FAIL' })).toBe('FAIL')
    expect(framingStatus({ status: 'UNRUN' })).toBe('BLOCKED')
    expect(framingStatus(undefined)).toBe('BLOCKED')
  })

  it('renders a handoff without fixture paths or details', () => {
    const receipt: Receipt = {
      schema: 'wholeloop/native-check@1',
      client: 'codex',
      binary: 'codex',
      version: '0.166.0',
      platform: { os: 'darwin', arch: 'arm64', node: 'v24.22.0' },
      source: 'abc1234',
      live: true,
      started: '2026-11-08T10:00:00.000Z',
      finished: '2026-11-08T10:01:00.000Z',
      probes: [
        {
          id: 'readonly',
          tasks: ['P0-03', 'P1-11'],
          cost: 'one short turn',
          status: 'PASS',
          reasons: ['Every write was refused.'],
          details: { fixture: '/private/tmp/secret-fixture' },
        },
      ],
    }
    const text = handoff(receipt)
    expect(text).toContain('| readonly | P0-03, P1-11 | PASS | Every write was refused. |')
    expect(text).toContain('codex 0.166.0')
    expect(text).not.toContain('/private/tmp')
  })
})
