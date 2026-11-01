import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { contractDigest } from '../../src/contracts/compatibility.js'
import type { DecisionId } from '../../src/decisions/policy.js'
import type { DeliveryEffect } from '../../src/delivery/authority.js'
import type { DeliveryPlan } from '../../src/delivery/plan.js'
import {
  DeliveryRunner,
  type DeliveryRunnerHost,
  type RunnerStageContext,
  type RunnerStageObservation,
} from '../../src/runner/engine.js'
import { RunnerGitStages } from '../../src/runner/git-stages.js'
import { runnerRoute } from '../../src/runner/route.js'
import { type RunnerRequest, RunnerStore } from '../../src/runner/store.js'
import type { StoreFiles } from '../../src/state/files.js'
import { authorization, envelope, fixture, git } from './delivery.js'

export async function runnerGitFixture(
  operation: (context: {
    store: RunnerStore
    host: RunnerGitStages
    request: RunnerRequest
    root: string
    digest: string
    dispatch(id: string): RunnerStageContext
    observe(value: RunnerStageObservation): void
    adopt(proposal: { revision: number; digest: string }): void
  }) => Promise<void>,
  options: {
    singleUnit?: boolean
    guidance?: string
    stageBudget?: 'plan'
    withinEnvelope?: boolean
    definition?: boolean
    seed?: Record<string, string>
    retain?: boolean
    configure?(plan: DeliveryPlan, files: StoreFiles): void
    decisions?: DecisionId[]
    /** Extra granted effects, for example publication; never part of the default grant. */
    effects?: DeliveryEffect[]
  } = {},
) {
  await fixture(
    async ({ planning, plan, root }) => {
      if (options.seed) {
        const names = Object.keys(options.seed)
        if (!names.length || names.some((name) => !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)))
          throw new Error('Runner fixtures seed distinct root-level files only')
        for (const [name, body] of Object.entries(options.seed))
          writeFileSync(join(root, name), body)
        git(root, ['add', '--', ...names])
        git(root, [
          'commit',
          '-m',
          'test: seed declared runner commands',
          '-m',
          'Pin explicit disposable application inputs before preparing the delivery plan.',
        ])
        const head = git(root, ['rev-parse', 'HEAD'])
        for (const repo of plan.repositories) if (repo.root === root) repo.base = head
      }
      if (options.definition)
        plan.definition = { ready: false, missing: ['Confirm the original bounded definition.'] }
      if (options.guidance !== undefined) {
        const guidance = plan.guidance[0]
        if (!guidance) throw new Error('Fixture guidance missing')
        guidance.sha256 = createHash('sha256').update(options.guidance).digest('hex')
      }
      if (options.singleUnit) {
        plan.work = plan.work
          .filter((work) => work.id === 'search')
          .map((work) => ({ ...work, after: [], consumes: [] }))
        plan.milestones = plan.milestones.map((milestone) => ({ ...milestone, work: ['search'] }))
      }
      options.configure?.(plan, planning.sources.files)
      if (options.withinEnvelope) plan.envelope = planning.prepareEnvelope(envelope(plan)).digest
      const prepared = planning.preparePlan(plan),
        store = new RunnerStore(planning.sources.files.root),
        grant = store.lifecycle.authority.authorize({
          ...authorization(plan, prepared.digest),
          ...(options.withinEnvelope
            ? { basis: { kind: 'envelope' as const, digest: plan.envelope ?? '' } }
            : {}),
          decisions: options.decisions ?? [],
          ...(options.effects
            ? { effects: [...authorization(plan, prepared.digest).effects, ...options.effects] }
            : {}),
        })
      store.lifecycle.track({ run: plan.run, revision: 1, grant: grant.grant.id })
      const request: RunnerRequest = {
          schema: 'wholeloop/delivery-runner-request@1',
          key: 'git-stages',
          run: plan.run,
          revision: 1,
          plan: prepared.digest,
          grant: grant.grant.id,
          host: { id: 'fixture', version: '1', configuration: 'a'.repeat(64) },
          pollMs: 50,
        },
        digest = store.prepare(request).digest,
        lease = store.claim(digest, `controller-${'a'.repeat(32)}`)
      await operation({
        store,
        request,
        root,
        digest,
        host: new RunnerGitStages(store),
        adopt: (proposal) => {
          store.adopt(lease, proposal)
        },
        dispatch(id) {
          const stage = runnerRoute(plan).find((item) => item.id === id)
          if (!stage) throw new Error('Fixture needs an actual route stage')
          const invocation = contractDigest({ request: digest, plan: prepared.digest, id })
          store.append(lease, { action: 'dispatched', stage: id, invocation })
          return {
            request,
            plan,
            stage,
            invocation,
            deadline: new Date(
              Date.now() + (options.stageBudget === 'plan' ? plan.budgets.attemptMs : 15000),
            ).toISOString(),
            signal: new AbortController().signal,
            current: () => store.live(lease, false),
            started: (runtime) =>
              store.append(lease, { action: 'started', stage: id, invocation, runtime }),
          }
        },
        observe(value) {
          store.append(lease, {
            action: 'observed',
            stage: value.stage,
            invocation: value.invocation,
            status: value.status,
            evidence: value.evidence,
            provenance: value.provenance,
            reason: value.reason,
          })
        },
      })
    },
    options.retain ? { retain: true } : {},
  )
}

