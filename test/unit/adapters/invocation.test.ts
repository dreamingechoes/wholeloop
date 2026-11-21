// The context opt-in must preserve ordinary payloads, exit codes and command execution count.

import { expect, it } from 'vitest'
import { adapterInvocation } from '../../../src/cli/adapter-context.js'
import schema from '../../../src/cli/schemas/adapter-invocation-v1.json' with { type: 'json' }
import { validate } from '../../../src/config/schema.js'

const context = {
  root: '/fixture/package',
  target: 'codex',
  version: '1.1.0',
  source: 'a'.repeat(64),
  roles: { researcher: 'wl-researcher' },
}

function output() {
  const stdout: string[] = [],
    stderr: string[] = []
  return {
    stdout,
    stderr,
    io: {
      out: (text: string) => {
        stdout.push(text)
      },
      err: (text: string) => {
        stderr.push(text)
      },
    },
  }
}

it('leaves ordinary invocations, output frames and errors unchanged', async () => {
  const { stdout, stderr, io } = output()
  const args = ['status', '--json']
  const code = await adapterInvocation(args, io, context, async (received, streams) => {
    expect(received).toBe(args)
    expect(streams).toBe(io)
    streams.out('unchanged')
    streams.err('observed error')
    return 3
  })
  expect(code).toBe(3)
  expect(stdout).toEqual(['unchanged'])
  expect(stderr).toEqual(['observed error'])
})

it.each([0, 2, 3, 4])('runs the first normal command once and preserves exit %s', async (code) => {
  const { stdout, stderr, io } = output()
  let calls = 0
  const result = { schema: 'wholeloop/error@1', code, message: 'Fixture result' }
  expect(
    await adapterInvocation(
      ['--with-context', 'step', 'begin', 'research', '--json'],
      io,
      context,
      async (args, streams) => {
        calls++
        expect(args).toEqual(['step', 'begin', 'research', '--json'])
        streams.out(JSON.stringify(result))
        streams.err('transient diagnostic')
        return code
      },
    ),
  ).toBe(code)
  expect(calls).toBe(1)
  const value = JSON.parse(stdout[0] ?? '')
  expect(validate(value, schema)).toEqual([])
  expect(value.context).toEqual(context)
  expect(value.result).toEqual(result)
  expect(stderr).toEqual(['transient diagnostic'])
})

it.each(['unpackaged', 'human'])(
  'refuses %s context before executing or creating work',
  async (kind) => {
    const { stdout, stderr, io } = output()
    let calls = 0
    expect(
      await adapterInvocation(
        ['--with-context', 'status', ...(kind === 'human' ? [] : ['--json'])],
        io,
        kind === 'unpackaged' ? undefined : context,
        async () => {
          calls++
          return 0
        },
      ),
    ).toBe(3)
    expect(calls).toBe(0)
    if (kind === 'unpackaged') expect(JSON.parse(stdout[0] ?? '').schema).toBe('wholeloop/error@1')
    else expect(stderr[0]).toContain('wl: Use --with-context')
  },
)

it('does not consume the context flag from a command argument', async () => {
  const { io } = output()
  const args = ['step', 'begin', 'research', '--input', '--with-context', '--json']
  await adapterInvocation(args, io, context, async (received, streams) => {
    expect(received).toBe(args)
    expect(streams).toBe(io)
    return 4
  })
})

it.each([[], {}, { schema: 'unversioned' }])(
  'refuses an unversioned result instead of relabelling it',
  async (result) => {
    const { io, stdout } = output()
    await expect(
      adapterInvocation(
        ['--with-context', 'fixture', '--json'],
        io,
        context,
        async (_args, streams) => {
          streams.out(JSON.stringify(result))
          return 0
        },
      ),
    ).rejects.toThrow('requires a versioned JSON command result')
    expect(stdout).toEqual([])
  },
)
