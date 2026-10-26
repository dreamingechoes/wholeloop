import { spawn } from 'node:child_process'
import { join, resolve } from 'node:path'
import { buildSync } from 'esbuild'
import { describe, expect, it } from 'vitest'
import { harnessAssets } from '../../../scripts/harness-assets.mjs'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { type BrokerScope, DeliveryBroker } from '../../../src/delivery/broker.js'
import type { DeliveryPlan } from '../../../src/delivery/plan.js'
import {
  DeliveryQueue,
  type QueueAssignment,
  type QueueReadiness,
} from '../../../src/delivery/queue.js'
import { deliveryAttempts } from '../../../src/delivery/reducer.js'
import { authorization, entry, fixture, git } from '../../support/delivery.js'

const at = '2026-10-24T10:00:00.000Z'
const owner = 'controller-0123456789abcdef0123456789abcdef'
const ready = (): QueueReadiness => ({
  ready: true,
  provenance: 'fixture',
  evidence: 'a'.repeat(64),
})
const runtime = { backend: 'fixture', instance: 'fixture-instance', worker: 'fixture-worker' }
function claimed(value: ReturnType<DeliveryQueue['claim']>): QueueAssignment {
  if (!value.assignment) throw new Error(JSON.stringify(value.deferred))
  return value.assignment
}
function register(queue: DeliveryQueue, plan: DeliveryPlan, id = 'authorization-0123456789abcdef') {
  const prepared = queue.lifecycle.authority.planning.preparePlan(plan)
  const request = authorization(plan, prepared.digest)
  request.id = id
  queue.lifecycle.authority.authorize(request)
  queue.lifecycle.track({ run: plan.run, revision: plan.revision, grant: id })
}

