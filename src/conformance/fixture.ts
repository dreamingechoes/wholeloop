/** Simulation executes the installed core, not a fabricated journal. It never invokes a native client/model. */
export const fixtureWorker = `
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
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
wl(['step','complete','frame-problem','--for',begun.subject.id,'--artifact',run.artifact])
`
