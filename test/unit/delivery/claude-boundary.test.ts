import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { homedir, tmpdir, userInfo } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { nativeDeliveryRecipe } from '../../../src/delivery/native-adapters.js'
import type { NativeProcessRunner } from '../../../src/delivery/native-assignment-host.js'
import { ClaudeBoundaryHost } from '../../../src/delivery/native-claude-boundary.js'
import {
  claudeSandboxProfile,
  type NativeClaudeContainment,
} from '../../../src/delivery/native-claude-sandbox.js'
import { workspaceSnapshot } from '../../../src/gates/snapshot.js'
import { fixture } from '../../support/delivery.js'
import { nativeBoundaryInput } from '../../support/native-boundary.js'

const contained = (dir: string): NativeClaudeContainment => {
  const client = join(dir, 'claude-client'),
    store = join(dir, 'claude-store')
  writeFileSync(client, '')
  mkdirSync(store, { recursive: true, mode: 0o700 })
  return {
    kind: 'macos-sandbox',
    sandbox: '/usr/bin/sandbox-exec',
    client,
    home: dir,
    user: 'fixture',
    store,
  }
}

async function setup(
  run: (context: {
    host: ClaudeBoundaryHost
    input: ReturnType<typeof nativeBoundaryInput>['input']
    calls: { command: string; args: string[]; env: NodeJS.ProcessEnv }[]
    containment: NativeClaudeContainment
    root: string
  }) => Promise<void>,
  options: {
    fault?: string
    role?: 'planner' | 'builder' | 'verifier'
    output?: 'files' | 'inline-proposal'
    platform?: NodeJS.Platform
  } = {},
) {
  const { fault = '', role = 'planner', output = 'inline-proposal' } = options
  await fixture(async ({ planning, dir, root }) => {
    const files = planning.sources.files,
      containment = contained(dir),
      { input } = nativeBoundaryInput(
        files,
        dir,
        role,
        role === 'planner' ? undefined : root,
        output,
        containment,
      ),
      calls: { command: string; args: string[]; env: NodeJS.ProcessEnv }[] = [],
      runner: NativeProcessRunner = async (command, args, process) => {
        calls.push({ command, args, env: process.env })
        const closed = {
          status: 'succeeded' as const,
          code: 0,
          signal: null,
          ownership: { invocationState: 'stopped' as const },
        }
        if (args.includes('--version'))
          return {
            ...closed,
            stdout: `${fault === 'version' ? '0.0.0' : '2.1.316'} (Claude Code)\n`,
          }
        if (args.includes('auth'))
          return {
            ...closed,
            stdout: JSON.stringify({ loggedIn: fault !== 'logged-out', email: 'private' }),
          }
        const value = JSON.parse(process.input)
        if (value.mode === 'cancel') {
          process.observe?.('stdout', Buffer.from(`${JSON.stringify({ ready: value.nonce })}\n`))
          expect(process.signal.aborted).toBe(true)
          return { ...closed, status: 'cancelled', code: null, stdout: '' }
        }
        expect(readFileSync(value.read, 'utf8')).toBe(value.nonce)
        return {
          ...closed,
          stdout: JSON.stringify({
            nonce: value.nonce,
            read: true,
            privateDenied: fault !== 'private',
            credentialsDenied: fault !== 'credentials',
            workspaceWrite: role === 'builder' ? 'allowed' : 'denied',
            outputWrite: output === 'files' ? 'allowed' : 'denied',
            // The contained client keeps its network; the observer ignores this.
            networkDenied: false,
          }),
        }
      },
      host = new ClaudeBoundaryHost(files, {
        path: '/usr/bin:/bin',
        containment,
        output,
        provenance: 'fixture',
        current: () => true,
        process: runner,
        platform: options.platform ?? 'darwin',
        ...(role === 'planner' ? {} : { workspace: root }),
      })
    await run({ host, input, calls, containment, root })
  })
}

