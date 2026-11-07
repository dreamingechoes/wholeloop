// Cursor headless worker and the hook that keeps its policy from overriding another hook's denial.
import { isAbsolute } from 'node:path'
import { isObject } from '../config/schema.js'
import type { HeadlessAdapter } from './adapters.js'
import type { WorkerPolicyFile } from './policy-files.js'

const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
const denied = {
  permission: 'deny',
  user_message: 'Read-only wholeloop worker refused this tool.',
  agent_message: 'Use only read/search tools for this assignment.',
}

/** A separate worker policy never grants permission over another native hook's denial. */
export function cursorWorkerHook(repository: string, directory: string) {
  const program = `
const {writeSync,realpathSync}=require('node:fs')
const {isAbsolute,relative,sep}=require('node:path')
const emit=value=>writeSync(1,JSON.stringify(value)+'\\n')
const deny=()=>emit(${JSON.stringify(denied)})
const allowed=new Set(['Read','ReadFile','read_file','Glob','glob','Grep','grep','LS','list_dir'])
const roots=${JSON.stringify([repository, directory])}
const inside=(root,path)=>{const part=relative(root,path);return part==='' || (!isAbsolute(part) && part!=='..' && !part.startsWith('..'+sep))}
let bytes=0;const chunks=[]
const timer=setTimeout(()=>{deny();process.exit(0)},5000)
;(async()=>{try{
 for await(const chunk of process.stdin){bytes+=chunk.length;if(bytes>65536)throw new Error('limit');chunks.push(chunk)}
 const value=JSON.parse(Buffer.concat(chunks).toString('utf8'))
 if(!value || typeof value!=='object' || Array.isArray(value) || !allowed.has(value.tool_name) || !value.tool_input || typeof value.tool_input!=='object' || Array.isArray(value.tool_input))throw new Error('tool')
 const expected=roots.map(root=>realpathSync(root))
 if(typeof value.cwd!=='string' || !isAbsolute(value.cwd) || !expected.some(root=>inside(root,realpathSync(value.cwd))) || !Array.isArray(value.workspace_roots) || !value.workspace_roots.length || value.workspace_roots.length>32 || !value.workspace_roots.every(root=>typeof root==='string' && isAbsolute(root) && expected.some(base=>inside(base,realpathSync(root)))))throw new Error('context')
 emit({})
}catch{deny()}finally{clearTimeout(timer);process.stdin.pause()}})()
`
  return {
    version: 1,
    hooks: {
      preToolUse: [
        {
          type: 'command',
          matcher: '.*',
          timeout: 10,
          failClosed: true,
          command: `${quote(process.execPath)} -e ${quote(program)} || printf '%s\\n' ${quote(JSON.stringify(denied))}`,
        },
      ],
    },
  }
}

export const cursorWorker: HeadlessAdapter = {
  id: 'cursor',
  invocation: ({ repository, directory }) => {
    // Native permission tokens contain globs and parentheses, with no literal escape contract.
    if (![repository, directory].every((path) => isAbsolute(path) && !/[\r\n*?()[\]{}]/.test(path)))
      throw new Error('Cursor inspection requires absolute paths without permission metacharacters')
    return {
      command: 'agent',
      args: [
        '--print',
        '--output-format',
        'json',
        '--mode',
        'ask',
        '--sandbox',
        'enabled',
        '--workspace',
        directory,
        '--add-dir',
        repository,
      ],
      files: new Map<WorkerPolicyFile, string>([
        [
          '.cursor/cli.json',
          JSON.stringify({
            permissions: {
              allow: [`Read(${repository}/**)`, `Read(${directory}/**)`],
              deny: ['Shell(*)', 'Write(**)', 'WebFetch(*)', 'Mcp(*:*)'],
            },
          }),
        ],
        ['.cursor/hooks.json', JSON.stringify(cursorWorkerHook(repository, directory))],
      ]),
    }
  },
  response: (stdout) => {
    const value: unknown = JSON.parse(stdout)
    if (
      !isObject(value) ||
      value.type !== 'result' ||
      value.subtype !== 'success' ||
      value.is_error !== false ||
      typeof value.result !== 'string' ||
      !value.result.trim()
    )
      throw new Error('No successful Cursor final result')
    return value.result
  },
}
