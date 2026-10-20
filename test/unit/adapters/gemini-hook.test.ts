import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { generateAdapter } from '../../../src/adapters/generate.js'
import { writeAdapter } from '../../../src/adapters/write.js'
import { normalizeTool } from '../../../src/guards/normalize.js'
import { canonicalPath } from '../../../src/state/paths.js'

const core = () => readFileSync(resolve('dist/wl.mjs'), 'utf8')
const canonical = new Map([
  [
    'harness/agents/reviewer.md',
    '---\nname: reviewer\ndescription: Observe fixture evidence.\nmetadata:\n  wholeloop.capabilities: read\n---\n# Review\n\nReport observed evidence.\n',
  ],
  [
    'harness/skills/next/SKILL.md',
    '---\nname: next\ndescription: Continue fixture work.\n---\n# Next\n\nRun wl next --json.\n',
  ],
])
function fixture(
  operation: (context: {
    root: string
    extension: string
    invoke: (input: unknown, override?: NodeJS.ProcessEnv) => { decision: string; reason?: string }
    command: string
    native: { env: Record<string, string>; timeout: number }
  }) => void,
  source = core(),
) {
  const dir = canonicalPath(mkdtempSync(join(tmpdir(), 'wl-gemini-hook-')))
  try {
    const root = join(dir, 'repository')
    const home = join(dir, 'home')
    const extension = join(dir, "extension ' # $(touch PWNED)")
    mkdirSync(root)
    mkdirSync(home)
    expect(spawnSync('git', ['init'], { cwd: root, encoding: 'utf8' }).status).toBe(0)
    const rendered = generateAdapter('gemini', canonical, source, '0.0.0')
    writeAdapter(extension, rendered)
    const native = JSON.parse(rendered.files.get('hooks/hooks.json')?.content ?? '{}').hooks
      .BeforeTool[0].hooks[0]
    const command = native.command as string
    const invoke = (input: unknown, override: NodeJS.ProcessEnv = {}) => {
      const result = spawnSync('/bin/sh', ['-c', command], {
        cwd: root,
        env: {
          ...process.env,
          HOME: home,
          XDG_CONFIG_HOME: join(home, 'config'),
          XDG_STATE_HOME: join(home, 'state'),
          PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ''}`,
          WL_GEMINI_EXTENSION_ROOT: extension,
          ...override,
        },
        input: typeof input === 'string' ? input : JSON.stringify(input),
        encoding: 'utf8',
        timeout: 12000,
        maxBuffer: 65536,
      })
      expect(result.status, result.stderr).toBe(0)
      expect(result.stdout).not.toContain('PRIVATE_BODY')
      return JSON.parse(result.stdout)
    }
    operation({ root, extension, invoke, command, native })
    expect(existsSync(join(root, 'PWNED'))).toBe(false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
const payload = (cwd: string, tool_name = 'read_file', tool_input: object = {}) => ({
  hook_event_name: 'BeforeTool',
  cwd,
  tool_name,
  tool_input,
})

describe('Gemini environment-bound native hook', () => {
  it('keeps hydrated paths out of shell text and preserves default native permissions', () =>
    fixture(({ root, invoke, command, native }) => {
      expect(native.env).toEqual({ WL_GEMINI_EXTENSION_ROOT: `\${extensionPath}` })
      expect(native.timeout).toBe(15000)
      expect(command).not.toContain(`\${extensionPath}`)
      expect(invoke(payload(root, 'read_file', { file_path: join(root, 'README.md') }))).toEqual({
        decision: 'allow',
      })
      expect(
        invoke(
          payload(root, 'write_file', {
            file_path: join(root, '.wholeloop/state/private.json'),
            content: 'PRIVATE_BODY',
          }),
        ),
      ).toMatchObject({ decision: 'deny', reason: expect.stringContaining('runtime artifacts') })
      expect(
        invoke(payload(root, 'run_shell_command', { command: 'git push origin main' })).decision,
      ).toBe('deny')
    }))
  it('rejects absent, relative or unresolved roots and malformed native context', () =>
    fixture(({ root, invoke }) => {
      for (const value of [undefined, 'relative', `\${extensionPath}`, join(root, 'missing')])
        expect(invoke(payload(root), { WL_GEMINI_EXTENSION_ROOT: value }).decision).toBe('deny')
      expect(
        invoke({ tool_name: 'read_file', tool_input: { content: 'PRIVATE_BODY' } }).decision,
      ).toBe('deny')
      expect(invoke('PRIVATE_BODY').decision).toBe('deny')
    }))
  it('refuses changed core bytes, target metadata and oversized payloads', () =>
    fixture(({ root, extension, invoke }) => {
      const manifestPath = join(extension, 'wholeloop-artifacts.json')
      const manifest = readFileSync(manifestPath, 'utf8')
      writeFileSync(
        manifestPath,
        JSON.stringify({ ...JSON.parse(manifest), target: 'antigravity' }),
      )
      expect(invoke(payload(root)).decision).toBe('deny')
      writeFileSync(manifestPath, manifest)
      const originalCore = readFileSync(join(extension, 'bin/wl.mjs'), 'utf8')
      writeFileSync(join(extension, 'bin/wl.mjs'), '#!/usr/bin/env node\n')
      expect(invoke(payload(root)).decision).toBe('deny')
      writeFileSync(join(extension, 'bin/wl.mjs'), originalCore)
      expect(invoke(payload(root))).toEqual({ decision: 'allow' })
      expect(invoke({ ...payload(root), ignored: 'x'.repeat(2 * 1024 * 1024) }).decision).toBe(
        'deny',
      )
    }))
  it('returns a native deny even when Node cannot be found', () =>
    fixture(({ root, invoke }) => {
      expect(invoke(payload(root), { PATH: '' })).toEqual({
        decision: 'deny',
        reason: 'wholeloop guard could not start.',
      })
    }))
  it('bounds an unresponsive pinned core independently of the native hook deadline', () =>
    fixture(({ root, invoke }) => {
      const started = Date.now()
      expect(invoke(payload(root)).decision).toBe('deny')
      expect(Date.now() - started).toBeLessThan(10000)
    }, '#!/usr/bin/env node\nsetInterval(() => {}, 1000)\n'))
  it('honors the actual Gemini shell dir_path before classifying a Git command', () => {
    const tool = normalizeTool(
      payload('/workspace/project', 'run_shell_command', {
        command: 'git push origin main',
        dir_path: 'nested',
        cwd: '/ignored-cwd',
        workdir: '/ignored-workdir',
      }),
      '/workspace/project',
    )
    expect(tool.cwd).toBe('/workspace/project/nested')
    expect(tool.kind).toBe('shell')
  })
})
