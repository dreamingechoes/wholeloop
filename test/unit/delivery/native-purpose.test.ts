import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findBudget } from '../../../src/delivery/budget-events.js'
import type { NativeBoundaryHost, NativeRunOptions } from '../../../src/delivery/native-host.js'
import {
  NativePurposeAttempts,
  type NativePurposeLease,
} from '../../../src/delivery/native-purpose.js'
import { DeliveryQueue } from '../../../src/delivery/queue.js'
import { deliveryAttempts } from '../../../src/delivery/reducer.js'
import { workerProcess } from '../../../src/fanout/process.js'
import { authorization, envelope, fixture, git } from '../../support/delivery.js'

const at = '2026-10-26T03:00:00.000Z'
const hash = (text: string) => createHash('sha256').update(text).digest('hex')
const boundary: NativeBoundaryHost = {
  observe: ({ assignment, recipe, model }) => ({
    schema: 'wholeloop/delivery-native-observation@1',
    target: recipe.target,
    version: recipe.version,
    role: assignment.identity.role,
    assignment: assignment.assignment,
    policy: recipe.policy,
    model,
    evidence: 'f'.repeat(64),
    provenance: 'fixture',
    authenticated: true,
    boundary: {
      contained: true,
      controllerStoreDenied: true,
      credentialsDenied: true,
      toolsRestricted: true,
      interactiveDisabled: true,
      cancellable: true,
      completeOutput: true,
      ownedOutputReader: true,
    },
    metering: { hardTokens: false, hardCurrency: false },
  }),
}
async function setup(
  run: (input: {
    purpose: NativePurposeAttempts
    claim: (role?: 'planner' | 'challenger', key?: string) => NativePurposeLease
    options: NativeRunOptions
    root: string
    dir: string
    run: string
    grant: string
  }) => Promise<void>,
  options: { envelope?: boolean; mode?: 'wrong' | 'malformed' | 'valid'; probeMs?: number } = {},
) {
  await fixture(async ({ plan, planning, root, dir }) => {
    if (options.probeMs) plan.budgets.attemptMs = options.probeMs
    const content = 'Pinned decision context.\n',
      contextRoot = join(dir, 'context'),
      bin = join(dir, 'bin')
    mkdirSync(join(contextRoot, 'artifacts'), { recursive: true })
    mkdirSync(bin)
    writeFileSync(join(contextRoot, 'artifacts/source.txt'), content)
    plan.policy.delegations = [
      {
        id: 'approve-spec',
        rubric: { ref: 'rubrics/spec.json', sha256: 'a'.repeat(64) },
        evidence: ['verification'],
        fallback: 'blocked',
      },
    ]
    const prepared = planning.preparePlan(plan),
      request = authorization(plan, prepared.digest)
    request.decisions = ['approve-spec']
    let envelopeDigest: string | undefined
    if (options.envelope) {
      envelopeDigest = planning.prepareEnvelope(envelope(plan)).digest
      request.basis = { kind: 'envelope', digest: envelopeDigest }
    }
    const queue = new DeliveryQueue(
      planning.sources.files.root,
      () => at,
      undefined,
      () => ({ wall: at, monotonicMs: 0, epoch: 'fixture-purpose-clock' }),
    )
    const grant = queue.lifecycle.authority.authorize(request)
    queue.lifecycle.track({
      run: plan.run,
      ...(envelopeDigest ? { envelope: envelopeDigest } : { revision: 1 }),
      grant: grant.grant.id,
    })
    queue.lifecycle.transition(plan.run, {
      to: 'queued',
      reason: 'Run explicitly authorized fixture decisions.',
    })
    for (const target of ['claude', 'codex']) {
      const executable = join(bin, target)
      writeFileSync(
        executable,
        `#!${process.execPath}
let body='';process.stdin.on('data',chunk=>body+=chunk);process.stdin.on('end',()=>{
const a=JSON.parse(body).assignment;
if(${JSON.stringify(options.mode)}==='malformed'){console.log('{');return}
const proposal={schema:'wholeloop/delivery-worker-proposal@1',assignment:${JSON.stringify(options.mode)}==='wrong'?'f'.repeat(64):a.assignment,status:'complete',summary:'Independent fixture decision report.',artifacts:[{ref:'artifacts/decision.json',kind:'report',text:JSON.stringify({role:a.identity.role,outcome:'accept'})}],criteria:[],findings:[],unknowns:[]};
if(${JSON.stringify(target)}==='claude')console.log(JSON.stringify({is_error:false,structured_output:proposal}));
else {console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify(proposal)}}));console.log(JSON.stringify({type:'turn.completed'}))}
});\n`,
      )
      chmodSync(executable, 0o700)
    }
    const purpose = new NativePurposeAttempts(queue)
    await run({
      purpose,
      root,
      dir,
      run: plan.run,
      grant: grant.grant.id,
      claim: (role = 'planner', key = '1'.repeat(64)) =>
        purpose.claim({
          run: plan.run,
          grant: grant.grant.id,
          decision: 'approve-spec',
          key,
          role,
          brief: 'Judge the pinned specification independently.',
          environment: { id: 'fixture', recipe: 'b'.repeat(64), boundary: 'c'.repeat(64) },
          contextRoot,
          context: [
            {
              kind: 'source',
              audience: 'shared',
              artifact: {
                ref: 'artifacts/source.txt',
                bytes: Buffer.byteLength(content),
                sha256: hash(content),
              },
            },
          ],
          provenance: 'fixture',
        }),
      options: {
        target: 'claude',
        version: '2.1.307',
        model: 'fixture-model',
        path: `${bin}:${process.env.PATH ?? ''}`,
        host: boundary,
      },
    })
  })
}

