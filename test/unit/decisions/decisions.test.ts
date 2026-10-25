import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import {
  type DecisionId,
  type DecisionOutcome,
  type DecisionRubric,
  decisionFallback,
  decisionRubric,
} from '../../../src/decisions/policy.js'
import {
  type DecisionIdentity,
  type DecisionRequest,
  type DelegatedDecisionHost,
  DelegatedDecisions,
} from '../../../src/decisions/store.js'
import { sourceHash } from '../../../src/delivery/input.js'
import { DELIVERY_DECISIONS, type DeliveryPolicy } from '../../../src/delivery/plan.js'
import { authorization, entry, envelope, fixture, git } from '../../support/delivery.js'

const at = '2026-10-25T22:00:00.000Z'
const outcomes: Record<DecisionId, DecisionOutcome> = {
  'delivery-plan': 'accept',
  'research-plan': 'accept',
  'research-sources': 'accept',
  'frame-outcome': 'go',
  'approve-spec': 'accept',
  'approve-scopes': 'accept',
  'approve-build-plan': 'accept',
  acceptance: 'accept',
  'learning-outcome': 'keep',
  'ramp-assessment': 'propose',
}
function rubric(id: DecisionId): DecisionRubric {
  return {
    schema: 'wholeloop/delegated-decision-rubric@1',
    decision: id,
    purpose: 'Judge only the exact reviewed artifact and observed evidence.',
    rules: [{ id: 'required', text: 'Preserve scope, actual failures and unresolved facts.' }],
    outcomes: [outcomes[id]],
    unknowns: {
      allowed: ['baseline'],
      defaults: [
        { id: 'baseline', value: 'Keep the baseline unknown.', reason: 'No measurement exists.' },
      ],
    },
    timeoutMs: 1000,
  }
}
function identity(
  role: 'planner' | 'challenger',
  provenance: DecisionIdentity['provenance'],
): DecisionIdentity {
  return {
    assignment: (role === 'planner' ? '1' : '2').repeat(64),
    worker: role,
    invocation: role,
    role,
    runtime: '3'.repeat(64),
    state: 'completed',
    provenance,
  }
}
function host(provenance: DecisionIdentity['provenance'] = 'fixture'): DelegatedDecisionHost {
  return {
    observeEvidence: (request) =>
      request.evidence.map((e) => ({
        ...e,
        status: 'passed',
        observation: '4'.repeat(64),
        provenance,
      })),
    prerequisites: () => ({ supported: true, humanRequired: false, interactive: 'disabled' }),
    judge: async (context) => ({
      identity: identity('planner', provenance),
      basis: context.basis,
      outcome: outcomes[context.request.decision],
      rationale: 'The exact inputs satisfy the pinned decision rubric.',
      uncertainties: [],
    }),
    challenge: async (context, judgment) => ({
      identity: identity('challenger', provenance),
      basis: context.basis,
      judgment: contractDigest(judgment),
      verdict: 'supported',
      rationale: 'Independent review retains required outcomes and actual evidence.',
      uncertainties: [],
    }),
    current: () => true,
  }
}
async function setup(
  run: (context: {
    decisions: DelegatedDecisions
    request: DecisionRequest
    operator: string
    root: string
    planDigest: string
    grantDigest: string
    dir: string
  }) => Promise<void>,
  options: {
    decision?: DecisionId
    envelope?: boolean
    none?: boolean
    missingDelegations?: boolean
    human?: boolean
    timeoutMs?: number
    artifactBytes?: number
    fallback?: DeliveryPolicy['uncertainty']
    outcome?: DecisionOutcome
  } = {},
) {
  await fixture(async ({ planning, plan, root, dir }) => {
    const decisions = new DelegatedDecisions(planning.sources.files.root, () => at),
      selected = options.decision ?? 'approve-spec',
      ids: DecisionId[] =
        options.none && !options.missingDelegations
          ? [
              ...new Set<DecisionId>([
                selected,
                'approve-build-plan',
                'acceptance',
                ...(options.envelope ? (['delivery-plan'] as const) : []),
              ]),
            ]
          : [selected]
    plan.policy.intervention = options.none ? 'none' : 'supervised'
    if (options.artifactBytes !== undefined) plan.budgets.artifactBytes = options.artifactBytes
    if (options.human) entry(plan.criteria, 0).acceptance = 'human'
    for (const id of ids) {
      const value = rubric(id)
      if (id === selected && options.outcome) value.outcomes = [options.outcome]
      if (options.timeoutMs !== undefined) value.timeoutMs = options.timeoutMs
      const body = JSON.stringify(value),
        ref = `rubrics/${id}.json`
      planning.sources.files.atomic(ref, body)
      plan.policy.delegations.push({
        id,
        rubric: { ref, sha256: sourceHash(body) },
        evidence: ['verification'],
        fallback: options.fallback ?? 'blocked',
      })
    }
    if (options.envelope) plan.envelope = planning.prepareEnvelope(envelope(plan)).digest
    const prepared = planning.preparePlan(plan),
      request = authorization(plan, prepared.digest)
    request.decisions = ids
    if (options.envelope) request.basis = { kind: 'envelope', digest: plan.envelope ?? '' }
    const grant = decisions.budgets.lifecycle.authority.authorize(request)
    decisions.budgets.lifecycle.track({ run: plan.run, revision: 1, grant: grant.grant.id })
    decisions.pin(grant.grant.id)
    const artifact = JSON.stringify({
        source: plan.source,
        plan: prepared.digest,
        scope: plan.scope,
      }),
      evidence = JSON.stringify({ result: 'Actual evidence selected by the controller.' })
    planning.sources.files.atomic('inputs/spec.json', artifact)
    planning.sources.files.atomic('inputs/evidence.json', evidence)
    const decision: DecisionRequest = {
      schema: 'wholeloop/delegated-decision-request@1',
      key: 'first',
      grant: grant.grant.id,
      run: plan.run,
      revision: 1,
      plan: prepared.digest,
      decision: selected,
      artifacts: [{ ref: 'inputs/spec.json', sha256: sourceHash(artifact) }],
      evidence: [{ id: 'verification', ref: 'inputs/evidence.json', sha256: sourceHash(evidence) }],
      unknowns: [],
    }
    await run({
      decisions,
      request: decision,
      operator: request.operator,
      root,
      planDigest: prepared.digest,
      grantDigest: grant.digest,
      dir,
    })
  })
}

