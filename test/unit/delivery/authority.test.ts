import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { type AuthorizationRequest, DeliveryAuthority } from '../../../src/delivery/authority.js'
import {
  type BrokerBoundary,
  type BrokerScope,
  DeliveryBroker,
  deliveryWorkerEnvironment,
  type TrustedBrokerRuntime,
} from '../../../src/delivery/broker.js'
import type { DeliveryPlan } from '../../../src/delivery/plan.js'
import { authorization, entry, envelope, fixture, git } from '../../support/delivery.js'
import { environmentNames } from '../../support/platform.js'

const at = '2026-10-24T10:00:00.000Z'
function assignment(plan: DeliveryPlan, digest: string): BrokerScope {
  return {
    grant: 'authorization-0123456789abcdef',
    run: plan.run,
    revision: plan.revision,
    plan: digest,
    unit: 'search',
    attempt: 'attempt-0123456789abcdef',
    generation: 1,
    role: 'builder',
    runtime: 'fixture-runtime',
    criteria: ['search'],
    findings: ['finding-fixture'],
    contracts: ['search-api'],
  }
}
function runtime(overrides: Partial<TrustedBrokerRuntime> = {}): TrustedBrokerRuntime {
  return {
    observe(scope) {
      return {
        instance: scope.runtime,
        assignment: contractDigest(scope),
        containment: 'isolated',
        controllerStore: 'denied',
        credentials: 'denied',
        tools: 'restricted',
        interactive: 'disabled',
        provenance: 'fixture',
      }
    },
    current: () => true,
    planAccepted: () => false,
    ownsBranch: (_scope, repository, branch) =>
      repository === 'app' && branch === 'wl/owned-fixture',
    ...overrides,
  }
}
const proposal = () => ({
  schema: 'wholeloop/delivery-broker-request@1',
  id: 'request-0123456789abcdef',
  method: 'artifact.propose',
  data: { kind: 'patch', ref: 'artifacts/patch.json', sha256: 'a'.repeat(64) },
})

