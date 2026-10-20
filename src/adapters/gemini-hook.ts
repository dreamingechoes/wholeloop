import { pinnedGuardCommand } from './pinned-guard.js'

/** Extension hydration binds a literal environment value rather than executable shell text. */
export function geminiHook(core: string) {
  const command = pinnedGuardCommand(
    'gemini',
    core,
    `
  if(!payload || typeof payload.cwd!=='string' || !isAbsolute(payload.cwd))throw new Error('cwd')
  const cwd=realpathSync(payload.cwd)
  const root=process.env.WL_GEMINI_EXTENSION_ROOT
  if(typeof root!=='string' || !isAbsolute(root))throw new Error('root')
  const bin=matching(root)
`,
  )
  return {
    hooks: {
      BeforeTool: [
        {
          matcher: '.*',
          hooks: [
            {
              name: 'wholeloop-guard',
              type: 'command',
              command,
              timeout: 15000,
              env: { WL_GEMINI_EXTENSION_ROOT: `\${extensionPath}` },
            },
          ],
        },
      ],
    },
  }
}
