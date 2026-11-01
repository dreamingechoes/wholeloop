import { chmodSync } from 'node:fs'
import { dirname } from 'node:path'
import { contractDigest } from '../../src/contracts/compatibility.js'
import { NativeDelegatedDecisionHost } from '../../src/decisions/native-host.js'
import type { DecisionRubric } from '../../src/decisions/policy.js'
import type { DecisionRequest } from '../../src/decisions/store.js'
import { readSourceFile, sourceHash } from '../../src/delivery/input.js'
import type { NativeBoundaryHost, NativeProcessRunner } from '../../src/delivery/native-host.js'
import { NativePurposeAttempts } from '../../src/delivery/native-purpose.js'
import type { DeliveryPlan } from '../../src/delivery/plan.js'
import { DeliveryQueue } from '../../src/delivery/queue.js'
import type { Angle, AngleResult, Refutation } from '../../src/research/contracts.js'
import type { RunnerStageContext } from '../../src/runner/engine.js'
import { RunnerPlanStages } from '../../src/runner/plan-stages.js'
import {
  type RunnerResearchClaimJob,
  type RunnerResearchObservation,
  RunnerResearchStages,
} from '../../src/runner/research-stages.js'
import { NativeResearchWorkers, RunnerResearchAttempts } from '../../src/runner/research-workers.js'
import { runnerDecisionRequirements } from '../../src/runner/route.js'
import { RunnerStageDispatcher } from '../../src/runner/stage-dispatcher.js'
import { type RunnerRequest, RunnerStore } from '../../src/runner/store.js'
import { authorization, fixture } from './delivery.js'

export type AngleScript = AngleResult | 'crash' | 'fixture' | 'hang'
export type ClaimScript = (job: RunnerResearchClaimJob) => Refutation | 'crash'
export const angle = (provider: string, available = true): Angle => ({
  id: `${provider}:source.web`,
  provider,
  capability: 'source.web',
  operation: 'source.web.query',
  available,
  evidence: available ? 'Fixture provider declared.' : 'Fixture provider is not configured.',
})
export const confirm: ClaimScript = (job) => ({
  claim: job.claim.id,
  verifier: job.verifier,
  outcome: 'confirm',
  reason: 'The cited excerpt states the claim.',
  evidence: [],
})
const rubric = (decision: string): DecisionRubric =>
  ({
    schema: 'wholeloop/delegated-decision-rubric@1',
    decision,
    purpose: 'Judge exact cited research evidence and preserve uncertainties.',
    rules: [{ id: 'coverage', text: 'Every retained claim needs cited evidence.' }],
    outcomes: ['accept', 'reject'],
    unknowns: { allowed: [], defaults: [] },
    timeoutMs: 10000,
  }) as DecisionRubric
