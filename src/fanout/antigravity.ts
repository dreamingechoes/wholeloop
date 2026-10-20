import { createHash } from 'node:crypto'
import { isAbsolute } from 'node:path'
import { antigravityInput } from '../adapters/antigravity-input.js'
import { isObject } from '../config/schema.js'
import type { HeadlessAdapter } from './adapters.js'
import type { WorkerPolicyFile } from './policy-files.js'

const readTools = ['view_file', 'grep_search']
const conversationId = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`

/** No assignment is sent until the client reports only the intended native read tools. */
export function antigravityInit(line: string, directory: string) {
  const value: unknown = JSON.parse(line)
  if (
    !isObject(value) ||
    value.event !== 'init' ||
    typeof value.conversation_id !== 'string' ||
    value.conversation_id.trim() !== value.conversation_id ||
    !conversationId.test(value.conversation_id) ||
    !isObject(value.init) ||
    value.init.cwd !== directory ||
    !['request-review', 'strict'].includes(String(value.init.permission_mode)) ||
    !Array.isArray(value.init.tools) ||
    !value.init.tools.length ||
    value.init.tools.length > readTools.length ||
    new Set(value.init.tools).size !== value.init.tools.length ||
    !value.init.tools.every((tool) => typeof tool === 'string' && readTools.includes(tool))
  )
    throw new Error('Native Antigravity initialization is not the selected read-only worker')
  return value.conversation_id
}

export function antigravityWorkerHook(repository: string, directory: string) {
  const denied = { decision: 'deny', reason: 'Read-only wholeloop worker refused this tool.' }
  const program = `
const {writeSync,realpathSync}=require('node:fs')
const {isAbsolute,relative,sep}=require('node:path')
const emit=value=>writeSync(1,JSON.stringify(value)+'\\n')
const deny=()=>emit(${JSON.stringify(denied)})
const roots=${JSON.stringify([repository, directory])}
const inside=(root,path)=>{const part=relative(root,path);return part==='' || (!isAbsolute(part) && part!=='..' && !part.startsWith('..'+sep))}
let bytes=0;const chunks=[]
const timer=setTimeout(()=>{deny();process.exit(0)},5000)
;(async()=>{try{
 for await(const chunk of process.stdin){bytes+=chunk.length;if(bytes>65536)throw new Error('limit');chunks.push(chunk)}
 const value=JSON.parse(Buffer.concat(chunks).toString('utf8'))
 if(!value || typeof value!=='object' || Array.isArray(value) || !value.toolCall || !${JSON.stringify(readTools)}.includes(value.toolCall.name) || !value.toolCall.args || typeof value.toolCall.args!=='object' || Array.isArray(value.toolCall.args))throw new Error('tool')
 const expected=roots.map(root=>realpathSync(root))
 if(!Array.isArray(value.workspacePaths) || !value.workspacePaths.length || value.workspacePaths.length>32 || !value.workspacePaths.every(root=>typeof root==='string' && isAbsolute(root) && expected.some(base=>inside(base,realpathSync(root)))))throw new Error('context')
 const args=value.toolCall.args
 const target=args.AbsolutePath ?? args.SearchPath ?? args.SearchDirectory ?? args.DirectoryPath
 if(value.toolCall.name==='view_file' && target===undefined)throw new Error('file')
 if(target!==undefined && (typeof target!=='string' || !isAbsolute(target) || !expected.some(root=>inside(root,realpathSync(target)))))throw new Error('target')
 emit({decision:'allow'})
}catch{deny()}finally{clearTimeout(timer);process.stdin.pause()}})()
`
  return {
    'wholeloop-observer': {
      PreToolUse: [
        {
          matcher: '.*',
          hooks: [
            {
              type: 'command',
              timeout: 10,
              command: `${quote(process.execPath)} -e ${quote(program)} || printf '%s\\n' ${quote(JSON.stringify(denied))}`,
            },
          ],
        },
      ],
    },
  }
}

export const antigravityWorker: HeadlessAdapter = {
  id: 'antigravity',
  input: antigravityInput,
  invocation: ({ repository, directory }) => {
    if (![repository, directory].every(isAbsolute))
      throw new Error('Antigravity inspection requires absolute repository and worker paths')
    const name =
      `wholeloop-observer-${createHash('sha256').update(directory).digest('hex').slice(0, 16)}` as const
    const agent = [
      '---',
      `name: ${name}`,
      'description: Inspect one assigned repository observation without mutation.',
      'tools: [view_file, grep_search]',
      'mainAgent: true',
      'subagent: false',
      'model: inherit',
      'commandExecutionPolicy: "off"',
      'mcpServers: []',
      'skills: []',
      'plugins: []',
      '---',
      '# Observer policy',
      '',
      'Read only the assigned evidence and return the requested JSON envelope.',
      'Do not write, execute commands, delegate, request permissions or use web/MCP tools.',
      '',
    ].join('\n')
    return {
      command: 'agy',
      args: [
        '--input-format',
        'stream-json',
        '--output-format',
        'stream-json',
        '--agent',
        name,
        '--sandbox',
      ],
      files: new Map<WorkerPolicyFile, string>([
        [`.agents/agents/${name}.md`, agent],
        ['.agents/hooks.json', JSON.stringify(antigravityWorkerHook(repository, directory))],
      ]),
      readyLine: (line: string) => !!antigravityInit(line, directory),
    }
  },
  response: (stdout, directory) => {
    const lines = stdout.trim().split('\n')
    const conversation = antigravityInit(lines[0] ?? '', directory)
    if (lines.length < 2) throw new Error('No completed Antigravity turn')
    for (const line of lines.slice(1, -1)) {
      const event: unknown = JSON.parse(line)
      if (
        !isObject(event) ||
        event.event !== 'step_update' ||
        !isObject(event.step_update) ||
        event.step_update.conversation_id !== conversation
      )
        throw new Error('Mixed or unsupported Antigravity turn events')
    }
    const final: unknown = JSON.parse(lines.at(-1) ?? '')
    if (
      !isObject(final) ||
      final.event !== 'result' ||
      !isObject(final.result) ||
      final.result.conversation_id !== conversation ||
      final.result.status !== 'SUCCESS' ||
      final.result.num_turns !== 1 ||
      final.result.error !== undefined ||
      typeof final.result.response !== 'string' ||
      !final.result.response.trim()
    )
      throw new Error('No successful fresh Antigravity final result')
    return final.result.response
  },
}