describe('explicit delivery authority (AUTH-03–AUTH-08)', () => {
  it('authorizes, inspects and revokes through independent compiled processes', () =>
    fixture(({ plan, planning, dir, state }) => {
      const prepared = planning.preparePlan(plan)
      const file = join(dir, 'authorization.json')
      writeFileSync(file, JSON.stringify(authorization(plan, prepared.digest)))
      const call = (args: string[]) => {
        const result = spawnSync(
          process.execPath,
          [
            resolve('dist/wl.mjs'),
            'delivery',
            ...args,
            '--store',
            planning.sources.files.root,
            '--json',
          ],
          { encoding: 'utf8' },
        )
        expect(result.status, result.stderr).toBe(0)
        return JSON.parse(result.stdout)
      }
      const issued = call(['authorize', '--file', file, '--root', dir])
      expect(issued).toMatchObject({
        schema: 'wholeloop/delivery-authorization@1',
        status: 'active',
        runtime: 'not-observed-by-this-command',
      })
      expect(call(['grant', '--id', issued.grant.id]).grant).toEqual(issued.grant)
      const revoke = join(dir, 'revoke.json')
      writeFileSync(
        revoke,
        JSON.stringify({
          schema: 'wholeloop/delivery-revocation-request@1',
          grant: issued.grant.id,
          operator: 'Fixture Operator',
          reason: 'End this disposable trial.',
        }),
      )
      expect(call(['revoke', '--file', revoke, '--root', dir]).status).toBe('revoked')
      expect(call(['grant', '--id', issued.grant.id]).status).toBe('revoked')
      expect(state.events()).toEqual([])
    }))
  it('binds one explicit operator action without manufacturing human testing or extending it on retry', () =>
    fixture(({ plan, planning, state }) => {
      const prepared = planning.preparePlan(plan)
      let now = at
      const authority = new DeliveryAuthority(planning.sources.files.root, () => now)
      const request = authorization(plan, prepared.digest)
      const issued = authority.authorize(request)
      expect(issued.status).toBe('active')
      expect(issued.grant.policy).toEqual(plan.policy)
      expect(issued.grant.budgets).toEqual(plan.budgets)
      expect(issued.grant.provenance).toBe('operator-control')
      expect(issued.grant.expiresAt).toBe('2026-10-25T10:00:00.000Z')
      expect(issued.grant.owner).toBe('Fixture Owner')
      expect(issued.grant.operator).toBe('Fixture Operator')
      now = '2026-10-24T11:00:00.000Z'
      expect(authority.authorize(request).grant).toEqual(issued.grant)
      expect(() => authority.authorize({ ...request, effectLimit: 30 })).toThrow(
        'authorization-id-conflict',
      )
      expect(state.events()).toEqual([])
      expect(Object.hasOwn(issued.grant, 'by')).toBe(false)
    }))

  it('expires, detects pre-issuance clock rollback and retains an idempotent explicit revocation', () =>
    fixture(({ plan, planning }) => {
      const prepared = planning.preparePlan(plan)
      let now = at
      const authority = new DeliveryAuthority(planning.sources.files.root, () => now)
      const first = authority.authorize(authorization(plan, prepared.digest))
      now = '2026-10-25T10:00:00.000Z'
      expect(authority.inspect(first.grant.id).status).toBe('expired')
      now = '2026-10-24T09:59:59.000Z'
      expect(authority.inspect(first.grant.id).status).toBe('clock-invalid')
      now = '2026-10-24T12:00:00.000Z'
      const request = {
        schema: 'wholeloop/delivery-revocation-request@1',
        grant: first.grant.id,
        operator: 'Fixture Operator',
        reason: 'Stop this authorized route.',
      }
      const revoked = authority.revoke(request)
      expect(revoked.status).toBe('revoked')
      expect(revoked.revocation?.schema).toBe('wholeloop/delivery-revocation@1')
      now = '2026-10-24T13:00:00.000Z'
      expect(authority.revoke(request).revocation).toEqual(revoked.revocation)
      expect(authority.authorize(authorization(plan, prepared.digest)).status).toBe('revoked')
    }))

  it.each([
    ['extra authority', (r: AuthorizationRequest) => ({ ...r, humanTested: true })],
    ['altered budgets', (r: AuthorizationRequest) => ({ ...r, budgets: { wallTimeMs: 1 } })],
    ['unknown effect', (r: AuthorizationRequest) => ({ ...r, effects: ['production.deploy'] })],
    [
      'duplicate effects',
      (r: AuthorizationRequest) => ({ ...r, effects: ['source.read', 'source.read'] }),
    ],
    ['undeclared decision', (r: AuthorizationRequest) => ({ ...r, decisions: ['acceptance'] })],
    [
      'wrong repository',
      (r: AuthorizationRequest) => ({
        ...r,
        repositories: [{ repository: 'other', topicPrefix: 'wl/' }],
      }),
    ],
    [
      'unowned branch prefix',
      (r: AuthorizationRequest) => ({
        ...r,
        repositories: [{ repository: 'app', topicPrefix: 'main/' }],
      }),
    ],
    [
      'write through read policy',
      (r: AuthorizationRequest) => ({
        ...r,
        reads: [{ provider: 'notion', scope: 'team', operations: ['docs.update'] }],
      }),
    ],
    [
      'expired initial deadline',
      (r: AuthorizationRequest) => ({ ...r, expiresAt: '2026-10-24T09:00:00.000Z' }),
    ],
  ] as const)('refuses %s', (_name, change) =>
    fixture(({ plan, planning }) => {
      const prepared = planning.preparePlan(plan)
      const authority = new DeliveryAuthority(planning.sources.files.root, () => at)
      expect(() => authority.authorize(change(authorization(plan, prepared.digest)))).toThrow()
      expect(existsSync(planning.sources.files.path('delivery/authority/grants'))).toBe(false)
    }),
  )

  it.each(['research-report', 'local-handoff', 'to-pr'] as const)(
    'keeps %s below merge authority',
    (endpoint) =>
      fixture(({ plan, planning, root }) => {
        if (endpoint === 'research-report') {
          plan.repositories = []
          plan.work = [
            {
              id: 'search',
              role: 'research',
              criteria: ['search'],
              after: [],
              consumes: [],
              produces: [],
            },
          ]
          entry(plan.milestones, 0).work = ['search']
        }
        if (endpoint === 'to-pr') {
          git(root, ['remote', 'add', 'origin', 'https://github.com/example/tasks.git'])
          entry(plan.repositories, 0).remote = {
            name: 'origin',
            url: 'https://github.com/example/tasks',
          }
        }
        plan.policy.endpoint = endpoint
        const prepared = planning.preparePlan(plan)
        const authority = new DeliveryAuthority(planning.sources.files.root, () => at)
        const request = authorization(plan, prepared.digest)
        request.effects = ['pr.merge']
        request.reads = []
        expect(() => authority.authorize(request)).toThrow('endpoint-effect-ceiling')
        if (endpoint === 'research-report') {
          request.effects = ['code.write']
          expect(() => authority.authorize(request)).toThrow('endpoint-effect-ceiling')
          request.effects = ['source.read', 'report.write']
          expect(authority.authorize(request).status).toBe('active')
        }
      }),
  )

  it('allows an explicit merge intent without making a worker or merge host eligible', () =>
    fixture(({ plan, planning, root, state }) => {
      git(root, ['remote', 'add', 'origin', 'https://github.com/example/tasks.git'])
      entry(plan.repositories, 0).remote = {
        name: 'origin',
        url: 'https://github.com/example/tasks',
      }
      plan.policy.endpoint = 'to-merge'
      const prepared = planning.preparePlan(plan)
      const authority = new DeliveryAuthority(planning.sources.files.root, () => at)
      const request = authorization(plan, prepared.digest)
      request.effects.push('pr.merge')
      expect(authority.authorize(request).runtime).toBe('not-observed-by-this-command')
      const response = new DeliveryBroker(authority, runtime())
        .open(assignment(plan, prepared.digest))
        .request({
          ...proposal(),
          method: 'effect.request',
          data: {
            effect: 'pr.merge',
            repository: 'app',
            branch: 'wl/owned-fixture',
            sha256: 'a'.repeat(64),
          },
        })
      expect(response).toMatchObject({
        status: 'denied',
        reason: 'controller-only-effect',
        effects: 'not-performed',
      })
      expect(state.events()).toEqual([])
      expect(git(root, ['rev-parse', 'HEAD'])).toBe(entry(plan.repositories, 0).base)
    }))

  it('refuses a stale local basis and damaged authority rather than accepting changed scope', () =>
    fixture(({ plan, planning, root }) => {
      const prepared = planning.preparePlan(plan)
      const authority = new DeliveryAuthority(planning.sources.files.root, () => at)
      const request = authorization(plan, prepared.digest)
      authority.authorize(request)
      const path = planning.sources.files.path(`delivery/authority/grants/${request.id}.json`)
      const raw = JSON.parse(readFileSync(path, 'utf8'))
      raw.value.effects.push('pr.merge')
      writeFileSync(path, JSON.stringify(raw))
      expect(() => authority.inspect(request.id)).toThrow('missing-or-damaged-authority')
      writeFileSync(join(root, 'app.txt'), 'New base.\n')
      git(root, ['add', 'app.txt'])
      git(root, [
        'commit',
        '-m',
        'feat: advance the disposable target',
        '-m',
        'Reject authorization against a stale local basis.',
      ])
      expect(() =>
        authority.authorize({ ...request, id: 'authorization-aaaaaaaaaaaaaaaa' }),
      ).toThrow('stale-or-missing-base')
    }))
})

