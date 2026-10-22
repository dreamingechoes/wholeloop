import { spawnSync } from 'node:child_process'
import {
  chmodSync,
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
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { bundledCanonical } from '../../../src/adapters/canonical.js'
import { generateAdapter } from '../../../src/adapters/generate.js'
import { openCodeMajor } from '../../../src/adapters/opencode-version.js'
import { writeAdapter } from '../../../src/adapters/write.js'
import { prepareConformance } from '../../../src/conformance/prepare.js'
import {
  expectedArtifact,
  inspectArtifact,
  openCodeVersionProbe,
} from '../../../src/diagnostics/doctor.js'
import { headlessAdapter } from '../../../src/fanout/adapters.js'
import { stageWorkerPolicy } from '../../../src/fanout/policy-files.js'
import { installationPlan } from '../../../src/installation/plan.js'

const core = () => readFileSync(resolve('dist/wl.mjs'), 'utf8')
const legacy = 'export const Wholeloop ='
const modern = "id:'wholeloop.guard'"
const start = {
  type: 'step_start',
  sessionID: 'fixture',
  part: { type: 'step-start', sessionID: 'fixture', messageID: 'final' },
}
const text = {
  type: 'text',
  sessionID: 'fixture',
  part: {
    type: 'text',
    sessionID: 'fixture',
    messageID: 'final',
    text: '{"result":true}',
    time: { start: 0, end: 1 },
  },
}
const jsonl = (events: unknown[]) => events.map((value) => JSON.stringify(value)).join('\n')

describe('version-specific OpenCode transport', () => {
  it('accepts V2 completed final text after clean process exit without weakening the V1 parser', () => {
    expect(headlessAdapter('opencode', '2.1.1').response(jsonl([start, text]), '')).toBe(
      '{"result":true}',
    )
    expect(() => headlessAdapter('opencode', '1.17.9').response(jsonl([start, text]), '')).toThrow(
      /completed/,
    )
  })
  it('allows a recovered terminal tool error before the final step', () => {
    const earlier = { ...start, part: { ...start.part, messageID: 'earlier' } }
    const failed = {
      type: 'tool_use',
      sessionID: 'fixture',
      part: {
        sessionID: 'fixture',
        messageID: 'earlier',
        state: { status: 'error', error: 'Synthetic missing optional guidance' },
      },
    }
    expect(
      headlessAdapter('opencode', '2.1.1').response(jsonl([earlier, failed, start, text]), ''),
    ).toBe('{"result":true}')
  })
  it.each(['```json\n{"result":true}\n```', '```\n{"result":true}\n```'])(
    'decodes one exact JSON fence only after native completion: %s',
    (value) => {
      const final = { ...text, part: { ...text.part, text: value } }
      expect(headlessAdapter('opencode', '2.1.1').response(jsonl([start, final]), '')).toBe(
        '{"result":true}',
      )
    },
  )
  it.each([
    'Explanation\n```json\n{"result":true}\n```',
    '```json\n{"result":true}\n```\nExplanation',
    '```js\n{"result":true}\n```',
    '```json\n{}\n```\n```json\n{}\n```',
    '```json\n[1,2]\n```',
    '```json\nnull\n```',
    '```json\n{"unfinished":\n```',
  ])('rejects prose, ambiguous fences and nonobject results: %s', (value) => {
    const final = { ...text, part: { ...text.part, text: value } }
    expect(() =>
      JSON.parse(headlessAdapter('opencode', '2.1.1').response(jsonl([start, final]), '')),
    ).toThrow()
  })
  it.each([
    [],
    [text],
    [start],
    [start, { ...text, sessionID: 'other' }],
    [start, { ...text, part: { ...text.part, messageID: 'earlier' } }],
    [start, { ...text, part: { ...text.part, time: { start: 0 } } }],
    [start, { ...text, part: { ...text.part, time: { start: 2, end: 1 } } }],
    [start, text, { type: 'error', sessionID: 'fixture' }],
    [start, text, start],
    [
      start,
      text,
      {
        type: 'tool_use',
        sessionID: 'fixture',
        part: { sessionID: 'fixture', state: { status: 'running' } },
      },
    ],
  ])('refuses incomplete, mixed or nonterminal V2 streams %#', (...events) => {
    expect(() => headlessAdapter('opencode', '2.1.1').response(jsonl(events), '')).toThrow()
  })
  it('isolates native version side effects and selects V2 during compiled dry-run/install/doctor', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wl-opencode-probe-'))
    try {
      const home = join(dir, 'home'),
        project = join(dir, 'project'),
        bin = join(dir, 'bin'),
        audit = join(dir, 'probe-home')
      for (const path of [home, project, bin]) mkdirSync(path)
      writeFileSync(join(project, 'README.md'), '# Synthetic project\n')
      expect(
        spawnSync('git', ['-c', 'init.templateDir=', 'init', '-b', 'fixture'], { cwd: project })
          .status,
      ).toBe(0)
      const executable = join(bin, 'opencode')
      writeFileSync(
        executable,
        `#!/usr/bin/env node\nconst fs=require('node:fs');fs.writeFileSync(process.env.HOME+'/native-log','synthetic');fs.writeFileSync(${JSON.stringify(audit)},process.env.HOME);console.log('2.1.1')\n`,
      )
      chmodSync(executable, 0o700)
      const env = { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}` }
      expect(openCodeVersionProbe(env, project)).toMatchObject({
        status: 'observed',
        version: '2.1.1',
      })
      expect(readdirSync(home)).toEqual([])
      expect(existsSync(readFileSync(audit, 'utf8'))).toBe(false)
      const invoke = (args: string[]) =>
        spawnSync(process.execPath, [resolve('dist/wl.mjs'), ...args, '--json'], {
          cwd: project,
          env,
          encoding: 'utf8',
        })
      const args = [
        'install',
        '--target',
        'opencode',
        '--scope',
        'project',
        '--store',
        join(dir, 'state'),
      ]
      const dry = invoke([...args, '--dry-run'])
      expect(dry.status, dry.stderr).toBe(0)
      expect(JSON.parse(dry.stdout).status).toBe('planned')
      expect(readdirSync(project).sort()).toEqual(['.git', 'README.md'])
      expect(readdirSync(home)).toEqual([])
      const installed = invoke(args)
      expect(installed.status, installed.stderr).toBe(0)
      expect(readFileSync(join(project, '.opencode/plugins/wholeloop.js'), 'utf8')).toContain(
        modern,
      )
      const report = JSON.parse(
        invoke([
          'doctor',
          '--target',
          'opencode',
          '--store',
          join(dir, 'state'),
          '--artifact',
          join(project, '.wholeloop/distribution/opencode'),
        ]).stdout,
      )
      expect(report.checks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'installation.project', status: 'pass' }),
          expect.objectContaining({ id: 'artifacts', status: 'pass' }),
        ]),
      )
      expect(readdirSync(home)).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 15000)
  it('verifies either known standalone dialect by bytes without guessing from the local client', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wl-opencode-inspection-'))
    try {
      const canonical = bundledCanonical(),
        compiled = core()
      for (const version of ['1.17.9', '2.1.1']) {
        const path = join(dir, version)
        const generated = generateAdapter('opencode', canonical, compiled, '0.0.0', version)
        writeAdapter(path, generated)
        expect(
          inspectArtifact(path, expectedArtifact('opencode', path, canonical, compiled, '0.0.0')),
        ).toEqual(generated.manifest)
      }
      const path = join(dir, '2.1.1')
      writeFileSync(join(path, '.opencode/plugins/wholeloop.js'), 'export default {}\n')
      expect(() =>
        inspectArtifact(path, expectedArtifact('opencode', path, canonical, compiled, '0.0.0')),
      ).toThrow(/missing|changed|stale/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
  it('refuses a dialect hint reached through an escaping parent or root symlink', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wl-opencode-hint-'))
    try {
      const canonical = bundledCanonical(),
        compiled = core(),
        outside = join(dir, 'outside'),
        selected = join(dir, 'selected')
      writeAdapter(outside, generateAdapter('opencode', canonical, compiled, '0.0.0', '2.1.1'))
      mkdirSync(selected)
      symlinkSync(join(outside, '.opencode'), join(selected, '.opencode'), 'dir')
      const alias = join(dir, 'root-alias')
      symlinkSync(outside, alias, 'dir')
      for (const path of [selected, alias]) {
        expect(
          expectedArtifact('opencode', path, canonical, compiled, '0.0.0').files.get(
            '.opencode/plugins/wholeloop.js',
          )?.content,
        ).toContain(legacy)
        expect(() =>
          inspectArtifact(path, expectedArtifact('opencode', path, canonical, compiled, '0.0.0')),
        ).toThrow()
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
  it('stages V2 native rules, denies unbounded search and clears inherited V1 overrides', () => {
    const directory = mkdtempSync(join(tmpdir(), 'wl-opencode-worker-'))
    try {
      const repository = '/synthetic repository'
      const adapter = headlessAdapter('opencode', '2.1.1')
      const invocation = adapter.invocation({ repository, directory })
      expect(invocation.args).toEqual([
        'run',
        '--standalone',
        '--format',
        'json',
        '--agent',
        expect.stringMatching(/^wholeloop-inspector-/),
      ])
      expect(invocation.env).toHaveProperty('OPENCODE_CONFIG_CONTENT', undefined)
      expect(invocation.env).toHaveProperty('OPENCODE_PERMISSION', undefined)
      expect(invocation.env?.XDG_CONFIG_HOME).toBe(join(directory, '.native-config'))
      stageWorkerPolicy(directory, invocation.files)
      const policy = JSON.parse(
        readFileSync(join(directory, '.native-config/opencode/opencode.json'), 'utf8'),
      )
      expect(policy.policies).toEqual([
        { action: 'integration.use', resource: 'mcp:*', effect: 'deny' },
        { action: 'integration.use', resource: 'skill:*', effect: 'deny' },
      ])
      const agent = invocation.args.at(-1) ?? ''
      expect(policy.agents[agent].permissions).toEqual(policy.permissions)
      const match = (pattern: string, value: string) =>
        new RegExp(
          `^${pattern
            .split('*')
            .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('.*')}$`,
        ).test(value)
      const effect = (action: string, resource: string) =>
        policy.permissions
          .filter(
            (rule: { action: string; resource: string }) =>
              match(rule.action, action) && match(rule.resource, resource),
          )
          .at(-1)?.effect
      for (const action of [
        'shell',
        'edit',
        'subagent',
        'execute',
        'grep',
        'glob',
        'webfetch',
        'unknown_mcp_tool',
      ])
        expect(effect(action, '*')).toBe('deny')
      expect(effect('read', 'README.md')).toBe('allow')
      expect(effect('read', `${repository}/.env`)).toBe('deny')
      expect(effect('read', `${repository}/.env.local`)).toBe('deny')
      expect(effect('read', `${repository}/.env.example`)).toBe('allow')
      expect(effect('external_directory', `${repository}/nested/*`)).toBe('allow')
      expect(effect('external_directory', '/unrelated/private/*')).toBe('deny')
      expect(effect('external_directory', `${repository}-other/*`)).toBe('deny')
      expect(() => stageWorkerPolicy(directory, invocation.files)).toThrow(/already exists/)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
  it.each(['', 'latest', '2', '2.1', '3.0.0', '../2.1.1'])(
    'refuses an unsupported or ambiguous native version %s',
    (version) => {
      expect(() => openCodeMajor(version)).toThrow(/exact supported/)
    },
  )
  it('preserves the legacy render by default and chooses V2 only from an explicit exact pin', () => {
    const sources = bundledCanonical()
    const before = generateAdapter('opencode', sources, core(), '0.0.0')
    const pinned = generateAdapter('opencode', sources, core(), '0.0.0', '1.17.9')
    expect(pinned).toEqual(before)
    const after = generateAdapter('opencode', sources, core(), '0.0.0', '2.1.1')
    expect(before.files.get('.opencode/plugins/wholeloop.js')?.content).toContain(legacy)
    expect(after.files.get('.opencode/plugins/wholeloop.js')?.content).toContain(modern)
    expect(after.manifest.source).toBe(before.manifest.source)
    expect(after.manifest.core).toBe(before.manifest.core)
    expect(after.manifest.capabilities.conformance).toBe('unverified')
  })
  it('propagates the exact conformance pin and managed installation dialect', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wl-opencode-version-'))
    try {
      const context = {
        store: join(dir, 'state'),
        canonical: bundledCanonical(),
        core: core(),
        version: '0.0.0',
      }
      const run = prepareConformance(context, 'opencode', '2.1.1')
      expect(readFileSync(join(run.root, '.opencode/plugins/wholeloop.js'), 'utf8')).toContain(
        modern,
      )
      const plan = installationPlan(
        'opencode',
        {
          root: run.root,
          home: dir,
          store: context.store,
          scope: 'project',
          opencodeVersion: '2.1.1',
        },
        join(run.root, 'artifact'),
        context.canonical,
        context.core,
        context.version,
      )
      expect(
        plan.files.find((file) => file.path === join(run.root, '.opencode/plugins/wholeloop.js'))
          ?.content,
      ).toContain(modern)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
  it('executes V2 guard callbacks using session location, patch destinations and fail-closed context', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wl-opencode-guard-'))
    try {
      const repository = join(dir, 'repository')
      mkdirSync(repository)
      writeFileSync(join(repository, 'README.md'), '# Synthetic repository\n')
      expect(
        spawnSync('git', ['-c', 'init.templateDir=', 'init', '-b', 'fixture'], { cwd: repository })
          .status,
      ).toBe(0)
      const output = join(dir, 'artifact')
      writeAdapter(
        output,
        generateAdapter('opencode', bundledCanonical(), core(), '0.0.0', '2.1.1'),
      )
      const plugin = join(output, '.opencode/plugins/wholeloop.mjs')
      writeFileSync(plugin, readFileSync(join(output, '.opencode/plugins/wholeloop.js')))
      const script = `
import assert from 'node:assert/strict'
import plugin from ${JSON.stringify(pathToFileURL(plugin).href)}
let before
await plugin.setup({location:{directory:${JSON.stringify(dir)}},session:{get:async({sessionID})=>{
 if(sessionID==='missing')throw new Error('Synthetic private context')
 return {location:{directory:sessionID==='relative'?'relative':${JSON.stringify(repository)}}}
}},tool:{hook:async(name,callback)=>{assert.equal(name,'execute.before');before=callback}}})
const call=(tool,input,sessionID='fixture')=>before({tool,input,sessionID})
await call('read',{filePath:'README.md'})
await assert.rejects(call('write',{filePath:'.wholeloop/runtime/item'}),/runtime/)
await assert.rejects(call('patch',{patchText:'*** Begin Patch\\n*** Add File: .wholeloop/runtime/item\\n+x\\n*** End Patch'}),/runtime/)
await assert.rejects(call('patch',{}),/explicit destinations/)
await assert.rejects(call('read',{},'missing'),/session context is unavailable/)
await assert.rejects(call('read',{},'relative'),/session context is unavailable/)
await assert.rejects(before({tool:'read',input:{}}),/session context is unavailable/)
`
      const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
        cwd: repository,
        encoding: 'utf8',
      })
      expect(result.status, result.stderr).toBe(0)
      expect(result.stdout).toBe('')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 15000)
  it('exposes explicit native builds without changing the existing build command', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wl-opencode-build-'))
    try {
      const invoke = (pin: string) =>
        spawnSync(
          process.execPath,
          [
            resolve('dist/wl.mjs'),
            'adapter',
            'build-native',
            '--target',
            'opencode',
            '--pin',
            pin,
            '--out',
            join(dir, pin),
            '--json',
          ],
          { encoding: 'utf8' },
        )
      const result = invoke('2.1.1')
      expect(result.status, result.stderr).toBe(0)
      expect(JSON.parse(result.stdout).schema).toBe('wholeloop/adapter-build@1')
      expect(readFileSync(join(dir, '2.1.1/.opencode/plugins/wholeloop.js'), 'utf8')).toContain(
        modern,
      )
      expect(invoke('3.0.0').status).toBe(3)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
