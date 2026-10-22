/** Simulation executes the installed core, not a fabricated journal. It never invokes a native client/model. */
export const fixtureWorker = `
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
let input=''
for await (const chunk of process.stdin) input+=chunk
const {run,scenario}=JSON.parse(input)
function wl(args){
 const result=spawnSync(process.execPath,[run.launcher,...args,'--json'],{cwd:run.root,env:process.env,encoding:'utf8',timeout:15000,maxBuffer:1048576})
 if(result.error || result.status!==0)process.exit(1)
 return JSON.parse(result.stdout)
}
const begun=wl(['step','begin','frame-problem','--input',scenario.input,'--owner',scenario.owner])
const marker=/conformance-marker:([a-f0-9]{32})/.exec(readFileSync(run.skill,'utf8'))?.[1]
if(!marker)process.exit(1)
wl(['note',begun.subject.id,'conformance-marker:'+marker])
writeFileSync(run.artifact,scenario.artifact,{mode:0o600,flag:'wx'})
const decision=join(run.state,'fixture-decision.json'),review=join(run.state,'fixture-review.json')
writeFileSync(decision,JSON.stringify(scenario.approval.decision),{mode:0o600,flag:'wx'})
const draft=wl(['frame','draft','--for',begun.subject.id,'--artifact',run.artifact,'--file',decision])
if(draft.artifact.sha256!==scenario.approval.sha256||draft.artifact.content!==scenario.artifact)process.exit(1)
// This worker simulates a reviewer to exercise the installed transport; it is never native review evidence.
const attestation={...draft.reviewTemplate,reviewer:{by:'SIMULATED fixture reviewer',sha256:draft.artifact.sha256,coverage:['problem','evidence','impact','decision-fidelity'],unresolvedFindings:[]}}
writeFileSync(review,JSON.stringify(attestation),{mode:0o600,flag:'wx'})
wl(['frame','finalize','--for',begun.subject.id,'--artifact',run.artifact,'--file',review])
`
