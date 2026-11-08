// ADR-0209: worker credentials resolve from the operating system's secret store per launch, and
// the value never travels through arguments, output or a file.
import { describe, expect, it } from 'vitest'
import { parseArguments } from '../../../src/cli/arguments.js'
import { deliveryCredentialCommand } from '../../../src/cli/delivery-credentials.js'
import { CliError } from '../../../src/cli/errors.js'
import {
  NATIVE_SECRET_SERVICE,
  type NativeCredentialReference,
  resolveNativeCredential,
  type SecretStoreRunner,
  storeNativeCredential,
  validNativeCredentialReference,
} from '../../../src/delivery/native-credentials.js'
import { validNativeRuntime } from '../../../src/delivery/native-runtime.js'

const SECRET = 'sk-fake-0123456789abcdef'
const VALUES = ['--target', '--kind', '--item', '--store']
const keychain: NativeCredentialReference = {
  store: 'macos-keychain',
  item: 'claude-worker',
  kind: 'oauth-token',
}
const service: NativeCredentialReference = { ...keychain, store: 'secret-service' }

/** A fake store: records every call and answers with a fixed result. */
function fakeStore(answer: { code: number | null; stdout: string } | Error) {
  const calls: { command: string; args: string[]; input: string }[] = []
  const run: SecretStoreRunner = async (command, args, input) => {
    calls.push({ command, args, input })
    if (answer instanceof Error) throw answer
    return answer
  }
  return { calls, run }
}
const everywhere = () => true

describe('worker credential references', () => {
  it.each([
    ['claude', 'api-key', true],
    ['claude', 'oauth-token', true],
    ['codex', 'api-key', true],
    // A ChatGPT session stays in Codex's own keyring; there is nothing to inject.
    ['codex', 'oauth-token', false],
    ['opencode', 'api-key', false],
  ])('%s with %s is supported: %s', (target, kind, valid) => {
    expect(validNativeCredentialReference({ ...keychain, kind }, target)).toBe(valid)
  })

  it.each([
    [{ ...keychain, item: 'Has Space' }],
    [{ ...keychain, item: '../escape' }],
    [{ ...keychain, store: 'file' }],
    [{ ...keychain, value: SECRET }],
    [{ store: 'macos-keychain', item: 'x' }],
  ])('refuses a malformed or value-carrying reference %#', (reference) => {
    expect(validNativeCredentialReference(reference, 'claude')).toBe(false)
  })

  it('lets a runtime client carry a reference, never a value', () => {
    const client = { target: 'claude', client: '/opt/claude', store: '/opt/claude-home' }
    const runtime = (extra: object) => ({
      schema: 'wholeloop/native-runtime@1',
      clients: [{ ...client, ...extra }],
    })
    expect(validNativeRuntime(runtime({}))).toBe(true)
    expect(validNativeRuntime(runtime({ credential: keychain }))).toBe(true)
    expect(validNativeRuntime(runtime({ credential: { ...keychain, kind: 'session' } }))).toBe(
      false,
    )
    expect(validNativeRuntime(runtime({ credential: SECRET }))).toBe(false)
  })
})

describe('resolving a credential for one launch', () => {
  it('reads the Keychain item by name and returns the client variable', async () => {
    const store = fakeStore({ code: 0, stdout: `${SECRET}\n` })
    await expect(
      resolveNativeCredential(keychain, 'claude', store.run, 'darwin', everywhere),
    ).resolves.toEqual({ resolved: true, variable: 'CLAUDE_CODE_OAUTH_TOKEN', value: SECRET })
    expect(store.calls).toEqual([
      {
        command: '/usr/bin/security',
        args: ['find-generic-password', '-s', NATIVE_SECRET_SERVICE, '-a', 'claude-worker', '-w'],
        input: '',
      },
    ])
  })

  it('reads Secret Service through a trusted secret-tool path, never PATH', async () => {
    const store = fakeStore({ code: 0, stdout: `${SECRET}\n` })
    const result = await resolveNativeCredential(
      { ...service, kind: 'api-key' },
      'codex',
      store.run,
      'linux',
      (path) => path === '/usr/local/bin/secret-tool',
    )
    expect(result).toEqual({ resolved: true, variable: 'CODEX_API_KEY', value: SECRET })
    expect(store.calls[0]?.command).toBe('/usr/local/bin/secret-tool')
    expect(store.calls[0]?.args).toEqual([
      'lookup',
      'service',
      NATIVE_SECRET_SERVICE,
      'account',
      'claude-worker',
    ])
  })

  it.each([
    ['a missing item', { code: 44, stdout: '' }, 'credential-missing'],
    ['an unusable value', { code: 0, stdout: 'has space\n' }, 'credential-missing'],
    ['a store that cannot start', new Error('spawn'), 'credential-store-unavailable'],
  ])('names %s', async (_, answer, reason) => {
    const store = fakeStore(answer)
    await expect(
      resolveNativeCredential(keychain, 'claude', store.run, 'darwin', everywhere),
    ).resolves.toEqual({ resolved: false, reason })
  })

  it.each([
    ['the Keychain off macOS', keychain, 'linux'],
    ['Secret Service off Linux', service, 'darwin'],
    ['a Linux host without secret-tool', service, 'linux'],
  ] as const)('falls back to nothing on %s', async (_, reference, platform) => {
    const store = fakeStore({ code: 0, stdout: SECRET })
    await expect(
      resolveNativeCredential(reference, 'claude', store.run, platform, () => false),
    ).resolves.toEqual({ resolved: false, reason: 'credential-store-unavailable' })
    expect(store.calls).toEqual([])
  })
})

