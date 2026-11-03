import { spawn, spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { delimiter, join, resolve } from 'node:path'
import { build } from 'esbuild'
import { describe, expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { REFERENCE_NATIVE_VERSIONS } from '../../../src/delivery/native-adapters.js'
import {
  NATIVE_BINDINGS_DEFAULT,
  type NativeBindings,
} from '../../../src/delivery/native-bindings.js'
import type { NativeRuntime } from '../../../src/delivery/native-runtime.js'
import { OwnedForegroundRunner } from '../../../src/runner/foreground.js'
import { publicRunnerIdentity } from '../../../src/runner/public-host.js'
import { type RunnerRequest, RunnerStore } from '../../../src/runner/store.js'
import { authorization, fixture } from '../../support/delivery.js'

const cli = resolve('dist/wl.mjs')
const bound: NativeBindings = {
  schema: 'wholeloop/native-bindings@1',
  bindings: [
    {
      target: 'codex',
      version: REFERENCE_NATIVE_VERSIONS.codex,
      model: 'reference-model',
      roles: ['builder', 'challenger', 'planner', 'refuter', 'researcher', 'reviewer', 'verifier'],
    },
  ],
}
function invoke(argv: string[], cwd: string, env: NodeJS.ProcessEnv = process.env) {
  const started = Date.now(),
    result = spawnSync(process.execPath, [cli, ...argv, '--json'], {
      cwd,
      env,
      encoding: 'utf8',
      timeout: 60000,
      maxBuffer: 2 * 1024 * 1024,
    })
  return {
    code: result.status,
    ms: Date.now() - started,
    errors: result.stderr,
    value: result.stdout ? JSON.parse(result.stdout) : null,
  }
}
async function until(observed: () => boolean, maximumMs = 8000) {
  const deadline = Date.now() + maximumMs
  while (!observed()) {
    if (Date.now() >= deadline) throw new Error('The expected owned observation did not arrive.')
    await new Promise((done) => setTimeout(done, 30))
  }
}
async function setup(
  test: (input: {
    store: RunnerStore
    request: RunnerRequest
    digest: string
    dir: string
    bindingsFile: string
    env: NodeJS.ProcessEnv
    canary: string
  }) => Promise<void>,
  options: {
    intervention: 'none' | 'supervised'
    bindings: NativeBindings
    runtime?: NativeRuntime
  },
) {
  await fixture(async ({ dir, planning, plan }) => {
    plan.policy.intervention = options.intervention
    const store = new RunnerStore(planning.sources.files.root),
      prepared = planning.preparePlan(plan),
      grant = store.lifecycle.authority.authorize(authorization(plan, prepared.digest))
    store.lifecycle.track({ run: plan.run, revision: 1, grant: grant.grant.id })
    const request: RunnerRequest = {
        schema: 'wholeloop/delivery-runner-request@1',
        key: 'public',
        run: plan.run,
        revision: 1,
        plan: prepared.digest,
        grant: grant.grant.id,
        host: publicRunnerIdentity(options.bindings, options.runtime),
        pollMs: 50,
      },
      file = join(dir, 'request.json'),
      bindingsFile = join(dir, 'bindings.json'),
      bin = join(dir, 'canary-bin'),
      canary = join(dir, 'canary-launched')
    writeFileSync(file, JSON.stringify(request))
    writeFileSync(bindingsFile, JSON.stringify(options.bindings))
    // Interactive-tool canaries: a launched client records itself and waits for input.
    mkdirSync(bin)
    for (const name of ['codex', 'claude']) {
      writeFileSync(
        join(bin, name),
        `#!${process.execPath}\nrequire('node:fs').appendFileSync(${JSON.stringify(canary)},'${name}\\n');process.stdin.resume()\n`,
      )
      chmodSync(join(bin, name), 0o700)
    }
    const env = { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ''}` },
      prepare = invoke(
        ['delivery', 'runner-prepare', '--file', file, '--store', store.files.root],
        dir,
      )
    expect(prepare.code, prepare.errors).toBe(0)
    await test({
      store,
      request,
      digest: contractDigest(request),
      dir,
      bindingsFile,
      env,
      canary,
    })
  })
}
const run = (digest: string, store: RunnerStore, extra: string[] = []) => [
  'delivery',
  'run',
  '--digest',
  digest,
  '--store',
  store.files.root,
  ...extra,
]

describe('public foreground run and reconcile (P6-10)', () => {
  it.each([
    ['none', NATIVE_BINDINGS_DEFAULT, 'public-host-native-unbound', 'blocked'],
    ['none', bound, 'public-host-native-runtime-unavailable', 'blocked'],
    ['supervised', NATIVE_BINDINGS_DEFAULT, 'public-host-native-unbound', 'paused'],
  ] as const)(
    'ends a %s route honestly before any native launch with bindings %#',
    async (intervention, bindings, reason, state) => {
      await setup(
        async ({ store, digest, dir, bindingsFile, env, canary }) => {
          const extra = bindings === bound ? ['--bindings', bindingsFile] : [],
            result = invoke(run(digest, store, extra), dir, env)
          expect(result.code, result.errors).toBe(3)
          expect(result.value).toMatchObject({
            schema: 'wholeloop/delivery-runner-run@1',
            preflight: { available: false, reason },
            status: { digest, state, ownership: 'released', stages: [] },
          })
          expect(result.value.status.outcome).toBe(state === 'blocked' ? 'blocked' : null)
          // No client was launched, nothing waited for input and no person was asked.
          expect(existsSync(canary)).toBe(false)
          expect(result.ms).toBeLessThan(30000)
          expect(store.lifecycle.journal.get(store.get(digest).run).state).not.toBe('waiting-input')
          const reconciled = invoke(
            ['delivery', 'reconcile', '--digest', digest, '--store', store.files.root, ...extra],
            dir,
            env,
          )
          expect(reconciled.code, reconciled.errors).toBe(0)
          expect(reconciled.value).toMatchObject({
            schema: 'wholeloop/delivery-runner-reconcile@1',
            recoveryProblems: [],
            status: { state, stages: [] },
          })
          if (intervention === 'supervised') {
            const resumed = invoke(
              [
                'delivery',
                'resume',
                '--digest',
                digest,
                '--operator',
                'Fixture Operator',
                '--store',
                store.files.root,
              ],
              dir,
            )
            expect(resumed.value.state).toBe('queued')
          }
        },
        { intervention, bindings },
      )
    },
  )
  it('launches the verified controller bundle, which composes no route it does not support (ADR-0205)', async () => {
    const runtime: NativeRuntime = {
      schema: 'wholeloop/native-runtime@1',
      clients: [
        { target: 'codex', client: '/opt/fixture/bin/codex', store: '/opt/fixture/codex-home' },
      ],
    }
    await setup(
      async ({ store, digest, dir, bindingsFile, env, canary }) => {
        const runtimeFile = join(dir, 'runtime.json')
        writeFileSync(runtimeFile, JSON.stringify(runtime))
        const extra = ['--bindings', bindingsFile, '--runtime', runtimeFile],
          result = invoke(run(digest, store, extra), dir, env)
        // The fixture plan is an implementation route; only research is composed.
        expect(result.code, result.errors).toBe(3)
        expect(result.value.status).toMatchObject({ state: 'blocked', stages: [] })
        // The core cannot compose this host, so it reports no preflight of its own.
        expect(result.value.preflight).toBeNull()
        expect(existsSync(canary)).toBe(false)
        const records = readdirSync(store.files.path('delivery/runner-foreground')),
          invocation = JSON.parse(
            readFileSync(
              store.files.path(`delivery/runner-foreground/${records[0]}/invocation.json`),
              'utf8',
            ),
          )
        expect(records).toHaveLength(1)
        expect(invocation.core.path).toBe(realpathSync(resolve('dist/wl-runner.mjs')))
        // The identity command names exactly the host the request was prepared for.
        const identity = invoke(
          ['delivery', 'runner-host', '--bindings', bindingsFile, '--runtime', runtimeFile],
          dir,
          env,
        )
        expect(identity.value).toEqual({
          schema: 'wholeloop/delivery-runner-host@1',
          host: store.get(digest).host,
          runtime: true,
        })
        // Reconcile runs in the bundle that composed the run and finds nothing owned.
        const reconciled = invoke(
          ['delivery', 'reconcile', '--digest', digest, '--store', store.files.root, ...extra],
          dir,
          env,
        )
        expect(reconciled.code, reconciled.errors).toBe(0)
        expect(reconciled.value).toMatchObject({
          schema: 'wholeloop/delivery-runner-reconcile@1',
          recoveryProblems: [],
          status: { state: 'blocked', stages: [] },
        })
        // Without the runtime document the identity differs and is refused.
        const missing = invoke(run(digest, store, ['--bindings', bindingsFile]), dir, env)
        expect(`${JSON.stringify(missing.value)}${missing.errors}`).toContain('runner-host-binding')
      },
      { intervention: 'none', bindings: bound, runtime },
    )
  })
  it('refuses an installed core whose controller bundle changed before claiming the run', async () => {
    await setup(
      async ({ store, digest, dir, env, canary }) => {
        const copy = join(dir, 'installed')
        mkdirSync(copy)
        copyFileSync(cli, join(copy, 'wl.mjs'))
        writeFileSync(
          join(copy, 'wl-runner.mjs'),
          `${readFileSync(resolve('dist/wl-runner.mjs'), 'utf8')}\n// changed\n`,
        )
        const result = spawnSync(
          process.execPath,
          [join(copy, 'wl.mjs'), ...run(digest, store), '--json'],
          { cwd: dir, env, encoding: 'utf8', timeout: 60000 },
        )
        expect(result.status).toBe(3)
        expect(`${result.stdout}${result.stderr}`).toContain('public-host-controller-bundle')
        expect(store.record(digest).controller).toBeUndefined()
        expect(existsSync(canary)).toBe(false)
      },
      { intervention: 'none', bindings: NATIVE_BINDINGS_DEFAULT },
    )
  })
  it('refuses a different bindings document and a revoked grant before claiming the run', async () => {
    await setup(
      async ({ store, request, digest, dir, env, canary }) => {
        const journal = contractDigest(store.lifecycle.journal.events()),
          other = join(dir, 'other-bindings.json')
        writeFileSync(other, JSON.stringify(bound))
        const mismatch = invoke(run(digest, store, ['--bindings', other]), dir, env)
        expect(mismatch.code).toBe(3)
        expect(`${JSON.stringify(mismatch.value)}${mismatch.errors}`).toContain(
          'runner-host-binding',
        )
        expect(contractDigest(store.lifecycle.journal.events())).toBe(journal)
        store.lifecycle.authority.revoke({
          schema: 'wholeloop/delivery-revocation-request@1',
          grant: request.grant,
          operator: 'Fixture Operator',
          reason: 'Withdraw authority before the public run starts.',
        })
        const revoked = invoke(run(digest, store), dir, env)
        expect(revoked.code).toBe(3)
        expect(store.record(digest)).toMatchObject({ stages: [] })
        expect(store.record(digest).controller).toBeUndefined()
        expect(existsSync(canary)).toBe(false)
      },
      { intervention: 'none', bindings: NATIVE_BINDINGS_DEFAULT },
    )
  })
  it('cancels only the owned waiting controller group through public stop and reconcile', async () => {
    await setup(
      async ({ store, digest, dir, env }) => {
        const core = join(dir, 'waiting-core.mjs'),
          ready = join(dir, 'ready')
        await build({
          stdin: {
            contents: `
import {fileURLToPath} from 'node:url';import {writeFileSync} from 'node:fs';
import {receiveOwnedForeground} from ${JSON.stringify(resolve('src/runner/foreground.ts'))};
let text='';for await(const chunk of process.stdin)text+=chunk
await receiveOwnedForeground(JSON.parse(text),fileURLToPath(import.meta.url),request=>({
 identity:request.host,
 preflight:async()=>{writeFileSync(${JSON.stringify(ready)},'waiting');await new Promise(()=>{})},
 execute:async()=>{throw new Error('No stage may execute')},
 inspect:async()=>{throw new Error('No stage exists')},
 endpoint:async()=>{throw new Error('No endpoint exists')}
}))`,
            resolveDir: process.cwd(),
          },
          outfile: core,
          bundle: true,
          platform: 'node',
          format: 'esm',
          target: 'node20',
          define: { __WL_HARNESS__: '{}', __WL_VERSION__: '"0.0.0"' },
          banner: {
            js: "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);",
          },
        })
        const unrelated = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
            stdio: 'ignore',
          }),
          pending = new OwnedForegroundRunner(store).run(digest, core)
        try {
          await until(() => existsSync(ready))
          const stop = invoke(
            [
              'delivery',
              'stop',
              '--digest',
              digest,
              '--operator',
              'Fixture Operator',
              '--store',
              store.files.root,
            ],
            dir,
          )
          expect(stop.value.state).toBe('stopping')
          invoke(
            ['delivery', 'reconcile', '--digest', digest, '--cancel', '--store', store.files.root],
            dir,
            env,
          )
          const observed = await pending
          expect(observed.process).toMatchObject({
            invocationState: 'stopped',
            reason: 'cancelled',
          })
          const final = invoke(
            ['delivery', 'reconcile', '--digest', digest, '--cancel', '--store', store.files.root],
            dir,
            env,
          )
          expect(final.code, final.errors).toBe(0)
          expect(final.value).toMatchObject({
            recoveryProblems: [],
            status: { state: 'stopped', ownership: 'released', outcome: 'stopped', stages: [] },
          })
          // A later public run cannot restart the stopped route or issue any stage.
          const again = invoke(run(digest, store), dir, env)
          expect(again.code).toBe(3)
          expect(new RunnerStore(store.files.root).inspect(digest)).toMatchObject({
            state: 'stopped',
            stages: [],
          })
          expect(store.record(digest).stages).toEqual([])
          // Cancellation reached only the owned group.
          expect(unrelated.exitCode).toBeNull()
          expect(process.kill(unrelated.pid ?? 0, 0)).toBe(true)
        } finally {
          unrelated.kill('SIGKILL')
        }
      },
      { intervention: 'supervised', bindings: NATIVE_BINDINGS_DEFAULT },
    )
  })
})
