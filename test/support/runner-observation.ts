import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { loadExtensionOptions } from '../../src/config/load.js'
import { NativeDelegatedDecisionHost } from '../../src/decisions/native-host.js'
import type { DecisionRubric } from '../../src/decisions/policy.js'
import type { DecisionRequest } from '../../src/decisions/store.js'
import { readSourceFile, sourceHash } from '../../src/delivery/input.js'
import type { NativeBoundaryHost, NativeProcessRunner } from '../../src/delivery/native-host.js'
import { NativePurposeAttempts } from '../../src/delivery/native-purpose.js'
import type { DeliveryPlan } from '../../src/delivery/plan.js'
import { DeliveryQueue } from '../../src/delivery/queue.js'
import { FlowEngine } from '../../src/flow/engine.js'
import { ImpactWorkflow } from '../../src/impact/workflow.js'
import type { MeasurementPlan } from '../../src/launch/measurement.js'
import { dueObservations, ObservationSchedule } from '../../src/learning/scheduler.js'
import { loadProviders } from '../../src/providers/load.js'
import type { OperationCall, OperationResult } from '../../src/providers/operations.js'
import type { ClientMcpInventory } from '../../src/providers/transport.js'
import { RunnerObservationStages } from '../../src/runner/observation-stages.js'
import { RunnerPlanStages } from '../../src/runner/plan-stages.js'
import { RunnerStageDispatcher } from '../../src/runner/stage-dispatcher.js'
import { type RunnerRequest, RunnerStore } from '../../src/runner/store.js'
import { parseSpec } from '../../src/spec/contract.js'
import { StateStore } from '../../src/state/store.js'
import { authorization, fixture } from './delivery.js'

