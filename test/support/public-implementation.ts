import { createHash } from 'node:crypto'
import { sourceHash } from '../../src/delivery/input.js'
import { REFERENCE_NATIVE_VERSIONS } from '../../src/delivery/native-adapters.js'
import type { NativeBindings } from '../../src/delivery/native-bindings.js'
import type { DeliveryPlan } from '../../src/delivery/plan.js'
import { DOCKER_REFERENCE_HELPER } from '../../src/environment/docker-policy.js'
import { DeliveryEnvironments } from '../../src/environment/provision.js'
import type { StoreFiles } from '../../src/state/files.js'
import { git } from './delivery.js'
import { environmentRecipe } from './environment.js'

/** Shared by the public to-pr composition test and its real-Docker evaluation (ADR-0207). */
export const RUBRIC = 'Review the exact diff for correctness and scope.\n',
  publicBindings: NativeBindings = {
    schema: 'wholeloop/native-bindings@1',
    bindings: [
      {
        target: 'codex',
        version: REFERENCE_NATIVE_VERSIONS.codex,
        model: 'reference-model',
        roles: ['planner', 'challenger', 'builder', 'verifier', 'reviewer', 'refuter'],
      },
    ],
  }

/**
 * A synthetic Codex answering the real boundary observer's controls, then the
 * acceptance-plan, builder-plan, decision, builder and gate turns. Its sandbox probe
 * reports what the profile's own write roots allow for the workspace witness,
 * so a builder's workspace write is observed only when the recipe grants it.
 * Gate workers report the unit clean and refuters refute. It certifies no
 * client, model or containment. In correction mode an ordinary build writes a
 * wrong service status, so product QA fails until a correction task writes the
 * right one (ADR-0208).
 */
export const SYNTHETIC_CODEX = (
  log: string,
  mode: 'pass' | 'correction' | 'ci-correction' = 'pass',
) => `#!${process.execPath}
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
if(a.identity.role==='builder'){const ws=writes.find(p=>!p.startsWith(process.cwd())),repair=b.task&&b.task.kind==='repair';fs.writeFileSync(path.join(ws,'app.txt'),'Synthetic public implementation.\\n');fs.writeFileSync(path.join(ws,'status.txt'),repair||${JSON.stringify(mode)}!=='correction'?'public fixture':'broken');if(${JSON.stringify(mode)}==='ci-correction')fs.writeFileSync(path.join(ws,'ci-status.txt'),repair?'passed':'failed');emit('artifacts/report.txt','Synthetic builder report.\\n');return}
const gate=(payload.inputs||[]).find(i=>i.artifact&&i.artifact.ref==='artifacts/gate-input.json');
if(gate){const input=JSON.parse(gate.content),report=a.identity.role==='refuter'?{finding:input.assignment.finding,verifier:input.assignment.verifier,outcome:'refute',reason:'Synthetic counterexample.',evidence:['Synthetic observation.']}:{unit:input.assignment.id,status:'ok',evidence:['Synthetic inspection of the candidate.'],findings:[]};emit('artifacts/gate.json',JSON.stringify(report));return}
const id=b.response&&b.response.$id;
if(id==='wholeloop/acceptance-plan@1'){if(b.response.properties.revision.const!==b.plan.revision||b.acceptanceContext?.inputSchema?.$id!=='wholeloop/behavior-input@1'||!b.acceptanceContext.fixtures.length)throw new Error('Installed acceptance generation contract missing');emit('artifacts/production.json',JSON.stringify({schema:id,run:a.identity.run,revision:b.plan.revision,plan:a.identity.plan,source:b.plan.source,cases:[{id:'product-api',criteria:b.plan.criteria.map(c=>c.id),owner:'machine',applicability:'applicable',rationale:'Observe the assembled application through its public HTTP endpoint.',initial:'The assembled application is ready.',actions:b.plan.milestones.map(m=>m.procedure),assertions:[{id:'response',description:'The assembled service returns its status.',subject:'json',operator:'equals',path:'/status',expected:'"public fixture"'}],failureConditions:['A different response fails the product check.'],runner:{kind:'api',capability:'http.request',input:JSON.stringify({schema:'wholeloop/behavior-input@1',kind:'api',service:'web',port:3000,steps:[{id:'read',kind:'request',method:'GET',path:'/'}]})},fixture:b.acceptanceContext.fixtures[0].fixture,timeoutMs:60000},{id:'product-scope',criteria:b.plan.criteria.map(c=>c.id),owner:'machine',applicability:'applicable',rationale:'Observe complete committed scope through the installed controller.',initial:'The controller pins the original base and assembled candidate.',actions:b.plan.milestones.map(m=>m.procedure),assertions:[{id:'paths',description:'Only the declared synthetic product files change.',subject:'json',operator:'equals',path:'/changedPaths',expected:JSON.stringify(${JSON.stringify(mode)}==='ci-correction'?['app.txt','ci-status.txt','status.txt']:['app.txt','status.txt'])}],failureConditions:['An additional changed file fails scope.'],runner:{kind:'cli',capability:'repository.diff',input:JSON.stringify({schema:'wholeloop/repository-diff-input@1',repository:b.acceptanceContext.fixtures[0].repository})},fixture:b.acceptanceContext.fixtures[0].repositoryDiffFixture,timeoutMs:60000}],retention:{reviewAfterMs:86400000,expiryAction:'retain'}}));return}
if(id==='wholeloop/builder-plan@1'){emit('artifacts/production.json',JSON.stringify({schema:id,steps:['Implement title filtering in the declared task entrypoint.'],tests:['Search seeded titles and assert exact matching task IDs.'],assumptions:[]}));return}
const inner=JSON.parse(payload.inputs[0].content),output={schema:id,basis:inner.basis,rationale:'Synthetic judgment of the exact produced plan.',uncertainties:[]};
if(a.identity.role==='planner')output.outcome='accept';else{output.judgment=b.judgment;output.verdict='supported'}
emit('artifacts/decision.json',JSON.stringify(output));
});
`

