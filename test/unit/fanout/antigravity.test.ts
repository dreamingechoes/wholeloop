import { spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { headlessAdapter } from '../../../src/fanout/adapters.js'
import { antigravityInit, antigravityWorkerHook } from '../../../src/fanout/antigravity.js'
import { stageWorkerPolicy, type WorkerPolicyFile } from '../../../src/fanout/policy-files.js'

function init(directory = '/worker') {
  return {
    event: 'init',
    conversation_id: 'fixture-session',
    init: {
      cwd: directory,
      tools: ['view_file', 'grep_search'],
      permission_mode: 'request-review',
    },
  }
}
const final = () => ({
  event: 'result',
  result: {
    conversation_id: 'fixture-session',
    status: 'SUCCESS',
    num_turns: 1,
    response: '{"result":true}',
  },
})
const stream = (...events: unknown[]) => events.map((e) => JSON.stringify(e)).join('\n')
function fixture(operation: (root: string, repository: string, directory: string) => void) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-agy-worker-'))),
    repository = join(root, "repo ' # $ with spaces"),
    directory = join(root, 'worker')
  mkdirSync(repository)
  mkdirSync(directory)
  try {
    operation(root, repository, directory)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('Antigravity read-only native initialization contract', () => {
  it('stages a unique private primary observer and requires readiness before JSONL input', () =>
    fixture((_root, repository, directory) => {
      const adapter = headlessAdapter('antigravity'),
        invocation = adapter.invocation({ repository, directory })
      expect(invocation.command).toBe('agy')
      expect(invocation.args).toEqual([
        '--input-format',
        'stream-json',
        '--output-format',
        'stream-json',
        '--agent',
        expect.stringMatching(/^wholeloop-observer-[a-f0-9]{16}$/),
        '--sandbox',
      ])
      const name = invocation.args[5]
      if (!name) throw new Error('Missing fixture agent')
      stageWorkerPolicy(directory, invocation.files)
      const agent = parse(
        readFileSync(join(directory, `.agents/agents/${name}.md`), 'utf8').split('---')[1] ?? '',
      )
      expect(agent).toMatchObject({
        name,
        tools: ['view_file', 'grep_search'],
        mainAgent: true,
        subagent: false,
        model: 'inherit',
        commandExecutionPolicy: 'off',
        mcpServers: [],
        skills: [],
        plugins: [],
      })
      expect(invocation.readyLine?.(JSON.stringify(init(directory)))).toBe(true)
      expect(JSON.parse(adapter.input?.('{"assignment":"fixture"}') ?? '')).toEqual({
        event: 'user',
        message: { content: '{"assignment":"fixture"}' },
      })
      expect(readdirSync(repository)).toEqual([])
      expect(() => stageWorkerPolicy(directory, invocation.files)).toThrow(/already exists/)
    }))
  it.each(['write', 'empty', 'duplicate', 'cwd', 'permission', 'conversation', 'event'])(
    'refuses %s startup observations',
    (kind) => {
      const value = init()
      if (kind === 'write') value.init.tools.push('write_to_file')
      if (kind === 'empty') value.init.tools = []
      if (kind === 'duplicate') value.init.tools = ['view_file', 'view_file']
      if (kind === 'cwd') value.init.cwd = '/other'
      if (kind === 'permission') value.init.permission_mode = 'always-proceed'
      if (kind === 'conversation') value.conversation_id = 'fixture\n'
      if (kind === 'event') value.event = 'result'
      expect(() => antigravityInit(JSON.stringify(value), '/worker')).toThrow()
    },
  )
  it('accepts only one fresh matching successful native result', () => {
    const adapter = headlessAdapter('antigravity')
    expect(
      adapter.response(
        stream(
          init(),
          { event: 'step_update', step_update: { conversation_id: 'fixture-session' } },
          final(),
        ),
        '/worker',
      ),
    ).toBe('{"result":true}')
    for (const events of [
      [init()],
      [init(), init(), final()],
      [init(), final(), final()],
      [init(), { event: 'error' }, final()],
      [init(), { event: 'step_update', step_update: { conversation_id: 'other' } }, final()],
    ])
      expect(() => adapter.response(stream(...events), '/worker')).toThrow()
    for (const changed of [
      { status: 'ERROR' },
      { conversation_id: 'other' },
      { num_turns: 2 },
      { response: '' },
      { error: 'fixture failure' },
    ]) {
      const result = final()
      Object.assign(result.result, changed)
      expect(() => adapter.response(stream(init(), result), '/worker')).toThrow()
    }
  })
})

describe('Antigravity positive read-only hook transport', () => {
  it.each(['view_file', 'grep_search'])(
    'delegates %s to native policy without permission overrides',
    (tool) =>
      fixture((_root, repository, directory) => {
        const path = join(repository, 'evidence.txt')
        writeFileSync(path, 'fixture evidence')
        const command =
          antigravityWorkerHook(repository, directory)['wholeloop-observer'].PreToolUse[0]?.hooks[0]
            ?.command ?? ''
        const result = spawnSync('/bin/sh', ['-c', command], {
          cwd: directory,
          encoding: 'utf8',
          input: JSON.stringify({
            toolCall: {
              name: tool,
              args: tool === 'view_file' ? { AbsolutePath: path } : { SearchPath: repository },
            },
            workspacePaths: [directory],
          }),
        })
        expect(result.status, result.stderr).toBe(0)
        expect(JSON.parse(result.stdout)).toEqual({ decision: 'allow' })
      }),
  )
  it.each([
    'run_command',
    'write_to_file',
    'replace_file_content',
    'search_web',
    'read_url_content',
    'invoke_subagent',
    'mcp__fixture',
    'ask_permission',
    'unknown',
  ])('denies %s', (tool) =>
    fixture((_root, repository, directory) => {
      const command =
        antigravityWorkerHook(repository, directory)['wholeloop-observer'].PreToolUse[0]?.hooks[0]
          ?.command ?? ''
      const result = spawnSync('/bin/sh', ['-c', command], {
        cwd: directory,
        encoding: 'utf8',
        input: JSON.stringify({ toolCall: { name: tool, args: {} }, workspacePaths: [directory] }),
      })
      expect(result.status, result.stderr).toBe(0)
      expect(JSON.parse(result.stdout).decision).toBe('deny')
    }),
  )
  it('denies linked external reads, malformed context and absent Node', () =>
    fixture((root, repository, directory) => {
      const outside = join(root, 'outside.txt')
      writeFileSync(outside, 'fixture outside')
      symlinkSync(outside, join(repository, 'linked.txt'))
      const command =
        antigravityWorkerHook(repository, directory)['wholeloop-observer'].PreToolUse[0]?.hooks[0]
          ?.command ?? ''
      for (const input of [
        'malformed',
        JSON.stringify({
          toolCall: { name: 'view_file', args: { AbsolutePath: join(repository, 'linked.txt') } },
          workspacePaths: [directory],
        }),
        JSON.stringify({ toolCall: { name: 'view_file', args: {} }, workspacePaths: [directory] }),
        JSON.stringify({ toolCall: { name: 'grep_search', args: {} }, workspacePaths: [root] }),
      ]) {
        const result = spawnSync('/bin/sh', ['-c', command], {
          cwd: directory,
          encoding: 'utf8',
          input,
        })
        expect(JSON.parse(result.stdout).decision).toBe('deny')
      }
      const quote = (s: string) => `'${s.replaceAll("'", "'\\''")}'`
      const missing = command.replace(quote(process.execPath), quote(join(root, 'missing-node')))
      const result = spawnSync('/bin/sh', ['-c', missing], {
        cwd: directory,
        encoding: 'utf8',
        input: '{}',
      })
      expect(result.status).toBe(0)
      expect(JSON.parse(result.stdout).decision).toBe('deny')
    }))
  it('rejects unrecognized nested policy names without creating parent directories', () =>
    fixture((_root, _repository, directory) => {
      for (const path of [
        '.agents/agents/other.md',
        '.agents/agents/wholeloop-observer-../escape.md',
        '.agents/agents/wholeloop-observer-aaaaaaaaaaaaaaaa.md\n',
      ])
        expect(() =>
          stageWorkerPolicy(directory, new Map([[path as WorkerPolicyFile, 'fixture']])),
        ).toThrow(/Unsupported/)
      expect(readdirSync(directory)).toEqual([])
    }))
})
