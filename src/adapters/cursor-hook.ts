// Cursor's native hook binding, taking the harness root from explicit environment data.
import { pinnedGuardCommand } from './pinned-guard.js'

type Binding = { kind: 'plugin' } | { kind: 'project' } | { kind: 'user'; root: string }
/** Standalone roots are explicit environment data; managed overlays bind their owned artifact. */
export function cursorHook(core: string, binding: Binding = { kind: 'plugin' }) {
  const location =
    binding.kind === 'user'
      ? JSON.stringify(binding.root)
      : binding.kind === 'project'
        ? `join(realpathSync(process.env.CURSOR_PROJECT_DIR),'.wholeloop/distribution/cursor')`
        : 'process.env.CURSOR_PLUGIN_ROOT'
  const command = pinnedGuardCommand(
    'cursor',
    core,
    `
  // Cursor 2026.11 sends an empty cwd for Shell calls. Use the call's own absolute working
  // directory, or the only workspace root; with several roots and no cwd the hook still denies.
  if(payload && payload.cwd==='' && payload.tool_input && typeof payload.tool_input==='object' && Array.isArray(payload.workspace_roots)){
   const own=payload.tool_input.working_directory
   const fallback=typeof own==='string' && isAbsolute(own) ? own : payload.workspace_roots.length===1 ? payload.workspace_roots[0] : undefined
   if(typeof fallback==='string')payload.cwd=fallback
  }
  if(!payload || typeof payload.cwd!=='string' || !isAbsolute(payload.cwd) || typeof payload.tool_name!=='string' || !payload.tool_input || typeof payload.tool_input!=='object' || Array.isArray(payload.tool_input) || !Array.isArray(payload.workspace_roots) || !payload.workspace_roots.length || payload.workspace_roots.length>32)throw new Error('context')
  const cwd=realpathSync(payload.cwd)
  const roots=payload.workspace_roots.map(root=>{if(typeof root!=='string' || !isAbsolute(root))throw new Error('workspace');return realpathSync(root)})
  if(!roots.some(root=>inside(root,cwd)))throw new Error('cwd')
  const root=${location}
  if(typeof root!=='string' || !isAbsolute(root))throw new Error('root')
  const bin=matching(root)
`,
    'cursor',
  )
  return {
    version: 1,
    hooks: {
      preToolUse: [{ type: 'command', matcher: '.*', command, timeout: 15, failClosed: true }],
    },
  }
}