describe('role-bound broker metadata, not execution proof', () => {
  it('records an idempotent worker proposal as a claim without producing approval or an external effect', () =>
    fixture(({ plan, planning, state }) => {
      const prepared = planning.preparePlan(plan)
      const authority = new DeliveryAuthority(planning.sources.files.root, () => at)
      authority.authorize(authorization(plan, prepared.digest))
      const session = new DeliveryBroker(authority, runtime()).open(
        assignment(plan, prepared.digest),
      )
      const first = session.request(proposal())
      expect(first).toMatchObject({
        status: 'recorded',
        origin: 'worker-claim',
        runtime: 'fixture',
        effects: 'not-performed',
      })
      expect(session.request(proposal())).toEqual(first)
      expect(
        session.request({ ...proposal(), data: { ...proposal().data, sha256: 'b'.repeat(64) } }),
      ).toMatchObject({ status: 'denied', reason: 'request-id-conflict' })
      expect(state.events()).toEqual([])
    }))

  it.each([
    { ...proposal(), method: 'authorize' },
    { ...proposal(), method: 'revoke' },
    { ...proposal(), method: 'decision.recorded' },
    { ...proposal(), method: 'pr.tested' },
    { ...proposal(), role: 'controller' },
    { ...proposal(), budgets: { wallTimeMs: 999999999 } },
    { ...proposal(), boundary: { containment: 'isolated' } },
    { ...proposal(), data: { ...proposal().data, humanTested: true } },
    { ...proposal(), data: { ...proposal().data, ref: 'artifacts/../../controller/grants.json' } },
  ])('refuses hostile source/worker authority claims %#', (value) =>
    fixture(({ plan, planning, state }) => {
      const prepared = planning.preparePlan(plan)
      const authority = new DeliveryAuthority(planning.sources.files.root, () => at)
      authority.authorize(authorization(plan, prepared.digest))
      expect(
        new DeliveryBroker(authority, runtime())
          .open(assignment(plan, prepared.digest))
          .request(value).status,
      ).toBe('denied')
      expect(state.events()).toEqual([])
      expect(existsSync(planning.sources.files.path('delivery/broker'))).toBe(false)
    }),
  )

  it.each([
    ['containment', 'non-contained'],
    ['controllerStore', 'unverified'],
    ['credentials', 'unverified'],
    ['tools', 'unverified'],
    ['instance', 'another-runtime'],
    ['assignment', 'a'.repeat(64)],
    ['interactive', 'permitted'],
  ] as const)('refuses unavailable %s without a broader fallback', (key, value) =>
    fixture(({ plan, planning }) => {
      plan.policy.intervention = 'none'
      const prepared = planning.preparePlan(plan)
      const authority = new DeliveryAuthority(planning.sources.files.root, () => at)
      authority.authorize(authorization(plan, prepared.digest))
      const host = runtime()
      const broker = new DeliveryBroker(authority, {
        ...host,
        observe(scope) {
          return { ...host.observe(scope), [key]: value } as BrokerBoundary
        },
      })
      expect(broker.open(assignment(plan, prepared.digest)).request(proposal())).toMatchObject({
        status: 'denied',
        reason: key === 'interactive' ? 'interactive-runtime' : 'unavailable-boundary',
      })
    }),
  )

  it('rechecks revocation, expiry and current fencing on every message', () =>
    fixture(({ plan, planning }) => {
      const prepared = planning.preparePlan(plan)
      let now = at,
        current = true
      const authority = new DeliveryAuthority(planning.sources.files.root, () => now)
      const grant = authority.authorize(authorization(plan, prepared.digest))
      const session = new DeliveryBroker(authority, runtime({ current: () => current })).open(
        assignment(plan, prepared.digest),
      )
      current = false
      expect(session.request(proposal())).toMatchObject({ reason: 'stale-assignment' })
      current = true
      now = grant.grant.expiresAt
      expect(session.request(proposal())).toMatchObject({ reason: 'grant-expired' })
      now = at
      authority.revoke({
        schema: 'wholeloop/delivery-revocation-request@1',
        grant: grant.grant.id,
        operator: 'Fixture Operator',
        reason: 'Stop this run.',
      })
      expect(session.request(proposal())).toMatchObject({ reason: 'grant-revoked' })
    }))

  it('only records a commit request for an explicitly owned branch and grant scope', () =>
    fixture(({ plan, planning }) => {
      const prepared = planning.preparePlan(plan)
      const authority = new DeliveryAuthority(planning.sources.files.root, () => at)
      authority.authorize(authorization(plan, prepared.digest))
      const session = new DeliveryBroker(authority, runtime()).open(
        assignment(plan, prepared.digest),
      )
      const request = {
        ...proposal(),
        method: 'effect.request',
        data: {
          effect: 'git.commit',
          repository: 'app',
          branch: 'wl/owned-fixture',
          sha256: 'a'.repeat(64),
        },
      }
      expect(session.request(request)).toMatchObject({
        status: 'recorded',
        effects: 'not-performed',
      })
      expect(
        session.request({ ...request, data: { ...request.data, branch: 'wl/someone-else' } }),
      ).toMatchObject({ reason: 'effect-scope' })
      expect(
        session.request({ ...request, data: { ...request.data, branch: 'main' } }),
      ).toMatchObject({ reason: 'effect-scope' })
    }))

  it('keeps evaluator results as scoped machine claims and rejects forged human testing', () =>
    fixture(({ plan, planning, state }) => {
      const prepared = planning.preparePlan(plan)
      const authority = new DeliveryAuthority(planning.sources.files.root, () => at)
      authority.authorize(authorization(plan, prepared.digest))
      const scope = { ...assignment(plan, prepared.digest), role: 'verifier' as const }
      const session = new DeliveryBroker(authority, runtime()).open(scope)
      const request = {
        ...proposal(),
        method: 'evidence.submit',
        data: {
          ref: 'artifacts/result.json',
          sha256: 'a'.repeat(64),
          claim: 'pass',
          criterion: 'search',
        },
      }
      expect(session.request(request)).toMatchObject({
        status: 'recorded',
        origin: 'worker-claim',
        effects: 'not-performed',
      })
      expect(
        session.request({ ...request, data: { ...request.data, humanTested: true } }).status,
      ).toBe('denied')
      expect(
        session.request({ ...request, data: { ...request.data, criterion: 'other' } }),
      ).toMatchObject({ reason: 'evidence-scope' })
      expect(
        session.request({ ...request, data: { ...request.data, finding: 'finding-fixture' } }),
      ).toMatchObject({ reason: 'ambiguous-evidence-scope' })
      expect(state.events()).toEqual([])
    }))

  it('requires independently accepted derived plans in addition to structural envelope fit', () =>
    fixture(({ plan, planning }) => {
      plan.policy.delegations = [
        {
          id: 'delivery-plan',
          rubric: { ref: 'fixture:plan-review', sha256: 'a'.repeat(64) },
          evidence: ['Independent exact-plan challenge.'],
          fallback: 'blocked',
        },
      ]
      const initial = planning.prepareEnvelope(envelope(plan))
      const authority = new DeliveryAuthority(planning.sources.files.root, () => at)
      const request = authorization(plan, 'a'.repeat(64))
      request.basis = { kind: 'envelope', digest: initial.digest }
      request.decisions = ['delivery-plan']
      authority.authorize(request)
      plan.envelope = initial.digest
      const prepared = planning.preparePlan(plan)
      const scope = assignment(plan, prepared.digest)
      expect(
        new DeliveryBroker(authority, runtime()).open(scope).request(proposal()),
      ).toMatchObject({ reason: 'unaccepted-derived-plan' })
      expect(
        new DeliveryBroker(authority, runtime({ planAccepted: () => true }))
          .open(scope)
          .request(proposal()),
      ).toMatchObject({ status: 'recorded', runtime: 'fixture' })
    }))

  it('keeps read requests inside the exact granted provider, tenant and operation', () =>
    fixture(({ plan, planning }) => {
      plan.policy.endpoint = 'research-report'
      plan.repositories = []
      plan.work = [
        {
          id: 'search',
          role: 'research',
          criteria: ['search'],
          after: [],
          consumes: [],
          produces: [],
        },
      ]
      entry(plan.milestones, 0).work = ['search']
      const prepared = planning.preparePlan(plan)
      const authority = new DeliveryAuthority(planning.sources.files.root, () => at)
      const request = authorization(plan, prepared.digest)
      request.effects = ['source.read', 'report.write']
      authority.authorize(request)
      const session = new DeliveryBroker(authority, runtime()).open({
        ...assignment(plan, prepared.digest),
        role: 'researcher',
        contracts: [],
      })
      const read = {
        ...proposal(),
        method: 'source.read',
        data: {
          ref: 'artifacts/query.json',
          sha256: 'a'.repeat(64),
          provider: 'github-issues',
          scope: 'example/tasks',
          operation: 'tracker.read-item',
        },
      }
      expect(session.request(read)).toMatchObject({
        status: 'recorded',
        effects: 'not-performed',
        runtime: 'fixture',
      })
      expect(
        session.request({ ...read, data: { ...read.data, scope: 'another/tenant' } }),
      ).toMatchObject({ reason: 'read-scope' })
      expect(
        session.request({ ...read, data: { ...read.data, operation: 'docs.update' } }),
      ).toMatchObject({ reason: 'read-scope' })
    }))

  it('does not promote a tampered cached receipt to human or execution evidence', () =>
    fixture(({ plan, planning }) => {
      const prepared = planning.preparePlan(plan)
      const authority = new DeliveryAuthority(planning.sources.files.root, () => at)
      authority.authorize(authorization(plan, prepared.digest))
      const scope = assignment(plan, prepared.digest)
      const session = new DeliveryBroker(authority, runtime()).open(scope)
      session.request(proposal())
      const path = planning.sources.files.path(
        `delivery/broker/${scope.attempt}/1/${proposal().id}.json`,
      )
      const raw = JSON.parse(readFileSync(path, 'utf8'))
      raw.receipt.origin = 'human-test'
      raw.digest = contractDigest({ input: raw.input, request: raw.request, receipt: raw.receipt })
      writeFileSync(path, JSON.stringify(raw))
      expect(session.request(proposal())).toMatchObject({
        status: 'denied',
        reason: 'request-id-conflict',
      })
    }))

  it('rejects an operator RPC emitted by a synthetic process before rechecking runtime capability', () =>
    fixture(({ plan, planning, dir }) => {
      const prepared = planning.preparePlan(plan)
      const authority = new DeliveryAuthority(planning.sources.files.root, () => at)
      const issued = authority.authorize(authorization(plan, prepared.digest))
      const env = deliveryWorkerEnvironment({
        home: join(dir, 'worker-home'),
        path: dirname(process.execPath),
        temp: dir,
        run: plan.run,
        attempt: 'attempt-0123456789abcdef',
      })
      const result = spawnSync(
        process.execPath,
        [
          '-e',
          'let input="";process.stdin.on("data",chunk=>input+=chunk);process.stdin.on("end",()=>process.stdout.write(input))',
        ],
        { input: JSON.stringify({ ...proposal(), method: 'authorize' }), env, encoding: 'utf8' },
      )
      expect(result.status, result.stderr).toBe(0)
      let observed = false
      const host = runtime({
        observe(scope) {
          observed = true
          return runtime().observe(scope)
        },
      })
      const session = new DeliveryBroker(authority, host).open(assignment(plan, prepared.digest))
      expect(session.available).toBe(true)
      observed = false
      const response = session.request(JSON.parse(result.stdout))
      expect(response).toMatchObject({
        status: 'denied',
        reason: 'invalid-message',
        effects: 'not-performed',
      })
      expect(observed).toBe(false)
      expect(authority.inspect(issued.grant.id).grant).toEqual(issued.grant)
    }))

  it('constructs an actual child environment without inheriting controller credentials or options', () =>
    fixture(({ dir, plan, planning }) => {
      const env = deliveryWorkerEnvironment({
        home: join(dir, 'worker-home'),
        path: dirname(process.execPath),
        temp: dir,
        run: plan.run,
        attempt: 'attempt-0123456789abcdef',
      })
      const result = spawnSync(
        process.execPath,
        ['-e', 'process.stdout.write(JSON.stringify(Object.keys(process.env).sort()))'],
        { env, encoding: 'utf8' },
      )
      expect(result.status, result.stderr).toBe(0)
      expect(environmentNames(process.platform, JSON.parse(result.stdout))).toEqual(
        Object.keys(env).sort(),
      )
      expect(env).not.toHaveProperty('NODE_OPTIONS')
      expect(env).not.toHaveProperty('GH_TOKEN')
      expect(env).not.toHaveProperty('ANTHROPIC_API_KEY')
      expect(env.HOME).not.toBe(process.env.HOME)
      expect(existsSync(planning.sources.files.path('delivery/authority'))).toBe(false)
    }))
})
