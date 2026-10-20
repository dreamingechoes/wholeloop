import { spawnSync } from 'node:child_process'
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { headlessAdapter } from '../../../src/fanout/adapters.js'
import { cursorWorkerHook } from '../../../src/fanout/cursor.js'
import { stageWorkerPolicy, type WorkerPolicyFile } from '../../../src/fanout/policy-files.js'

function fixture(run: (root: string, repository: string, directory: string) => void) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-cursor-worker-')))
  const repository = join(root, "repo ' # $ with spaces"),
    directory = join(root, 'external worker')
  mkdirSync(repository)
  mkdirSync(directory)
  try {
    run(root, repository, directory)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}
describe('Cursor read-only headless policy', () => {
  it('stages private policy before launch without writing repository or personal settings', () =>
    fixture((root, repository, directory) => {
      const invocation = headlessAdapter('cursor').invocation({ repository, directory })
      expect(invocation.command).toBe('agent')
      expect(invocation.args).toEqual([
        '--print',
        '--output-format',
        'json',
        '--mode',
        'ask',
        '--sandbox',
        'enabled',
        '--workspace',
        directory,
        '--add-dir',
        repository,
      ])
      stageWorkerPolicy(directory, invocation.files)
      expect(readdirSync(repository)).toEqual([])
      expect(readdirSync(root).sort()).toEqual(['external worker', "repo ' # $ with spaces"])
      expect(lstatSync(join(directory, '.cursor/cli.json')).mode & 0o777).toBe(0o600)
      const policy = JSON.parse(readFileSync(join(directory, '.cursor/cli.json'), 'utf8'))
      expect(policy.permissions.allow).toEqual([`Read(${repository}/**)`, `Read(${directory}/**)`])
      expect(policy.permissions.deny).toEqual(['Shell(*)', 'Write(**)', 'WebFetch(*)', 'Mcp(*:*)'])
      const hooks = JSON.parse(readFileSync(join(directory, '.cursor/hooks.json'), 'utf8'))
      expect(hooks.hooks.preToolUse[0]).toMatchObject({
        type: 'command',
        matcher: '.*',
        failClosed: true,
      })
    }))
  it.each(['Read', 'ReadFile', 'read_file', 'Glob', 'glob', 'Grep', 'grep', 'LS', 'list_dir'])(
    'runs the actual hook command for %s without granting over native permissions',
    (tool_name) =>
      fixture((_root, repository, directory) => {
        const command = cursorWorkerHook(repository, directory).hooks.preToolUse[0]?.command ?? ''
        const response = spawnSync('/bin/sh', ['-c', command], {
          cwd: directory,
          encoding: 'utf8',
          input: JSON.stringify({
            tool_name,
            tool_input: { path: repository },
            cwd: directory,
            workspace_roots: [directory, repository],
          }),
        })
        expect(response.status, response.stderr).toBe(0)
        expect(JSON.parse(response.stdout)).toEqual({})
      }),
  )
  it.each([
    'Shell',
    'Write',
    'Delete',
    'WebFetch',
    'WebSearch',
    'Mcp',
    'Task',
    'AskUserQuestion',
    'remember',
    'unknown',
  ])('denies %s through the actual hook transport', (tool_name) =>
    fixture((_root, repository, directory) => {
      const command = cursorWorkerHook(repository, directory).hooks.preToolUse[0]?.command ?? ''
      const response = spawnSync('/bin/sh', ['-c', command], {
        encoding: 'utf8',
        input: JSON.stringify({
          tool_name,
          tool_input: {},
          cwd: directory,
          workspace_roots: [directory, repository],
        }),
      })
      expect(response.status, response.stderr).toBe(0)
      expect(JSON.parse(response.stdout).permission).toBe('deny')
    }),
  )
  it('refuses malformed, oversized, missing-context and foreign-workspace reads plus missing Node', () =>
    fixture((root, repository, directory) => {
      const command = cursorWorkerHook(repository, directory).hooks.preToolUse[0]?.command ?? ''
      const payload = {
        tool_name: 'Read',
        tool_input: {},
        cwd: directory,
        workspace_roots: [directory, repository],
      }
      for (const input of [
        'secret-invalid-json',
        ' '.repeat(65537),
        JSON.stringify({ tool_name: 'Read', tool_input: {} }),
        JSON.stringify({ ...payload, workspace_roots: [root] }),
        JSON.stringify({ ...payload, cwd: root }),
        JSON.stringify({ ...payload, tool_input: [] }),
      ]) {
        const result = spawnSync('/bin/sh', ['-c', command], { input, encoding: 'utf8' })
        expect(result.status).toBe(0)
        expect(JSON.parse(result.stdout).permission).toBe('deny')
        expect(result.stdout).not.toContain('secret-invalid-json')
      }
      const missing = command.replace(
        `'${process.execPath.replaceAll("'", "'\\''")}'`,
        "'/missing-wholeloop-worker-node'",
      )
      const result = spawnSync('/bin/sh', ['-c', missing], {
        input: JSON.stringify(payload),
        encoding: 'utf8',
      })
      expect(result.status).toBe(0)
      expect(JSON.parse(result.stdout).permission).toBe('deny')
    }))
  it('preflights every policy output and preserves an existing second file', () =>
    fixture((_root, repository, directory) => {
      mkdirSync(join(directory, '.cursor'))
      writeFileSync(join(directory, '.cursor/hooks.json'), 'owner policy')
      const invocation = headlessAdapter('cursor').invocation({ repository, directory })
      expect(() => stageWorkerPolicy(directory, invocation.files)).toThrow(/already exists/)
      expect(readdirSync(join(directory, '.cursor'))).toEqual(['hooks.json'])
      expect(readFileSync(join(directory, '.cursor/hooks.json'), 'utf8')).toBe('owner policy')
    }))
  it('refuses symlink parents and files, traversal and oversized policy before writing', () =>
    fixture((root, repository, directory) => {
      const files = headlessAdapter('cursor').invocation({ repository, directory }).files
      symlinkSync(repository, join(directory, '.cursor'))
      expect(() => stageWorkerPolicy(directory, files)).toThrow(/Unsafe/)
      expect(readdirSync(repository)).toEqual([])
      unlinkSync(join(directory, '.cursor'))
      for (const [name, content] of [
        ['../escape.json', '{}'],
        ['.cursor/cli.json', ' '.repeat(65537)],
      ]) {
        expect(() =>
          stageWorkerPolicy(directory, new Map([[name as WorkerPolicyFile, content ?? '']])),
        ).toThrow(/Unsupported|oversized/)
        expect(readdirSync(directory)).toEqual([])
      }
      mkdirSync(join(directory, '.cursor'))
      symlinkSync(join(root, 'missing'), join(directory, '.cursor/cli.json'))
      expect(() => stageWorkerPolicy(directory, files)).toThrow(/already exists/)
    }))
  it.each(['relative', '/repo*', '/repo?', '/repo(test)', '/repo[1]', '/repo\nname'])(
    'refuses ambiguous permission path %s',
    (repository) => {
      expect(() =>
        headlessAdapter('cursor').invocation({ repository, directory: '/external/one' }),
      ).toThrow(/absolute paths/)
    },
  )
  it('accepts only a successful native final result', () => {
    const adapter = headlessAdapter('cursor')
    expect(
      adapter.response(
        JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: '{}' }),
        '',
      ),
    ).toBe('{}')
    for (const value of [
      { result: '{}' },
      { type: 'result', subtype: 'success', is_error: true, result: '{}' },
      { type: 'result', subtype: 'error', is_error: false, result: '{}' },
      { type: 'result', subtype: 'success', is_error: false, result: '' },
    ])
      expect(() => adapter.response(JSON.stringify(value), '')).toThrow()
    expect(() => adapter.response('{}\n{}', '')).toThrow()
  })
})
