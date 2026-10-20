import { describe, expect, it } from 'vitest'
import { headlessAdapter } from '../../../src/fanout/adapters.js'

const context = { repository: '/repo with spaces', directory: '/external/one' }
const jsonl = (...events: unknown[]) => events.map((event) => JSON.stringify(event)).join('\n')
const text = (messageID: string, value: string, sessionID = 'one') => ({
  type: 'text',
  sessionID,
  part: { messageID, text: value, time: { end: 1 } },
})
const finish = (messageID = 'final', reason = 'stop', sessionID = 'one') => ({
  type: 'step_finish',
  sessionID,
  part: { messageID, reason },
})

describe('additional read-only headless recipes', () => {
  it('confines OpenCode to a fresh inspector and native read-only permissions', () => {
    const recipe = headlessAdapter('opencode').invocation(context)
    expect(recipe.command).toBe('opencode')
    expect(recipe.args).toEqual([
      'run',
      '--pure',
      '--format',
      'json',
      '--dir',
      context.directory,
      '--agent',
      expect.stringMatching(/^wholeloop-inspector-[a-f0-9]{16}$/),
    ])
    const config = JSON.parse(recipe.env?.OPENCODE_CONFIG_CONTENT ?? '')
    const permissions = JSON.parse(recipe.env?.OPENCODE_PERMISSION ?? '')
    expect(permissions).toEqual({
      '*': 'deny',
      read: { '*': 'allow', '*.env': 'deny', '*.env.*': 'deny', '*.env.example': 'allow' },
      glob: 'allow',
      grep: 'allow',
      external_directory: {
        '*': 'deny',
        [context.repository]: 'allow',
        [`${context.repository}/**`]: 'allow',
      },
    })
    expect(config.agent[recipe.args.at(-1) ?? ''].permission).toEqual(permissions)
    expect(config).toMatchObject({
      autoupdate: false,
      share: 'disabled',
      snapshot: false,
      lsp: false,
    })
    expect(recipe.env).toHaveProperty('OPENCODE_CONFIG', undefined)
    expect(recipe.env).toHaveProperty('OPENCODE_CONFIG_DIR', undefined)
    expect(
      headlessAdapter('opencode')
        .invocation({ ...context, directory: '/external/two' })
        .args.at(-1),
    ).not.toBe(recipe.args.at(-1))
  })
  it.each(['/repo*', '/repo?', 'relative'])(
    'refuses an ambiguous native permission path %s',
    (repository) => {
      expect(() => headlessAdapter('opencode').invocation({ ...context, repository })).toThrow(
        /absolute repository/,
      )
    },
  )
  it('takes only the completed OpenCode final message, including split text parts', () => {
    const adapter = headlessAdapter('opencode')
    expect(
      adapter.response(
        jsonl(
          text('earlier', 'Ignore this'),
          finish('earlier', 'tool-calls'),
          text('final', '{"result":'),
          text('final', 'true}'),
          finish(),
        ),
        '',
      ),
    ).toBe('{"result":true}')
    // Part updates may arrive after the finish event; message identity is authoritative.
    expect(adapter.response(jsonl(finish(), text('final', '{}')), '')).toBe('{}')
  })
  it.each(
    [
      [],
      [text('final', '{}')],
      [finish()],
      [text('other', '{}'), finish()],
      [text('final', '{}'), finish('final', 'length')],
      [text('final', '{}'), finish('final', 'tool-calls')],
      [text('final', '{}'), finish(), { type: 'error', error: {} }],
      [text('final', '{}', 'another'), finish()],
      [{ type: 'text', sessionID: 'one', part: { messageID: 'final', text: '{}' } }, finish()],
      [text('final', ''), finish()],
      [null, finish()],
    ].map((events) => ({ events })),
  )('refuses missing, failed, mixed or incomplete OpenCode output %#', ({ events }) => {
    expect(() => headlessAdapter('opencode').response(jsonl(...events), '')).toThrow()
  })
  it('rejects a malformed native event rather than searching output for JSON', () => {
    expect(() =>
      headlessAdapter('opencode').response(`${jsonl(text('final', '{}'), finish())}\nprogress`, ''),
    ).toThrow()
  })
  it('restricts Copilot tools without broad grants, trust, persistence exports or inherited bypasses', () => {
    const recipe = headlessAdapter('copilot').invocation(context)
    expect(recipe.command).toBe('copilot')
    expect(recipe.args).toEqual([
      '--add-dir',
      context.repository,
      '--silent',
      '--output-format',
      'text',
      '--available-tools=view,glob,grep',
      '--allow-tool=read',
      '--deny-tool=shell,write,url,memory',
      '--disable-builtin-mcps',
      '--no-ask-user',
      '--no-auto-update',
      '--no-custom-instructions',
      '--no-experimental',
      '--no-remote-export',
      '--disallow-temp-dir',
      '--log-level',
      'none',
    ])
    expect(recipe.env).toEqual({
      COPILOT_ALLOW_ALL: 'false',
      GITHUB_COPILOT_PROMPT_MODE_EXTENSIONS: 'false',
    })
    expect(headlessAdapter('copilot').response('{"assignment":"exact"}', '')).toBe(
      '{"assignment":"exact"}',
    )
  })
})