/** The runtime's pinned inputs for one repository, with the suite every fixture declares. */
export const REPOSITORY = (recipe: string, repository = 'app') => ({
  repository,
  recipe,
  helperImage: DOCKER_REFERENCE_HELPER,
  suite: {
    refs: ['package.json#check'],
    mapping: { 'package.json#check': 'suite' },
    timeoutMs: 30000,
  },
})

/** Decisions a none-policy to-pr route delegates; the fixture grant names exactly these. */
export const DELEGATED = ['approve-build-plan', 'acceptance'] as const

/** `ssh`: an SSH-form remote whose transport GIT_SSH_COMMAND can serve locally. */
export function toPr(plan: DeliveryPlan, files: StoreFiles, remote: 'https' | 'ssh' = 'https') {
  const rubric = RUBRIC
  plan.policy.endpoint = 'to-pr'
  plan.policy.intervention = 'none'
  for (const repository of plan.repositories) {
    git(repository.root, [
      'remote',
      'add',
      'origin',
      remote === 'ssh' ? 'git@github.com:fixture/app.git' : 'https://github.com/fixture/app.git',
    ])
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
  plan.policy.delegations = DELEGATED.map((id) => {
    const text = JSON.stringify({
      schema: 'wholeloop/delegated-decision-rubric@1',
      decision: id,
      purpose: 'Accept only evidence that satisfies the pinned criteria.',
      rules: [{ id: 'scope', text: 'Preserve the approved scope and source.' }],
      outcomes: ['accept', 'reject'],
      unknowns: { allowed: [], defaults: [] },
      timeoutMs: 10000,
    })
    files.atomic(`rubrics/${id}.json`, text)
    return {
      id,
      rubric: { ref: `rubrics/${id}.json`, sha256: sourceHash(text) },
      evidence: ['production'],
      fallback: 'blocked' as const,
    }
  })
}

const APP =
    "const fs=require('node:fs');require('node:http').createServer((_q,r)=>{r.setHeader('content-type','application/json');r.end(JSON.stringify({status:fs.readFileSync('/workspace/app/status.txt','utf8')}))}).listen(3000,'0.0.0.0')\n",
  CHECK = "process.stdout.write('observed public suite\\n')\n",
  PACKAGE = JSON.stringify({ private: true, scripts: { check: 'node suite.cjs' } })
/** The committed application, declared suite and rubric every public to-pr fixture seeds. */
export const SEED = {
  'package.json': PACKAGE,
  'app.cjs': APP,
  'suite.cjs': CHECK,
  'REVIEW.md': RUBRIC,
}

/** Pins (never provisions) the recipe whose `suite` test command runs the declared check. */
export function prepareSuiteRecipe(storeRoot: string, root: string, data = false) {
  const recipe = environmentRecipe(root, APP, process.arch === 'x64' ? 'amd64' : 'arm64')
  // Product QA has no source for data seeds, so the public route refuses data volumes.
  if (!data) {
    recipe.data = []
    for (const service of recipe.services)
      service.mounts = service.mounts.filter((mount) => mount.kind !== 'data')
  }
  recipe.files.push(
    {
      id: 'package',
      repository: 'app',
      ref: 'package.json',
      sha256: sourceHash(PACKAGE),
      kind: 'package',
    },
    { id: 'suite', repository: 'app', ref: 'suite.cjs', sha256: sourceHash(CHECK), kind: 'script' },
  )
  recipe.commands.push({
    id: 'suite',
    service: 'web',
    phase: 'test',
    command: {
      argv: ['npm', 'run', 'check'],
      cwd: '/workspace/app',
      origin: { kind: 'package-script', file: 'package', script: 'check' },
    },
    timeoutMs: 5000,
  })
  return new DeliveryEnvironments(storeRoot).recipes.prepare(recipe).digest
}

/**
 * Serves the SSH-form GitHub remote from a local bare repository, so the
 * fixed code host pushes and lists heads with real Git and no network.
 * Git runs it as GIT_SSH_COMMAND with the host and the remote command.
 */
export const LOCAL_SSH = (bare: string) => `#!${process.execPath}
const command=process.argv.at(-1).split(' ')[0],map={'git-receive-pack':'receive-pack','git-upload-pack':'upload-pack'};
if(!map[command])process.exit(2);
process.exit(require('node:child_process').spawnSync('git',[map[command],${JSON.stringify(bare)}],{stdio:'inherit'}).status??1)
`

/**
 * A stateful synthetic gh: lists, creates and readies pull requests for
 * fixture/app in a JSON file, reading pushed heads from the local bare
 * repository. Every call is logged. It certifies no GitHub behavior.
 */
export const SYNTHETIC_GH = (state: string, bare: string, log: string) => `#!${process.execPath}
const fs=require('node:fs'),cp=require('node:child_process'),args=process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(args)+'\\n');
const load=()=>fs.existsSync(${JSON.stringify(state)})?JSON.parse(fs.readFileSync(${JSON.stringify(state)},'utf8')):[],save=v=>fs.writeFileSync(${JSON.stringify(state)},JSON.stringify(v));
if(args[0]==='pr'&&args[1]==='ready'){const v=load(),pr=v.find(p=>p.html_url===args.at(-1));if(!pr)process.exit(1);pr.draft=false;save(v);process.exit(0)}
if(args[0]!=='api')process.exit(2);
const method=args[args.indexOf('--method')+1],endpoint=args.find(a=>a.startsWith('repos/fixture/app/'));
if(method==='GET'&&endpoint.startsWith('repos/fixture/app/pulls?')){const head=decodeURIComponent(new URL('https://x/'+endpoint).searchParams.get('head')).split(':')[1];console.log(JSON.stringify(load().filter(p=>p.head.ref===head)));process.exit(0)}
if(method==='POST'&&endpoint==='repos/fixture/app/pulls'){let input='';process.stdin.on('data',c=>input+=c);process.stdin.on('end',()=>{const body=JSON.parse(input),v=load(),sha=cp.execFileSync('git',['--git-dir',${JSON.stringify(bare)},'rev-parse','refs/heads/'+body.head],{encoding:'utf8'}).trim(),pr={number:v.length+1,html_url:'https://github.com/fixture/app/pull/'+(v.length+1),head:{ref:body.head,sha},base:{ref:body.base},draft:body.draft===true,state:'open',merged_at:null,title:body.title,body:body.body};v.push(pr);save(v);console.log(JSON.stringify(pr))});return}
process.exit(2)
`
