import { describe, expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import type { DeliveryPlan } from '../../../src/delivery/plan.js'
import { DOCKER_REFERENCE_HELPER } from '../../../src/environment/docker-policy.js'
import { RunnerAssemblyReadiness } from '../../../src/runner/assembly-readiness.js'
import { DeliveryRunner } from '../../../src/runner/engine.js'
import { RunnerIntegrationStages } from '../../../src/runner/integration-stages.js'
import { RunnerMilestoneReadiness } from '../../../src/runner/milestone-readiness.js'
import { RunnerNativeScope } from '../../../src/runner/native-scope.js'
import { RunnerPlanStages } from '../../../src/runner/plan-stages.js'
import { RunnerProductEnvironments } from '../../../src/runner/product-environments.js'
import { runnerRoute } from '../../../src/runner/route.js'
import {
  type RunnerStageAdapters,
  RunnerStageDispatcher,
} from '../../../src/runner/stage-dispatcher.js'
import { RunnerStore } from '../../../src/runner/store.js'
import { runnerDefinitionFixture } from '../../support/runner-definition.js'
import { runnerGitFixture } from '../../support/runner-git.js'
import { runnerPlanFixture as setup } from '../../support/runner-plan.js'
import { runnerWorkerComponents } from '../../support/runner-worker.js'

describe('fixed original domain-stage dispatch', () => {
  it.each(['before', 'after'] as const)(
    'refuses observation cancelled %s its asynchronous read',
    async (when) => {
      await setup(
        async (f) => {
          const dispatcher = new RunnerStageDispatcher(f.store, f.context.request.host, {
              plan: f.stages,
            }),
            result = await dispatcher.execute(f.context)
          f.observe(result)
          const record = f.store.stage(contractDigest(f.context.request), 'plan'),
            abort = new AbortController(),
            journal = contractDigest(f.store.lifecycle.journal.events())
          if (!record) throw new Error('Original plan stage required')
          if (when === 'before') abort.abort()
          const pending = dispatcher.inspect(f.context.request, record, abort.signal)
          if (when === 'after') abort.abort()
          await expect(pending).rejects.toThrow('dispatcher-observation-cancelled')
          expect(contractDigest(f.store.lifecycle.journal.events())).toBe(journal)
        },
        { withinEnvelope: false },
      )
    },
  )
  it('executes original core planning and recovers the same result while paused', async () => {
    await setup(
      async (f) => {
        const adapters = { plan: f.stages },
          dispatcher = new RunnerStageDispatcher(f.store, f.context.request.host, adapters)
        adapters.plan = new RunnerPlanStages(f.store, {
          ...f.options,
          identity: { ...f.context.request.host, configuration: '0'.repeat(64) },
        })
        const result = await dispatcher.execute(f.context)
        expect(result.status).toBe('passed')
        expect(result.invocationState).toBe('stopped')
        f.observe(result)
        const record = f.store.stage(contractDigest(f.context.request), 'plan')
        if (!record) throw new Error('Original plan stage required')
        f.store.lifecycle.transition(f.context.request.run, {
          to: 'paused',
          reason: 'Recover fixed dispatch without repeating core work.',
        })
        const journal = contractDigest(f.store.lifecycle.journal.events()),
          fresh = new RunnerStageDispatcher(
            new RunnerStore(f.store.files.root),
            f.context.request.host,
            { plan: f.stages },
          )
        expect(
          await fresh.inspect(f.context.request, record, new AbortController().signal),
        ).toEqual(result)
        expect(contractDigest(f.store.lifecycle.journal.events())).toBe(journal)
        expect(new RunnerNativeScope(f.store.files, record.invocation).calls()).toEqual([])
        expect(dispatcher.coverage(f.context.plan)).toMatchObject({ complete: false })
        expect(dispatcher.coverage(f.context.plan).unsupported).toContain('handoff')
      },
      { withinEnvelope: false },
    )
  })
  it.each([
    'cancelled',
    'expired',
    'fenced',
    'malformed-deadline',
    'different-kind',
    'different-plan',
    'foreign-host',
    'foreign-invocation',
    'missing-adapter',
    'product-on-plan',
  ] as const)('refuses %s before domain execution', async (mode) => {
    await setup(
      async (f) => {
        const dispatcher = new RunnerStageDispatcher(
            f.store,
            mode === 'foreign-host'
              ? { ...f.context.request.host, configuration: '0'.repeat(64) }
              : f.context.request.host,
            mode === 'missing-adapter' ? {} : { plan: f.stages },
          ),
          before = contractDigest(f.store.lifecycle.journal.events())
        if (mode === 'cancelled') f.context.signal = AbortSignal.abort()
        if (mode === 'expired') f.context.deadline = new Date(Date.now() - 1).toISOString()
        if (mode === 'fenced') f.context.current = () => false
        if (mode === 'malformed-deadline') f.context.deadline = 'invalid'
        if (mode === 'different-kind')
          f.context.stage = { ...f.context.stage, kind: 'implementation' }
        if (mode === 'different-plan')
          f.context.plan = { ...f.context.plan, owner: 'Different Owner' }
        if (mode === 'foreign-invocation') f.context.invocation = '0'.repeat(64)
        await expect(
          dispatcher.execute(
            f.context,
            mode === 'product-on-plan'
              ? {
                  selection: {
                    schema: 'wholeloop/integration-verification-request@1',
                    candidate: 'a'.repeat(64),
                    assembly: 'b'.repeat(64),
                    environment: `environment-${'c'.repeat(32)}`,
                  },
                }
              : undefined,
          ),
        ).rejects.toThrow('Delivery runner refused:')
        const record = f.store.stage(contractDigest(f.context.request), 'plan')
        expect(record?.runtime).toBeUndefined()
        expect(contractDigest(f.store.lifecycle.journal.events())).toBe(before)
      },
      { withinEnvelope: false },
    )
  })
  it.each(['foreign-store', 'structural-host', 'constructor-key'] as const)(
    'refuses %s registration',
    async (mode) => {
      await setup(
        async (f) => {
          const adapter =
              mode === 'foreign-store'
                ? new RunnerPlanStages(
                    new RunnerStore(f.store.files.path('foreign-store')),
                    f.options,
                  )
                : mode === 'structural-host'
                  ? {
                      store: f.store,
                      execute: () => {
                        throw new Error('Untrusted host')
                      },
                    }
                  : f.stages,
            adapters = {
              [mode === 'constructor-key' ? 'constructor' : 'plan']: adapter,
            } as Partial<RunnerStageAdapters>
          expect(
            () => new RunnerStageDispatcher(f.store, f.context.request.host, adapters),
          ).toThrow('dispatcher-fixed-domain-adapter-required')
        },
        { withinEnvelope: false },
      )
    },
  )
})

describe('static fixed-dispatch route preflight', () => {
  it.each(['supported', 'no-adapters', 'changed-route', 'foreign-host', 'cancelled'] as const)(
    'reports %s for a definition route without any stage effect',
    async (mode) => {
      await runnerDefinitionFixture(async (f) => {
        const dispatcher = new RunnerStageDispatcher(
            f.store,
            mode === 'foreign-host'
              ? { ...f.context.request.host, configuration: '0'.repeat(64) }
              : f.context.request.host,
            mode === 'no-adapters' ? {} : { definition: f.stages },
          ),
          route = runnerRoute(f.context.plan),
          journal = contractDigest(f.store.lifecycle.journal.events()),
          pending = dispatcher.preflight(
            f.context.request,
            f.context.plan,
            mode === 'changed-route' ? [] : route,
            mode === 'cancelled' ? AbortSignal.abort() : new AbortController().signal,
          )
        expect(route.map((stage) => stage.kind)).toEqual(['definition'])
        if (mode === 'cancelled')
          await expect(pending).rejects.toThrow('dispatcher-preflight-cancelled')
        else
          expect(await pending).toEqual(
            mode === 'supported'
              ? {
                  available: true,
                  interactive: 'disabled',
                  humanRequired: false,
                  reason: 'dispatcher-static-route-supported',
                }
              : {
                  available: false,
                  interactive: 'unverified',
                  humanRequired: false,
                  reason:
                    mode === 'no-adapters'
                      ? 'dispatcher-unsupported-stage'
                      : 'dispatcher-preflight-original-route',
                },
          )
        expect(new RunnerNativeScope(f.store.files, f.context.invocation).calls()).toEqual([])
        expect(contractDigest(f.store.lifecycle.journal.events())).toBe(journal)
      })
    },
  )
  it.each(['missing-products', 'unconfigured-milestone', 'configured-milestone'] as const)(
    'requires fixed product input for every integration milestone: %s',
    (mode) =>
      runnerGitFixture(
        async ({ store, request, digest }) => {
          const readiness = new RunnerAssemblyReadiness(
              store,
              new RunnerMilestoneReadiness(store, new Map()),
            ),
            products =
              mode === 'missing-products'
                ? undefined
                : new RunnerProductEnvironments(
                    store,
                    readiness,
                    new Map(
                      mode === 'configured-milestone'
                        ? [
                            [
                              'feature',
                              {
                                candidate: 'a'.repeat(64),
                                assembly: 'b'.repeat(64),
                                helperImage: DOCKER_REFERENCE_HELPER,
                              },
                            ],
                          ]
                        : [],
                    ),
                  ),
            dispatcher = new RunnerStageDispatcher(
              store,
              request.host,
              { integration: new RunnerIntegrationStages(store, readiness) },
              products,
            ),
            { plan } = store.basis(request)
          expect(
            await dispatcher.preflight(
              request,
              plan,
              store.inspect(digest).route,
              new AbortController().signal,
            ),
          ).toMatchObject({
            available: false,
            humanRequired: false,
            reason:
              mode === 'configured-milestone'
                ? 'dispatcher-unsupported-stage'
                : 'dispatcher-product-configuration-required',
          })
        },
        { singleUnit: true },
      ),
  )
  it('lets the actual engine pause an unsupported supervised route before any dispatch', () =>
    runnerGitFixture(
      async ({ store, request, digest }) => {
        const owned = store.record(digest)
        if (!owned.controller) throw new Error('Fixture owner missing')
        store.release(
          { request: digest, controller: owned.controller, generation: owned.generation },
          'Hand the fixture route to its actual engine.',
        )
        const dispatcher = new RunnerStageDispatcher(store, request.host, {})
        expect(store.basis(request).plan.policy.intervention).toBe('supervised')
        const receipt = await new DeliveryRunner(store).run(digest, dispatcher)
        expect(receipt.state).toBe('paused')
        expect(store.record(digest).stages).toEqual([])
        // The host's closed reason is the only trace of why nothing dispatched.
        expect(store.lifecycle.journal.get(request.run).reason).toBe(
          'Required runtime, noninteractive capability or non-delegable prerequisite is unavailable (dispatcher-product-configuration-required).',
        )
      },
      { singleUnit: true },
    ))
})

describe('fixed dispatch of research work', () => {
  const guidance = 'Pinned research guidance.\n'
  const withResearchUnit = (plan: DeliveryPlan) => {
    const first = plan.criteria[0]
    if (!first) throw new Error('Fixture criterion required')
    plan.criteria.push({
      ...first,
      id: 'background',
      text: 'Record the cited background question for search.',
    })
    plan.work.push({
      id: 'background',
      role: 'research',
      criteria: ['background'],
      after: [],
      consumes: [],
      produces: [],
    })
    plan.milestones = plan.milestones.map((milestone) => ({
      ...milestone,
      work: [...milestone.work, 'background'],
      criteria: [...milestone.criteria, 'background'],
    }))
  }
  it('runs a unit research claim through the fixed worker adapter', () =>
    runnerGitFixture(
      async (input) => {
        input.observe(await input.host.execute(input.dispatch('workspace:search')))
        const { workers } = runnerWorkerComponents(input, 'complete', {
            provenance: 'host-observed',
            guidance,
          }),
          dispatcher = new RunnerStageDispatcher(input.store, input.request.host, {
            implementation: workers,
          }),
          context = input.dispatch('research:background')
        expect(dispatcher.coverage(context.plan).unsupported).not.toContain('research:background')
        expect(await dispatcher.execute(context)).toMatchObject({
          stage: 'research:background',
          status: 'passed',
          invocationState: 'stopped',
          provenance: 'host-observed',
        })
        expect(
          await dispatcher.preflight(
            input.request,
            input.store.basis(input.request).plan,
            input.store.inspect(input.digest).route,
            new AbortController().signal,
          ),
        ).toMatchObject({ available: false, reason: 'dispatcher-research-milestone-unsupported' })
        // A research-report route has a report-level research stage, which only the
        // research host may execute; worker registration never covers it.
        const report: DeliveryPlan = {
          ...context.plan,
          policy: { ...context.plan.policy, endpoint: 'research-report' },
        }
        expect(runnerRoute(report).map((stage) => stage.id)).toEqual([
          'plan',
          'research',
          'handoff',
        ])
        expect(dispatcher.coverage(report).unsupported).toEqual(['plan', 'research', 'handoff'])
      },
      { singleUnit: true, guidance, configure: withResearchUnit },
    ))
})
