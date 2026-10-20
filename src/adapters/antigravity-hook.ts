/** Only native transport/root binding lives here; all tool policy remains in guard before-tool. */
export function antigravityHook(core: string, boundRoot?: string) {
  if (!/^[a-f0-9]{64}$/.test(core))
    throw new Error('Antigravity hooks require an exact packaged core hash')
  const program = `
const {spawnSync}=require('node:child_process')
const {createHash}=require('node:crypto')
const {lstatSync,readFileSync,realpathSync}=require('node:fs')
const {homedir}=require('node:os')
const {isAbsolute,join,relative,sep}=require('node:path')
const expected=${JSON.stringify(core)},bound=${JSON.stringify(boundRoot ?? null)}
const unavailable='wholeloop guard is unavailable; inspect the packaged core and workspace context.'
const emit=(decision,reason)=>process.stdout.write(JSON.stringify({decision,...(reason?{reason}:{})})+'\\n')
const deny=()=>emit('deny',unavailable)
const inside=(root,path)=>{const value=relative(root,path);return value==='' || (!isAbsolute(value) && value!=='..' && !value.startsWith('..'+sep))}
function matching(root){
 try{
  root=realpathSync(root)
  const manifest=join(root,'wholeloop-artifacts.json'),bin=join(root,'bin/wl.mjs')
  const meta=lstatSync(manifest),stat=lstatSync(bin)
  if(!meta.isFile() || meta.isSymbolicLink() || meta.size>1048576 || !stat.isFile() || stat.isSymbolicLink() || stat.size>4194304)return
  const value=JSON.parse(readFileSync(manifest,'utf8'))
  if(value.schema!=='wholeloop/adapter-artifacts@1' || value.target!=='antigravity' || value.core!==expected || !Array.isArray(value.files) || !value.files.some(file=>file.path==='bin/wl.mjs' && file.sha256===expected) || createHash('sha256').update(readFileSync(bin)).digest('hex')!==expected)return
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
  if(!payload || !payload.toolCall || !payload.toolCall.args || !Array.isArray(payload.workspacePaths) || payload.workspacePaths.length>32)throw new Error('context')
  const workspaces=[...new Set(payload.workspacePaths.map(path=>{if(typeof path!=='string' || !isAbsolute(path))throw new Error('workspace');return realpathSync(path)}))]
  const args=payload.toolCall.args
  const target=args.Cwd ?? args.TargetFile ?? args.AbsolutePath ?? args.DirectoryPath ?? args.SearchDirectory ?? args.SearchPath
  if(target!==undefined && (typeof target!=='string' || !isAbsolute(target)))throw new Error('target')
  const candidates=typeof target==='string' && isAbsolute(target)?workspaces.filter(root=>inside(root,target)):workspaces
  const roots=!candidates.length && args.Cwd===undefined && workspaces.length===1?workspaces:candidates
  const cwd=args.Cwd || (roots.length===1?roots[0]:undefined)
  if(typeof cwd!=='string' || !isAbsolute(cwd) || !roots.some(root=>inside(root,cwd)))throw new Error('cwd')
  let bin
  if(bound)bin=matching(bound)
  else{
   const local=roots.map(root=>matching(join(root,'.wholeloop/distribution/antigravity'))).filter(Boolean)
   if(local.length>1)throw new Error('ambiguous')
   bin=local[0] || matching(join(homedir(),'.gemini/antigravity-cli/plugins/wholeloop'))
  }
  if(!bin)throw new Error('core')
  const result=spawnSync(process.execPath,[bin,'guard','before-tool','--stdin','--json'],{cwd,input:JSON.stringify(payload),encoding:'utf8',timeout:5000,killSignal:'SIGKILL',maxBuffer:65536,shell:false})
  if(result.error || ![0,2].includes(result.status))throw new Error('process')
  const value=JSON.parse(result.stdout)
  if(value.schema!=='wholeloop/guard@1' || !['allow','deny'].includes(value.decision) || result.status!==(value.decision==='allow'?0:2) || !Array.isArray(value.reasons) || value.reasons.some(reason=>typeof reason!=='string'))throw new Error('result')
  // Native allow delegates to the next hook/default policy; never emit permissionOverrides.
  emit(value.decision,value.decision==='deny'?value.reasons.join(' '):undefined)
 }catch{deny()}finally{clearTimeout(timer);process.stdin.pause()}
})()
`
  const quoted = `'${program.replaceAll("'", "'\\''")}'`
  return {
    'wholeloop-guard': {
      PreToolUse: [
        { matcher: '.*', hooks: [{ type: 'command', command: `node -e ${quoted}`, timeout: 15 }] },
      ],
    },
  }
}