/** Synthetic processes and normalized host flags certify no account, model or real source. */
export async function runnerResearchFixture(
  run: (input: {
    store: RunnerStore
    request: RunnerRequest
    digest: string
    dir: string
    plan: DeliveryPlan
    dispatcher: RunnerStageDispatcher
    research: RunnerResearchStages
    calls: { angles: string[]; claims: string[] }
  }) => Promise<void>,
  settings: {
    angles?: Angle[]
    scripts?: Record<string, AngleScript[]>
    examine?: ClaimScript
    uncertainty?: DeliveryPlan['policy']['uncertainty']
    intervention?: 'none' | 'supervised'
    decision?: 'accept' | 'reject'
    native?: boolean
  } = {},
) {
  await fixture(async ({ dir, planning, plan }) => {
    const files = planning.sources.files
    plan.policy = {
      endpoint: 'research-report',
      intervention: settings.intervention ?? 'none',
      uncertainty: settings.uncertainty ?? 'blocked',
      delegations: (['research-plan', 'research-sources'] as const).map((id) => {
        const text = JSON.stringify(rubric(id))
        files.atomic(`rubrics/${id}.json`, text)
        return {
          id,
          rubric: { ref: `rubrics/${id}.json`, sha256: sourceHash(text) },
          evidence: ['production'],
          fallback: 'blocked' as const,
        }
      }),
    }
    plan.repositories = []
    plan.work = [
      {
        id: 'background',
        role: 'research',
        criteria: ['search'],
        after: [],
        consumes: [],
        produces: [],
      },
    ]
    plan.milestones = [
      {
        id: 'report',
        work: ['background'],
        criteria: ['search'],
        after: [],
        procedure: 'Read the stored research brief.',
      },
    ]
    const store = new RunnerStore(files.root),
      prepared = planning.preparePlan(plan),
      grantRequest = authorization(plan, prepared.digest)
    grantRequest.effects = ['source.read', 'report.write']
    grantRequest.decisions = ['research-plan', 'research-sources']
    const grant = store.lifecycle.authority.authorize(grantRequest)
    store.lifecycle.track({ run: plan.run, revision: 1, grant: grant.grant.id })
    const request: RunnerRequest = {
        schema: 'wholeloop/delivery-runner-request@1',
        key: 'research',
        run: plan.run,
        revision: 1,
        plan: prepared.digest,
        grant: grant.grant.id,
        host: { id: 'fixture', version: '1', configuration: 'a'.repeat(64) },
        pollMs: 50,
      },
      digest = store.prepare(request).digest
    store.files.atomic(
      'research-bin/codex',
      `#!${process.execPath}
if(process.argv.includes('--version')){console.log('codex-cli 0.163.0');process.exit(0)}
let input='';process.stdin.on('data',chunk=>input+=chunk);process.stdin.on('end',()=>{
const payload=JSON.parse(input),a=payload.assignment,b=JSON.parse(a.brief);
const emit=(ref,body)=>{const proposal={schema:'wholeloop/delivery-worker-proposal@1',assignment:a.assignment,status:'complete',summary:'Synthetic process output; no account, model or real source certification.',artifacts:[{ref,kind:'report',text:JSON.stringify(body)}],criteria:[],findings:[],unknowns:[]};
console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify(proposal)}}));console.log(JSON.stringify({type:'turn.completed'}))};
if(b.job){const j=b.job;emit('artifacts/research.json',a.identity.role==='planner'?{angle:j.angle.id,status:'ok',claims:[{id:'index',text:'A title index serves search.',confidence:'high',loadBearing:true,evidence:[{ref:'https://'+j.angle.provider+'.example/index',excerpt:'A title index serves search.'}]}],openQuestions:[]}:{claim:j.claim.id,verifier:j.verifier,outcome:'confirm',reason:'The cited excerpt states the claim.',evidence:[]});return}
const inner=JSON.parse(payload.inputs[0].content);
const output={schema:b.response.$id,basis:inner.basis,rationale:'Synthetic independent judgment of exact cited fixture evidence.',uncertainties:[]};
if(a.identity.role==='planner')output.outcome=${JSON.stringify(settings.decision ?? 'accept')};else{output.judgment=b.judgment;output.verdict='supported'}
emit('artifacts/decision.json',output);
});\n`,
    )
    chmodSync(store.files.path('research-bin/codex'), 0o700)
    const nativePath = `${store.files.path('research-bin')}:${dirname(process.execPath)}`,
      boundary: NativeBoundaryHost = {
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
      },
      host = (process: NativeProcessRunner) =>
        new NativeDelegatedDecisionHost(
          new NativePurposeAttempts(
            new DeliveryQueue(store.files.root, store.now, undefined, store.budgets.clock),
          ),
          {
            prerequisites: () => ({
              supported: true,
              humanRequired: false,
              interactive: 'disabled',
            }),
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
              version: '0.163.0',
              model: 'fixture-model',
              path: nativePath,
              host: boundary,
              process,
            },
            environment: { id: 'fixture', recipe: 'b'.repeat(64), boundary: 'c'.repeat(64) },
            provenance: 'host-observed',
          },
        ),
      requests = (
        context: RunnerStageContext,
        artifact: { ref: string; sha256: string },
      ): DecisionRequest[] =>
        runnerDecisionRequirements(
          context.plan as DeliveryPlan,
          context.stage,
          store.lifecycle.authority.inspect(context.request.grant).grant.basis.kind,
        ).map(({ id }) => ({
          schema: 'wholeloop/delegated-decision-request@1',
          key: `${id}-${context.invocation.slice(0, 32)}`,
          grant: context.request.grant,
          run: context.request.run,
          revision: context.plan.revision,
          plan: context.request.plan,
          decision: id,
          artifacts: [artifact],
          evidence: [{ id: 'production', ...artifact }],
          unknowns: [],
        })),
      angles = settings.angles ?? [angle('docs'), angle('forum')],
      scripts = structuredClone(settings.scripts ?? {}),
      calls = { angles: [] as string[], claims: [] as string[] },
      observation = (value: unknown): RunnerResearchObservation => ({
        provenance: 'host-observed',
        evidence: contractDigest(value),
        value,
      }),
      research = new RunnerResearchStages(store, {
        identity: request.host,
        plan: (context) => ({
          schema: 'wholeloop/research-plan@1',
          subject: 'search',
          run: context.request.run,
          question: planning.sources.get(context.plan.source).body,
          owner: context.plan.owner,
          verifiers: 3,
          refutations: 2,
          angles,
          openQuestions: [],
        }),
        workers: settings.native
          ? (process, context) =>
              new NativeResearchWorkers(
                new RunnerResearchAttempts(
                  new DeliveryQueue(store.files.root, store.now, undefined, store.budgets.clock),
                ),
                {
                  run: context.request.run,
                  grant: context.request.grant,
                  native: {
                    target: 'codex',
                    version: '0.163.0',
                    model: 'fixture-model',
                    path: nativePath,
                    host: boundary,
                    process,
                  },
                  environment: { id: 'fixture', recipe: 'b'.repeat(64), boundary: 'c'.repeat(64) },
                  provenance: 'host-observed',
                  deadline: context.deadline,
                },
              )
          : () => ({
              angle: async (job, signal) => {
                calls.angles.push(job.angle.id)
                const next = scripts[job.angle.id]?.shift() ?? 'crash'
                if (next === 'crash') throw new Error('Synthetic source worker crash.')
                if (next === 'hang')
                  return new Promise((_, reject) =>
                    signal.addEventListener('abort', () => reject(new Error('cancelled'))),
                  )
                if (next === 'fixture') return { ...observation({}), provenance: 'fixture' }
                return observation(next)
              },
              examine: async (job) => {
                calls.claims.push(`${job.claim.id}#${job.verifier}`)
                const value = (settings.examine ?? confirm)(job)
                if (value === 'crash') throw new Error('Synthetic refuter crash.')
                return observation(value)
              },
            }),
        requests,
        host,
      }),
      dispatcher = new RunnerStageDispatcher(store, request.host, {
        plan: new RunnerPlanStages(store, { identity: request.host, requests, host }),
        research,
      })
    await run({ store, request, digest, dir, plan, dispatcher, research, calls })
  })
}