describe('owned native decision purpose attempts', () => {
  it('awaits asynchronous runtime observation before starting the original worker', async () => {
    await setup(async ({ purpose, claim, options }) => {
      let observed = false
      const receipt = await purpose.run(claim(), {
        ...options,
        host: {
          observe: async (input) => {
            await Promise.resolve()
            observed = true
            return await options.host?.observe(input)
          },
        },
      })
      expect(observed).toBe(true)
      expect(receipt.status).toBe('succeeded')
    })
  })
  it('bounds a hanging runtime probe and retains its consumed attempt instead of launching a model', async () => {
    await setup(
      async ({ purpose, claim, options, run }) => {
        const lease = claim()
        let aborted = false,
          launched = false
        await expect(
          purpose.run(lease, {
            ...options,
            host: {
              observe: ({ signal }) =>
                new Promise((resolve) => {
                  signal?.addEventListener(
                    'abort',
                    () => {
                      aborted = true
                      resolve(undefined)
                    },
                    { once: true },
                  )
                }),
            },
            process: async () => {
              launched = true
              throw new Error('A model must not start')
            },
          }),
        ).rejects.toThrow('Native boundary observation unresolved')
        expect(aborted).toBe(true)
        expect(launched).toBe(false)
        expect(deliveryAttempts(purpose.queue.lifecycle.journal.get(run)).records[0]?.state).toBe(
          'claimed',
        )
        await expect(purpose.run(lease, options)).rejects.toThrow('purpose-already-invoked')
      },
      { probeMs: 500 },
    )
  })
  it('does not replay a consumed purpose after a pre-launch observer failure', async () => {
    await setup(async ({ purpose, claim, options, run }) => {
      const lease = claim()
      await expect(
        purpose.run(lease, {
          ...options,
          host: {
            observe: () => {
              throw new Error('Injected observer failure')
            },
          },
        }),
      ).rejects.toThrow('Native boundary observation unresolved; original attempt retained')
      await expect(purpose.run(lease, options)).rejects.toThrow('purpose-already-invoked')
      expect(() => claim('challenger')).toThrow('purpose-unresolved-evaluator')
      expect(deliveryAttempts(purpose.queue.lifecycle.journal.get(run)).records[0]?.state).toBe(
        'claimed',
      )
    })
  })
  it('holds capacity when the process owner cannot establish closure', async () => {
    await setup(async ({ purpose, claim, options, run }) => {
      const lease = claim()
      const receipt = await purpose.run(lease, {
        ...options,
        process: async (command, args, input) => ({
          ...(await workerProcess(command, args, input)),
          ownership: { invocationState: 'unknown' },
        }),
      })
      expect(receipt).toMatchObject({ status: 'failed', reason: 'runtime-unobserved' })
      expect(purpose.completed(lease, receipt)).toBe(false)
      expect(deliveryAttempts(purpose.queue.lifecycle.journal.get(run)).records[0]?.state).toBe(
        'started',
      )
      expect(() => claim('challenger')).toThrow('purpose-unresolved-evaluator')
      await expect(purpose.run(lease, options)).rejects.toThrow('purpose-not-ready')
    })
  })
  it('refuses unsupported hard native metering before reserving an attempt', async () => {
    await setup(async ({ purpose, claim, run, grant }) => {
      const state = purpose.queue.lifecycle.journal.get(run)
      purpose.budgets.configure({
        schema: 'wholeloop/delivery-budget-constraints@1',
        operator: 'Fixture Operator',
        run,
        basis: state.basis.digest,
        grantDigest: state.grant?.digest,
        requirements: { tokens: { mode: 'hard', limit: 100 } },
      })
      expect(grant).toBe(state.grant?.id)
      expect(() => claim()).toThrow('unsupported-hard-token-limit')
      expect(deliveryAttempts(purpose.queue.lifecycle.journal.get(run)).records).toHaveLength(0)
    })
  })
  it.each(['claude', 'codex'])(
    'executes %s planner/challenger without an implementation unit',
    async (target) => {
      await setup(async ({ purpose, claim, options, run }) => {
        options = { ...options, target, version: target === 'claude' ? '2.1.307' : '0.163.0' }
        const planner = claim(),
          first = await purpose.run(planner, options)
        expect(first).toMatchObject({
          status: 'succeeded',
          execution: { provenance: 'fixture' },
          acceptance: 'not-established',
        })
        expect(first.result?.identity).toMatchObject({ role: 'planner', generation: 1 })
        expect(first.result?.identity.unit).toBeUndefined()
        const challenger = claim('challenger'),
          second = await purpose.run(challenger, options)
        expect(second).toMatchObject({
          status: 'succeeded',
          result: { identity: { role: 'challenger' } },
        })
        expect(second.execution?.runtime).not.toEqual(first.execution?.runtime)
        const state = purpose.queue.lifecycle.journal.get(run)
        expect(deliveryAttempts(state).records.map((item) => item.state)).toEqual([
          'completed',
          'completed',
        ])
        expect(findBudget(state)?.reservations).toHaveLength(2)
        expect(first.artifacts).toHaveLength(1)
        expect(
          existsSync(
            join(
              purpose.queue.lifecycle.journal.files.root,
              first.directory,
              'outputs/artifacts/decision.json',
            ),
          ),
        ).toBe(false)
      })
    },
  )
  it('supports an original envelope without fabricating a plan revision', async () => {
    await setup(
      async ({ purpose, claim, options }) => {
        const lease = claim()
        expect(lease.assignment.identity.revision).toBe(0)
        expect((await purpose.run(lease, options)).status).toBe('succeeded')
      },
      { envelope: true },
    )
  })
  it('refuses a repeated decision claim and a repeated consumed invocation', async () => {
    await setup(async ({ purpose, claim, options, run }) => {
      const lease = claim()
      expect(() => claim()).toThrow('purpose-already-claimed')
      await purpose.run(lease, options)
      await expect(purpose.run(lease, options)).rejects.toThrow('purpose-not-ready')
      expect(findBudget(purpose.queue.lifecycle.journal.get(run))?.reservations).toHaveLength(1)
    })
  })
  it('holds an unresolved purpose before another decision or normal evaluator admission', async () => {
    await setup(async ({ purpose, claim, run }) => {
      claim()
      expect(() => claim('challenger')).toThrow('purpose-unresolved-evaluator')
      const queue = purpose.queue
      queue.enqueue(run, { unit: 'contract', role: 'verifier', cell: 'separate' })
      const selected = queue.claim('controller-0123456789abcdef0123456789abcdef', () => ({
        ready: true,
        provenance: 'fixture',
        evidence: 'e'.repeat(64),
      }))
      expect(selected.assignment).toBeNull()
      expect(selected.deferred).toEqual(
        expect.arrayContaining([expect.objectContaining({ reason: 'unknown-reservation' })]),
      )
    })
  })
  it.each(['wrong', 'malformed'] as const)(
    'refuses %s output without settling a successful decision',
    async (mode) => {
      await setup(
        async ({ purpose, claim, options, run }) => {
          const lease = claim(),
            result = await purpose.run(lease, options)
          expect(result).toMatchObject({ status: 'failed', reason: 'invalid-output' })
          expect(findBudget(purpose.queue.lifecycle.journal.get(run))?.artifacts).toHaveLength(0)
        },
        { mode },
      )
    },
  )
  it('requires live native proof even when a private purpose lease exists', async () => {
    await setup(async ({ purpose, claim, options, run }) => {
      const { host: _host, ...unobserved } = options
      expect(await purpose.run(claim(), unobserved)).toMatchObject({
        status: 'unavailable',
        reason: 'runtime-unobserved',
      })
      expect(deliveryAttempts(purpose.queue.lifecycle.journal.get(run)).records[0]?.state).toBe(
        'stopped',
      )
    })
  })
  it('rejects modified private bindings, changed input bytes and moving repository bases', async () => {
    await setup(async ({ purpose, claim, options, root }) => {
      const lease = claim()
      await expect(purpose.run({ ...lease, provenance: 'host-observed' }, options)).rejects.toThrow(
        'purpose-binding',
      )
      const input = join(lease.contextRoot, 'artifacts/source.txt'),
        previous = readFileSync(input)
      writeFileSync(input, 'Changed source.')
      await expect(purpose.run(lease, options)).rejects.toThrow('changed-context')
      writeFileSync(input, previous)
      writeFileSync(join(root, 'app.txt'), 'Changed base.')
      git(root, ['add', 'app.txt'])
      git(root, [
        'commit',
        '-m',
        'fix: change the fixture base',
        '-m',
        'Observe original basis invalidation.',
      ])
      await expect(purpose.run(lease, options)).rejects.toThrow()
    })
  })
  it('refuses revoked authority before sending private input', async () => {
    await setup(async ({ purpose, claim, options, grant }) => {
      const lease = claim()
      purpose.queue.lifecycle.authority.revoke({
        schema: 'wholeloop/delivery-revocation-request@1',
        grant,
        operator: 'Fixture Operator',
        reason: 'Revoke before launch.',
      })
      await expect(purpose.run(lease, options)).rejects.toThrow('purpose-inactive-authority')
    })
  })
})
