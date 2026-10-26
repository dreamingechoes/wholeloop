import { createHash } from 'node:crypto'
import { chmodSync } from 'node:fs'
import { dirname } from 'node:path'
import type { DecisionId } from '../../src/decisions/policy.js'
import { sourceHash } from '../../src/delivery/input.js'
import type {
  NativeBoundaryHost,
  NativeRunOptions,
  NativeRunReceipt,
} from '../../src/delivery/native-host.js'
import type { DeliveryPlan } from '../../src/delivery/plan.js'
import {
  RunnerArtifactAttempts,
  type RunnerArtifactInput,
  type RunnerArtifactLease,
} from '../../src/runner/artifact-attempts.js'
import { RunnerNativeStage } from '../../src/runner/native-stage.js'
import type { StoreFiles } from '../../src/state/files.js'
import { runnerGitFixture } from './runner-git.js'

export async function runnerArtifactFixture(
  run: (input: {
    store: Parameters<Parameters<typeof runnerGitFixture>[0]>[0]['store']
    context: ConstructorParameters<typeof RunnerArtifactAttempts>[1]
    attempts: RunnerArtifactAttempts
    input: RunnerArtifactInput
    native: Omit<NativeRunOptions, 'process'>
    observe: Parameters<Parameters<typeof runnerGitFixture>[0]>[0]['observe']
    adopt: Parameters<Parameters<typeof runnerGitFixture>[0]>[0]['adopt']
    workspace?: string
    execute(lease: RunnerArtifactLease): Promise<NativeRunReceipt>
  }) => Promise<void>,
  provenance: 'fixture' | 'host-observed' = 'fixture',
  options: {
    stage?: 'definition' | 'plan' | 'acceptance-definition' | 'build-plan'
    mode?:
      | 'valid'
      | 'malformed'
      | 'wrong-basis'
      | 'unknown'
      | 'policy'
      | 'incomplete'
      | 'decision-reject'
    withinEnvelope?: boolean
    delegate?: boolean
    stageBudget?: 'plan'
  } = {},
) {
  const guidance = 'Pinned fixture artifact-production guidance.'
  const decisions: DecisionId[] =
    options.stage === 'definition'
      ? ['frame-outcome', 'approve-spec', 'approve-scopes']
      : options.stage === 'plan'
        ? ['delivery-plan']
        : ['approve-build-plan']
  await runnerGitFixture(
    async ({ store, dispatch, host: git, observe, adopt, request }) => {
      let workspace: string | undefined
      if (options.stage === 'build-plan') {
        observe(await git.execute(dispatch('workspace:search')))
        workspace = git.workspace(request, 'search').repository.path
      }
      const context = dispatch(
          options.stage === 'build-plan'
            ? 'build-plan:search'
            : (options.stage ?? 'acceptance-definition'),
        ),
        attempts = new RunnerArtifactAttempts(store, context),
        root = store.files.path('artifact-input'),
        bin = store.files.path('artifact-bin')
      store.files.atomic('artifact-input/artifacts/guidance.txt', guidance)
      store.files.atomic(
        'artifact-bin/codex',
        `#!${process.execPath}
let input='';process.stdin.on('data',chunk=>input+=chunk);process.stdin.on('end',()=>{
const payload=JSON.parse(input),a=payload.assignment;
let b={};try{b=JSON.parse(a.brief)}catch{}
const mode=${JSON.stringify(options.mode ?? 'valid')};let output={purpose:'fixture',role:a.identity.role};
if(b.response?.$id==='wholeloop/builder-plan@1')output={schema:b.response.$id,steps:['Implement title filtering in the declared task entrypoint.'],tests:['Search seeded titles and assert exact matching task IDs.'],assumptions:[]};
if(b.response?.$id==='wholeloop/acceptance-plan@1')output={schema:b.response.$id,run:a.identity.run,revision:b.plan.revision,plan:mode==='wrong-basis'?'f'.repeat(64):a.identity.plan,source:b.plan.source,cases:[{id:'find-title',criteria:['search'],owner:'machine',applicability:'applicable',rationale:'Exercise the exact agreed search criterion.',initial:'Two seeded tasks have distinct titles.',actions:['Search for the second task title.'],assertions:[{id:'matching-ids',description:'Return the matching task ID.',subject:'json',operator:'equals',path:'/ids',expected:'["task-2"]'}],failureConditions:['Missing or extra IDs fail the case.'],runner:{kind:'api',capability:'http.request',input:'{"method":"GET","path":"/tasks?title=Second"}'},fixture:{ref:'fixture:two-tasks',sha256:'b'.repeat(64)},timeoutMs:5000}],retention:{reviewAfterMs:86400000,expiryAction:'retain'}};
if(b.response?.$id==='wholeloop/delivery-plan@1')output={...b.plan,revision:b.plan.revision+1,previous:mode==='wrong-basis'?'f'.repeat(64):a.identity.plan,definition:mode==='incomplete'?b.plan.definition:{ready:true,missing:[]}};
if(b.response?.$id==='wholeloop/delegated-native-judgment@1'||b.response?.$id==='wholeloop/delegated-native-challenge@1'){const inner=JSON.parse(payload.inputs[0].content);output={schema:b.response.$id,basis:inner.basis,rationale:'Independently inspect the exact produced builder plan.',uncertainties:[]};if(a.identity.role==='planner')output.outcome=inner.request.decision==='frame-outcome'?(mode==='decision-reject'?'on-hold':'go'):(mode==='decision-reject'?'reject':'accept');else{output.judgment=b.judgment;output.verdict='supported'}};
if(mode==='policy'&&output.policy)output.policy={...output.policy,endpoint:'to-merge'};
const proposal={schema:'wholeloop/delivery-worker-proposal@1',assignment:a.assignment,status:'complete',summary:'Synthetic artifact production, not approval.',artifacts:[{ref:b.response?.$id?.startsWith('wholeloop/delegated-native-')?'artifacts/decision.json':'artifacts/production.json',kind:'report',text:mode==='malformed'?'Incomplete JSON':JSON.stringify(output)}],criteria:[],findings:[],unknowns:mode==='unknown'?[{question:'Missing fact?',reason:'Unobserved fixture input.',owner:'Fixture Owner'}]:[]};
console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify(proposal)}}));console.log(JSON.stringify({type:'turn.completed'}));
});\n`,
      )
      chmodSync(`${bin}/codex`, 0o700)
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
          provenance,
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
      const input: RunnerArtifactInput = {
          brief:
            'Produce a pinned artifact proposal without approval, execution claims or human testing.',
          environment: { id: 'fixture', recipe: 'b'.repeat(64), boundary: 'c'.repeat(64) },
          contextRoot: root,
          context: [
            {
              kind: 'guidance',
              audience: 'shared',
              artifact: {
                ref: 'artifacts/guidance.txt',
                sha256: createHash('sha256').update(guidance).digest('hex'),
                bytes: Buffer.byteLength(guidance),
              },
            },
          ],
          provenance,
        },
        native = {
          target: 'codex',
          version: '0.163.0',
          model: 'fixture-model',
          path: `${bin}:${dirname(process.execPath)}`,
          host: boundary,
        }
      // Host-observed normalization here is test input, never actual containment,
      // account authentication or model certification.
      await run({
        store,
        observe,
        adopt,
        context,
        attempts,
        input,
        native,
        ...(workspace ? { workspace } : {}),
        execute: (lease) =>
          new RunnerNativeStage(store, context).run((process) =>
            attempts.run(lease, { ...native, process, signal: context.signal }),
          ),
      })
    },
    {
      singleUnit: true,
      ...(options.withinEnvelope ? { withinEnvelope: true } : {}),
      guidance,
      ...(options.stage === 'definition' ? { definition: true } : {}),
      ...(options.stageBudget ? { stageBudget: options.stageBudget } : {}),
      ...(options.delegate
        ? {
            decisions,
            configure: (plan: DeliveryPlan, files: StoreFiles) => {
              plan.policy.intervention = 'none'
              plan.policy.delegations = decisions.map((id) => {
                const rubric = JSON.stringify({
                  schema: 'wholeloop/delegated-decision-rubric@1',
                  decision: id,
                  purpose: 'Inspect the exact observed proposal before authorizing its next phase.',
                  rules: [{ id: 'scope', text: 'Preserve the approved scope and source.' }],
                  outcomes:
                    id === 'frame-outcome' ? ['go', 'on-hold', 'dropped'] : ['accept', 'reject'],
                  unknowns: { allowed: [], defaults: [] },
                  timeoutMs: 10000,
                })
                const ref = `rubrics/${id}.json`
                files.atomic(ref, rubric)
                return {
                  id,
                  rubric: { ref, sha256: sourceHash(rubric) },
                  evidence: ['production'],
                  fallback: 'blocked',
                }
              })
            },
          }
        : {}),
    },
  )
}
