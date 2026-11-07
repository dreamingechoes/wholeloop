// Antigravity's native hook binding: transport and root only, with all tool policy left to the
// guard.
import { pinnedGuardCommand } from './pinned-guard.js'

/** Only native transport/root binding lives here; all tool policy remains in guard before-tool. */
export function antigravityHook(core: string, boundRoot?: string) {
  const command = pinnedGuardCommand(
    'antigravity',
    core,
    `
  const bound=${JSON.stringify(boundRoot ?? null)}
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
`,
  )
  return {
    'wholeloop-guard': {
      PreToolUse: [{ matcher: '.*', hooks: [{ type: 'command', command, timeout: 15 }] }],
    },
  }
}
