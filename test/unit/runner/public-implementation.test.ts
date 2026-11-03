import { createHash } from 'node:crypto'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sourceHash } from '../../../src/delivery/input.js'
import { REFERENCE_NATIVE_VERSIONS } from '../../../src/delivery/native-adapters.js'
import type { NativeBindings } from '../../../src/delivery/native-bindings.js'
import type { NativeRuntime } from '../../../src/delivery/native-runtime.js'
import type { DeliveryPlan } from '../../../src/delivery/plan.js'
import { RunnerNativeScope } from '../../../src/runner/native-scope.js'
import { composePublicHost } from '../../../src/runner/public-composition.js'
import { runnerRoute } from '../../../src/runner/route.js'
import { RunnerStageDispatcher } from '../../../src/runner/stage-dispatcher.js'
import type { StoreFiles } from '../../../src/state/files.js'
import { git } from '../../support/delivery.js'
import { runnerGitFixture } from '../../support/runner-git.js'

const RUBRIC = 'Review the exact diff for correctness and scope.\n',
  bindings: NativeBindings = {
    schema: 'wholeloop/native-bindings@1',
    bindings: [
      {
        target: 'codex',
        version: REFERENCE_NATIVE_VERSIONS.codex,
        model: 'reference-model',
        roles: ['planner', 'challenger', 'builder'],
      },
    ],
  }

/**
 * A synthetic Codex answering the real boundary observer's controls, then the
 * acceptance-plan, builder-plan, decision and builder turns. Its sandbox probe
 * reports what the profile's own write roots allow for the workspace witness,
 * so a builder's workspace write is observed only when the recipe grants it. It certifies no client.
 */
const SYNTHETIC_CODEX = (log: string) => `#!${process.execPath}
const args=process.argv.slice(2),fs=require('node:fs'),path=require('node:path'),conf=args.join(' ');
fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(args.filter(a=>!a.startsWith('{')&&a.length<200))+'\\n');
const writes=[...conf.matchAll(/"([^"]+)"="write"/g)].map(m=>m[1]);
if(args.includes('--version')){console.log('codex-cli 0.166.0');process.exit(0)}
if(args.includes('features')){for(const a of args)if(a.startsWith('features.'))console.log(a.slice(9).split('=')[0]+' stable false');process.exit(0)}
if(args.includes('login')){console.log('Logged in');process.exit(0)}
let input='';process.stdin.on('data',chunk=>input+=chunk);process.stdin.on('end',()=>{
if(args.includes('sandbox')){const v=JSON.parse(input);if(v.mode==='cancel'){console.log(JSON.stringify({ready:v.nonce}));setInterval(()=>{},1000);return}
const ww=v.workspace!==v.read&&writes.some(w=>v.workspace.startsWith(w+'/'))?'allowed':'denied';
console.log(JSON.stringify({nonce:v.nonce,read:fs.readFileSync(v.read,'utf8')===v.nonce,privateDenied:true,credentialsDenied:true,workspaceWrite:ww,outputWrite:'denied',networkDenied:true}));return}
const payload=JSON.parse(input),a=payload.assignment;let b={};try{b=JSON.parse(a.brief)}catch{}
const emit=(ref,text)=>{const proposal={schema:'wholeloop/delivery-worker-proposal@1',assignment:a.assignment,status:'complete',summary:'Synthetic output.',artifacts:[{ref,kind:'report',text}],criteria:[],findings:[],unknowns:[]};
console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify(proposal)}}));console.log(JSON.stringify({type:'turn.completed'}))};
if(a.identity.role==='builder'){const ws=writes.find(p=>!p.startsWith(process.cwd()));fs.writeFileSync(path.join(ws,'app.txt'),'Synthetic public implementation.\\n');emit('artifacts/report.txt','Synthetic builder report.\\n');return}
const id=b.response&&b.response.$id;
if(id==='wholeloop/acceptance-plan@1'){emit('artifacts/production.json',JSON.stringify({schema:id,run:a.identity.run,revision:b.plan.revision,plan:a.identity.plan,source:b.plan.source,cases:[{id:'find-title',criteria:['search'],owner:'machine',applicability:'applicable',rationale:'Exercise the exact agreed search criterion.',initial:'Two seeded tasks have distinct titles.',actions:['Search for the second task title.'],assertions:[{id:'matching-ids',description:'Return the matching task ID.',subject:'json',operator:'equals',path:'/ids',expected:'["task-2"]'}],failureConditions:['Missing or extra IDs fail the case.'],runner:{kind:'api',capability:'http.request',input:'{"method":"GET","path":"/tasks?title=Second"}'},fixture:{ref:'fixture:two-tasks',sha256:'b'.repeat(64)},timeoutMs:5000}],retention:{reviewAfterMs:86400000,expiryAction:'retain'}}));return}
if(id==='wholeloop/builder-plan@1'){emit('artifacts/production.json',JSON.stringify({schema:id,steps:['Implement title filtering in the declared task entrypoint.'],tests:['Search seeded titles and assert exact matching task IDs.'],assumptions:[]}));return}
const inner=JSON.parse(payload.inputs[0].content),output={schema:id,basis:inner.basis,rationale:'Synthetic judgment of the exact produced plan.',uncertainties:[]};
if(a.identity.role==='planner')output.outcome='accept';else{output.judgment=b.judgment;output.verdict='supported'}
emit('artifacts/decision.json',JSON.stringify(output));
});
`