describe('explicit delegated decisions', () => {
  it.each(DELIVERY_DECISIONS)(
    'records %s as a machine fixture without creating human approval',
    async (decision) => {
      await setup(
        async ({ decisions, request, dir }) => {
          const record = await decisions.decide(request, host())
          expect(record.status).toBe('fixture-only')
          expect(record.record).toMatchObject({
            actorKind: 'machine',
            humanApproval: 'not-recorded',
            gates: 'unchanged',
            effects: 'not-granted',
          })
          expect(record.record.judgment.outcome).toBe(outcomes[decision])
          expect(
            await decisions.decide(request, {
              ...host(),
              judge: async () => {
                throw new Error('Must not replay.')
              },
            }),
          ).toEqual(record)
          expect(decisions.budgets.inspect(request.run).counters.artifactBytes).toBeGreaterThan(0)
          expect(readFileSync(join(dir, 'repo', 'app.txt'), 'utf8')).toBe('Original application.\n')
        },
        { decision },
      )
    },
  )
  it('accepts an in-envelope plan only from current independent observed controller records', async () => {
    await setup(
      async ({ decisions, request, grantDigest, planDigest }) => {
        expect(decisions.planAccepted(grantDigest, planDigest)).toBe(false)
        const record = await decisions.decide(request, host('host-observed'))
        expect(record.status).toBe('current')
        expect(decisions.planAccepted(grantDigest, planDigest)).toBe(true)
        decisions.budgets.lifecycle.authority.revoke({
          schema: 'wholeloop/delivery-revocation-request@1',
          grant: request.grant,
          operator: 'Fixture Operator',
          reason: 'Stop future delegated decisions.',
        })
        expect(decisions.inspect(record.digest).status).toBe('stale')
        expect(decisions.inspect(record.digest).record).toEqual(record.record)
        expect(decisions.planAccepted(grantDigest, planDigest)).toBe(false)
        await expect(decisions.decide({ ...request, key: 'second' }, host())).rejects.toThrow(
          'inactive-grant',
        )
      },
      { decision: 'delivery-plan', envelope: true },
    )
  })
  it('never promotes a fixture plan acceptance into execution authority', async () => {
    await setup(
      async ({ decisions, request, grantDigest, planDigest }) => {
        expect((await decisions.decide(request, host())).status).toBe('fixture-only')
        expect(decisions.planAccepted(grantDigest, planDigest)).toBe(false)
      },
      { decision: 'delivery-plan', envelope: true },
    )
  })
  it.each(['assignment', 'worker', 'invocation'] as const)(
    'refuses a challenger sharing the planner %s',
    async (field) => {
      await setup(async ({ decisions, request }) => {
        const observer = host(),
          challenge = observer.challenge
        observer.challenge = async (context, judgment) => {
          const r = await challenge(context, judgment)
          r.identity[field] = judgment.identity[field]
          return r
        }
        await expect(decisions.decide(request, observer)).rejects.toThrow(
          'independent-observation-binding',
        )
      })
    },
  )
  it.each(['rejected', 'unknown'] as const)('retains %s challenge as blocking', async (verdict) => {
    await setup(async ({ decisions, request }) => {
      const observer = host(),
        challenge = observer.challenge
      observer.challenge = async (c, j) => ({ ...(await challenge(c, j)), verdict })
      expect((await decisions.decide(request, observer)).status).toBe('blocked')
    })
  })
  it.each(['failed', 'unknown', 'human-required'] as const)(
    'cannot turn %s evidence into a positive decision',
    async (status) => {
      await setup(
        async ({ decisions, request }) => {
          const observer = host(),
            observe = observer.observeEvidence
          observer.observeEvidence = (r) => observe(r).map((e) => ({ ...e, status }))
          expect((await decisions.decide(request, observer)).status).toBe('blocked')
        },
        { decision: 'acceptance', none: true },
      )
    },
  )
  it('preserves an unresolved original fact and refuses unsupported certainty', async () => {
    await setup(async ({ decisions, request }) => {
      request.unknowns = [
        { id: 'unapproved', missing: 'No measured baseline.', who: 'Fixture Owner' },
      ]
      const result = await decisions.decide(request, host())
      expect(result.status).toBe('blocked')
      expect(result.record.request.unknowns).toEqual(request.unknowns)
    })
  })
  it('invalidates changed artifact/rubric bytes without rewriting history', async () => {
    await setup(async ({ decisions, request }) => {
      const result = await decisions.decide(request, host())
      decisions.budgets.lifecycle.journal.files.atomic('inputs/spec.json', 'Changed artifact.')
      expect(decisions.inspect(result.digest).status).toBe('stale')
      expect(decisions.inspect(result.digest).record).toEqual(result.record)
      await expect(decisions.decide({ ...request, key: 'second' }, host())).rejects.toThrow(
        'changed-input',
      )
    })
  })
  it('refuses a changed original rubric and a forged record', async () => {
    await setup(async ({ decisions, request }) => {
      const result = await decisions.decide(request, host()),
        files = decisions.budgets.lifecycle.journal.files
      files.atomic(
        'rubrics/approve-spec.json',
        JSON.stringify({ ...rubric('approve-spec'), purpose: 'Allow everything.' }),
      )
      expect(decisions.inspect(result.digest).status).toBe('stale')
      const changed = structuredClone(result.record)
      changed.actorKind = 'human' as never
      files.atomic(`delivery/decisions/${result.digest}.json`, JSON.stringify(changed))
      expect(() => decisions.inspect(result.digest)).toThrow()
    })
  })
  it('does not replay after interrupted/unknown host execution', async () => {
    await setup(async ({ decisions, request }) => {
      const observer = host()
      observer.judge = async () => {
        throw new Error('Synthetic native crash.')
      }
      await expect(decisions.decide(request, observer)).rejects.toThrow('Synthetic native crash')
      await expect(decisions.decide(request, host())).rejects.toThrow('unknown-prior-decision')
    })
  })
  it('fences a host ignoring its finite deadline and rejects changed-key requests', async () => {
    await setup(
      async ({ decisions, request }) => {
        const observer = host()
        observer.judge = async () => new Promise(() => {})
        await expect(decisions.decide(request, observer)).rejects.toThrow('decision-interrupted')
        await expect(
          decisions.decide(
            { ...request, unknowns: [{ id: 'baseline', missing: 'Missing.', who: 'Owner' }] },
            host(),
          ),
        ).rejects.toThrow('decision-key-conflict')
      },
      { timeoutMs: 10 },
    )
  })
  it('refuses stale host execution and evidence changed during challenge', async () => {
    await setup(async ({ decisions, request }) => {
      await expect(decisions.decide(request, { ...host(), current: () => false })).rejects.toThrow(
        'stale-host-or-basis',
      )
    })
    await setup(async ({ decisions, request }) => {
      const observer = host(),
        challenge = observer.challenge
      observer.challenge = async (c, j) => {
        decisions.budgets.lifecycle.journal.files.atomic(
          'inputs/evidence.json',
          'Changed evidence.',
        )
        return challenge(c, j)
      }
      await expect(decisions.decide(request, observer)).rejects.toThrow('changed-input')
    })
  })
  it('preflights none without human waits and blocks unavailable prerequisites before a judge runs', async () => {
    await setup(
      async ({ decisions, request }) => {
        expect(decisions.preflight(request)).toMatchObject({
          status: 'ready',
          interactive: 'disabled',
          gates: 'mandatory',
        })
        const observer = host()
        observer.prerequisites = () => ({
          supported: false,
          humanRequired: false,
          interactive: 'disabled',
        })
        observer.judge = async () => {
          throw new Error('Must not execute.')
        }
        await expect(decisions.decide(request, observer)).rejects.toThrow(
          'non-delegable-or-unavailable',
        )
        expect(() =>
          decisions.budgets.lifecycle.transition(request.run, {
            to: 'waiting-input',
            reason: 'Ask the owner.',
          }),
        ).toThrow()
      },
      { none: true },
    )
  })
  it('reports undelegated none-route decisions and human-only criteria as blocked', async () => {
    await setup(
      async ({ decisions, request }) => {
        expect(decisions.preflight(request)).toMatchObject({
          status: 'blocked',
          interactive: 'disabled',
        })
      },
      { none: true, missingDelegations: true },
    )
    // The original plan authority already rejects a none/human route; delegation cannot bypass it.
    await expect(setup(async () => {}, { none: true, human: true })).rejects.toThrow(
      'ineligible-plan',
    )
  })
  it('retains owned missing facts when completion with unknowns is explicitly delegated', async () => {
    await setup(
      async ({ decisions, request }) => {
        request.unknowns = [
          {
            id: 'baseline',
            missing: 'No numeric baseline has been measured.',
            who: 'Fixture Owner',
          },
        ]
        const result = await decisions.decide(request, host())
        expect(result.status).toBe('fixture-only')
        expect(result.record.request.unknowns).toEqual(request.unknowns)
      },
      { fallback: 'complete-with-unknowns' },
    )
    await setup(async ({ decisions, request }) => {
      request.unknowns = [
        { id: 'baseline', missing: 'No numeric baseline has been measured.', who: 'Fixture Owner' },
      ]
      expect((await decisions.decide(request, host())).status).toBe('blocked')
    })
  })
  it('allows a challenged on-hold decision to preserve actual negative evidence', async () => {
    await setup(
      async ({ decisions, request }) => {
        const observer = host(),
          judge = observer.judge,
          observe = observer.observeEvidence
        observer.judge = async (c) => ({ ...(await judge(c)), outcome: 'on-hold' })
        observer.observeEvidence = (r) => observe(r).map((e) => ({ ...e, status: 'failed' }))
        const result = await decisions.decide(request, observer)
        expect(result.status).toBe('fixture-only')
        expect(result.record.observations[0]?.status).toBe('failed')
        expect(result.record.judgment.outcome).toBe('on-hold')
      },
      { decision: 'frame-outcome', outcome: 'on-hold', fallback: 'on-hold' },
    )
  })
  it('blocks interactive native prerequisites and fences an old plan when a new judge crashes', async () => {
    await setup(
      async ({ decisions, request }) => {
        const observer = host()
        observer.prerequisites = () => ({
          supported: true,
          humanRequired: false,
          interactive: 'permitted',
        })
        await expect(decisions.decide(request, observer)).rejects.toThrow(
          'non-delegable-or-unavailable',
        )
      },
      { none: true },
    )
    await setup(
      async ({ decisions, request, grantDigest, planDigest }) => {
        const first = await decisions.decide(request, host('host-observed'))
        expect(decisions.planAccepted(grantDigest, planDigest)).toBe(true)
        const observer = host('host-observed')
        observer.judge = async () => {
          throw new Error('Synthetic crashed replacement.')
        }
        await expect(
          decisions.decide({ ...request, key: 'replacement' }, observer),
        ).rejects.toThrow('Synthetic crashed replacement')
        expect(decisions.inspect(first.digest).status).toBe('stale')
        expect(decisions.planAccepted(grantDigest, planDigest)).toBe(false)
      },
      { decision: 'delivery-plan', envelope: true },
    )
  })
  it('fences a late old judgment behind a newer independent decision', async () => {
    await setup(
      async ({ decisions, request, grantDigest, planDigest }) => {
        const observer = host('host-observed'),
          judge = observer.judge
        let release = () => {}
        const barrier = new Promise<void>((resolve) => {
          release = resolve
        })
        observer.judge = async (c) => {
          await barrier
          return judge(c)
        }
        const pending = decisions.decide(request, observer)
        // Attach the rejection assertion before releasing the older host to avoid an unhandled rejection.
        const refused = expect(pending).rejects.toThrow('superseded-decision-intent')
        const latest = await decisions.decide({ ...request, key: 'newer' }, host('host-observed'))
        release()
        await refused
        expect(decisions.inspect(latest.digest).status).toBe('current')
        expect(decisions.planAccepted(grantDigest, planDigest)).toBe(true)
      },
      { decision: 'delivery-plan', envelope: true },
    )
  })
  it('preserves an interrupted unpublished intent as unknown instead of replaying', async () => {
    await setup(async ({ decisions, request }) => {
      const files = decisions.budgets.lifecycle.journal.files,
        atomic = files.atomic.bind(files)
      let interrupted = false,
        calls = 0
      files.atomic = (path, body) => {
        if (!interrupted && path.startsWith('delivery/decision-heads/')) {
          interrupted = true
          throw new Error('Synthetic interrupted unpublished intent.')
        }
        atomic(path, body)
      }
      const observer = host(),
        judge = observer.judge
      observer.judge = async (c) => {
        calls++
        return judge(c)
      }
      await expect(decisions.decide(request, observer)).rejects.toThrow(
        'Synthetic interrupted unpublished',
      )
      await expect(decisions.decide(request, observer)).rejects.toThrow('unknown-prior-decision')
      expect(calls).toBe(0)
    })
  })
  it.each(['key', 'plan-index'] as const)(
    'recovers a published decision after interrupted %s without replay',
    async (point) => {
      await setup(
        async ({ decisions, request, grantDigest, planDigest }) => {
          const files = decisions.budgets.lifecycle.journal.files,
            atomic = files.atomic.bind(files)
          let interrupted = false,
            calls = 0
          files.atomic = (path, body) => {
            const finalKey =
              point === 'key' &&
              path.startsWith('delivery/decision-keys/') &&
              typeof body === 'string' &&
              JSON.parse(body).digest !== undefined
            if (
              !interrupted &&
              (finalKey || (point === 'plan-index' && path.startsWith('delivery/accepted-plans/')))
            ) {
              interrupted = true
              throw new Error('Synthetic interrupted locator write.')
            }
            atomic(path, body)
          }
          const observer = host('host-observed'),
            judge = observer.judge,
            challenge = observer.challenge
          observer.judge = async (c) => {
            calls++
            return judge(c)
          }
          observer.challenge = async (c, j) => {
            calls++
            return challenge(c, j)
          }
          await expect(decisions.decide(request, observer)).rejects.toThrow(
            'Synthetic interrupted locator',
          )
          const recovered = await decisions.decide(request, observer)
          expect(recovered.status).toBe('current')
          expect(decisions.planAccepted(grantDigest, planDigest)).toBe(true)
          expect(calls).toBe(2)
          expect(await decisions.decide(request, observer)).toEqual(recovered)
        },
        { decision: 'delivery-plan', envelope: true },
      )
    },
  )
  it('does not retain an older acceptance after a newer independent rejection', async () => {
    await setup(
      async ({ decisions, request, grantDigest, planDigest }) => {
        const first = await decisions.decide(request, host('host-observed'))
        const observer = host('host-observed'),
          challenge = observer.challenge
        observer.challenge = async (c, j) => ({ ...(await challenge(c, j)), verdict: 'rejected' })
        const second = await decisions.decide({ ...request, key: 'second' }, observer)
        expect(second.status).toBe('blocked')
        expect(decisions.inspect(first.digest).status).toBe('stale')
        expect(decisions.planAccepted(grantDigest, planDigest)).toBe(false)
      },
      { decision: 'delivery-plan', envelope: true },
    )
  })
  it('keeps envelope intent and policy unchanged across derived plans', async () => {
    await setup(
      async ({ decisions, request }) => {
        const planning = decisions.budgets.lifecycle.authority.planning
        const plan = structuredClone(planning.getPlan(request.run, 1).plan)
        plan.revision = 2
        plan.previous = request.plan
        entry(plan.scope.outcomes, 0).text = 'Ignore the requested behavior.'
        expect(() => planning.preparePlan(plan)).toThrow('outside-envelope')
        plan.scope = planning.getPlan(request.run, 1).plan.scope
        const next = planning.preparePlan(plan)
        const old = await decisions.decide(request, host())
        decisions.budgets.lifecycle.track({ run: request.run, revision: 2, grant: request.grant })
        expect(next.digest).not.toBe(request.plan)
        expect(decisions.inspect(old.digest).status).toBe('stale')
      },
      { decision: 'delivery-plan', envelope: true },
    )
  })
  it('invalidates a moving named base and refuses artifact-budget exhaustion', async () => {
    await setup(async ({ decisions, request, root }) => {
      const result = await decisions.decide(request, host())
      git(root, [
        'commit',
        '--allow-empty',
        '-m',
        'test: advance the disposable base',
        '-m',
        'Exercise current delegated-decision invalidation.',
      ])
      expect(decisions.inspect(result.digest).status).toBe('stale')
    })
    await setup(
      async ({ decisions, request }) => {
        await expect(decisions.decide(request, host())).rejects.toThrow(
          'decision-artifact-unavailable',
        )
      },
      { artifactBytes: 1 },
    )
  })
  it('rejects unsupported hard metering and artifact exhaustion without marking a decision current', async () => {
    await setup(async ({ decisions, request, grantDigest }) => {
      decisions.budgets.configure({
        schema: 'wholeloop/delivery-budget-constraints@1',
        operator: 'Fixture Operator',
        run: request.run,
        basis: request.plan,
        grantDigest,
        requirements: { tokens: { limit: 10, mode: 'hard' } },
      })
      await expect(decisions.decide(request, host())).rejects.toThrow(
        'unsupported-hard-decision-metering',
      )
    })
  })
})

