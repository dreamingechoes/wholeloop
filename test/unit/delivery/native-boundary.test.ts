import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { nativeDeliveryRecipe } from '../../../src/delivery/native-adapters.js'
import type { NativeProcessRunner } from '../../../src/delivery/native-assignment-host.js'
import {
  CodexBoundaryHost,
  nativeBoundaryKey,
} from '../../../src/delivery/native-codex-boundary.js'
import { createWorkerAssignment } from '../../../src/delivery/worker-protocol.js'
import { workspaceSnapshot } from '../../../src/gates/snapshot.js'
import { fixture } from '../../support/delivery.js'
import { nativeBoundaryInput } from '../../support/native-boundary.js'

async function setup(
  run: (context: {
    host: CodexBoundaryHost
    input: ReturnType<typeof nativeBoundaryInput>['input']
    calls: string[][]
    root: string
  }) => Promise<void>,
  fault = '',
  role: 'planner' | 'builder' | 'verifier' = 'planner',
  output: 'files' | 'inline-proposal' = 'inline-proposal',
) {
  await fixture(async ({ planning, dir, root }) => {
    const files = planning.sources.files,
      { input, nativeStore } = nativeBoundaryInput(
        files,
        dir,
        role,
        role === 'planner' ? undefined : root,
        output,
      ),
      calls: string[][] = [],
      runner: NativeProcessRunner = async (_command, args, options) => {
        calls.push(args)
        const closed = {
          status: 'succeeded' as const,
          code: 0,
          signal: null,
          ownership: {
            invocationState:
              fault === 'unknown-owner' ? ('unknown' as const) : ('stopped' as const),
          },
        }
        if (args.includes('--version'))
          return {
            ...closed,
            stdout: `codex-cli ${fault === 'version' ? 'unverified' : '0.166.0'}\n`,
          }
        if (args.includes('features')) {
          const names = args
            .filter((value) => value.startsWith('features.'))
            .map((value) => value.slice('features.'.length).split('=')[0])
          return {
            ...closed,
            stdout: names
              .map((name) => `${name} stable ${fault === 'feature' ? 'true' : 'false'}`)
              .join('\n'),
          }
        }
        if (args.includes('login'))
          return { ...closed, stdout: 'Local client status details remain private.' }
        const value = JSON.parse(options.input)
        if (value.mode === 'cancel') {
          options.observe?.('stdout', Buffer.from(`${JSON.stringify({ ready: value.nonce })}\n`))
          expect(options.signal.aborted).toBe(true)
          return { ...closed, status: 'cancelled', code: null, stdout: '' }
        }
        expect(readFileSync(value.read, 'utf8')).toBe(value.nonce)
        return {
          ...closed,
          stdout: JSON.stringify({
            nonce: fault === 'nonce' ? 'wrong' : value.nonce,
            read: true,
            privateDenied: fault !== 'private',
            credentialsDenied: true,
            workspaceWrite: role === 'builder' ? 'allowed' : 'denied',
            outputWrite: output === 'files' ? 'allowed' : 'denied',
            networkDenied: fault !== 'network',
            ...(fault === 'shape' ? { ignored: true } : {}),
          }),
        }
      },
      host = new CodexBoundaryHost(files, {
        path: process.env.PATH ?? '',
        nativeStore,
        output,
        provenance: 'fixture',
        current: () => true,
        process: runner,
        ...(role === 'planner' ? {} : { workspace: root }),
      })
    await run({ host, input, calls, root })
  })
}