/** Keep the complete two-unit route in the standalone evaluation, outside file-worker time budgets. */
export async function runnerGitRouteFixture(singleUnit = false, stopBeforeQa = false) {
  let observed:
    | {
        state: string
        outcome: string | null
        stages: { id: string; status: string; provenance?: string }[]
        effects: number
      }
    | undefined
  await runnerGitFixture(
    async ({ store, host, request, digest }) => {
      const owned = store.record(digest)
      if (!owned.controller) throw new Error('Fixture owner missing')
      store.release(
        { request: digest, controller: owned.controller, generation: owned.generation },
        'Hand the fixture route to its actual engine.',
      )
      const controller: DeliveryRunnerHost = {
        identity: request.host,
        preflight: async () => ({
          available: true,
          interactive: 'disabled',
          humanRequired: false,
          reason: 'Synthetic semantic stages, actual owned Git stages.',
        }),
        execute: async (context) => {
          if (['workspace', 'commit'].includes(context.stage.kind)) return host.execute(context)
          // Ordinary unit coverage stops at the Git boundary. The separate
          // evaluation still executes the entire two-unit semantic fixture route.
          if (stopBeforeQa && context.stage.kind === 'verification')
            return {
              schema: 'wholeloop/delivery-runner-stage-observation@1',
              request: digest,
              plan: request.plan,
              stage: context.stage.id,
              invocation: context.invocation,
              status: 'blocked',
              invocationState: 'not-started',
              evidence: 'f'.repeat(64),
              provenance: 'fixture',
              reason: 'This Git-boundary fixture supplies no behavioral QA host.',
            }
          context.started({
            backend: 'fixture',
            instance: context.invocation,
            worker: context.stage.id,
          })
          if (context.stage.kind === 'implementation' && context.stage.unit) {
            const allocation = host.workspace(request, context.stage.unit)
            writeFileSync(
              join(allocation.repository.path, 'app.txt'),
              `Synthetic implementation for ${context.stage.unit}.\n`,
            )
          }
          return {
            schema: 'wholeloop/delivery-runner-stage-observation@1',
            request: digest,
            plan: contractDigest(context.plan),
            stage: context.stage.id,
            invocation: context.invocation,
            status: 'passed',
            invocationState: 'stopped',
            evidence: 'f'.repeat(64),
            provenance: 'fixture',
            reason: 'Synthetic semantic observation, never actual QA.',
          }
        },
        inspect: async (input, record) => host.inspect(input, record),
        stop: async (input, record, signal) => host.stop(input, record, signal),
        endpoint: async () => {
          throw new Error('Fixture semantics cannot establish an actual endpoint')
        },
      }
      const result = await new DeliveryRunner(store).run(digest, controller)
      observed = {
        state: result.state,
        outcome: result.outcome,
        stages: result.stages,
        effects: host.workspaces.effects.inspect(request.run).length,
      }
    },
    { singleUnit },
  )
  if (!observed) throw new Error('Fixture route observation missing')
  return observed
}