describe('durable delivery queue and current fencing', () => {
  it('limits targeted admission and deferrals without ignoring global reservations', () =>
    fixture(({ planning, plan }) => {
      const queue = new DeliveryQueue(planning.sources.files.root, () => at)
      register(queue, plan)
      const other = structuredClone(plan)
      other.run = 'delivery-aaaaaaaaaaaaaaaa'
      register(queue, other, 'authorization-aaaaaaaaaaaaaaaa')
      const foreign = queue.enqueue(other.run, { unit: 'contract', priority: 100 }),
        target = queue.enqueue(plan.run, { unit: 'contract' }),
        observed: string[] = []
      const result = queue.claim(
        owner,
        (candidate) => {
          observed.push(candidate.run)
          return ready()
        },
        { run: plan.run, queue: target.id },
      )
      expect(result.assignment?.run).toBe(plan.run)
      expect(observed).toEqual([plan.run])
      expect(queue.inspect(other.run)[0]).toEqual(foreign)
      expect(result.deferred).toEqual([])
      expect(queue.claim(owner, ready, { run: other.run, queue: foreign.id })).toMatchObject({
        assignment: null,
        deferred: [{ run: other.run, reason: 'repository-capacity' }],
      })
    }))

  it('refuses malformed target identities and never falls back to an unrelated pending entry', () =>
    fixture(({ planning, plan }) => {
      const queue = new DeliveryQueue(planning.sources.files.root, () => at)
      register(queue, plan)
      const target = queue.enqueue(plan.run, { unit: 'contract' }),
        before = queue.lifecycle.journal.events()
      expect(() => queue.claim(owner, ready, { run: 'wrong', queue: target.id })).toThrow(
        'invalid-queue-selection',
      )
      expect(
        queue.claim(owner, ready, { run: plan.run, queue: `queue-${'f'.repeat(32)}` }).assignment,
      ).toBeNull()
      expect(queue.lifecycle.journal.events()).toEqual(before)
    }))

  it('enqueues exact idempotent slots without starting a worker or changing the grant', () =>
    fixture(({ planning, plan }) => {
      const queue = new DeliveryQueue(planning.sources.files.root, () => at)
      register(queue, plan)
      const grant = queue.lifecycle.authority.inspect('authorization-0123456789abcdef')
      const first = queue.enqueue(plan.run, { unit: 'search', priority: 10 })
      const before = queue.lifecycle.journal.events()
      expect(queue.enqueue(plan.run, { unit: 'search', priority: 10 })).toEqual(first)
      expect(queue.lifecycle.journal.events()).toEqual(before)
      expect(queue.lifecycle.journal.get(plan.run).state).toBe('queued')
      expect(deliveryAttempts(queue.lifecycle.journal.get(plan.run)).records).toEqual([])
      expect(queue.lifecycle.authority.inspect(grant.grant.id)).toEqual(grant)
      expect(() => queue.enqueue(plan.run, { unit: 'search', priority: 11 })).toThrow(
        'changed-queue-priority',
      )
      expect(() => queue.enqueue(plan.run, { unit: 'absent' })).toThrow('unknown-queue-unit')
      expect(() =>
        queue.enqueue(plan.run, { unit: 'contract', cell: 'forged-builder-cell' }),
      ).toThrow('queue-enqueue')
    }))

  it('defaults to unavailable host admission and retains the reason without repeated events', () =>
    fixture(({ planning, plan }) => {
      const queue = new DeliveryQueue(planning.sources.files.root, () => at)
      register(queue, plan)
      queue.enqueue(plan.run, { unit: 'contract' })
      expect(queue.claim(owner)).toMatchObject({
        assignment: null,
        deferred: [{ reason: 'capability-unavailable' }],
      })
      const events = queue.lifecycle.journal.events()
      queue.claim(owner)
      expect(queue.lifecycle.journal.events()).toEqual(events)
      expect(queue.inspect(plan.run)[0]).toMatchObject({
        status: 'pending',
        reason: 'capability-unavailable',
      })
    }))

  it('selects eligible dependencies before a higher-priority dependent and retains fixture provenance', () =>
    fixture(({ planning, plan }) => {
      const queue = new DeliveryQueue(planning.sources.files.root, () => at)
      register(queue, plan)
      queue.enqueue(plan.run, { unit: 'search', priority: 100 })
      queue.enqueue(plan.run, { unit: 'contract' })
      const result = queue.claim(owner, ready)
      const contract = claimed(result)
      expect(contract.unit).toBe('contract')
      expect(result.deferred).toMatchObject([{ reason: 'dependencies-pending' }])
      queue.start(contract, runtime)
      queue.finish(contract, 'completed', 'b'.repeat(64))
      const search = claimed(queue.claim(owner, ready))
      expect(search.unit).toBe('search')
      expect(
        queue.inspect(plan.run).find((record) => record.id === search.queue)?.admission?.provenance,
      ).toBe('fixture')
      expect(queue.lifecycle.journal.get(plan.run).state).toBe('running')
    }))

  it('orders independent eligible units by priority and then retained enqueue sequence', () =>
    fixture(({ planning, plan }) => {
      entry(plan.work, 1).after = []
      entry(plan.work, 1).consumes = []
      const queue = new DeliveryQueue(planning.sources.files.root, () => at)
      register(queue, plan)
      queue.enqueue(plan.run, { unit: 'contract' })
      queue.enqueue(plan.run, { unit: 'search', priority: 1 })
      const first = claimed(queue.claim(owner, ready))
      expect(first.unit).toBe('search')
      queue.start(first, runtime)
      queue.finish(first, 'completed', 'b'.repeat(64))
      expect(claimed(queue.claim(owner, ready)).unit).toBe('contract')
    }))

  it.each(['global-capacity', 'repository-capacity'] as const)(
    'holds %s across runs with different local repository labels',
    (reason) =>
      fixture(({ planning, plan }) => {
        const capacity = {
          builders: reason === 'global-capacity' ? 1 : 2,
          buildersPerRepository: 1,
          evaluators: 4,
        }
        const queue = new DeliveryQueue(planning.sources.files.root, () => at, capacity)
        register(queue, plan)
        const other = structuredClone(plan)
        other.run = 'delivery-aaaaaaaaaaaaaaaa'
        entry(other.repositories, 0).id = 'another-label'
        for (const unit of other.work) unit.repository = 'another-label'
        register(queue, other, 'authorization-aaaaaaaaaaaaaaaa')
        queue.enqueue(plan.run, { unit: 'contract' })
        queue.enqueue(other.run, { unit: 'contract' })
        claimed(queue.claim(owner, ready))
        expect(queue.claim(owner, ready)).toMatchObject({
          assignment: null,
          deferred: [{ run: other.run, reason }],
        })
        const later = new DeliveryQueue(
          planning.sources.files.root,
          () => '2026-10-24T11:00:00.000Z',
          capacity,
        )
        expect(
          later.claim('controller-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', ready).assignment,
        ).toBeNull()
        expect(queue.inspect(other.run)[0]?.status).toBe('pending')
      }),
  )

  it('enforces per-run capacity across two distinct actual repositories', () =>
    fixture(({ planning, plan, root, dir }) => {
      const second = join(dir, 'second-repository')
      git(root, ['clone', '-q', root, second])
      plan.repositories.push({ ...entry(plan.repositories, 0), id: 'second', root: second })
      entry(plan.work, 1).repository = 'second'
      entry(plan.work, 1).after = []
      entry(plan.work, 1).consumes = []
      plan.budgets.builders = 1
      const queue = new DeliveryQueue(planning.sources.files.root, () => at, {
        builders: 10,
        buildersPerRepository: 10,
        evaluators: 10,
      })
      register(queue, plan)
      queue.enqueue(plan.run, { unit: 'contract' })
      queue.enqueue(plan.run, { unit: 'search' })
      claimed(queue.claim(owner, ready))
      expect(queue.claim(owner, ready)).toMatchObject({
        assignment: null,
        deferred: [{ reason: 'run-capacity' }],
      })
    }))

  it('shares remote capacity across distinct actual clones of one named code host', () =>
    fixture(({ planning, plan, root, dir }) => {
      const remote = { name: 'origin', url: 'https://github.com/example/tasks' }
      git(root, ['remote', 'add', 'origin', `${remote.url}.git`])
      entry(plan.repositories, 0).remote = remote
      const queue = new DeliveryQueue(planning.sources.files.root, () => at)
      register(queue, plan)
      const second = join(dir, 'another-clone')
      git(root, ['clone', '-q', root, second])
      git(second, ['remote', 'set-url', 'origin', `${remote.url}.git`])
      const other = structuredClone(plan)
      other.run = 'delivery-aaaaaaaaaaaaaaaa'
      entry(other.repositories, 0).root = second
      register(queue, other, 'authorization-aaaaaaaaaaaaaaaa')
      const one = queue.enqueue(plan.run, { unit: 'contract' })
      const two = queue.enqueue(other.run, { unit: 'contract' })
      expect(one.repositoryKey).not.toBe(two.repositoryKey)
      expect(one.remoteKey).toBe(two.remoteKey)
      claimed(queue.claim(owner, ready))
      expect(queue.claim(owner, ready)).toMatchObject({
        assignment: null,
        deferred: [{ reason: 'repository-capacity' }],
      })
    }))

  it('uses retained enqueue sequence to break equal-priority ties', () =>
    fixture(({ planning, plan }) => {
      entry(plan.work, 1).after = []
      entry(plan.work, 1).consumes = []
      const queue = new DeliveryQueue(planning.sources.files.root, () => at)
      register(queue, plan)
      queue.enqueue(plan.run, { unit: 'search' })
      queue.enqueue(plan.run, { unit: 'contract' })
      expect(claimed(queue.claim(owner, ready)).unit).toBe('search')
    }))

  it('keeps evaluator cells independently fenced and outside builder capacity', () =>
    fixture(({ planning, plan }) => {
      const queue = new DeliveryQueue(planning.sources.files.root, () => at, {
        builders: 1,
        buildersPerRepository: 1,
        evaluators: 1,
      })
      register(queue, plan)
      queue.enqueue(plan.run, { unit: 'contract', role: 'verifier', cell: 'api' })
      queue.enqueue(plan.run, { unit: 'contract', role: 'verifier', cell: 'cli' })
      queue.enqueue(plan.run, { unit: 'contract' })
      const evaluator = claimed(queue.claim(owner, ready))
      expect(evaluator.cell).toBe('api')
      const builder = claimed(queue.claim(owner, ready))
      expect(builder.role).toBe('builder')
      expect(queue.claim(owner, ready).assignment).toBeNull()
      queue.start(evaluator, runtime)
      expect(() => queue.start(builder, runtime)).toThrow('runtime-already-assigned')
      queue.start(builder, { ...runtime, worker: 'builder-worker' })
    }))

  it('refuses unconfirmed requeue and denies old completion and broker mutations after fencing', () =>
    fixture(({ planning, plan }) => {
      const queue = new DeliveryQueue(planning.sources.files.root, () => at)
      register(queue, plan)
      queue.enqueue(plan.run, { unit: 'contract' })
      const old = claimed(queue.claim(owner, ready))
      queue.start(old, runtime)
      const scope: BrokerScope = {
        grant: old.grant,
        run: old.run,
        revision: old.revision,
        plan: old.plan,
        unit: old.unit,
        attempt: old.attempt,
        generation: old.generation,
        role: old.role,
        runtime: runtime.instance,
        criteria: [],
        findings: [],
        contracts: ['search-api'],
      }
      const broker = new DeliveryBroker(queue.lifecycle.authority, {
        current: (value) => queue.current(value),
        planAccepted: () => true,
        ownsBranch: () => true,
        observe: (value) => ({
          instance: value.runtime,
          assignment: contractDigest(value),
          containment: 'isolated',
          controllerStore: 'denied',
          credentials: 'denied',
          tools: 'restricted',
          interactive: 'disabled',
          provenance: 'fixture',
        }),
      })
      const peer = broker.open(scope)
      expect(peer.available).toBe(true)
      const request = {
        schema: 'wholeloop/delivery-broker-request@1',
        id: 'request-0123456789abcdef',
        method: 'effect.request',
        data: {
          effect: 'git.commit',
          repository: 'app',
          branch: 'wl/contract',
          sha256: 'a'.repeat(64),
        },
      }
      expect(peer.request(request).status).toBe('recorded')
      expect(() => queue.requeue(old, 'b'.repeat(64))).toThrow('queue-retry-without-fence')
      queue.finish(old, 'failed', 'b'.repeat(64))
      expect(() => queue.requeue(old, 'b'.repeat(64))).toThrow('queue-retry-without-fence')
      queue.fence(old)
      expect(() =>
        queue.lifecycle.append(old.run, {
          schema: 'wholeloop/delivery-attempt-event@1',
          action: 'completed',
          id: old.attempt,
          basis: old.plan,
          unit: old.unit,
          role: old.role,
          generation: old.generation,
          evidence: 'd'.repeat(64),
        }),
      ).toThrow('attempt-transition')
      expect(peer.request(request)).toMatchObject({
        status: 'denied',
        reason: 'stale-assignment',
        effects: 'not-performed',
      })
      queue.requeue(old, 'c'.repeat(64))
      const current = claimed(queue.claim(owner, ready))
      expect(current.generation).toBe(2)
      expect(current.attempt).not.toBe(old.attempt)
      expect(() => queue.finish(old, 'completed', 'd'.repeat(64))).toThrow('stale-queue-lease')
      expect(() =>
        queue.start(
          { ...current, controller: 'controller-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
          runtime,
        ),
      ).toThrow('stale-queue-lease')
    }))

  it.each(['revoked', 'expired', 'rollback', 'changed-base', 'host-denied'] as const)(
    'retains queued work after %s',
    (failure) =>
      fixture(({ planning, plan, root }) => {
        let now = at
        const queue = new DeliveryQueue(planning.sources.files.root, () => now)
        register(queue, plan)
        queue.enqueue(plan.run, { unit: 'contract' })
        if (failure === 'revoked')
          queue.lifecycle.authority.revoke({
            schema: 'wholeloop/delivery-revocation-request@1',
            grant: 'authorization-0123456789abcdef',
            operator: 'Fixture Operator',
            reason: 'End the fixture grant.',
          })
        if (failure === 'expired') now = '2026-10-26T10:00:00.000Z'
        if (failure === 'rollback') now = '2026-10-24T09:00:00.000Z'
        if (failure === 'changed-base')
          git(root, ['commit', '--allow-empty', '-m', 'test: advance the fixture base'])
        const result = queue.claim(
          owner,
          failure === 'host-denied'
            ? () => ({ ready: false, reason: 'environment-unavailable' })
            : ready,
        )
        expect(result.assignment).toBeNull()
        expect(result.deferred[0]?.reason).toBe(
          failure === 'rollback'
            ? 'clock-regression'
            : failure === 'host-denied'
              ? 'environment-unavailable'
              : 'basis-or-admission-unavailable',
        )
        expect(queue.inspect(plan.run)[0]?.status).toBe('pending')
        expect(deliveryAttempts(queue.lifecycle.journal.get(plan.run)).records).toEqual([])
      }),
  )

  it('refuses malformed capacity and preserves unknown active reservations', () =>
    fixture(({ planning, plan }) => {
      const store = planning.sources.files.root
      expect(
        () =>
          new DeliveryQueue(store, () => at, {
            builders: 0,
            buildersPerRepository: 1,
            evaluators: 4,
          }),
      ).toThrow('invalid-queue-capacity')
      const queue = new DeliveryQueue(store, () => at)
      register(queue, plan)
      queue.enqueue(plan.run, { unit: 'contract' })
      queue.enqueue(plan.run, { unit: 'contract', role: 'reviewer', cell: 'independent' })
      queue.lifecycle.append(plan.run, {
        schema: 'wholeloop/delivery-attempt-event@1',
        action: 'claimed',
        id: 'attempt-aaaaaaaaaaaaaaaa',
        basis: queue.lifecycle.journal.get(plan.run).basis.digest,
        unit: 'search',
        role: 'builder',
        generation: 1,
      })
      const result = queue.claim(owner, ready)
      expect(result.deferred[0]?.reason).toBe('unknown-reservation')
      expect(claimed(result).role).toBe('reviewer')
    }))

  it('serializes actual competing controller processes to one persisted claim', () =>
    fixture(async ({ planning, plan, dir }) => {
      const queue = new DeliveryQueue(planning.sources.files.root, () => at)
      register(queue, plan)
      queue.enqueue(plan.run, { unit: 'contract' })
      const executable = join(dir, 'claim.mjs')
      buildSync({
        stdin: {
          contents: `import {DeliveryQueue} from './src/delivery/queue.ts';const queue=new DeliveryQueue(process.argv[2],()=>${JSON.stringify(at)});console.log(JSON.stringify(queue.claim(process.argv[3],()=>({ready:true,provenance:'fixture',evidence:'a'.repeat(64)}))));`,
          resolveDir: resolve('.'),
          sourcefile: 'fixture-claim.ts',
        },
        outfile: executable,
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
      const run = (controller: string) =>
        new Promise<ReturnType<DeliveryQueue['claim']>>((resolveResult, reject) => {
          const process = spawn(globalThis.process.execPath, [
            executable,
            planning.sources.files.root,
            controller,
          ])
          let stdout = '',
            stderr = ''
          process.stdout.on('data', (chunk) => {
            stdout += chunk
          })
          process.stderr.on('data', (chunk) => {
            stderr += chunk
          })
          process.on('error', reject)
          process.on('close', (code) => {
            if (code !== 0) reject(new Error(stderr))
            else resolveResult(JSON.parse(stdout))
          })
        })
      const results = await Promise.all([
        run(owner),
        run('controller-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
      ])
      expect(results.filter((result) => result.assignment !== null)).toHaveLength(1)
      const attempts = deliveryAttempts(queue.lifecycle.journal.get(plan.run)).records
      expect(attempts).toHaveLength(1)
      expect(attempts[0]?.state).toBe('claimed')
    }))
})
