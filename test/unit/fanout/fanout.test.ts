import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type HeadlessAdapter, headlessAdapter } from '../../../src/fanout/adapters.js'
import { HeadlessHost } from '../../../src/fanout/host.js'
import { runHeadless } from '../../../src/fanout/run.js'
import { FlowEngine } from '../../../src/flow/engine.js'
import type { GateFinding, GatePlan } from '../../../src/gates/contracts.js'
import { type GateHost, inspectGateRound } from '../../../src/gates/execution.js'
import { gateRuns } from '../../../src/gates/state.js'
import { GateWorkflow } from '../../../src/gates/workflow.js'
import { StateStore } from '../../../src/state/store.js'

const defect: GateFinding = {
  id: 'defect',
  location: 'app.ts:1',
  text: 'Fixture observed defect',
  evidence: ['Observed the fixture branch'],
}
const worker = `#!/usr/bin/env node
const fs=require('node:fs')
if(process.argv.includes('--version')){console.log(process.env.WL_FIXTURE_NATIVE_VERSION||'1.17.9');process.exit(0)}
const format=process.env.WL_FIXTURE_FORMAT
if(format==='antigravity')console.log(JSON.stringify({event:'init',conversation_id:'fixture-session',init:{cwd:process.cwd(),tools:['view_file','grep_search'],permission_mode:'request-review'}}))
let raw=''
process.stdin.on('data',chunk=>raw+=chunk)
process.stdin.on('end',()=>{
 const received=JSON.parse(raw),a=format==='antigravity'?JSON.parse(received.message.content):received,mode=process.env.WL_FIXTURE_MODE
 if(format==='codex'){
  const index=process.argv.indexOf('--output-schema')
  if(index<0)process.exit(9)
  const schema=JSON.parse(fs.readFileSync(process.argv[index+1],'utf8')),field=a.role==='inspect'?'result':'vote',props=schema.properties
  if(props.assignment.enum[0]!==a.assignment||props.run.enum[0]!==a.run||props.round.enum[0]!==a.round||schema.additionalProperties!==false||!schema.required.includes(field))process.exit(9)
  if(a.role==='inspect'&&props.result.properties.unit.enum[0]!==a.unit.id)process.exit(9)
  if(a.role==='refute'&&(props.vote.properties.finding.enum[0]!==a.unit.finding||props.vote.properties.verifier.enum[0]!==a.unit.verifier))process.exit(9)
 }
 const log=action=>{if(process.env.WL_FIXTURE_LOG)fs.appendFileSync(process.env.WL_FIXTURE_LOG,JSON.stringify({action,pid:process.pid,role:a.role,time:Date.now(),cwd:process.cwd(),args:process.argv.slice(2),copilotAllowAll:process.env.COPILOT_ALLOW_ALL,extensions:process.env.GITHUB_COPILOT_PROMPT_MODE_EXTENSIONS,opencodePermissions:format==='opencode'&&process.env.OPENCODE_PERMISSION?JSON.parse(process.env.OPENCODE_PERMISSION):undefined,opencodePolicy:format==='opencode'&&!process.env.OPENCODE_PERMISSION?JSON.parse(fs.readFileSync('.native-config/opencode/opencode.json','utf8')):undefined,cursorPolicy:process.env.WL_FIXTURE_FORMAT==='cursor'?JSON.parse(fs.readFileSync('.cursor/cli.json','utf8')):undefined,cursorHooks:process.env.WL_FIXTURE_FORMAT==='cursor'?fs.existsSync('.cursor/hooks.json'):undefined,geminiPolicy:process.env.WL_FIXTURE_FORMAT==='gemini'?JSON.parse(fs.readFileSync(process.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH,'utf8')):undefined,agyAgent:format==='antigravity'?fs.readFileSync('.agents/agents/'+process.argv[process.argv.indexOf('--agent')+1]+'.md','utf8'):undefined})+'\\n')}
 log('start')
 if(mode==='crash' || (mode==='crash-vote' && a.role==='refute'))process.exit(7)
 if(mode==='timeout'){process.on('SIGTERM',()=>{});setInterval(()=>{},1000);return}
 if(mode==='overflow'){process.stdout.write('x'.repeat(1024*1024+1));return}
 if(mode==='mutate')fs.appendFileSync(a.repository+'/app.ts','// changed by fixture\\n')
 setTimeout(()=>{
  const result=a.role==='inspect'?{unit:mode==='wrong-unit'?'another':a.unit.id,status:'ok',evidence:['Observed fixture'],findings:process.env.WL_FIXTURE_FINDING==='yes' && a.unit.id===process.env.WL_FIXTURE_UNIT?[${JSON.stringify(defect)}]:[]}:{finding:a.unit.finding,verifier:a.unit.verifier,outcome:'refute',reason:'Fixture falsifying observation',evidence:['Observed counterexample']}
  if(format==='codex'&&a.role==='inspect')result.reason='Fixture inspection completed'
  const envelope={schema:'wholeloop/headless-result@1',assignment:mode==='wrong'?'different':a.assignment,run:a.run,round:a.round,[a.role==='inspect'?'result':'vote']:result}
  const text=mode==='malformed'?'not JSON':JSON.stringify(envelope)
  log('end')
  if(format==='antigravity')console.log(JSON.stringify({event:'result',result:{conversation_id:'fixture-session',status:'SUCCESS',num_turns:1,response:text}}))
  else if(format==='claude')process.stdout.write(JSON.stringify({is_error:false,result:text}))
  else if(format==='codex'){console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text}}));console.log(JSON.stringify({type:'turn.completed'}))}
  else if(format==='gemini')process.stdout.write(JSON.stringify({response:text,session_id:'fixture-session'}))
  else if(format==='cursor')process.stdout.write(JSON.stringify({type:'result',subtype:'success',is_error:false,result:text}))
  else if(format==='opencode'){
   if(process.env.WL_FIXTURE_FINAL_TEXT_ONLY==='yes'){
    console.log(JSON.stringify({type:'step_start',sessionID:'fixture-session',part:{sessionID:'fixture-session',messageID:'final',type:'step-start'}}))
    console.log(JSON.stringify({type:'text',sessionID:'fixture-session',part:{sessionID:'fixture-session',messageID:'final',type:'text',text:String.fromCharCode(96).repeat(3)+'json\\n'+text+'\\n'+String.fromCharCode(96).repeat(3),time:{start:0,end:1}}}))
   }else{console.log(JSON.stringify({type:'text',sessionID:'fixture-session',part:{messageID:'final',text,time:{end:1}}}));console.log(JSON.stringify({type:'step_finish',sessionID:'fixture-session',part:{messageID:'final',reason:'stop'}}))}
  }
  else process.stdout.write(text)
 },Number(process.env.WL_FIXTURE_DELAY||0))
})
`
async function fixture(
  run: (context: {
    dir: string
    engine: FlowEngine
    plan: GatePlan
    adapter: HeadlessAdapter
    env: NodeJS.ProcessEnv
  }) => Promise<void> | void,
) {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-fanout-'))
  const root = join(dir, 'repo with spaces')
  mkdirSync(root)
  const git = (...args: string[]) => {
    const result = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_GLOBAL: join(dir, 'no-global'), GIT_CONFIG_NOSYSTEM: '1' },
    })
    if (result.status !== 0) throw new Error('Fixture Git failed')
    return result.stdout
  }
  try {
    git('init', '-b', 'main')
    writeFileSync(join(root, 'app.ts'), 'export const value = 42\n')
    git('add', '.')
    git(
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.com',
      'commit',
      '-m',
      'feat: seed fanout fixture',
      '-m',
      'Pin an isolated repository for process checks.',
    )
    const engine = new FlowEngine(
      new StateStore(join(dir, 'state', 'wholeloop')),
      root,
      join(dir, 'user/config.yml'),
      join(dir, 'home'),
    )
    const subject = engine.store.create({
      kind: 'review',
      title: 'Fixture review',
      owner: 'Alex',
      body: '',
      repository: root,
    }).id
    const plan = new GateWorkflow(engine).plan(subject, 'review', { base: 'main' }).plan
    const script = join(dir, 'worker.cjs')
    writeFileSync(script, worker)
    chmodSync(script, 0o700)
    const adapter: HeadlessAdapter = {
      id: 'fixture',
      invocation: () => ({ command: process.execPath, args: [script] }),
      response: (stdout) => stdout,
    }
    const env = {
      WL_FIXTURE_LOG: join(dir, 'workers.ndjson'),
      WL_FIXTURE_UNIT: plan.units[0]?.id ?? '',
      WL_FIXTURE_FINDING: '',
      WL_FIXTURE_MODE: '',
      WL_FIXTURE_FORMAT: '',
      WL_FIXTURE_DELAY: '0',
    }
    await run({ dir, engine, plan, adapter, env })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('bounded headless gate processes', () => {
  it('starts no client when native encoding exceeds the assignment wire budget', () =>
    fixture(async ({ dir, engine, plan, adapter, env }) => {
      const sentinel = join(dir, 'encoded-input-must-not-launch')
      const oversized: HeadlessAdapter = {
        ...adapter,
        input: () => 'x'.repeat(2 * 1024 * 1024 + 1),
        invocation: () => ({
          command: process.execPath,
          args: [
            '-e',
            `require('node:fs').writeFileSync(${JSON.stringify(sentinel)},'unexpected')`,
          ],
        }),
      }
      expect(
        (await runHeadless(engine, plan.subject, 'review', { adapter: oversized, env })).status,
      ).toBe('FAIL')
      expect(existsSync(sentinel)).toBe(false)
    }))
  it('delivers no Antigravity assignment when its reported initialization contains a writer', () =>
    fixture(async ({ dir, engine, plan, env }) => {
      const bin = join(dir, 'agy-bin'),
        sentinel = join(dir, 'agy-must-not-receive')
      mkdirSync(bin)
      writeFileSync(
        join(bin, 'agy'),
        `#!${process.execPath}\nprocess.stdin.on('data',()=>require('node:fs').writeFileSync(${JSON.stringify(sentinel)},'unexpected'));console.log(JSON.stringify({event:'init',conversation_id:'fixture-session',init:{cwd:process.cwd(),tools:['view_file','write_to_file'],permission_mode:'request-review'}}));setInterval(()=>{},1000)\n`,
        { mode: 0o700 },
      )
      const result = await runHeadless(engine, plan.subject, 'review', {
        adapter: headlessAdapter('antigravity'),
        env: { ...env, PATH: `${bin}:${process.env.PATH}` },
        timeoutMs: 3000,
      })
      expect(result.status).toBe('FAIL')
      expect(result.workers.length).toBeGreaterThan(0)
      expect(result.workers.every((worker) => worker.status === 'crashed')).toBe(true)
      expect(existsSync(sentinel)).toBe(false)
    }))
  it('starts no Gemini client when the effective host environment selects managed settings', () =>
    fixture(async ({ dir, engine, plan, env }) => {
      const bin = join(dir, 'gemini-bin'),
        sentinel = join(dir, 'gemini-must-not-launch')
      mkdirSync(bin)
      writeFileSync(
        join(bin, 'gemini'),
        `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(sentinel)},'unexpected')\n`,
        { mode: 0o700 },
      )
      const result = await runHeadless(engine, plan.subject, 'review', {
        adapter: headlessAdapter('gemini'),
        env: {
          ...env,
          PATH: `${bin}:${process.env.PATH}`,
          GEMINI_CLI_SYSTEM_SETTINGS_PATH: join(dir, 'existing-native-settings.json'),
        },
      })
      expect(result.status).toBe('FAIL')
      expect(existsSync(sentinel)).toBe(false)
    }))
  it('starts no client when private native policy setup is refused', () =>
    fixture(async ({ dir, engine, plan, adapter, env }) => {
      const sentinel = join(dir, 'must-not-launch')
      const refused: HeadlessAdapter = {
        ...adapter,
        invocation: () => ({
          command: process.execPath,
          args: ['-e', `require('node:fs').writeFileSync(${JSON.stringify(sentinel)},'launched')`],
          files: new Map([['.cursor/cli.json', ' '.repeat(65537)]]),
        }),
      }
      const result = await runHeadless(engine, plan.subject, 'review', { adapter: refused, env })
      expect(result.status).toBe('FAIL')
      expect(existsSync(sentinel)).toBe(false)
    }))
  it(
    'collects real isolated processes and caches a decided round without respawning',
    () =>
      fixture(async ({ dir, engine, plan, adapter, env }) => {
        const result = await runHeadless(engine, plan.subject, 'review', {
          adapter,
          env,
          concurrency: 2,
        })
        expect(result.status).toBe('PASS')
        expect(result.workers).toHaveLength(plan.units.length)
        const log = readFileSync(join(dir, 'workers.ndjson'), 'utf8')
        const starts = log
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line))
          .filter((row) => row.action === 'start')
        expect(new Set(starts.map((row) => row.pid)).size).toBe(plan.units.length)
        expect(starts.every((row) => row.cwd.startsWith(engine.store.files.root))).toBe(true)
        expect(
          starts.every((row) => !JSON.stringify(row.args).includes('headless-assignment')),
        ).toBe(true)
        expect((await runHeadless(engine, plan.subject, 'review', { adapter, env })).cached).toBe(
          true,
        )
        expect(readFileSync(join(dir, 'workers.ndjson'), 'utf8')).toBe(log)
        expect(result.workers.every((row) => existsSync(engine.store.files.path(row.path)))).toBe(
          true,
        )
      }),
    15000,
  )
  it(
    'enforces the actual process concurrency limit across inspections and refutations',
    () =>
      fixture(async ({ dir, engine, plan, adapter, env }) => {
        const result = await runHeadless(engine, plan.subject, 'review', {
          adapter,
          env: { ...env, WL_FIXTURE_DELAY: '80', WL_FIXTURE_FINDING: 'yes' },
          concurrency: 2,
        })
        expect(result.status).toBe('PASS')
        const events = readFileSync(join(dir, 'workers.ndjson'), 'utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line))
        let active = 0
        let peak = 0
        for (const event of events) {
          active += event.action === 'start' ? 1 : -1
          peak = Math.max(peak, active)
        }
        expect(active).toBe(0)
        expect(peak).toBe(2)
        expect(result.workers.filter((row) => row.role === 'refute')).toHaveLength(plan.verifiers)
      }),
    15000,
  )
  it(
    'produces the same verdict and quorum as native and sequential hosts',
    () =>
      fixture(async ({ engine, plan, adapter, env }) => {
        const report = await runHeadless(engine, plan.subject, 'review', {
          adapter,
          env: { ...env, WL_FIXTURE_FINDING: 'yes' },
        })
        expect(report.verdict?.dropped).toHaveLength(1)
        for (const sequential of [false, true]) {
          const subject = engine.store.create({
            kind: 'review',
            title: 'Parity fixture',
            owner: 'Alex',
            body: '',
            repository: engine.root,
          }).id
          const workflow = new GateWorkflow(engine)
          const next = workflow.plan(subject, 'review', { base: 'main' }).plan
          const host: GateHost = {
            stopped: () => false,
            inspect: async (_plan, unit) => ({
              unit: unit.id,
              status: 'ok',
              evidence: ['Observed fixture'],
              findings: unit.id === env.WL_FIXTURE_UNIT ? [defect] : [],
            }),
            refute: async (_plan, finding, verifier) => ({
              finding,
              verifier,
              outcome: 'refute',
              reason: 'Fixture falsifying observation',
              evidence: ['Observed counterexample'],
            }),
          }
          await inspectGateRound(engine, next, host, sequential, () => {})
          expect(workflow.verdict(subject, 'review').report).toMatchObject(report.verdict ?? {})
        }
      }),
    20000,
  )
  it.each(['crash', 'timeout', 'overflow', 'wrong', 'wrong-unit', 'malformed'])(
    'reports %s workers as unavailable without claiming green',
    (mode) =>
      fixture(async ({ engine, plan, adapter, env }) => {
        const result = await runHeadless(engine, plan.subject, 'review', {
          adapter,
          env: { ...env, WL_FIXTURE_MODE: mode },
          timeoutMs: mode === 'timeout' ? 100 : 5000,
          concurrency: 4,
        })
        expect(result.status).toBe('FAIL')
        expect(result.verdict?.missing).toHaveLength(plan.units.length)
        expect(
          result.workers.every(
            (row) =>
              row.status ===
              (mode === 'crash'
                ? 'crashed'
                : ['wrong', 'wrong-unit', 'malformed'].includes(mode)
                  ? 'invalid'
                  : mode),
          ),
        ).toBe(true)
        expect(result.verdict?.dropped).toEqual([])
      }),
    15000,
  )
  it(
    'never counts a crashed refutation worker as an active vote',
    () =>
      fixture(async ({ engine, plan, adapter, env }) => {
        const result = await runHeadless(engine, plan.subject, 'review', {
          adapter,
          env: { ...env, WL_FIXTURE_FINDING: 'yes', WL_FIXTURE_MODE: 'crash-vote' },
        })
        expect(result.status).toBe('FAIL')
        expect(result.verdict?.kept[0]?.refutations).toBe(0)
        const round = gateRuns(engine.store.events()).find((run) => run.run === plan.run)?.rounds[0]
        expect(round?.votes).toEqual([])
        expect(
          result.workers
            .filter((row) => row.role === 'refute')
            .every((row) => row.status === 'crashed'),
        ).toBe(true)
      }),
    15000,
  )
  it(
    'cancels active and queued workers without deciding a partial round',
    () =>
      fixture(async ({ engine, plan, adapter, env }) => {
        const controller = new AbortController()
        setTimeout(() => controller.abort(), 100)
        const result = await runHeadless(engine, plan.subject, 'review', {
          adapter,
          env: { ...env, WL_FIXTURE_MODE: 'timeout' },
          signal: controller.signal,
          concurrency: 1,
        })
        expect(result.status).toBe('stopped')
        expect(result.verdict).toBeNull()
        expect(result.workers).toHaveLength(1)
        expect(result.workers[0]?.status).toBe('cancelled')
        expect(gateRuns(engine.store.events())[0]?.rounds[0]?.decision).toBeUndefined()
      }),
    15000,
  )
  it(
    'detects an observed repository write, preserves it and stops other workers',
    () =>
      fixture(async ({ engine, plan, adapter, env }) => {
        await expect(
          runHeadless(engine, plan.subject, 'review', {
            adapter,
            env: { ...env, WL_FIXTURE_MODE: 'mutate' },
            concurrency: 1,
          }),
        ).rejects.toThrow(/workspace changed/)
        expect(readFileSync(join(engine.root, 'app.ts'), 'utf8')).toContain('changed by fixture')
        expect(gateRuns(engine.store.events())[0]?.rounds[0]?.decision).toBeUndefined()
      }),
    15000,
  )
  it('refuses concurrent round ownership and never steals an unexplained lock', () =>
    fixture(async ({ engine, plan, adapter, env }) => {
      const lock = engine.store.files.path(`fanout/${plan.run}/${plan.round}/lock`)
      mkdirSync(lock, { recursive: true })
      await expect(runHeadless(engine, plan.subject, 'review', { adapter, env })).rejects.toThrow(
        /locked/,
      )
      expect(existsSync(lock)).toBe(true)
    }))
  it('requires planning and a real suite before verification fan-out', () =>
    fixture(async ({ engine, plan, adapter, env }) => {
      await expect(runHeadless(engine, plan.subject, 'verify', { adapter, env })).rejects.toThrow(
        /Plan the gate/,
      )
      new GateWorkflow(engine).plan(plan.subject, 'verify', {
        base: 'main',
        criteria: [
          { id: 'observed', text: 'Return status 200', test: 'Request and assert status 200' },
        ],
      })
      await expect(runHeadless(engine, plan.subject, 'verify', { adapter, env })).rejects.toThrow(
        /verify suite/,
      )
    }))
  it('rejects invalid resource budgets and unsupported recipes before starting workers', () =>
    fixture(({ engine, adapter }) => {
      for (const options of [
        { concurrency: 0 },
        { concurrency: 17 },
        { timeoutMs: 99 },
        { timeoutMs: 600001 },
        { timeoutMs: Number.NaN },
      ])
        expect(() => new HeadlessHost(engine, { adapter, ...options })).toThrow(/concurrency/)
      expect(() => headlessAdapter('unimplemented')).toThrow(/unimplemented/)
    }))
  it.each([
    'claude',
    'codex',
    'opencode',
    'opencode-v2',
    'copilot',
    'cursor',
    'gemini',
    'antigravity',
  ])(
    'executes compiled %s dispatch through a synthetic client on PATH',
    (selected) =>
      fixture(async ({ dir, engine, plan }) => {
        const id = selected === 'opencode-v2' ? 'opencode' : selected
        const bin = join(dir, 'bin')
        mkdirSync(bin)
        const executable = id === 'cursor' ? 'agent' : id === 'antigravity' ? 'agy' : id
        writeFileSync(join(bin, executable), worker)
        chmodSync(join(bin, executable), 0o700)
        const result = spawnSync(
          process.execPath,
          [
            resolve('dist/wl.mjs'),
            'fanout',
            'run',
            'review',
            '--for',
            plan.subject,
            '--engine',
            'headless',
            '--adapter',
            id,
            '--concurrency',
            '2',
            '--json',
          ],
          {
            cwd: engine.root,
            encoding: 'utf8',
            env: {
              ...process.env,
              PATH: `${bin}:${process.env.PATH}`,
              XDG_STATE_HOME: join(dir, 'state'),
              XDG_CONFIG_HOME: join(dir, 'user'),
              WL_WORKSPACE: '',
              WL_FIXTURE_FORMAT: id,
              ...(selected === 'opencode-v2'
                ? { WL_FIXTURE_NATIVE_VERSION: '2.1.1', WL_FIXTURE_FINAL_TEXT_ONLY: 'yes' }
                : {}),
              WL_FIXTURE_LOG: join(dir, 'compiled-workers.ndjson'),
              COPILOT_ALLOW_ALL: 'true',
              GITHUB_COPILOT_PROMPT_MODE_EXTENSIONS: 'true',
              OPENCODE_PERMISSION: '{"*":"allow"}',
            },
          },
        )
        expect(result.stderr).toBe('')
        expect(result.status).toBe(0)
        const payload = JSON.parse(result.stdout)
        expect(payload.status).toBe('PASS')
        expect(payload.workers).toHaveLength(plan.units.length)
        const starts = readFileSync(join(dir, 'compiled-workers.ndjson'), 'utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line))
          .filter((row) => row.action === 'start')
        expect(starts).toHaveLength(plan.units.length)
        for (const row of starts) {
          expect(row.cwd).not.toBe(engine.root)
          expect(row.args.some((arg: string) => arg.includes('headless-assignment'))).toBe(false)
          if (id === 'antigravity') {
            expect(row.agyAgent).toContain('tools: [view_file, grep_search]')
            expect(row.agyAgent).toContain('commandExecutionPolicy: "off"')
            expect(row.agyAgent).toContain('model: inherit')
          }
          if (id === 'codex') {
            expect(row.args).toContain('--output-schema')
            const schemaFile = row.args[row.args.indexOf('--output-schema') + 1]
            const schema = JSON.parse(readFileSync(schemaFile, 'utf8'))
            expect(schema.properties.schema.enum).toEqual(['wholeloop/headless-result@1'])
            expect(schema.properties.run.enum).toEqual([plan.run])
          }
          if (id === 'gemini') {
            expect(row.geminiPolicy.tools.core).toContain('read_file')
            expect(row.geminiPolicy.admin.mcp.enabled).toBe(false)
            expect(row.geminiPolicy.tools.enableHooks).toBe(false)
          }
          if (id === 'copilot') {
            expect(row.copilotAllowAll).toBe('false')
            expect(row.extensions).toBe('false')
          }
          if (id === 'opencode') {
            if (selected === 'opencode-v2') {
              expect(row.opencodePolicy.permissions[0]).toEqual({
                action: '*',
                resource: '*',
                effect: 'deny',
              })
              expect(row.args).toContain('--standalone')
              expect(row.args).not.toContain('--pure')
              expect(row.args).not.toContain('--dir')
            } else expect(row.opencodePermissions['*']).toBe('deny')
          }
          if (id === 'cursor') {
            expect(row.cursorPolicy.permissions.deny).toEqual([
              'Shell(*)',
              'Write(**)',
              'WebFetch(*)',
              'Mcp(*:*)',
            ])
            expect(row.cursorHooks).toBe(true)
          }
        }
      }),
    15000,
  )
  it('keeps recipe permissions explicit and rejects failed/missing final turns', () => {
    const claude = headlessAdapter('claude')
    const codex = headlessAdapter('codex')
    const context = { repository: '/repo with spaces', directory: '/external/workers/one' }
    expect(claude.invocation(context).args).toContain('Read,Glob,Grep')
    expect(claude.invocation(context).args).toContain('dontAsk')
    expect(codex.invocation(context).args).toContain('read-only')
    expect(codex.invocation(context).args).toContain('--ignore-user-config')
    expect(codex.invocation(context).args).not.toContain(context.repository)
    expect(() => claude.response('{"is_error":true,"result":"{}"}', '')).toThrow()
    expect(() => codex.response('{"type":"turn.failed"}', '')).toThrow()
    expect(() => codex.response('{"type":"turn.completed"}', '')).toThrow()
  })
})
