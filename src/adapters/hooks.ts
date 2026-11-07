// Native hook artifacts for each client; they carry transport only and leave policy to the core.
import { antigravityHook } from './antigravity-hook.js'
import type { RenderedFile } from './contracts.js'
import { cursorHook } from './cursor-hook.js'
import { geminiHook } from './gemini-hook.js'
import { openCodeMajor } from './opencode-version.js'

/** Native bindings contain transport only. Policy and all state interpretation stay in the core. */
export function hookArtifacts(
  target: string,
  core?: string,
  nativeVersion?: string,
): Map<string, RenderedFile> {
  if (target === 'cursor')
    return new Map([
      [
        'hooks/hooks.json',
        { mode: 0o644, content: `${JSON.stringify(cursorHook(core ?? ''), null, 2)}\n` },
      ],
    ])
  if (target === 'antigravity')
    return new Map([
      [
        'hooks.json',
        { mode: 0o644, content: `${JSON.stringify(antigravityHook(core ?? ''), null, 2)}\n` },
      ],
    ])
  if (target === 'gemini')
    return new Map([
      [
        'hooks/hooks.json',
        { mode: 0o644, content: `${JSON.stringify(geminiHook(core ?? ''), null, 2)}\n` },
      ],
    ])
  if (target === 'codex') return new Map()
  const files = new Map<string, RenderedFile>()
  const add = (path: string, content: string) => files.set(path, { mode: 0o644, content })
  add(
    'hooks/check.mjs',
    `import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
export const unavailable={schema:'wholeloop/guard@1',decision:'deny',policies:['guard-unavailable'],reasons:['wholeloop guard is unavailable; inspect the configured external store and packaged core.']}
export function check(payload) {
 try {
  const input=JSON.stringify(payload)
  if(Buffer.byteLength(input)>2097152)return unavailable
  // A native client may run on Bun or ship its own executable as process.execPath.
  const result=spawnSync('node',[fileURLToPath(new URL('../bin/wl.mjs',import.meta.url)),'guard','before-tool','--stdin','--json'],{input,encoding:'utf8',timeout:5000,maxBuffer:65536,shell:false})
  if(result.error || ![0,2].includes(result.status))return unavailable
  const decision=JSON.parse(result.stdout)
  if(decision.schema!=='wholeloop/guard@1' || !['allow','deny'].includes(decision.decision) || result.status!==(decision.decision==='allow'?0:2) || !Array.isArray(decision.reasons))return unavailable
  return decision
 }catch{return unavailable}
}
`,
  )
  if (target === 'opencode') {
    add(
      '.opencode/plugins/wholeloop.js',
      openCodeMajor(nativeVersion) === 2
        ? `import { isAbsolute } from 'node:path'
import { check } from '../../hooks/check.mjs'
export default {
 id:'wholeloop.guard',
 async setup(ctx) {
  await ctx.tool.hook('execute.before',async event=>{
   // A plugin's load location may differ from the current session or worktree.
   let cwd
   try {
    if(typeof event.sessionID!=='string' || !event.sessionID)throw new Error('session')
    const session=await ctx.session.get({sessionID:event.sessionID})
    cwd=session?.location?.directory
    if(typeof cwd!=='string' || !isAbsolute(cwd))throw new Error('location')
   }catch{throw new Error('wholeloop guard session context is unavailable.')}
   const decision=check({event:'before-tool',tool:event.tool,args:event.input,cwd})
   if(decision.decision==='deny')throw new Error(decision.reasons.join(' '))
  })
 }
}
`
        : `import { check } from '../../hooks/check.mjs'
export const Wholeloop = async ({ directory }) => ({
 'tool.execute.before': async (input, output) => {
  const decision=check({event:'before-tool',tool:input.tool,args:output.args,cwd:directory})
  if(decision.decision==='deny')throw new Error(decision.reasons.join(' '))
 }
})
`,
    )
    return files
  }
  add(
    'hooks/run.mjs',
    `import { check, unavailable } from './check.mjs'
const target=process.argv.at(-1)
function emit(decision) {
 // Empty success preserves the client's normal permission checks; an allow would bypass them.
 if(decision.decision==='allow')return
 const reason=decision.reasons.join(' ')
 const output=target==='claude'?{hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'deny',permissionDecisionReason:reason}}:{permissionDecision:'deny',permissionDecisionReason:reason}
 process.stdout.write(JSON.stringify(output)+'\\n')
}
let bytes=0;const chunks=[]
const timer=setTimeout(()=>{emit(unavailable);process.exit(0)},5000)
try {
 for await(const chunk of process.stdin){bytes+=chunk.length;if(bytes>2097152)throw new Error('Input limit');chunks.push(chunk)}
 clearTimeout(timer)
 emit(check(JSON.parse(Buffer.concat(chunks).toString('utf8'))))
}catch{clearTimeout(timer);emit(unavailable)}
process.stdin.pause()
`,
  )
  const hook =
    target === 'claude'
      ? {
          hooks: {
            PreToolUse: [
              {
                matcher: '.*',
                hooks: [
                  {
                    type: 'command',
                    // biome-ignore lint/suspicious/noTemplateCurlyInString: Native plugin substitution must remain literal.
                    command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/run.mjs" claude',
                    timeout: 15,
                  },
                ],
              },
            ],
          },
        }
      : {
          version: 1,
          hooks: {
            preToolUse: [
              {
                type: 'command',
                exec: 'node',
                args: [
                  '-e',
                  `const {join}=require('node:path');const {pathToFileURL}=require('node:url');const root=process.env.COPILOT_PLUGIN_ROOT;if(!root){process.stdout.write(JSON.stringify({permissionDecision:'deny',permissionDecisionReason:'wholeloop plugin root is unavailable.'}));}else{import(pathToFileURL(join(root,'hooks/run.mjs')).href).catch(()=>{process.stdout.write(JSON.stringify({permissionDecision:'deny',permissionDecisionReason:'wholeloop hook transport is unavailable.'}));});}`,
                  'copilot',
                ],
                timeoutSec: 15,
              },
            ],
          },
        }
  add(
    target === 'claude' ? 'hooks/hooks.json' : 'com.github.copilot/hooks/hooks.json',
    `${JSON.stringify(hook, null, 2)}\n`,
  )
  return files
}
