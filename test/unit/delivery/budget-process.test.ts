import { spawn, spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { buildSync } from 'esbuild'
import { describe, expect, it } from 'vitest'
import { harnessAssets } from '../../../scripts/harness-assets.mjs'
import { DeliveryBudgets } from '../../../src/delivery/budgets.js'
import { DeliveryLockRecovery } from '../../../src/delivery/lock-recovery.js'
import { DeliveryQueue } from '../../../src/delivery/queue.js'
import { authorization, entry, fixture } from '../../support/delivery.js'

const at = '2026-10-24T10:00:00.000Z'
function bundle(contents: string, outfile: string) {
  buildSync({
    stdin: { contents, resolveDir: resolve('.'), sourcefile: 'budget-process-fixture.ts' },
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
function execute(executable: string, args: string[]): Promise<Record<string, unknown>> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [executable, ...args])
    let stdout = '',
      stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(stderr))
      else resolveResult(JSON.parse(stdout))
    })
  })
}
describe('atomic budget reservations across real controllers', () => {
  it('allows only one of two independent eligible workers to reserve a limited token budget', () =>
    fixture(async ({ planning, plan, dir }) => {
      entry(plan.work, 1).after = []
      entry(plan.work, 1).consumes = []
      plan.budgets.buildersPerRepository = 2
      const prepared = planning.preparePlan(plan)
      const queue = new DeliveryQueue(planning.sources.files.root, () => at)
      const grant = queue.lifecycle.authority.authorize(authorization(plan, prepared.digest))
      queue.lifecycle.track({ run: plan.run, revision: 1, grant: grant.grant.id })
      new DeliveryBudgets(planning.sources.files.root, () => at).configure({
        schema: 'wholeloop/delivery-budget-constraints@1',
        operator: 'Fixture Operator',
        run: plan.run,
        basis: prepared.digest,
        grantDigest: grant.digest,
        requirements: { tokens: { limit: 100, mode: 'hard' } },
      })
      queue.enqueue(plan.run, { unit: 'contract' })
      queue.enqueue(plan.run, { unit: 'search' })
      const executable = join(dir, 'budget-claim.mjs')
      bundle(
        `import {DeliveryQueue} from './src/delivery/queue.ts';const queue=new DeliveryQueue(process.argv[2],()=>${JSON.stringify(at)},{builders:10,buildersPerRepository:10,evaluators:10});console.log(JSON.stringify(queue.claim(process.argv[3],()=>({ready:true,provenance:'fixture',evidence:'a'.repeat(64),metering:{hardTokens:true,hardCurrency:false,tokensMaximum:70,meter:'fixture-meter',provenance:'fixture',evidence:'a'.repeat(64)}}))));`,
        executable,
      )
      const results = await Promise.all(
        [
          'controller-0123456789abcdef0123456789abcdef',
          'controller-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        ].map((owner) => execute(executable, [planning.sources.files.root, owner])),
      )
      expect(results.filter((result) => result.assignment !== null)).toHaveLength(1)
      const report = new DeliveryBudgets(planning.sources.files.root, () => at).inspect(plan.run)
      expect(report.reservations).toHaveLength(1)
      expect(report.reservations[0]?.metering?.tokensMaximum).toBe(70)
      expect(report.usage.tokens.value).toBeNull()
    }))

  it('prevents two processes from oversubscribing artifact bytes before writing', () =>
    fixture(async ({ planning, plan, dir }) => {
      plan.budgets.artifactBytes = 5
      const prepared = planning.preparePlan(plan),
        queue = new DeliveryQueue(planning.sources.files.root, () => at)
      queue.lifecycle.authority.authorize(authorization(plan, prepared.digest))
      queue.lifecycle.track({ run: plan.run, revision: 1, grant: 'authorization-0123456789abcdef' })
      const executable = join(dir, 'artifact-capture.mjs')
      bundle(
        `import {DeliveryBudgets} from './src/delivery/budgets.ts';console.log(JSON.stringify(new DeliveryBudgets(process.argv[2],()=>${JSON.stringify(at)}).captureArtifact(process.argv[3],Buffer.from(process.argv[4]))));`,
        executable,
      )
      const results = await Promise.all(
        ['abc', 'def'].map((body) =>
          execute(executable, [planning.sources.files.root, plan.run, body]),
        ),
      )
      expect(results.filter((result) => result.stored === true)).toHaveLength(1)
      expect(results.filter((result) => result.reason === 'artifact-byte-limit')).toHaveLength(1)
      expect(
        new DeliveryBudgets(planning.sources.files.root, () => at).inspect(plan.run).counters
          .artifactBytes,
      ).toBe(3)
    }))

  it.each(['before', 'after'] as const)(
    'retains an artifact reservation after actual SIGKILL %s the file replacement',
    (phase) =>
      fixture(({ planning, plan, dir }) => {
        plan.budgets.artifactBytes = 5
        const prepared = planning.preparePlan(plan),
          queue = new DeliveryQueue(planning.sources.files.root, () => at)
        queue.lifecycle.authority.authorize(authorization(plan, prepared.digest))
        queue.lifecycle.track({
          run: plan.run,
          revision: 1,
          grant: 'authorization-0123456789abcdef',
        })
        const executable = join(dir, 'artifact-crash.mjs')
        bundle(
          `import {DeliveryBudgets} from './src/delivery/budgets.ts';const [store,run,phase]=process.argv.slice(2);const budgets=new DeliveryBudgets(store,()=>${JSON.stringify(at)});const atomic=budgets.lifecycle.journal.files.atomic.bind(budgets.lifecycle.journal.files);budgets.lifecycle.journal.files.atomic=(path,body)=>{if(phase==='before'&&path.startsWith('delivery/artifacts/'))process.kill(process.pid,'SIGKILL');atomic(path,body);if(phase==='after'&&path.startsWith('delivery/artifacts/'))process.kill(process.pid,'SIGKILL')};budgets.captureArtifact(run,Buffer.from('abc'));`,
          executable,
        )
        const killed = spawnSync(
          process.execPath,
          [executable, planning.sources.files.root, plan.run, phase],
          { encoding: 'utf8' },
        )
        expect(killed.signal, killed.stderr).toBe('SIGKILL')
        const locks = new DeliveryLockRecovery(planning.sources.files.root),
          stopped = locks.inspect()
        expect(stopped.status).toBe('stopped')
        if (!('digest' in stopped) || !stopped.digest)
          throw new Error('Observed stopped-writer digest required')
        locks.repair(stopped.digest)
        const recovered = new DeliveryBudgets(planning.sources.files.root, () => at)
        expect(recovered.inspect(plan.run)).toMatchObject({
          counters: { artifactBytes: 3 },
          artifacts: [{ status: 'reserved' }],
        })
        expect(recovered.captureArtifact(plan.run, Buffer.from('abc')).stored).toBe(true)
        expect(recovered.inspect(plan.run)).toMatchObject({
          counters: { artifactBytes: 3 },
          artifacts: [{ status: 'observed' }],
        })
        expect(recovered.captureArtifact(plan.run, Buffer.from('def'))).toMatchObject({
          stored: false,
          reason: 'artifact-byte-limit',
        })
      }),
  )
})
