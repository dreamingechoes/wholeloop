// The pinned guard command that native hooks run, shared by every adapter.
/** Shared transport only: adapters supply trusted context binding; policy stays in the core. */
export function pinnedGuardCommand(
  target: string,
  core: string,
  context: string,
  response: 'decision' | 'cursor' = 'decision',
): string {
  if (!/^[a-f0-9]{64}$/.test(core))
    throw new Error('Native hooks require an exact packaged core hash')
  const emit =
    response === 'cursor'
      ? "const emit=(decision,reason)=>process.stdout.write(JSON.stringify(decision==='allow'?{}:{permission:'deny',user_message:reason,agent_message:reason})+'\\n')"
      : "const emit=(decision,reason)=>process.stdout.write(JSON.stringify({decision,...(reason?{reason}:{})})+'\\n')"
  const failure =
    response === 'cursor'
      ? {
          permission: 'deny',
          user_message: 'wholeloop guard could not start.',
          agent_message: 'wholeloop guard could not start.',
        }
      : { decision: 'deny', reason: 'wholeloop guard could not start.' }
  const program = `
const {spawnSync}=require('node:child_process')
const {createHash}=require('node:crypto')
const {lstatSync,readFileSync,realpathSync}=require('node:fs')
const {homedir}=require('node:os')
const {isAbsolute,join,relative,sep}=require('node:path')
const expected=${JSON.stringify(core)},target=${JSON.stringify(target)}
const unavailable='wholeloop guard is unavailable; inspect the packaged core and workspace context.'
${emit}
const deny=()=>emit('deny',unavailable)
const inside=(root,path)=>{const value=relative(root,path);return value==='' || (!isAbsolute(value) && value!=='..' && !value.startsWith('..'+sep))}
function matching(root){
 try{
  root=realpathSync(root)
  const manifest=join(root,'wholeloop-artifacts.json'),bin=join(root,'bin/wl.mjs')
  const meta=lstatSync(manifest),stat=lstatSync(bin)
  if(!meta.isFile() || meta.isSymbolicLink() || meta.size>1048576 || !stat.isFile() || stat.isSymbolicLink() || stat.size>4194304)return
  const value=JSON.parse(readFileSync(manifest,'utf8'))
  if(value.schema!=='wholeloop/adapter-artifacts@1' || value.target!==target || value.core!==expected || !Array.isArray(value.files) || !value.files.some(file=>file.path==='bin/wl.mjs' && file.sha256===expected) || createHash('sha256').update(readFileSync(bin)).digest('hex')!==expected)return
  return bin
 }catch{}
}
const timer=setTimeout(()=>{deny();process.exit(0)},5000)
;(async()=>{
 try{
  let bytes=0;const chunks=[]
  for await(const chunk of process.stdin){bytes+=chunk.length;if(bytes>2097152)throw new Error('limit');chunks.push(chunk)}
  clearTimeout(timer)
  const payload=JSON.parse(Buffer.concat(chunks).toString('utf8'))
  ${context}
  if(!bin)throw new Error('core')
  const result=spawnSync(process.execPath,[bin,'guard','before-tool','--stdin','--json'],{cwd,input:JSON.stringify(payload),encoding:'utf8',timeout:5000,killSignal:'SIGKILL',maxBuffer:65536,shell:false})
  if(result.error || ![0,2].includes(result.status))throw new Error('process')
  const value=JSON.parse(result.stdout)
  if(value.schema!=='wholeloop/guard@1' || !['allow','deny'].includes(value.decision) || result.status!==(value.decision==='allow'?0:2) || !Array.isArray(value.reasons) || value.reasons.some(reason=>typeof reason!=='string'))throw new Error('result')
  emit(value.decision,value.decision==='deny'?value.reasons.join(' '):undefined)
 }catch{deny()}finally{clearTimeout(timer);process.stdin.pause()}
})()
`
  const quoted = `'${program.replaceAll("'", "'\\''")}'`
  // A missing Node executable must still produce the native deny response.
  return `node -e ${quoted} || printf '%s\\n' '${JSON.stringify(failure)}'`
}
