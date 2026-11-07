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
