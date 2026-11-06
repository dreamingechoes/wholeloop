import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'
import { describe, expect, it, vi } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { DeliveryRunner, type DeliveryRunnerHost } from '../../../src/runner/engine.js'
import { OwnedForegroundRunner, receiveOwnedForeground } from '../../../src/runner/foreground.js'
import { ForegroundOwner } from '../../../src/runner/foreground-owner.js'
import { type RunnerRequest, RunnerStore } from '../../../src/runner/store.js'
import { authorization, fixture } from '../../support/delivery.js'

async function until(observed: () => boolean, maximumMs = 8000) {
  const deadline = Date.now() + maximumMs
  while (!observed()) {
    if (Date.now() >= deadline)
      throw new Error('The exact owned controller observation did not arrive.')
    await new Promise((resolve) => setTimeout(resolve, 30))
  }
}
async function compile(contents: string, outfile: string) {
  await build({
    stdin: { contents, resolveDir: process.cwd() },
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    define: { __WL_HARNESS__: '{}', __WL_VERSION__: '"0.0.0"' },
    banner: {
      js: "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);",
    },
  })
}
async function setup(
  test: (input: {
    store: RunnerStore
    digest: string
    core: string
    dir: string
    ready: string
    host: DeliveryRunnerHost
  }) => Promise<void>,
  mode:
    | 'ordinary'
    | 'delayed'
    | 'waiting'
    | 'foreign'
    | 'duplicate'
    | 'factory-failure' = 'ordinary',
) {
  await fixture(async ({ dir, planning, plan }) => {
    if (mode === 'factory-failure') plan.policy.intervention = 'none'
    const store = new RunnerStore(planning.sources.files.root),
      prepared = planning.preparePlan(plan),
      grant = store.lifecycle.authority.authorize(authorization(plan, prepared.digest))
    store.lifecycle.track({ run: plan.run, revision: 1, grant: grant.grant.id })
    const request: RunnerRequest = {
        schema: 'wholeloop/delivery-runner-request@1',
        key: 'foreground',
        run: plan.run,
        revision: 1,
        plan: prepared.digest,
        grant: grant.grant.id,
        host: { id: 'fixture', version: '1', configuration: 'a'.repeat(64) },
        pollMs: 50,
      },
      digest = store.prepare(request).digest,
      core = join(dir, 'core.mjs'),
      ready = join(dir, 'ready')
    await compile(
      `
import {fileURLToPath} from 'node:url';import {writeFileSync,appendFileSync} from 'node:fs';
import {receiveOwnedForeground} from ${JSON.stringify(resolve('src/runner/foreground.ts'))};
import {ForegroundOwner} from ${JSON.stringify(resolve('src/runner/foreground-owner.ts'))};
import {RunnerStore} from ${JSON.stringify(resolve('src/runner/store.ts'))};
if(process.argv[2]!=='--internal-delivery-foreground')throw new Error('Expected only the private controller mode');
let text='';for await(const chunk of process.stdin){text+=chunk;if(Buffer.byteLength(text)>65536)throw new Error('Bounded private input required')}
const value=JSON.parse(text);${mode === 'foreign' ? "value.nonce='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';" : ''}
await receiveOwnedForeground(value,fileURLToPath(import.meta.url),request=>{
${mode === 'factory-failure' ? "throw new Error('The fixed test host cannot be constructed.');" : ''}
${mode === 'duplicate' ? `let refused=false;try{new ForegroundOwner(new RunnerStore(value.store),value.lease).consume(value,fileURLToPath(import.meta.url))}catch(error){if(error.problem==='foreground-input-already-consumed')refused=true;else throw error}if(!refused)throw new Error('A second consumer was admitted');` : ''}
return {
 identity:request.host,
 preflight:async()=>{appendFileSync(${JSON.stringify(ready)},'observed\\n');${mode === 'delayed' ? 'await new Promise(resolve=>setTimeout(resolve,600));' : mode === 'waiting' ? 'await new Promise(()=>{});' : ''}return{available:false,interactive:'disabled',humanRequired:false,reason:'The actual native model boundary is not available in this fixture.'}},
 execute:async()=>{throw new Error('A fixture cannot execute an application')},
 inspect:async()=>{throw new Error('No stage invocation exists')},
 endpoint:async()=>{throw new Error('A fixture cannot establish an endpoint')}
}});
`,
      core,
    )
    const host: DeliveryRunnerHost = {
      identity: request.host,
      preflight: async () => {
        throw new Error('Recovery cannot perform execution preflight.')
      },
      execute: async () => {
        throw new Error('Recovery cannot execute a new stage.')
      },
      inspect: async () => {
        throw new Error('No stage invocation exists.')
      },
      endpoint: async () => {
        throw new Error('Recovery cannot establish an endpoint.')
      },
    }
    try {
      await test({ store, digest, core, dir, ready, host })
    } finally {
      const record = store.record(digest)
      if (record.controller && record.generation) {
        const owner = new ForegroundOwner(store, {
          request: digest,
          controller: record.controller,
          generation: record.generation,
        })
        if (
          owner.read() &&
          existsSync(store.files.path(`${owner.manager.relative}/intent.json`)) &&
          owner.observe().invocationState === 'unknown'
        ) {
          owner.requestCancellation()
          await until(() => owner.observe().invocationState !== 'unknown')
        }
      }
    }
  })
}
describe('actual owned foreground controller admission and recovery', () => {
  it.each(['private-owner', 'journal', 'projection'] as const)(
    'retains safe authority after an injected %s publication failure',
    async (target) => {
      await setup(async ({ store, digest, core, ready }) => {
        const write = store.files.atomic.bind(store.files),
          view = store.files.project.bind(store.files)
        let ownerPublished = false,
          fired = false
        const fault = vi.spyOn(store.files, 'atomic').mockImplementation((path, body) => {
          const owner =
            path.startsWith('delivery/runner-foreground/') && path.endsWith('/invocation.json')
          const selected =
            target === 'private-owner'
              ? owner
              : ownerPublished && target === 'journal' && path.startsWith('delivery/journal/')
          if (selected && !fired) {
            fired = true
            throw new Error('Injected foreground publication interruption.')
          }
          write(path, body)
          if (owner) ownerPublished = true
        })
        // Projections are journal-derived views with their own writer (ADR-0242).
        const viewFault = vi.spyOn(store.files, 'project').mockImplementation((path, body) => {
          if (
            target === 'projection' &&
            ownerPublished &&
            path.startsWith('delivery/state/') &&
            !fired
          ) {
            fired = true
            throw new Error('Injected foreground publication interruption.')
          }
          view(path, body)
        })
        try {
          await expect(new OwnedForegroundRunner(store).run(digest, core)).rejects.toThrow(
            'Injected foreground',
          )
        } finally {
          fault.mockRestore()
          viewFault.mockRestore()
        }
        expect(fired).toBe(true)
        expect(store.record(digest).ownership).toBe(
          target === 'projection' ? 'released' : 'unclaimed',
        )
        expect(store.record(digest).generation).toBe(target === 'projection' ? 1 : 0)
        expect(store.inspect(digest).stages).toEqual([])
        expect(existsSync(ready)).toBe(false)
      })
    },
  )
  it('registers before private input and returns current journal state from a separate controller process', async () => {
    await setup(async ({ store, digest, core, ready }) => {
      const result = await new OwnedForegroundRunner(store).run(digest, core)
      expect(result.status).toMatchObject({
        state: 'paused',
        ownership: 'released',
        outcome: null,
        stages: [],
      })
      expect(result.process).toMatchObject({ invocationState: 'stopped', code: 0 })
      expect(readFileSync(ready, 'utf8')).toBe('observed\n')
      const record = store.record(digest),
        owner = record.owner
      expect(owner?.runtime.backend).toBe('wholeloop:foreground')
      expect(owner?.runtime.instance).toBe(owner?.invocation)
      expect(new RunnerStore(store.files.root).inspect(digest)).toEqual(result.status)
    })
  })
  it('refuses a foreign private nonce before the fixed host factory can run', async () => {
    await setup(async ({ store, digest, core, ready }) => {
      const result = await new OwnedForegroundRunner(store).run(digest, core)
      expect(result.process).toMatchObject({ invocationState: 'stopped', code: 1 })
      expect(result.status).toMatchObject({ ownership: 'released', outcome: null, stages: [] })
      expect(existsSync(ready)).toBe(false)
    }, 'foreign')
  })
  it('admits the private bootstrap only once even inside its correct live group', async () => {
    await setup(async ({ store, digest, core, ready }) => {
      const result = await new OwnedForegroundRunner(store).run(digest, core)
      expect(result.process).toMatchObject({ invocationState: 'stopped', code: 0 })
      expect(result.status).toMatchObject({ state: 'paused', ownership: 'released', stages: [] })
      expect(readFileSync(ready, 'utf8')).toBe('observed\n')
    }, 'duplicate')
  })
  it('ends a none-policy host-construction failure without asking or leaving a queued run', async () => {
    await setup(async ({ store, digest, core, ready }) => {
      const result = await new OwnedForegroundRunner(store).run(digest, core)
      expect(result.process).toMatchObject({ invocationState: 'stopped', code: 1 })
      expect(result.status).toMatchObject({
        state: 'blocked',
        ownership: 'released',
        outcome: 'blocked',
        stages: [],
      })
      expect(existsSync(ready)).toBe(false)
    }, 'factory-failure')
  })
  it('does not claim an already cancelled launch and releases known pre-launch failures', async () => {
    await setup(async ({ store, digest, core, dir }) => {
      const abort = new AbortController()
      abort.abort()
      await expect(
        new OwnedForegroundRunner(store).run(digest, core, { signal: abort.signal }),
      ).rejects.toThrow('foreground-already-cancelled')
      expect(store.inspect(digest).ownership).toBe('unclaimed')
      await expect(
        new OwnedForegroundRunner(store).run(digest, join(dir, 'missing.mjs')),
      ).rejects.toThrow()
      expect(store.inspect(digest)).toMatchObject({
        ownership: 'unclaimed',
        stages: [],
        outcome: null,
      })
    })
  })
  it('rejects changed core bytes, unregistered consumers and stale cancellation nonces', async () => {
    await setup(async ({ store, digest, core, ready }) => {
      const lease = store.claim(digest, 'controller-0123456789abcdef0123456789abcdef'),
        owner = new ForegroundOwner(store, lease),
        message = owner.prepare(core)
      expect(owner.prepare(core)).toEqual(message)
      store.files.atomic(`${owner.path}/cancel.json`, JSON.stringify({ nonce: 'foreign' }))
      expect(owner.current()).toBe(true)
      let factories = 0
      await expect(
        receiveOwnedForeground(message, core, () => {
          factories++
          throw new Error('Not admitted.')
        }),
      ).rejects.toThrow('foreground-consumer-binding')
      writeFileSync(core, 'An intentionally changed owned test core.\n')
      expect(() => owner.prepare(core)).toThrow('foreground-already-owned')
      await expect(
        receiveOwnedForeground(message, core, () => {
          factories++
          throw new Error('Not admitted.')
        }),
      ).rejects.toThrow('foreground-consumer-binding')
      expect(factories).toBe(0)
      expect(existsSync(ready)).toBe(false)
      owner.requestCancellation()
      expect(owner.current()).toBe(false)
      // The live original parent could still be inside launch; absence alone is not termination.
      expect(owner.observe().invocationState).toBe('unknown')
      store.release(lease, 'The original test caller knows it never attempted a process launch.')
    })
  })
  it('continues the same journaled controller after the actual outer terminal process is killed', async () => {
    await setup(async ({ store, digest, core, dir, ready }) => {
      const launcher = join(dir, 'launcher.mjs')
      await compile(
        `import {OwnedForegroundRunner} from ${JSON.stringify(resolve('src/runner/foreground.ts'))};import {RunnerStore} from ${JSON.stringify(resolve('src/runner/store.ts'))};await new OwnedForegroundRunner(new RunnerStore(${JSON.stringify(store.files.root)})).run(${JSON.stringify(digest)},${JSON.stringify(core)});`,
        launcher,
      )
      const parent = spawn(process.execPath, [launcher], {
          cwd: dir,
          stdio: ['ignore', 'pipe', 'pipe'],
        }),
        closed = new Promise((resolve) => parent.once('close', resolve))
      await until(() => existsSync(ready))
      expect(parent.kill('SIGKILL')).toBe(true)
      await closed
      const record = store.record(digest)
      if (!record.controller) throw new Error('The actual foreground owner was not registered.')
      const owner = new ForegroundOwner(store, {
        request: digest,
        controller: record.controller,
        generation: record.generation,
      })
      await until(() => owner.observe().invocationState === 'stopped')
      expect(new RunnerStore(store.files.root).inspect(digest)).toMatchObject({
        state: 'paused',
        ownership: 'released',
        generation: 1,
        stages: [],
      })
      expect(owner.observe()).toMatchObject({ code: 0, reason: 'finished' })
      expect(readFileSync(ready, 'utf8')).toBe('observed\n')
    }, 'delayed')
  })
  it('cancels a waiting original foreground group through fresh recovery and confirms stop separately', async () => {
    await setup(async ({ store, digest, core, ready, host }) => {
      const pending = new OwnedForegroundRunner(store).run(digest, core)
      await until(() => existsSync(ready))
      store.control(digest, 'stop', 'Fixture Operator')
      const runner = new DeliveryRunner(new RunnerStore(store.files.root))
      await runner.reconcile(digest, host, { cancel: true })
      const observed = await pending
      expect(observed.process.invocationState).toBe('stopped')
      expect(observed.process.reason).toBe('cancelled')
      const final = await runner.reconcile(digest, host, { cancel: true })
      expect(final).toMatchObject({
        state: 'stopped',
        ownership: 'released',
        outcome: 'stopped',
        stages: [],
      })
      expect(final.recoveryProblems).toEqual([])
      expect(contractDigest(store.get(digest))).toBe(digest)
    }, 'waiting')
  })
  it('recovers a positively absent parent that died before any native intent without launching a replacement', async () => {
    await setup(async ({ store, digest, core, dir, ready, host }) => {
      const launcher = join(dir, 'before-intent.mjs')
      await compile(
        `import {writeFileSync} from 'node:fs';import {RunnerStore} from ${JSON.stringify(resolve('src/runner/store.ts'))};import {ForegroundOwner} from ${JSON.stringify(resolve('src/runner/foreground-owner.ts'))};const store=new RunnerStore(${JSON.stringify(store.files.root)});ForegroundOwner.claim(store,${JSON.stringify(digest)},${JSON.stringify(core)});writeFileSync(${JSON.stringify(ready)},'prepared');setInterval(()=>{},1000);`,
        launcher,
      )
      const parent = spawn(process.execPath, [launcher], {
          cwd: dir,
          stdio: ['ignore', 'pipe', 'pipe'],
        }),
        closed = new Promise((resolve) => parent.once('close', resolve))
      await until(() => existsSync(ready))
      expect(parent.kill('SIGKILL')).toBe(true)
      await closed
      const record = store.record(digest)
      expect(record.owner).toBeUndefined()
      if (!record.controller) throw new Error('The original controller claim is missing.')
      const owner = new ForegroundOwner(store, {
        request: digest,
        controller: record.controller,
        generation: record.generation,
      })
      expect(owner.observe().invocationState).toBe('not-started')
      store.control(digest, 'stop', 'Fixture Operator')
      const recovered = await new DeliveryRunner(new RunnerStore(store.files.root)).reconcile(
        digest,
        host,
        { cancel: true },
      )
      expect(recovered).toMatchObject({
        state: 'stopped',
        ownership: 'released',
        stages: [],
        outcome: 'stopped',
      })
      expect(existsSync(store.files.path(`${owner.manager.relative}/intent.json`))).toBe(false)
    })
  })
})
