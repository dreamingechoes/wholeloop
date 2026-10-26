import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { NativeDelegatedDecisionHost } from '../../src/decisions/native-host.js'
import type { DecisionId, DecisionRubric } from '../../src/decisions/policy.js'
import { type DecisionRequest, DelegatedDecisions } from '../../src/decisions/store.js'
import { sourceHash } from '../../src/delivery/input.js'
import type { NativeBoundaryHost } from '../../src/delivery/native-host.js'
import { NativePurposeAttempts } from '../../src/delivery/native-purpose.js'
import { DeliveryQueue } from '../../src/delivery/queue.js'
import { authorization, fixture } from './delivery.js'

const at = '2026-10-26T04:00:00.000Z'
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
const rubric: DecisionRubric = {
  schema: 'wholeloop/delegated-decision-rubric@1',
  decision: 'approve-spec',
  purpose: 'Judge exact evidence and preserve uncertainties.',
  rules: [{ id: 'coverage', text: 'Every claim needs evidence.' }],
  outcomes: ['accept', 'reject'],
  unknowns: { allowed: ['baseline'], defaults: [] },
  timeoutMs: 10000,
}
type Mode =
  | 'valid'
  | 'wrong-basis'
  | 'wrong-judgment'
  | 'forged-identity'
  | 'unknown-outer'
  | 'outcome'
  | 'rejected'
  | 'unknowns'
export async function nativeDecisionFixture(
  run: (context: {
    host: NativeDelegatedDecisionHost
    decisions: DelegatedDecisions
    request: DecisionRequest
    purposes: NativePurposeAttempts
    dir: string
  }) => Promise<void>,
  mode: Mode = 'valid',
  target = 'claude',
  options: { retain?: boolean; decision?: DecisionId; none?: boolean } = {},
) {
  await fixture(async ({ planning, plan, dir }) => {
    const files = planning.sources.files,
      decision = options.decision ?? 'approve-spec',
      rubricText = JSON.stringify({ ...rubric, decision })
    files.atomic('rubrics/spec.json', rubricText)
    plan.policy.delegations = [
      {
        id: decision,
        rubric: { ref: 'rubrics/spec.json', sha256: sourceHash(rubricText) },
        evidence: ['verification'],
        fallback: 'blocked',
      },
    ]
    if (options.none) plan.policy.intervention = 'none'
    const prepared = planning.preparePlan(plan),
      authorizationRequest = authorization(plan, prepared.digest)
    authorizationRequest.decisions = [decision]
    const queue = new DeliveryQueue(files.root, () => at)
    const grant = queue.lifecycle.authority.authorize(authorizationRequest)
    queue.lifecycle.track({ run: plan.run, revision: 1, grant: grant.grant.id })
    queue.lifecycle.transition(plan.run, {
      to: 'queued',
      reason: 'Exercise observed fixture native decisions.',
    })
    const decisions = new DelegatedDecisions(files.root, () => at),
      purposes = new NativePurposeAttempts(queue)
    decisions.pin(grant.grant.id)
    const artifact = JSON.stringify({ scope: plan.scope }),
      evidence = JSON.stringify({ observation: 'Selected fixture evidence.' })
    files.atomic('inputs/spec.json', artifact)
    files.atomic('inputs/evidence.json', evidence)
    const request: DecisionRequest = {
      schema: 'wholeloop/delegated-decision-request@1',
      key: 'native-spec',
      grant: grant.grant.id,
      run: plan.run,
      revision: 1,
      plan: prepared.digest,
      decision,
      artifacts: [{ ref: 'inputs/spec.json', sha256: sourceHash(artifact) }],
      evidence: [{ id: 'verification', ref: 'inputs/evidence.json', sha256: sourceHash(evidence) }],
      unknowns: [],
    }
    const bin = join(dir, 'bin')
    mkdirSync(bin)
    const executable = join(bin, target)
    writeFileSync(
      executable,
      `#!${process.execPath}
let input='';process.stdin.on('data',chunk=>input+=chunk);process.stdin.on('end',()=>{
const payload=JSON.parse(input),a=payload.assignment,brief=JSON.parse(a.brief),inner=JSON.parse(payload.inputs[0].content),planner=a.identity.role==='planner',mode=${JSON.stringify(mode)};
const decision={schema:brief.response.$id,basis:mode==='wrong-basis'?'a'.repeat(64):inner.basis,rationale:'The independent fixture report preserves pinned evidence.',uncertainties:mode==='unknowns'?[{id:'baseline',missing:'There is no measured baseline.',who:'Fixture Owner'}]:[]};
if(planner)decision.outcome=mode==='outcome'?'go':'accept';else {decision.judgment=mode==='wrong-judgment'?'b'.repeat(64):brief.judgment;decision.verdict=mode==='rejected'?'rejected':'supported'}
if(mode==='forged-identity')decision.identity={role:'planner',state:'completed'};
const result={schema:'wholeloop/delivery-worker-proposal@1',assignment:a.assignment,status:'complete',summary:'A fixture claim, not human approval.',artifacts:[{ref:'artifacts/decision.json',kind:'report',text:JSON.stringify(decision)}],criteria:[],findings:[],unknowns:mode==='unknown-outer'?[{question:'Missing measurement?',reason:'No data.',owner:'Fixture Owner'}]:[]};
if(${JSON.stringify(target)}==='claude')console.log(JSON.stringify({is_error:false,structured_output:result}));else {console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify(result)}}));console.log(JSON.stringify({type:'turn.completed'}))}
});\n`,
    )
    chmodSync(executable, 0o700)
    const host = new NativeDelegatedDecisionHost(
      purposes,
      {
        prerequisites: () => ({ supported: true, humanRequired: false, interactive: 'disabled' }),
        observeEvidence: (value) =>
          value.evidence.map((item) => ({
            ...item,
            status: 'passed',
            observation: 'e'.repeat(64),
            provenance: 'fixture',
          })),
      },
      {
        native: {
          target,
          version: target === 'claude' ? '2.1.307' : '0.163.0',
          model: 'fixture-model',
          path: `${bin}:${process.env.PATH ?? ''}`,
          host: boundary,
        },
        provenance: 'fixture',
        environment: { id: 'fixture', recipe: 'b'.repeat(64), boundary: 'c'.repeat(64) },
      },
    )
    await run({ host, decisions, request, purposes, dir })
  }, options)
}