describe('actual-boundary reference observer preserves independent proof and ownership', () => {
  it('cannot acquire another control allowance by changing context within the original attempt', async () => {
    await setup(async ({ host, input, calls }) => {
      await host.probePolicy(input)
      const { assignment: _digest, schema: _schema, tools: _tools, ...body } = input.assignment,
        assignment = createWorkerAssignment({
          ...body,
          brief: 'Changed context remains the same original attempt.',
        }),
        selected = nativeDeliveryRecipe({
          target: 'codex',
          version: '0.166.0',
          assignment,
          directory: input.recipe.cwd,
          model: input.model,
          output: 'inline-proposal',
        }),
        count = calls.length
      if (!selected.available) throw new Error('Fixture recipe unavailable')
      const { response: _response, ...recipe } = selected.recipe
      await expect(host.probePolicy({ ...input, assignment, recipe })).rejects.toThrow(
        'already issued',
      )
      expect(calls).toHaveLength(count)
    })
  })
  it.each([
    ['planner', 'files'],
    ['planner', 'inline-proposal'],
    ['builder', 'files'],
    ['builder', 'inline-proposal'],
    ['verifier', 'files'],
    ['verifier', 'inline-proposal'],
  ] as const)(
    'keeps %s %s policy observations unauthenticated and leaves project bytes unchanged',
    async (role, output) => {
      await setup(
        async ({ host, input, root }) => {
          const before = workspaceSnapshot(root).digest,
            value = await host.probePolicy(input)
          expect(value).toMatchObject({
            authenticated: false,
            provenance: 'fixture',
            assignment: input.assignment.assignment,
            policy: input.recipe.policy,
          })
          expect(Object.values(value?.boundary ?? {}).every(Boolean)).toBe(true)
          expect(workspaceSnapshot(root).digest).toBe(before)
          await expect(host.probePolicy(input)).rejects.toThrow('already issued')
        },
        '',
        role,
        output,
      )
    },
  )
  it.each(['version', 'feature', 'private', 'network', 'nonce', 'shape'])(
    'refuses %s proof without issuing a model or checking an account',
    async (fault) => {
      await setup(async ({ host, input, calls }) => {
        expect(await host.probePolicy(input)).toBeUndefined()
        expect(calls.some((args) => args.includes('exec') || args.includes('login'))).toBe(false)
      }, fault)
    },
  )
  it('holds an unknown original native group and refuses another policy invocation', async () => {
    await setup(async ({ host, input, calls }) => {
      await expect(host.probePolicy(input)).rejects.toThrow('ownership unresolved')
      await expect(host.probePolicy(input)).rejects.toThrow('already issued')
      expect(calls).toHaveLength(1)
    }, 'unknown-owner')
  })
  it('binds the same policy to private local authentication evidence without retaining its output', async () => {
    await setup(async ({ host, input, calls }) => {
      const value = await host.observe(input)
      expect(value).toMatchObject({ authenticated: true, provenance: 'fixture' })
      expect(calls.filter((args) => args.includes('login'))).toHaveLength(1)
      const index = readFileSync(
          host.files.path(`delivery/native-boundary-index/${nativeBoundaryKey(input)}.txt`),
          'utf8',
        ).trim(),
        proof = readFileSync(
          host.files.path(`delivery/native-boundary-controls/${index}/auth-proof.json`),
          'utf8',
        )
      expect(proof).not.toContain('Local client status details')
      expect(proof).not.toContain(host.options.nativeStore)
    })
  })
  it('checks an injected Codex key by resolving it, since login status cannot see it (ADR-0209)', async () => {
    for (const resolved of [true, false])
      await setup(async ({ host, input, calls }) => {
        const { nativeStore: _store, ...options } = host.options,
          injected = new CodexBoundaryHost(host.files, {
            ...options,
            credential: {
              reference: { store: 'macos-keychain', item: 'codex-worker', kind: 'api-key' },
              resolve: async () =>
                resolved
                  ? { resolved: true, variable: 'CODEX_API_KEY', value: 'sk-fake-codex-0123' }
                  : { resolved: false, reason: 'credential-missing' },
            },
          })
        const value = await injected.observe(input)
        expect(value).toMatchObject({ authenticated: resolved })
        expect(calls.some((args) => args.includes('login'))).toBe(false)
        expect(JSON.stringify(value)).not.toContain('sk-fake-codex-0123')
      })
  })
  it('refuses a boundary host with both or neither credential source', async () => {
    await setup(async ({ host, input }) => {
      const both = new CodexBoundaryHost(host.files, {
        ...host.options,
        credential: {
          reference: { store: 'macos-keychain', item: 'codex-worker', kind: 'api-key' },
          resolve: async () => ({ resolved: false, reason: 'credential-missing' }),
        },
      })
      expect(await both.probePolicy(input)).toBeUndefined()
    })
  })
  it('refuses changed policy bytes and unsupported versions before any control process', async () => {
    await setup(async ({ host, input, calls }) => {
      expect(
        await host.probePolicy({ ...input, recipe: { ...input.recipe, version: 'unknown' } }),
      ).toBeUndefined()
      expect(
        await host.probePolicy({
          ...input,
          recipe: { ...input.recipe, args: [...input.recipe.args, '--unsafe'] },
        }),
      ).toBeUndefined()
      expect(calls).toHaveLength(0)
      expect(
        await host.probePolicy({ ...input, recipe: { ...input.recipe, command: 'untrusted' } }),
      ).toBeUndefined()
    })
  })
})