function toPr(plan: DeliveryPlan, files: StoreFiles, rubric = RUBRIC) {
  plan.policy.endpoint = 'to-pr'
  plan.policy.intervention = 'none'
  for (const repository of plan.repositories) {
    git(repository.root, ['remote', 'add', 'origin', 'https://github.com/fixture/app.git'])
    repository.remote = { name: 'origin', url: 'https://github.com/fixture/app' }
  }
  // The pinned rubric is a committed repository file read at the pinned base.
  plan.guidance = [
    {
      slot: 'review.rubric',
      ref: 'REVIEW.md',
      sha256: createHash('sha256').update(rubric).digest('hex'),
      repository: 'app',
    },
  ]
  const text = JSON.stringify({
    schema: 'wholeloop/delegated-decision-rubric@1',
    decision: 'approve-build-plan',
    purpose: 'Accept a builder plan only when it implements the pinned criteria.',
    rules: [{ id: 'scope', text: 'Preserve the approved scope and source.' }],
    outcomes: ['accept', 'reject'],
    unknowns: { allowed: [], defaults: [] },
    timeoutMs: 10000,
  })
  files.atomic('rubrics/approve-build-plan.json', text)
  plan.policy.delegations = [
    {
      id: 'approve-build-plan',
      rubric: { ref: 'rubrics/approve-build-plan.json', sha256: sourceHash(text) },
      evidence: ['production'],
      fallback: 'blocked',
    },
  ]
}