export const LAUNCH = '2026-08-01T00:00:00.000Z'
export const TICK = '2026-08-09T00:00:00.000Z'
export function measurement(): MeasurementPlan {
  const spec = parseSpec(readFileSync(new URL('../fixtures/spec/spec.md', import.meta.url), 'utf8'))
  return {
    schema: 'wholeloop/measurement-plan@1',
    impact: spec.impact,
    metrics: spec.metrics,
    rollout: spec.rollout,
  }
}
export const qualitative = [
  {
    id: 'feedback',
    provider: 'analytics',
    operation: 'source.feedback.query',
    query: 'sanitized order search feedback',
    days: 7,
    timezone: 'UTC',
  },
]
/** A provider reached through the client's MCP server; wholeloop runs no MCP client itself. */
export function writeProvider(root: string) {
  mkdirSync(join(root, '.wholeloop/providers/analytics'), { recursive: true })
  writeFileSync(
    join(root, '.wholeloop/providers/analytics/provider.json'),
    JSON.stringify({
      schema: 1,
      id: 'analytics',
      name: 'Analytics fixture',
      description: 'Synthetic normalized reads through a client-owned MCP server',
      capabilities: ['source.product-analytics', 'source.feedback', 'comms'],
      access: {
        mcp: {
          server: 'analytics-mcp',
          install: { transport: 'http', url: 'https://mcp.analytics.example/mcp' },
        },
      },
      operations: {
        'source.product-analytics.query': { tool: 'aggregate' },
        'source.feedback.query': { tool: 'feedback' },
        'comms.draft': { tool: 'create_draft' },
      },
      degrade: {
        'source.product-analytics.query': 'open-question',
        'source.feedback.query': 'open-question',
        'comms.draft': 'handoff-artifact',
      },
    }),
  )
}
/** Normalized client responses; every call is recorded so a test can count reads. */
export function mcpResponses(calls: OperationCall[], value = 29) {
  return async (call: OperationCall): Promise<OperationResult> => {
    calls.push(call)
    if (!call.operation.startsWith('source.')) throw new Error('Unexpected write in read fixture')
    return {
      status: 'succeeded',
      complete: true,
      ref: `https://analytics.example/${call.tool}`,
      body: JSON.stringify(
        call.operation === 'source.feedback.query'
          ? { text: 'Customers ask for date presets.' }
          : { value, unit: 'seconds' },
      ),
    }
  }
}
/** Measure the launch checkpoint so d7 is the only one due at the tick. */
export async function launchMeasured(engine: FlowEngine) {
  const workflow = new ImpactWorkflow(engine),
    begun = workflow.begin({
      input: 'Order search impact',
      owner: 'Alex',
      measurement: measurement(),
      launchedAt: LAUNCH,
      checkpoint: 'launch',
      at: LAUNCH,
      qualitative,
    })
  if (begun.status !== 'planned') throw new Error('Expected impact plan')
  const calls: OperationCall[] = []
  await workflow.observe(begun.subject, { invoke: mcpResponses(calls) })
  workflow.complete(begun.subject)
  return begun.subject
}
/** The plan `wl measure tick` would admit: one research unit and the scheduled link. */
export function observationPlan(
  plan: DeliveryPlan,
  link: NonNullable<DeliveryPlan['observation']>,
  files: { atomic(path: string, text: string): void },
  uncertainty: DeliveryPlan['policy']['uncertainty'],
) {
  const rubric: DecisionRubric = {
      schema: 'wholeloop/delegated-decision-rubric@1',
      decision: 'learning-outcome',
      purpose: 'Recommend a learning outcome from the exact settled readings.',
      rules: [{ id: 'grounding', text: 'Name every unknown reading and do not infer causes.' }],
      outcomes: ['keep', 'iterate', 'kill', 'unflag'],
      unknowns: { allowed: ['feedback', 'retrieval-time'], defaults: [] },
      timeoutMs: 10000,
    } as DecisionRubric,
    text = JSON.stringify(rubric)
  files.atomic('rubrics/learning-outcome.json', text)
  plan.policy = {
    endpoint: 'learning-observation',
    intervention: 'none',
    uncertainty,
    delegations: [
      {
        id: 'learning-outcome',
        rubric: { ref: 'rubrics/learning-outcome.json', sha256: sourceHash(text) },
        evidence: ['production'],
        fallback: 'complete-with-unknowns',
      },
    ],
  }
  plan.observation = link
  plan.repositories = []
  plan.work = [
    {
      id: 'measure',
      role: 'research',
      criteria: ['search'],
      after: [],
      consumes: [],
      produces: [],
    },
  ]
  plan.milestones = [
    {
      id: 'observation',
      work: ['measure'],
      criteria: ['search'],
      after: [],
      procedure: 'Read the pinned measurement sources for the due checkpoint.',
    },
  ]
  return plan
}
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
    provenance: 'host-observed',
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
/** Synthetic judge and challenger processes; they certify no account, model or source. */
export function decisionHost(store: RunnerStore, outcome: string) {
  store.files.atomic(
    'observation-bin/codex',
    `#!${process.execPath}
if(process.argv.includes('--version')){console.log('codex-cli 0.166.0');process.exit(0)}
let input='';process.stdin.on('data',chunk=>input+=chunk);process.stdin.on('end',()=>{
const payload=JSON.parse(input),a=payload.assignment,b=JSON.parse(a.brief),inner=JSON.parse(payload.inputs[0].content);
const output={schema:b.response.$id,basis:inner.basis,rationale:a.identity.role==='planner'?'The settled readings meet the target.':'A single checkpoint cannot separate the change from seasonality.',uncertainties:[]};
if(a.identity.role==='planner')output.outcome=${JSON.stringify(outcome)};else{output.judgment=b.judgment;output.verdict='supported'}
const proposal={schema:'wholeloop/delivery-worker-proposal@1',assignment:a.assignment,status:'complete',summary:'Synthetic process output; no account or model certification.',artifacts:[{ref:'artifacts/decision.json',kind:'report',text:JSON.stringify(output)}],criteria:[],findings:[],unknowns:[]};
console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify(proposal)}}));console.log(JSON.stringify({type:'turn.completed'}));
});\n`,
  )
  chmodSync(store.files.path('observation-bin/codex'), 0o700)
  const path = `${store.files.path('observation-bin')}:${dirname(process.execPath)}`
  return (native: NativeProcessRunner) =>
    new NativeDelegatedDecisionHost(
      new NativePurposeAttempts(
        new DeliveryQueue(store.files.root, store.now, undefined, store.budgets.clock),
      ),
      {
        prerequisites: () => ({ supported: true, humanRequired: false, interactive: 'disabled' }),
        observeEvidence: (decision) =>
          decision.evidence.map((entry) => {
            const observed = sourceHash(
              readSourceFile(store.files.root, entry.ref, 8 * 1024 * 1024),
            )
            return {
              ...entry,
              status: observed === entry.sha256 ? 'passed' : 'unknown',
              observation: observed,
              provenance: 'host-observed',
            }
          }),
      },
      {
        native: {
          target: 'codex',
          version: '0.166.0',
          model: 'fixture-model',
          path,
          host: boundary,
          process: native,
        },
        environment: { id: 'fixture', recipe: 'b'.repeat(64), boundary: 'c'.repeat(64) },
        provenance: 'host-observed',
      },
    )
}
export interface ObservationFixture {
  store: RunnerStore
  request: RunnerRequest
  digest: string
  plan: DeliveryPlan
  subject: string
  key: string
  dispatcher: RunnerStageDispatcher
  calls: OperationCall[]
  root: string
  /** The built CLI's tick outputs, in order, when the scheduler was replayed. */
  ticks: { scheduled: string[]; deduped: string[]; reads: string }[]
}
/**
 * What a crontab or launchd entry runs: the built CLI as its own process, once
 * per firing, against the operator's store. The store is reached through
 * XDG_STATE_HOME, so the fixture links that location to its own store.
 */
