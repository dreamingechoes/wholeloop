import { createHash } from 'node:crypto'
import { chmodSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { NativeBoundaryHost, NativeProcessRunner } from '../../src/delivery/native-host.js'
import { DEFAULT_REVIEW_RUBRIC } from '../../src/review/input.js'
import type { RunnerGateOptions } from '../../src/runner/native-gate.js'
import type { RunnerStore } from '../../src/runner/store.js'

export type GateFixtureMode =
  | 'valid'
  | 'finding'
  | 'confirmed'
  | 'repair-aware'
  | 'wrong-unit'
  | 'execution'
  | 'outer-unknown'
  | 'mutate'
  | 'majority'

/** Synthetic processes test receipt composition, never authenticated model containment. */
export function gateWorkerFixture(
  store: RunnerStore,
  workspace: string,
  mode: GateFixtureMode = 'valid',
  provenance: 'fixture' | 'host-observed' = 'fixture',
) {
  const bin = store.files.path('gate-fixture-bin'),
    contextRoot = store.files.path('gate-fixture-context')
  store.files.atomic('gate-fixture-context/artifacts/guidance.txt', DEFAULT_REVIEW_RUBRIC)
  store.files.atomic(
    'gate-fixture-bin/codex',
    `#!${process.execPath}
const fs=require('node:fs');let text='';process.stdin.on('data',b=>text+=b);process.stdin.on('end',()=>{
const p=JSON.parse(text),a=p.assignment,input=JSON.parse(p.inputs.find(i=>i.artifact.ref==='artifacts/gate-input.json').content),mode=${JSON.stringify(mode)};
const confirmed=mode==='confirmed'||(mode==='repair-aware'&&fs.readFileSync(${JSON.stringify(join(workspace, 'app.txt'))},'utf8')!=='Synthetic owned correction.\\n');
if(mode==='mutate')fs.writeFileSync(${JSON.stringify(join(workspace, 'app.txt'))},'Forbidden review edit.');
const report=a.identity.role==='refuter'?{finding:input.assignment.finding,verifier:input.assignment.verifier,outcome:confirmed?'confirm':'refute',reason:'Normalized fixture counterexample.',evidence:['Observed fixture counterexample.']}:{unit:mode==='wrong-unit'?'another':input.assignment.id,status:'ok',evidence:['Observed fixture candidate.'],findings:(mode==='finding'||(confirmed&&input.assignment.id===input.plan.units.find(unit=>unit.id!=='suite')?.id)||(mode==='majority'&&input.assignment.id===input.plan.units.find(unit=>!unit.failSafe)?.id))?[{id:'defect',location:'app.txt:1',text:'Normalized fixture defect.',evidence:['Observed fixture line.']}]:[]};
if(mode==='execution')report.execution={status:'passed'};
const result={schema:'wholeloop/delivery-worker-proposal@1',assignment:a.assignment,status:mode==='majority'&&a.identity.role==='refuter'&&input.assignment.verifier===input.plan.verifiers?'blocked':'complete',summary:'Synthetic review claim.',artifacts:[{ref:'artifacts/gate.json',kind:'report',text:JSON.stringify(report)}],criteria:[],findings:[],unknowns:mode==='outer-unknown'?[{question:'Unknown?',reason:'Fixture missing evidence.',owner:'Fixture Owner'}]:[]};
console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify(result)}}));console.log(JSON.stringify({type:'turn.completed'}));
});
`,
  )
  chmodSync(join(bin, 'codex'), 0o700)
  // These normalized host-observed cases exercise controller logic. The fixture
  // client is not an observed containment boundary or an authenticated model.
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
  const options = (nativeProcess: NativeProcessRunner): RunnerGateOptions => ({
    native: {
      target: 'codex',
      version: '0.163.0',
      model: 'fixture-model',
      path: `${bin}:${dirname(process.execPath)}`,
      host: boundary,
      process: nativeProcess,
    },
    context: () => ({
      workspace,
      contextRoot,
      environment: { id: 'fixture', recipe: 'b'.repeat(64), boundary: 'c'.repeat(64) },
      context: [
        {
          kind: 'guidance',
          audience: 'shared',
          artifact: {
            ref: 'artifacts/guidance.txt',
            sha256: createHash('sha256').update(DEFAULT_REVIEW_RUBRIC).digest('hex'),
            bytes: Buffer.byteLength(DEFAULT_REVIEW_RUBRIC),
          },
        },
      ],
    }),
    admit: () => ({ ready: true, evidence: 'f'.repeat(64), provenance }),
  })
  return options
}