describe('storing a credential', () => {
  it('passes the value to the Keychain on stdin, never in arguments', async () => {
    const store = fakeStore({ code: 0, stdout: '' })
    await expect(
      storeNativeCredential(keychain, 'claude', SECRET, store.run, 'darwin', everywhere),
    ).resolves.toEqual({ stored: true })
    expect(store.calls[0]?.args).toEqual(['-i'])
    expect(store.calls[0]?.input).toContain(`-w ${SECRET}`)
    expect(store.calls[0]?.input).toContain('-U -s wholeloop-worker -a claude-worker')
  })

  it('passes the value to secret-tool on stdin', async () => {
    const store = fakeStore({ code: 0, stdout: '' })
    await storeNativeCredential(service, 'claude', SECRET, store.run, 'linux', everywhere)
    expect(store.calls[0]?.input).toBe(SECRET)
    expect(store.calls[0]?.args.join(' ')).not.toContain(SECRET)
  })

  it('refuses a value the Keychain command would have to quote', async () => {
    const store = fakeStore({ code: 0, stdout: '' })
    await expect(
      storeNativeCredential(keychain, 'claude', 'two words', store.run, 'darwin', everywhere),
    ).resolves.toEqual({ stored: false, reason: 'credential-invalid' })
    expect(store.calls).toEqual([])
  })
})

describe('wl delivery credential-store and credential-check', () => {
  const io = () => {
    const lines: string[] = []
    return { lines, io: { out: (line: string) => lines.push(line), err: () => {} } }
  }
  const args = (command: string, extra: string[] = []) =>
    parseArguments(
      [
        ...command.split(' '),
        '--target',
        'claude',
        '--kind',
        'oauth-token',
        '--item',
        'claude-worker',
        '--store',
        'macos-keychain',
        ...extra,
      ].slice(2),
      [],
      VALUES,
    )
  const stdin = (text: string) => {
    let sent = false
    return (buffer: Buffer, offset: number) => {
      if (sent) return 0
      sent = true
      return buffer.write(text, offset)
    }
  }

  it('stores from stdin and prints the reference only', async () => {
    const store = fakeStore({ code: 0, stdout: '' }),
      out = io()
    const code = await deliveryCredentialCommand(
      'delivery credential-store',
      args('delivery credential-store'),
      true,
      out.io as never,
      { run: store.run, platform: 'darwin', exists: everywhere, read: stdin(`${SECRET}\n`) },
    )
    expect(code).toBe(0)
    expect(store.calls[0]?.input).toContain(`-w ${SECRET}\n`)
    expect(out.lines.join('')).not.toContain(SECRET)
    expect(JSON.parse(out.lines[0] ?? '')).toMatchObject({ stored: true, reference: keychain })
  })

  it('checks without printing the value and names a missing item', async () => {
    for (const [answer, resolved] of [
      [{ code: 0, stdout: `${SECRET}\n` }, true],
      [{ code: 44, stdout: '' }, false],
    ] as const) {
      const out = io()
      const code = await deliveryCredentialCommand(
        'delivery credential-check',
        args('delivery credential-check'),
        true,
        out.io as never,
        { run: fakeStore(answer).run, platform: 'darwin', exists: everywhere },
      )
      expect(out.lines.join('')).not.toContain(SECRET)
      expect(JSON.parse(out.lines[0] ?? '')).toMatchObject(
        resolved
          ? { resolved: true, variable: 'CLAUDE_CODE_OAUTH_TOKEN' }
          : { resolved: false, reason: 'credential-missing' },
      )
      expect(code).toBe(resolved ? 0 : 3)
    }
  })

  it('refuses an unsupported kind before reading stdin', async () => {
    await expect(
      deliveryCredentialCommand(
        'delivery credential-store',
        parseArguments(['--target', 'codex', '--kind', 'oauth-token', '--item', 'x'], [], VALUES),
        true,
        io().io as never,
        {
          read: () => {
            throw new Error('stdin was read')
          },
        },
      ),
    ).rejects.toBeInstanceOf(CliError)
  })
})