function replayTicks(dir: string, root: string, store: string, subject: string, at: string[]) {
  mkdirSync(join(dir, 'xdg'), { recursive: true })
  symlinkSync(store, join(dir, 'xdg/wholeloop'))
  return at.map((time) => {
    const result = spawnSync(
      process.execPath,
      [resolve('dist/wl.mjs'), 'measure', 'tick', '--for', subject, '--at', time, '--json'],
      {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, XDG_STATE_HOME: join(dir, 'xdg'), HOME: join(dir, 'home') },
      },
    )
    if (result.status !== 0) throw new Error(`measure tick failed: ${result.stderr}`)
    return JSON.parse(result.stdout)
  })
}
/** A due d7 observation, its plan and grant, and a dispatcher with the observation host. */
export async function runnerObservationFixture(
  run: (input: ObservationFixture) => Promise<void>,
  settings: {
    uncertainty?: DeliveryPlan['policy']['uncertainty']
    intervention?: 'none' | 'supervised'
    outcome?: 'keep' | 'iterate' | 'kill' | 'unflag'
    tools?: string[]
    operations?: string[]
    invoke?: (call: OperationCall, signal: AbortSignal) => Promise<OperationResult>
    /** Replay the scheduler through the built CLI at these times instead of in process. */
    ticks?: string[]
  } = {},
) {
  await fixture(async ({ dir, root, planning, plan }) => {
    writeProvider(root)
    const files = planning.sources.files,
      engine = new FlowEngine(
        new StateStore(files.root),
        root,
        join(dir, 'user/config.yml'),
        join(dir, 'home'),
      ),
      subject = await launchMeasured(engine),
      due = dueObservations(engine.store.events(), [subject], ['launch', 'd7', 'd30'], TICK, {
        checkpoints: ['launch', 'd7', 'd30'],
      })
    const ticks = settings.ticks
      ? replayTicks(dir, root, files.root, subject, settings.ticks)
      : [{ ...new ObservationSchedule(files).tick(due), reads: 'not-performed' }]
    // The CLI derives the policy identity from configuration, so read back what it scheduled.
    const first = ticks[0]?.scheduled ?? [],
      scheduled = new ObservationSchedule(files).scheduled(first[0] ?? '')
    if (due.length !== 1 || first.length !== 1 || scheduled?.checkpoint !== 'd7')
      throw new Error('Expected only d7 due')
    observationPlan(
      plan,
      { key: scheduled.key, subject, checkpoint: 'd7' },
      files,
      settings.uncertainty ?? 'blocked',
    )
    if (settings.intervention) plan.policy.intervention = settings.intervention
    const store = new RunnerStore(files.root),
      prepared = planning.preparePlan(plan),
      grantRequest = authorization(plan, prepared.digest)
    grantRequest.effects = ['source.read', 'report.write']
    grantRequest.decisions = ['learning-outcome']
    grantRequest.reads = [
      {
        provider: 'analytics',
        scope: subject,
        operations: settings.operations ?? [
          'source.product-analytics.query',
          'source.feedback.query',
        ],
      },
    ]
    const grant = store.lifecycle.authority.authorize(grantRequest)
    store.lifecycle.track({ run: plan.run, revision: 1, grant: grant.grant.id })
    const request: RunnerRequest = {
        schema: 'wholeloop/delivery-runner-request@1',
        key: 'observation',
        run: plan.run,
        revision: 1,
        plan: prepared.digest,
        grant: grant.grant.id,
        host: { id: 'fixture', version: '1', configuration: 'a'.repeat(64) },
        pollMs: 50,
      },
      digest = store.prepare(request).digest,
      host = decisionHost(store, settings.outcome ?? 'keep'),
      calls: OperationCall[] = [],
      respond = mcpResponses(calls),
      inventory: ClientMcpInventory = {
        schema: 'wholeloop/client-mcp@1',
        server: 'analytics-mcp',
        tools: (settings.tools ?? ['aggregate', 'feedback']).map((name) => ({
          name,
          inputSchema: { type: 'object' },
        })),
      },
      requests = (
        context: Parameters<RunnerObservationStages['options']['requests']>[0],
        artifact: { ref: string; sha256: string },
        unknowns: readonly { id: string; missing: string; who: string }[],
      ): DecisionRequest[] => [
        {
          schema: 'wholeloop/delegated-decision-request@1',
          key: `learning-outcome-${context.invocation.slice(0, 32)}`,
          grant: context.request.grant,
          run: context.request.run,
          revision: context.plan.revision,
          plan: context.request.plan,
          decision: 'learning-outcome',
          artifacts: [artifact],
          evidence: [{ id: 'production', ...artifact }],
          unknowns: [...unknowns],
        },
      ],
      observation = new RunnerObservationStages(store, {
        identity: request.host,
        reads: (context) => ({
          registry: loadProviders(
            loadExtensionOptions({ root, userFile: join(dir, 'user/config.yml') }),
          ),
          mcp: {
            inventory,
            invoke: settings.invoke
              ? (call) => {
                  calls.push(call)
                  return (settings.invoke as NonNullable<typeof settings.invoke>)(
                    call,
                    context.signal,
                  )
                }
              : respond,
          },
        }),
        requests,
        host,
      }),
      dispatcher = new RunnerStageDispatcher(store, request.host, {
        plan: new RunnerPlanStages(store, { identity: request.host, requests: () => [], host }),
        observation,
      })
    await run({
      store,
      request,
      digest,
      plan: prepared.plan,
      subject,
      key: scheduled.key,
      dispatcher,
      calls,
      root,
      ticks,
    })
  })
}