describe('public to-pr composition up to commit (ADR-0207)', () => {
  it('composes the front of the route and leaves every later stage unsupported', async () => {
    await runnerGitFixture(
      async ({ store, request }) => {
        const plan = store.basis(request).plan,
          runtime: NativeRuntime = {
            schema: 'wholeloop/native-runtime@1',
            clients: [
              { target: 'codex', client: '/opt/fixture/codex', store: '/opt/fixture/home' },
            ],
          },
          stages = runnerRoute(plan),
          host = composePublicHost({
            store,
            request,
            plan,
            stages,
            configuration: { bindings, runtime },
          })
        expect(host).toBeInstanceOf(RunnerStageDispatcher)
        const coverage = (host as RunnerStageDispatcher).coverage(plan)
        expect(coverage.complete).toBe(false)
        expect(
          stages.filter((stage) => !coverage.unsupported.includes(stage.id)).map((s) => s.id),
        ).toEqual([
          'plan',
          'acceptance-definition',
          'workspace:search',
          'build-plan:search',
          'implementation:search',
          'commit:search',
        ])
        expect(
          await host?.preflight(request, plan, stages, new AbortController().signal),
        ).toMatchObject({ available: false })
        // No builder binding, or a guidance pin whose bytes differ, composes nothing.
        expect(
          composePublicHost({
            store,
            request,
            plan,
            stages,
            configuration: {
              bindings: {
                ...bindings,
                bindings: bindings.bindings.map((b) => ({
                  ...b,
                  roles: ['planner', 'challenger'],
                })),
              },
              runtime,
            },
          }),
        ).toBeUndefined()
        const changed = {
          ...plan,
          guidance: plan.guidance.map((pin) => ({ ...pin, sha256: 'c'.repeat(64) })),
        }
        expect(
          composePublicHost({
            store,
            request,
            plan: changed,
            stages,
            configuration: { bindings, runtime },
          }),
        ).toBeUndefined()
      },
      {
        singleUnit: true,
        seed: { 'REVIEW.md': RUBRIC },
        decisions: ['approve-build-plan'],
        configure: (plan, files) => toPr(plan, files),
      },
    )
  })
  it('runs plan to commit through the real Codex observer with no prompt', async () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-public-implementation-')))
    mkdirSync(join(dir, 'bin'))
    mkdirSync(join(dir, 'codex-home'), { mode: 0o700 })
    const log = join(dir, 'calls.jsonl')
    writeFileSync(join(dir, 'bin', 'codex'), SYNTHETIC_CODEX(log))
    chmodSync(join(dir, 'bin', 'codex'), 0o700)
    const runtime: NativeRuntime = {
      schema: 'wholeloop/native-runtime@1',
      clients: [
        { target: 'codex', client: join(dir, 'bin', 'codex'), store: join(dir, 'codex-home') },
      ],
    }
    await runnerGitFixture(
      async ({ store, request, digest, dispatch, observe, host: git }) => {
        const plan = store.basis(request).plan,
          host = composePublicHost({
            store,
            request,
            plan,
            stages: runnerRoute(plan),
            configuration: { bindings, runtime },
          })
        if (!host) throw new Error('The front of the route must compose')
        for (const id of [
          'plan',
          'acceptance-definition',
          'workspace:search',
          'build-plan:search',
          'implementation:search',
          'commit:search',
        ]) {
          const observed = await host.execute(dispatch(id))
          expect(observed, `${id}: ${observed.reason}`).toMatchObject({ status: 'passed' })
          if (id !== 'plan' && id !== 'workspace:search' && id !== 'commit:search')
            expect(observed.provenance, id).toBe('host-observed')
          observe(observed)
        }
        const candidate = git.candidate(request, 'search')
        expect(readFileSync(join(candidate.allocation.repository.path, 'app.txt'), 'utf8')).toBe(
          'Synthetic public implementation.\n',
        )
        for (const id of ['acceptance-definition', 'build-plan:search', 'implementation:search']) {
          const record = store.stage(digest, id)
          if (record)
            expect(
              new RunnerNativeScope(store.files, record.invocation)
                .inspect()
                .every((call) => call.observed.invocationState === 'stopped'),
            ).toBe(true)
        }
        const calls = readFileSync(log, 'utf8')
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line) as string[]),
          launches = calls.filter((args) => args.includes('exec')).length
        // The acceptance-plan producer, the build-plan producer with its judge
        // and challenger, and one builder; acceptance definition is not delegated.
        expect(launches).toBe(5)
        expect(calls.filter((args) => args.includes('sandbox')).length).toBe(2 * launches)
        expect(calls.filter((args) => args.includes('login')).length).toBe(launches)
      },
      {
        singleUnit: true,
        seed: { 'REVIEW.md': RUBRIC },
        decisions: ['approve-build-plan'],
        configure: (plan, files) => toPr(plan, files),
      },
    )
  })
})
