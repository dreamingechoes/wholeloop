import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { buildSync } from 'esbuild'
import { describe, expect, it } from 'vitest'
import { harnessAssets } from '../../../scripts/harness-assets.mjs'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { DeliveryCheckpoints } from '../../../src/delivery/checkpoints.js'
import { DeliveryEffects } from '../../../src/delivery/effects.js'
import { DeliveryLockRecovery } from '../../../src/delivery/lock-recovery.js'
import { DeliveryQueue } from '../../../src/delivery/queue.js'
import { DeliveryRecovery, type RecoveryWorkerHost } from '../../../src/delivery/recovery.js'
import { deliveryAttempts } from '../../../src/delivery/reducer.js'
import { FlowEngine } from '../../../src/flow/engine.js'
import { gateRuns } from '../../../src/gates/state.js'
import { GateWorkflow } from '../../../src/gates/workflow.js'
import { authorization, fixture } from '../../support/delivery.js'

const at = '2026-10-24T10:00:00.000Z'
const owner = 'controller-0123456789abcdef0123456789abcdef'
const runtime = {
  backend: 'fixture-owned-process',
  instance: 'instance-1',
  worker: 'owned-child-with-start-identity',
}
async function child(directory: string): Promise<{ process: ChildProcess; closed: Promise<void> }> {
  const process = spawn(
    globalThis.process.execPath,
    ['-e', 'process.stdout.write("ready\\n");setInterval(()=>{},1000)'],
    {
      cwd: directory,
      env: { PATH: globalThis.process.env.PATH ?? '', HOME: directory, TMPDIR: directory },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  const closed = new Promise<void>((resolve) => process.once('close', () => resolve()))
  await new Promise<void>((resolveReady, reject) => {
    process.once('error', reject)
    process.stdout?.once('data', () => resolveReady())
  })
  return { process, closed }
}
async function finish(process: ChildProcess, closed: Promise<void>) {
  if (process.exitCode === null && process.signalCode === null) process.kill('SIGKILL')
  await closed
}
function bundle(contents: string, outfile: string) {
  buildSync({
    stdin: { contents, resolveDir: resolve('.'), sourcefile: 'recovery-process-fixture.ts' },
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    banner: {
      js: "import {createRequire} from 'node:module';const require=createRequire(import.meta.url)",
    },
    define: {
      __WL_VERSION__: JSON.stringify('0.0.0'),
      __WL_HARNESS__: JSON.stringify(harnessAssets(resolve('.'))),
    },
  })
}

describe('owned worker recovery and retained locks', () => {
  it('stops only an exact owned child, fences before retry and preserves an exhausted legacy gate', () =>
    fixture(async ({ planning, plan, dir, root, state }) => {
      const review = state.create({
        kind: 'review',
        title: 'Retained gate budget',
        owner: 'Fixture Owner',
        repository: root,
        body: '',
      })
      const gates = new GateWorkflow(
        new FlowEngine(state, root, join(dir, 'config.yml'), join(dir, 'home')),
      )
      gates.plan(review.id, 'review', { base: 'main', rounds: 1 })
      expect(gates.verdict(review.id, 'review').verdict).toBe('EXHAUSTED')
      const prior = gateRuns(state.events())
      const priorEvents = state.events()
      const receipt = planning.preparePlan(plan)
      const queue = new DeliveryQueue(planning.sources.files.root, () => at)
      queue.lifecycle.authority.authorize(authorization(plan, receipt.digest))
      queue.lifecycle.track({ run: plan.run, revision: 1, grant: 'authorization-0123456789abcdef' })
      queue.enqueue(plan.run, { unit: 'contract' })
      const assignment = queue.claim(owner, () => ({
        ready: true,
        evidence: 'a'.repeat(64),
        provenance: 'fixture',
      })).assignment
      if (!assignment) throw new Error('A fixture assignment is required')
      const owned = await child(dir),
        unrelated = await child(dir)
      queue.start(assignment, runtime)
      let stops = 0
      const host: RecoveryWorkerHost = {
        inspect: async (value) => ({
          assignment: contractDigest(value),
          status:
            owned.process.exitCode === null && owned.process.signalCode === null
              ? 'running'
              : 'stopped',
          runtime,
          owned: true,
          evidence: contractDigest({
            pid: owned.process.pid,
            exit: owned.process.exitCode,
            signal: owned.process.signalCode,
          }),
          provenance: 'fixture',
        }),
        stop: async (value, observed) => {
          expect(value).toEqual(assignment)
          expect(observed).toEqual(runtime)
          stops++
          owned.process.kill('SIGTERM')
          await owned.closed
        },
      }
      try {
        const recovered = await new DeliveryRecovery(planning.sources.files.root, () => at).recover(
          plan.run,
          { host, cancel: true, retry: true, resume: true },
        )
        expect(recovered.ready).toBe(true)
        expect(recovered.workers).toBe('not-started')
        expect(stops).toBe(1)
        expect(unrelated.process.exitCode).toBeNull()
        expect(unrelated.process.signalCode).toBeNull()
        const next = queue.claim(owner, () => ({
          ready: true,
          evidence: 'a'.repeat(64),
          provenance: 'fixture',
        })).assignment
        expect(next?.generation).toBe(2)
        expect(next?.attempt).not.toBe(assignment.attempt)
        expect(gateRuns(state.events())).toEqual(prior)
        expect(state.events()).toEqual(priorEvents)
        expect(() => gates.plan(review.id, 'review')).toThrow('budget exhausted')
      } finally {
        await finish(owned.process, owned.closed)
        await finish(unrelated.process, unrelated.closed)
      }
    }))

  it.each(['missing-host', 'reused-identity'] as const)(
    'pauses on %s without calling stop or stealing its reservation',
    (failure) =>
      fixture(async ({ planning, plan }) => {
        const receipt = planning.preparePlan(plan)
        const queue = new DeliveryQueue(planning.sources.files.root, () => at)
        queue.lifecycle.authority.authorize(authorization(plan, receipt.digest))
        queue.lifecycle.track({
          run: plan.run,
          revision: 1,
          grant: 'authorization-0123456789abcdef',
        })
        queue.enqueue(plan.run, { unit: 'contract' })
        const assignment = queue.claim(owner, () => ({
          ready: true,
          evidence: 'a'.repeat(64),
          provenance: 'fixture',
        })).assignment
        if (!assignment) throw new Error('Assignment required')
        queue.start(assignment, runtime)
        let stops = 0
        const host: RecoveryWorkerHost = {
          inspect: async (value) => ({
            assignment: contractDigest(value),
            status: 'running',
            runtime: { ...runtime, worker: 'reused-pid-different-start' },
            owned: true,
            evidence: 'b'.repeat(64),
            provenance: 'fixture',
          }),
          stop: async () => {
            stops++
          },
        }
        const result = await new DeliveryRecovery(planning.sources.files.root, () => at).recover(
          plan.run,
          {
            ...(failure === 'reused-identity' ? { host } : {}),
            cancel: true,
            retry: true,
            resume: true,
          },
        )
        expect(result).toMatchObject({
          ready: false,
          problems: ['unknown-worker-identity'],
          state: { state: 'paused' },
        })
        expect(stops).toBe(0)
        expect(deliveryAttempts(queue.lifecycle.journal.get(plan.run)).records[0]?.state).toBe(
          'started',
        )
        expect(queue.inspect(plan.run)[0]?.status).toBe('claimed')
        expect(queue.claim(owner).assignment).toBeNull()
      }),
  )

  it('ends an unattended unknown-ownership recovery without a human input wait', () =>
    fixture(async ({ planning, plan }) => {
      plan.policy.intervention = 'none'
      const receipt = planning.preparePlan(plan)
      const queue = new DeliveryQueue(planning.sources.files.root, () => at)
      queue.lifecycle.authority.authorize(authorization(plan, receipt.digest))
      queue.lifecycle.track({ run: plan.run, revision: 1, grant: 'authorization-0123456789abcdef' })
      queue.enqueue(plan.run, { unit: 'contract' })
      queue.claim(owner, () => ({ ready: true, evidence: 'a'.repeat(64), provenance: 'fixture' }))
      const result = await new DeliveryRecovery(planning.sources.files.root, () => at).recover(
        plan.run,
      )
      expect(result.state.state).toBe('blocked')
      expect(result.state.outcome).toBe('blocked')
      expect(result.problems).toContain('unknown-worker-identity')
      expect(queue.inspect(plan.run)[0]?.status).toBe('claimed')
    }))

  it('refuses a live, malformed or mismatched writer record without age-based recovery', () =>
    fixture(({ planning }) => {
      const recovery = new DeliveryLockRecovery(planning.sources.files.root)
      expect(recovery.inspect().status).toBe('clear')
      mkdirSync(recovery.files.path('.lock'))
      recovery.files.atomic(
        '.lock/owner.json',
        JSON.stringify({ pid: process.pid, started: '2000-01-01T00:00:00.000Z' }),
      )
      const held = recovery.inspect()
      expect(held.status).toBe('held')
      expect(() => recovery.repair('a'.repeat(64))).toThrow('writer-not-confirmed-stopped')
      recovery.files.atomic('.lock/owner.json', JSON.stringify({ pid: 0, started: at }))
      expect(recovery.inspect().status).toBe('unknown')
      expect(() => recovery.repair('a'.repeat(64))).toThrow('writer-not-confirmed-stopped')
    }))

  it.each(['after-intent', 'before-write', 'after-write'] as const)(
    'reconciles an actual killed invoker %s without replaying its write',
    (phase) =>
      fixture(async ({ planning, plan, dir }) => {
        const prepared = planning.preparePlan(plan)
        const queue = new DeliveryQueue(planning.sources.files.root, () => at)
        queue.lifecycle.authority.authorize(authorization(plan, prepared.digest))
        queue.lifecycle.track({
          run: plan.run,
          revision: 1,
          grant: 'authorization-0123456789abcdef',
        })
        queue.enqueue(plan.run, { unit: 'contract' })
        const effects = new DeliveryEffects(planning.sources.files.root, () => at)
        const intent = effects.prepare(plan.run, {
          key: 'report',
          operation: 'report.write',
          ref: 'artifacts/report.md',
          inputDigest: 'a'.repeat(64),
        })
        const executable = join(dir, 'crash-invocation.mjs'),
          counter = join(dir, 'writes.txt')
        bundle(
          `import {appendFileSync} from 'node:fs';import {DeliveryEffects} from './src/delivery/effects.ts';const [store,run,id,path,phase]=process.argv.slice(2);const effects=new DeliveryEffects(store,()=>${JSON.stringify(at)});const atomic=effects.lifecycle.journal.files.atomic.bind(effects.lifecycle.journal.files);effects.lifecycle.journal.files.atomic=(path,body)=>{atomic(path,body);if(phase==='after-intent'&&path.startsWith('delivery/journal/')&&body.includes('"action":"issued"'))process.kill(process.pid,'SIGKILL')};await effects.execute(run,id,{eligible:()=>({allowed:true,provenance:'fixture',evidence:'a'.repeat(64)}),invoke:async()=>{if(phase==='before-write')process.kill(process.pid,'SIGKILL');appendFileSync(path,'invoked\\n');process.kill(process.pid,'SIGKILL')},observe:async()=>{throw new Error('No observation may happen before the crash')}});`,
          executable,
        )
        const killed = spawnSync(
          process.execPath,
          [executable, planning.sources.files.root, plan.run, intent.intent.id, counter, phase],
          { encoding: 'utf8' },
        )
        expect(killed.signal, killed.stderr).toBe('SIGKILL')
        const locks = new DeliveryLockRecovery(planning.sources.files.root)
        const lock = locks.inspect()
        if (lock.status === 'stopped' && lock.digest) locks.repair(lock.digest)
        else expect(lock.status).toBe('clear')
        const pending = effects.get(plan.run, intent.intent.id)
        expect(pending.status).toBe('pending')
        let invoked = false
        await expect(
          effects.execute(plan.run, intent.intent.id, {
            eligible: () => ({ allowed: true, provenance: 'fixture', evidence: 'a'.repeat(64) }),
            invoke: async () => {
              invoked = true
            },
            observe: async () => {
              throw new Error('No blind execution')
            },
          }),
        ).rejects.toThrow('effect-already-issued')
        const reconciled = await effects.reconcile(plan.run, intent.intent.id, {
          observe: async (value) => ({
            available: true,
            value: {
              binding: contractDigest(value),
              status: phase === 'after-write' ? 'applied' : 'not-applied',
              invocationState: 'stopped',
              evidence: contractDigest({ child: killed.pid, signal: killed.signal, phase }),
              provenance: 'fixture',
              reason: 'observed',
              ...(phase === 'after-write'
                ? {
                    resource: {
                      ref: value.ref,
                      revision: contractDigest(readFileSync(counter, 'utf8')),
                    },
                  }
                : {}),
            },
          }),
        })
        expect(reconciled.status).toBe(phase === 'after-write' ? 'applied' : 'not-applied')
        expect(invoked).toBe(false)
        if (phase === 'after-write') expect(readFileSync(counter, 'utf8')).toBe('invoked\n')
        else expect(existsSync(counter)).toBe(false)
      }),
  )

  it.each(['before-manifest', 'after-manifest', 'after-journal'] as const)(
    'recovers the same checkpoint after actual SIGKILL %s',
    (phase) =>
      fixture(({ planning, plan, source, dir }) => {
        planning.preparePlan(plan)
        const checkpoints = new DeliveryCheckpoints(planning.sources.files.root, () => at)
        checkpoints.lifecycle.track({ run: plan.run, revision: 1 })
        const ref = `delivery/sources/${source.id}.json`
        const executable = join(dir, 'crash-checkpoint.mjs')
        bundle(
          `import {DeliveryCheckpoints} from './src/delivery/checkpoints.ts';const [store,run,ref,phase]=process.argv.slice(2);const checkpoints=new DeliveryCheckpoints(store,()=>${JSON.stringify(at)});const atomic=checkpoints.lifecycle.journal.files.atomic.bind(checkpoints.lifecycle.journal.files);checkpoints.lifecycle.journal.files.atomic=(path,body)=>{if(phase==='before-manifest'&&path.startsWith('delivery/checkpoints/'))process.kill(process.pid,'SIGKILL');atomic(path,body);if((phase==='after-manifest'&&path.startsWith('delivery/checkpoints/'))||(phase==='after-journal'&&path.startsWith('delivery/journal/')))process.kill(process.pid,'SIGKILL')};checkpoints.capture(run,{schema:'wholeloop/delivery-checkpoint-request@1',key:'source',stage:'source-adopted',inputs:[ref]});`,
          executable,
        )
        const killed = spawnSync(
          process.execPath,
          [executable, planning.sources.files.root, plan.run, ref, phase],
          { encoding: 'utf8' },
        )
        expect(killed.signal, killed.stderr).toBe('SIGKILL')
        const recovery = new DeliveryLockRecovery(planning.sources.files.root)
        const stopped = recovery.inspect()
        expect(stopped.status).toBe('stopped')
        if (!('digest' in stopped) || !stopped.digest)
          throw new Error('Exact stopped writer digest required')
        expect(() => recovery.repair('a'.repeat(64))).toThrow('writer-not-confirmed-stopped')
        const retained = recovery.repair(stopped.digest)
        expect(retained.status).toBe('retained-stopped-writer-lock')
        if (!retained.retained) throw new Error('Original ownership evidence must be retained')
        expect(
          JSON.parse(readFileSync(recovery.files.path(`${retained.retained}/owner.json`), 'utf8'))
            .pid,
        ).toBe(killed.pid)
        expect(recovery.repair(stopped.digest).status).toBe('already-clear')
        const receipt = checkpoints.capture(plan.run, {
          schema: 'wholeloop/delivery-checkpoint-request@1',
          key: 'source',
          stage: 'source-adopted',
          inputs: [ref],
        })
        expect(receipt?.status).toBe('current')
        expect(checkpoints.inspect(plan.run)).toHaveLength(1)
        expect(checkpoints.lifecycle.journal.get(plan.run).grant).toBeUndefined()
        expect(checkpoints.lifecycle.journal.events()).toHaveLength(2)
      }),
  )
})