describe('contained Claude Code reference boundary (ADR-0203)', () => {
  it('denies everything first, then allows only the assignment, client and Keychain paths', () => {
    const containment: NativeClaudeContainment = {
        kind: 'macos-sandbox',
        sandbox: '/usr/bin/sandbox-exec',
        client: '/opt/claude/2.1.316',
        home: '/home/owner',
        user: 'owner',
        store: '/state/claude',
      },
      profile = (output: 'files' | 'inline-proposal', workspaceWrite: boolean) =>
        claudeSandboxProfile({
          containment,
          directory: '/state/wholeloop/delivery/native/run/attempt/id',
          output,
          workspace: '/work/tree',
          workspaceWrite,
        })
    const files = profile('files', true),
      inline = profile('inline-proposal', false)
    expect(files.indexOf('(deny file-read* file-write* (subpath "/"))')).toBeLessThan(
      files.indexOf('(allow file-read*'),
    )
    expect(files).toContain('(subpath "/home/owner/Library/Keychains")')
    expect(files).not.toContain('(subpath "/home/owner")')
    expect(files).toContain('(subpath "/state/wholeloop/delivery/native/run/attempt/id/outputs")')
    expect(inline).not.toContain('/id/outputs")')
    const writes = (text: string) => text.slice(text.indexOf('(allow file-read* file-write*'))
    expect(writes(files)).toContain('(subpath "/work/tree")')
    expect(writes(inline)).not.toContain('(subpath "/work/tree")')
    // The credential deny comes last, so it overrides the client-home write allowance.
    expect(files.endsWith('(literal "/state/claude/auth.json"))')).toBe(true)
    expect(
      files.lastIndexOf('(deny file-write* (literal "/state/claude/.credentials.json")'),
    ).toBeGreaterThan(files.indexOf('(allow file-read* file-write*'))
    for (const path of ['relative', '/a/"b', '/a/../b', '/a\nb'])
      expect(() =>
        claudeSandboxProfile({
          containment: { ...containment, store: path },
          directory: '/d',
          output: 'files',
          workspaceWrite: false,
        }),
      ).toThrow()
  })
  it('binds the profile into the recipe policy and refuses containment for Codex', async () => {
    await setup(async ({ input, containment }) => {
      expect(input.recipe.command).toBe('/usr/bin/sandbox-exec')
      expect(input.recipe.args.slice(0, 1)).toEqual(['-p'])
      expect(input.recipe.args[2]).toBe(containment.client)
      expect(input.recipe.args).toContain('--restricted')
      const moved = nativeDeliveryRecipe({
        target: 'claude',
        version: '2.1.316',
        assignment: input.assignment,
        directory: input.recipe.cwd,
        model: input.model,
        output: 'inline-proposal',
        containment: { ...containment, store: `${containment.store}-other` },
      })
      expect(moved.available && moved.recipe.policy).not.toBe(input.recipe.policy)
      expect(
        nativeDeliveryRecipe({
          target: 'codex',
          version: '0.166.0',
          assignment: input.assignment,
          directory: input.recipe.cwd,
          containment,
        }),
      ).toEqual({ available: false, reason: 'unexpected-containment' })
    })
  })
  it.each([
    ['planner', 'inline-proposal'],
    ['builder', 'files'],
    ['verifier', 'files'],
  ] as const)(
    'observes %s %s inside the sandbox with the dedicated client home',
    async (role, output) => {
      await setup(
        async ({ host, input, calls, containment, root }) => {
          const before = workspaceSnapshot(root).digest,
            value = await host.observe(input)
          expect(value).toMatchObject({
            target: 'claude',
            authenticated: true,
            provenance: 'fixture',
            policy: input.recipe.policy,
          })
          expect(Object.values(value?.boundary ?? {}).every(Boolean)).toBe(true)
          // Every control runs under sandbox-exec with the launch's own env.
          expect(calls.every((call) => call.command === '/usr/bin/sandbox-exec')).toBe(true)
          expect(calls[0]?.args[1]).toBe(input.recipe.args[1])
          expect(
            calls.every(
              (call) =>
                call.env.HOME === containment.home &&
                call.env.CLAUDE_CONFIG_DIR === containment.store &&
                call.env.CLAUDE_CODE_TMPDIR === `${input.recipe.cwd}/tmp`,
            ),
          ).toBe(true)
          // No model: only version, the probe, its cancellation and auth status.
          expect(
            calls.map((call) => call.args.at(-1) === '-' || call.args.includes('--print')),
          ).toEqual([false, false, false, false])
          expect(workspaceSnapshot(root).digest).toBe(before)
          await expect(host.observe(input)).rejects.toThrow('already issued')
        },
        { role, output },
      )
    },
  )
  it.each(['version', 'private', 'credentials'])(
    'refuses %s proof without checking an account',
    async (fault) => {
      await setup(
        async ({ host, input, calls }) => {
          expect(await host.observe(input)).toBeUndefined()
          expect(calls.some((call) => call.args.includes('auth'))).toBe(false)
        },
        { fault },
      )
    },
  )
  it('reports a signed-out client unauthenticated, so admission refuses it', async () => {
    await setup(
      async ({ host, input }) => {
        expect(await host.observe(input)).toMatchObject({ authenticated: false })
      },
      { fault: 'logged-out' },
    )
  })
  it('starts no process off macOS, beside a credential file or for a changed recipe', async () => {
    await setup(
      async ({ host, input, calls }) => {
        expect(await host.observe(input)).toBeUndefined()
        expect(calls).toHaveLength(0)
      },
      { platform: 'linux' },
    )
    await setup(async ({ host, input, calls, containment }) => {
      expect(
        await host.observe({ ...input, recipe: { ...input.recipe, command: 'claude' } }),
      ).toBeUndefined()
      writeFileSync(join(containment.store, '.credentials.json'), '{}')
      expect(await host.observe(input)).toBeUndefined()
      expect(calls).toHaveLength(0)
    })
  })
  it.runIf(process.platform === 'darwin')(
    'lets the real sandbox write the client home but never a credential file there',
    () => {
      const store = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-claude-store-'))),
        directory = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-claude-run-'))),
        profile = claudeSandboxProfile({
          containment: {
            kind: 'macos-sandbox',
            sandbox: '/usr/bin/sandbox-exec',
            client: '/usr/bin/touch',
            home: realpathSync(homedir()),
            user: userInfo().username,
            store,
          },
          directory,
          output: 'inline-proposal',
          workspaceWrite: false,
        }),
        touch = (name: string) =>
          spawnSync('/usr/bin/sandbox-exec', ['-p', profile, '/usr/bin/touch', join(store, name)])
            .status
      expect(touch('settings.json')).toBe(0)
      expect(existsSync(join(store, 'settings.json'))).toBe(true)
      for (const name of ['.credentials.json', 'credentials.json', 'auth.json']) {
        expect(touch(name)).not.toBe(0)
        expect(existsSync(join(store, name))).toBe(false)
      }
    },
  )
})