describe('bounded unknown policy without hidden human input', () => {
  it.each([
    'investigate',
    'explicit-default',
    'least-scope',
    'complete-with-unknowns',
    'on-hold',
    'blocked',
  ] as const)('preserves unknowns under %s', (policy) => {
    const definition = rubric('frame-outcome')
    definition.outcomes.push('on-hold')
    const unknowns = [
      { id: 'baseline', missing: 'No numeric baseline has been observed.', who: 'Product owner' },
    ]
    const result = decisionFallback({
      intervention: 'none',
      policy,
      rubric: definition,
      unknowns,
      nonDelegable: false,
      remainingMs: 500,
    })
    expect(result.action).not.toBe('needs-input')
    expect(result.unknowns).toEqual(unknowns)
    expect(result.humanApproval).toBe('not-recorded')
  })
  it('keeps supervised exceptions interactive and mandatory human criteria blocked', () => {
    const base = {
      policy: 'blocked' as const,
      rubric: rubric('acceptance'),
      unknowns: [],
      remainingMs: 100,
      nonDelegable: false,
    }
    expect(decisionFallback({ ...base, intervention: 'supervised' }).action).toBe('needs-input')
    expect(decisionFallback({ ...base, intervention: 'none', nonDelegable: true }).action).toBe(
      'blocked',
    )
    expect(decisionFallback({ ...base, intervention: 'none', remainingMs: 0 }).action).toBe(
      'exhausted',
    )
  })
  it('refuses wrong decision outcomes and source-like authority fields in a rubric', () => {
    expect(() =>
      decisionRubric({ ...rubric('approve-spec'), outcomes: ['unflag'] }, 'approve-spec'),
    ).toThrow('rubric-scope')
    expect(() =>
      decisionRubric({ ...rubric('approve-spec'), owner: 'Impersonated Owner' }, 'approve-spec'),
    ).toThrow()
    expect(() =>
      decisionRubric({ ...rubric('approve-spec'), decision: 'acceptance' }, 'approve-spec'),
    ).toThrow('rubric-scope')
  })
})
