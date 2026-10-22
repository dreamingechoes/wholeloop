import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bundledCanonical } from '../../../src/adapters/canonical.js'
import type { ConformanceContext } from '../../../src/conformance/contracts.js'
import { conformanceDiagnostics } from '../../../src/conformance/diagnostics.js'
import { judgeConformance } from '../../../src/conformance/judge.js'
import { prepareConformance, readConformance, runFiles } from '../../../src/conformance/prepare.js'
import {
  conformanceEnvironment,
  conformancePrompt,
  conformanceRecipe,
} from '../../../src/conformance/recipes.js'
import { reportConformance, runConformance } from '../../../src/conformance/run.js'
import { conformanceScenario } from '../../../src/conformance/scenario.js'
import { workspaceSnapshot } from '../../../src/gates/snapshot.js'
import { canonicalPath } from '../../../src/state/paths.js'
import { StateStore } from '../../../src/state/store.js'

function context(store: string, full = false): ConformanceContext {
  const keep = [
    'harness/conformance/standalone-frame.json',
    'harness/conformance/frame-approval.json',
    'harness/skills/next/SKILL.md',
    'harness/skills/frame-problem/SKILL.md',
    'harness/agents/conductor.md',
    'harness/protocols/core-invariants.md',
    'harness/protocols/guards.md',
  ]
  return {
    store,
    canonical: new Map([...bundledCanonical()].filter(([path]) => full || keep.includes(path))),
    core: readFileSync(resolve('dist/wl.mjs'), 'utf8'),
    version: '0.0.0',
  }
}
async function fixture(
  operation: (ctx: ConformanceContext, dir: string) => Promise<void>,
  full = false,
) {
  const dir = mkdtempSync(join(tmpdir(), 'wl-conformance-'))
  try {
    await operation(context(join(dir, 'store'), full), dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
function fakeClient(dir: string, version: string, body: string, binary = 'codex') {
  const bin = join(dir, 'bin')
  mkdirSync(bin, { recursive: true })
  writeFileSync(
    join(bin, binary),
    `#!${process.execPath}\nif(process.argv.includes('--version')){console.log(${JSON.stringify(version)});process.exit(0)}\n${body}`,
    { mode: 0o755 },
  )
  return {
    ...process.env,
    PATH: `${bin}:${dirname(process.execPath)}`,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
  }
}

describe('standalone conformance runner', () => {
  it.each(['claude', 'codex', 'opencode', 'copilot', 'gemini', 'antigravity', 'cursor'])(
    'executes installed %s launchers while retaining explicit simulation evidence',
    async (target) => {
      await fixture(async (ctx) => {
        const pin = target === 'opencode' ? '1.17.9' : '99.0.0'
        const prepared = prepareConformance(ctx, target, pin)
        expect(reportConformance(ctx, prepared.id).status).toBe('UNRUN')
        const run = readConformance(ctx, prepared.id)
        const prompt = readFileSync(prepared.prompt, 'utf8')
        expect(prompt).not.toContain(run.marker)
        expect(readFileSync(run.skill, 'utf8')).toContain(`conformance-marker:${run.marker}`)
        expect(prepared.root.startsWith(canonicalPath(ctx.store))).toBe(true)
        expect(run.state.startsWith(`${run.root}/`)).toBe(false)
        const before = workspaceSnapshot(run.root).digest
        const report = await runConformance(ctx, prepared.id, 'fixture')
        expect(report).toMatchObject({
          cli: target,
          pin,
          status: 'FIXTURE_PASS',
          evidence: 'simulation',
          step: 'frame-problem',
          missing: [],
          problems: [],
        })
        expect(report.subject).toMatch(/^init-/)
        expect(workspaceSnapshot(run.root).digest).toBe(before)
        expect(reportConformance(ctx, prepared.id)).toEqual(report)
        await expect(runConformance(ctx, prepared.id, 'live')).rejects.toThrow('already claimed')
        expect(new StateStore(run.state).list()).toHaveLength(1)
        const events = new StateStore(run.state).events()
        const review = events.find(
          (entry) =>
            entry.type === 'note.added' && entry.data.text.startsWith('Framing final review:'),
        )
        expect(review?.type === 'note.added' && review.data.text).toContain(
          'SIMULATED fixture reviewer',
        )
      })
    },
    30000,
  )

  it('retains a redacted structured diagnosis from a failed native process without changing the verdict', async () => {
    await fixture(async (ctx, dir) => {
      const prepared = prepareConformance(ctx, 'copilot', '99.0.0')
      const env = fakeClient(
        dir,
        '99.0.0',
        `process.stderr.write('Authentication required: synthetic private diagnostic detail');process.exitCode=7`,
        'copilot',
      )
      const report = await runConformance(ctx, prepared.id, 'live', { env })
      expect(report.status).toBe('FAIL')
      expect(report.process).toMatchObject({ code: 7, status: 'crashed' })
      const diagnosis = conformanceDiagnostics(ctx, prepared.id)
      expect(diagnosis).toMatchObject({
        status: 'observed',
        mode: 'live',
        observations: { signals: ['authentication-required'] },
      })
      expect(JSON.stringify(diagnosis)).not.toContain('synthetic private diagnostic detail')
      expect(runFiles(ctx, prepared.id).read('diagnostics.json')).not.toContain(
        'Authentication required',
      )
    })
  })

  it('preflights agy and sends one documented JSONL user event to the native recipe', async () => {
    await fixture(async (ctx, dir) => {
      const prepared = prepareConformance(ctx, 'antigravity', '99.0.0')
      const received = join(dir, 'received.json')
      const env = fakeClient(
        dir,
        '99.0.0',
        `;(async()=>{let input='';for await(const chunk of process.stdin)input+=chunk;const event=JSON.parse(input);if(event.event!=='user'||!event.message.content.includes('wl-agy-frame-problem')||process.argv.some(arg=>arg.startsWith('--print'))||!process.argv.includes('stream-json'))process.exit(8);(await import('node:fs')).writeFileSync(${JSON.stringify(received)},JSON.stringify(event));})()`,
        'agy',
      )
      expect(JSON.parse(readFileSync(prepared.input, 'utf8')).event).toBe('user')
      const report = await runConformance(ctx, prepared.id, 'live', { env })
      expect(report.process, JSON.stringify(report)).toMatchObject({
        status: 'succeeded',
        code: 0,
        version: '99.0.0',
      })
      expect(report.status).toBe('FAIL')
      expect(report.evidence).toBe('live-process-and-journal')
      expect(JSON.parse(readFileSync(received, 'utf8')).message.content).toContain(
        'wl-agy-frame-problem',
      )
    })
  })

  it('preflights the Cursor calendar version and keeps the scenario on stdin', async () => {
    await fixture(async (ctx, dir) => {
      const pin = '2026.07.16-899851b'
      const prepared = prepareConformance(ctx, 'cursor', pin)
      const received = join(dir, 'received.txt')
      const env = fakeClient(
        dir,
        pin,
        `;(async()=>{let input='';for await(const chunk of process.stdin)input+=chunk;if(!input.includes('wl-frame-problem')||process.argv.includes(input)||!process.argv.includes('enabled'))process.exit(8);(await import('node:fs')).writeFileSync(${JSON.stringify(received)},input);})()`,
        'agent',
      )
      const report = await runConformance(ctx, prepared.id, 'live', { env })
      expect(report.process, JSON.stringify(report)).toMatchObject({
        status: 'succeeded',
        code: 0,
        version: pin,
      })
      expect(report.status).toBe('FAIL')
      expect(readFileSync(received, 'utf8')).toContain('wl-frame-problem')
    })
  })

  it('reports exact missing events and rejects stale artifacts, owners and unintended continuation', async () => {
    await fixture(async (ctx) => {
      const prepared = prepareConformance(ctx, 'codex', '99.0.0')
      await runConformance(ctx, prepared.id, 'fixture')
      const run = readConformance(ctx, prepared.id)
      const scenario = conformanceScenario(ctx.canonical).scenario
      const store = new StateStore(run.state)
      const original = store.events()
      const journal = `journal/${original[0]?.ts.slice(0, 7)}.ndjson`
      const save = (events: typeof original) =>
        store.files.atomic(journal, `${events.map((event) => JSON.stringify(event)).join('\n')}\n`)
      for (const [type, missing] of [
        ['note.added', 'note.added:installed-skill-marker'],
        ['step.completed', 'step.completed:frame-problem:same-run'],
        ['frame.decided', 'frame.decided:go:same-run'],
      ] as const) {
        save(original.filter((event) => event.type !== type))
        expect(judgeConformance(run, scenario)).toMatchObject({
          cli: 'codex',
          step: 'frame-problem',
          status: 'FAIL',
          missing: expect.arrayContaining([missing]),
        })
      }
      save(original)
      expect(judgeConformance({ ...run, phase: 'running' }, scenario).problems).toContain(
        'process-unfinished',
      )
      expect(judgeConformance({ ...run, mode: 'live' }, scenario).problems).toContain(
        'exact-version-not-observed',
      )
      expect(
        judgeConformance(
          { ...run, process: { status: 'crashed', code: 1, signal: null } },
          scenario,
        ).status,
      ).toBe('FAIL')
      const forged = structuredClone(original)
      const created = forged.find((event) => event.type === 'item.created')
      if (created?.type === 'item.created') created.data.owner = 'Wrong Owner'
      save(forged)
      expect(judgeConformance(run, scenario).missing).toContain(
        'item.created:owned-standalone-initiative',
      )
      save(original)
      const completed = original.find((event) => event.type === 'step.completed')
      if (completed?.type !== 'step.completed') throw new Error('Fixture completion missing')
      store.files.atomic(completed.data.artifact.path, 'edited projection\n')
      expect(judgeConformance(run, scenario).problems).toContain('artifact-projection-mismatch')
      store.rebuild()
      store.note(completed.subject, 'unrelated harmless note')
      expect(judgeConformance(run, scenario).status).toBe('FIXTURE_PASS')
      store.transaction((_events, append) =>
        append(completed.subject, {
          type: 'step.started',
          data: {
            step: 'write-spec',
            run: 'run-aaaaaaaaaaaaaaaa',
            mode: 'flow',
            input: 'Unexpected continuation',
          },
        }),
      )
      expect(judgeConformance(run, scenario).problems).toContain('expected-one-step-start')
      store.files.atomic(journal, 'malformed private content\n')
      const malformed = judgeConformance(run, scenario)
      expect(malformed.problems).toContain('invalid-journal')
      expect(JSON.stringify(malformed)).not.toContain('private content')
    })
  }, 30000)

  it('refuses to launch a changed fixture or consume existing journal evidence', async () => {
    await fixture(async (ctx) => {
      const prepared = prepareConformance(ctx, 'codex', '99.0.0')
      writeFileSync(join(prepared.root, 'README.md'), 'changed\n')
      expect((await runConformance(ctx, prepared.id, 'fixture')).problems).toContain(
        'workspace-changed',
      )
      const second = prepareConformance(ctx, 'codex', '99.0.0')
      const run = readConformance(ctx, second.id)
      new StateStore(run.state).create({
        kind: 'initiative',
        title: 'Existing',
        owner: 'Fixture Owner',
        body: '',
      })
      await expect(runConformance(ctx, second.id, 'fixture')).rejects.toThrow(
        'already contains journal',
      )
      expect(readConformance(ctx, second.id).phase).toBe('prepared')
    })
  }, 30000)

  it('requires the final review and exact scripted decision instead of accepting legacy completion', async () => {
    await fixture(async (ctx) => {
      const prepared = prepareConformance(ctx, 'codex', '99.0.0')
      await runConformance(ctx, prepared.id, 'fixture')
      const run = readConformance(ctx, prepared.id)
      const scenario = conformanceScenario(ctx.canonical).scenario
      const store = new StateStore(run.state)
      const original = store.events()
      const journal = `journal/${original[0]?.ts.slice(0, 7)}.ndjson`
      for (const kind of [
        'absent',
        'stale-digest',
        'other-owner',
        'open-finding',
        'duplicate',
        'after-completion',
        'changed-artifact',
        'changed-decision',
      ]) {
        let events = structuredClone(original)
        const note = events.find(
          (entry) =>
            entry.type === 'note.added' && entry.data.text.startsWith('Framing final review:'),
        )
        if (note?.type !== 'note.added') throw new Error('Missing fixture review')
        if (kind === 'absent') events = events.filter((entry) => entry !== note)
        if (kind === 'duplicate')
          events.push({ ...note, id: 'ev-00000000-0000-4000-8000-000000000000' })
        if (kind === 'after-completion')
          events = [...events.filter((entry) => entry !== note), note]
        if (['stale-digest', 'other-owner', 'open-finding'].includes(kind)) {
          const value = JSON.parse(note.data.text.slice('Framing final review: '.length))
          if (kind === 'stale-digest') value.sha256 = 'f'.repeat(64)
          if (kind === 'other-owner') value.decision.by = 'Other Owner'
          if (kind === 'open-finding') value.reviewer.unresolvedFindings.push('Missing evidence')
          note.data.text = `Framing final review: ${JSON.stringify(value)}`
        }
        if (kind === 'changed-artifact') {
          const complete = events.find((entry) => entry.type === 'step.completed')
          if (complete?.type === 'step.completed') complete.data.artifact.content += '\nEdited.\n'
        }
        if (kind === 'changed-decision') {
          const decision = events.find((entry) => entry.type === 'frame.decided')
          if (decision?.type === 'frame.decided') decision.data.reason = 'Not the scripted decision'
        }
        store.files.atomic(journal, `${events.map((event) => JSON.stringify(event)).join('\n')}\n`)
        const report = judgeConformance(run, scenario)
        expect(report.status, kind).toBe('FAIL')
        if (kind === 'absent' || kind === 'duplicate' || kind === 'after-completion')
          expect(report.missing, kind).toContain('note.added:final-framing-review')
        if (kind === 'changed-artifact')
          expect(report.problems).toContain('scripted-final-artifact-mismatch')
        if (kind === 'changed-decision')
          expect(report.problems).toContain('scripted-decision-mismatch')
      }
      store.files.atomic(journal, `${original.map((event) => JSON.stringify(event)).join('\n')}\n`)
      expect(judgeConformance(run, scenario).status).toBe('FIXTURE_PASS')
      expect(
        judgeConformance(
          {
            ...run,
            mode: 'live',
            process: { status: 'succeeded', code: 0, signal: null, version: run.pin },
          },
          scenario,
        ).problems,
      ).toContain('invalid-final-framing-review')
    })
  }, 30000)

  it('pins a real subprocess version before submitting any scenario input', async () => {
    await fixture(async (ctx, dir) => {
      const prepared = prepareConformance(ctx, 'codex', '99.0.0')
      const env = fakeClient(
        dir,
        '98.0.0',
        `require('node:fs').writeFileSync(${JSON.stringify(join(dir, 'launched'))},'unexpected')`,
      )
      const report = await runConformance(ctx, prepared.id, 'live', { env })
      expect(report.problems).toContain('version-mismatch')
      expect(existsSync(join(dir, 'launched'))).toBe(false)
      expect(report.status).toBe('FAIL')
    })
  }, 30000)

  it('does not treat a successful empty client response as a journal pass or retain its output', async () => {
    await fixture(async (ctx, dir) => {
      const prepared = prepareConformance(ctx, 'codex', '99.0.0')
      const env = fakeClient(
        dir,
        '99.0.0',
        "process.stdin.resume();process.stdin.on('end',()=>{console.log('PRIVATE FAKE CLIENT OUTPUT');process.exit(0)})",
      )
      const report = await runConformance(ctx, prepared.id, 'live', { env })
      expect(report.process).toMatchObject({ status: 'succeeded', code: 0, version: '99.0.0' })
      expect(report.status).toBe('FAIL')
      expect(report.missing).toContain('step.completed:frame-problem:same-run')
      const files = runFiles(ctx, prepared.id)
      expect(readFileSync(files.path('run.json'), 'utf8')).not.toContain(
        'PRIVATE FAKE CLIENT OUTPUT',
      )
    })
  }, 30000)

  it.each(['timeout', 'cancelled'] as const)(
    'bounds %s subprocesses and retains failure evidence',
    async (expected) => {
      await fixture(async (ctx, dir) => {
        const prepared = prepareConformance(ctx, 'codex', '99.0.0')
        const env = fakeClient(
          dir,
          '99.0.0',
          "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)",
        )
        const controller = new AbortController()
        if (expected === 'cancelled') controller.abort()
        const report = await runConformance(ctx, prepared.id, 'live', {
          env,
          timeoutMs: 150,
          signal: controller.signal,
        })
        expect(report.process?.status).toBe(expected)
        expect(report.status).toBe('FAIL')
      })
    },
    30000,
  )

  it('rejects invalid pins, unsafe IDs/stores, redirected metadata, stale cores and symlinked fixtures', async () => {
    await fixture(async (ctx, dir) => {
      expect(() => prepareConformance(ctx, 'codex', 'latest')).toThrow('exact semantic version')
      expect(() => prepareConformance(ctx, 'unknown', '1.0.0')).toThrow()
      expect(() => readConformance(ctx, '../escape')).toThrow('Invalid conformance run ID')
      const prepared = prepareConformance(ctx, 'codex', '99.0.0')
      const files = runFiles(ctx, prepared.id)
      const run = readConformance(ctx, prepared.id)
      expect(() => prepareConformance({ ...ctx, store: prepared.root }, 'codex', '99.0.0')).toThrow(
        'outside git',
      )
      expect(() =>
        readConformance({ ...ctx, core: `${ctx.core}\n// changed\n` }, prepared.id),
      ).toThrow('another source/core')
      files.atomic('run.json', JSON.stringify({ ...run, launcher: process.execPath }))
      expect(() => readConformance(ctx, prepared.id)).toThrow('Invalid conformance paths')
      files.atomic('run.json', JSON.stringify(run))
      rmSync(run.root, { recursive: true })
      mkdirSync(join(dir, 'other'))
      symlinkSync(join(dir, 'other'), run.root)
      expect(() => readConformance(ctx, prepared.id)).toThrow('Unsafe conformance fixture')
    })
  }, 30000)

  it('preserves exact input and owner values without adding prose punctuation', async () => {
    await fixture(async (ctx) => {
      const prepared = prepareConformance(ctx, 'codex', '99.0.0')
      const run = readConformance(ctx, prepared.id)
      const scenario = conformanceScenario(ctx.canonical).scenario
      for (const input of [scenario.input, 'Find "quoted" orders?\nKeep the next line.']) {
        const prompt = conformancePrompt(run, { ...scenario, input })
        const line = prompt.split('\n').find((line) => line.startsWith('Exact --input value'))
        const owner = prompt.split('\n').find((line) => line.startsWith('Exact --owner value'))
        expect(JSON.parse(line?.slice(line.indexOf(': ') + 2) ?? '')).toBe(input)
        expect(JSON.parse(owner?.slice(owner.indexOf(': ') + 2) ?? '')).toBe(scenario.owner)
      }
    })
  })

  it('runs OpenCode from the prepared cwd without the unsupported run directory flag', async () => {
    await fixture(async (ctx, dir) => {
      const prepared = prepareConformance(ctx, 'opencode', '1.17.9')
      const env = fakeClient(
        dir,
        '1.17.9',
        `;(async()=>{let input='';for await(const chunk of process.stdin)input+=chunk;if(process.argv.includes('--dir')||process.cwd()!==${JSON.stringify(prepared.root)}||!input.includes('Exact --input value'))process.exit(8);})()`,
        'opencode',
      )
      const report = await runConformance(ctx, prepared.id, 'live', { env })
      expect(report.process).toMatchObject({ status: 'succeeded', code: 0 })
      expect(report.status).toBe('FAIL')
      expect(report.missing).toContain('step.completed:frame-problem:same-run')
    })
  })

  it('keeps native recipes shell-free, fresh and free of permission bypasses', async () => {
    await fixture(async (ctx) => {
      const prepared = prepareConformance(ctx, 'claude', '99.0.0')
      const run = readConformance(ctx, prepared.id)
      const env = conformanceEnvironment(run, {
        WL_WORKSPACE: 'real',
        WL_SUBJECT: 'slice-real',
        PATH: '/bin',
      })
      expect(env.WL_WORKSPACE).toBeUndefined()
      expect(env.WL_SUBJECT).toBeUndefined()
      expect(env.XDG_STATE_HOME).toBe(join(run.home, 'state'))
      for (const target of ['claude', 'codex', 'opencode', 'copilot']) {
        const recipe = conformanceRecipe({ ...run, target })
        expect(recipe.command).toBe(target)
        expect(recipe.args.join(' ')).not.toMatch(
          /dangerously|yolo|allow-all|resume|continue|safe-mode|--pure/,
        )
        expect(recipe.args).not.toContain(
          conformancePrompt(run, conformanceScenario(ctx.canonical).scenario),
        )
      }
    })
  }, 30000)

  it('runs compiled prepare/fixture/report with the complete embedded catalog and explicit mode validation', async () => {
    await fixture(async (ctx, dir) => {
      const core = resolve('dist/wl.mjs')
      const cli = (args: string[]) =>
        spawnSync(process.execPath, [core, ...args, '--store', ctx.store, '--json'], {
          cwd: dir,
          encoding: 'utf8',
          timeout: 30000,
          maxBuffer: 1048576,
        })
      const prepared = cli(['conformance', 'prepare', '--target', 'codex', '--pin', '99.0.0'])
      expect(prepared.status, prepared.stderr).toBe(0)
      const { id, root } = JSON.parse(prepared.stdout)
      expect(readdirSync(join(root, '.agents/skills'))).toHaveLength(17)
      expect(cli(['conformance', 'run', id]).status).toBe(4)
      expect(cli(['conformance', 'run', id, '--fixture', '--live']).status).toBe(4)
      const result = cli(['conformance', 'run', id, '--fixture'])
      expect(result.status, result.stdout + result.stderr).toBe(0)
      expect(JSON.parse(result.stdout)).toMatchObject({
        status: 'FIXTURE_PASS',
        evidence: 'simulation',
      })
      expect(cli(['conformance', 'report', id]).stdout).toBe(result.stdout)
    }, true)
  }, 60000)
})
