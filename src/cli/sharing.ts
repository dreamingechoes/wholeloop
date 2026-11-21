// `wl adopt` and `wl share`: adopts and publishes shared documents.
import { readFileSync } from 'node:fs'
import { FlowEngine } from '../flow/engine.js'
import type { SharedTarget } from '../sharing/contracts.js'
import { SharingWorkflow } from '../sharing/workflow.js'
import { StateStore } from '../state/store.js'
import type { parseArguments } from './arguments.js'
import { EXIT, type Io } from './io.js'
import { emitCommand } from './presentation.js'
import { sharedRead } from './sharing-read.js'

export async function sharingCommand(
  command: string,
  { positional, options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
) {
  const value = (name: string) => (typeof options[name] === 'string' ? options[name] : undefined)
  const required = (name: string) => {
    const result = value(name)
    if (!result) throw new Error(`Provide ${name}`)
    return result
  }
  const workflow = new SharingWorkflow(new FlowEngine(new StateStore(), root))
  let result: unknown
  let code: number = EXIT.ok
  if (command === 'adopt') {
    if (positional.length !== 1) throw new Error('adopt expects one HTTPS URL')
    const ref = positional[0] ?? ''
    const provider = required('--provider')
    const kind = required('--kind')
    if (kind !== 'docs' && kind !== 'tracker') throw new Error('Choose --kind docs|tracker')
    const adopted = workflow.importRead(ref, sharedRead(required('--file'), ref, provider, kind), {
      provider,
      kind,
      ...(value('--owner') ? { owner: value('--owner') as string } : {}),
      ...(value('--title') ? { title: value('--title') as string } : {}),
    })
    result = adopted
    if (adopted.status === 'question') code = EXIT.input
  } else {
    if (positional.length)
      throw new Error('share commands take --for rather than positional arguments')
    const subject = required('--for')
    if (command === 'share mode') {
      const mode = required('--mode')
      if (mode !== 'local' && mode !== 'shared') throw new Error('Choose --mode local|shared')
      let targets: SharedTarget[] = workflow.report(subject).targets
      if (value('--file')) {
        try {
          const raw = readFileSync(required('--file'), 'utf8')
          if (Buffer.byteLength(raw) > 64 * 1024) throw new Error()
          targets = JSON.parse(raw)
        } catch {
          throw new Error('Cannot read bounded target array; contents omitted')
        }
        if (!Array.isArray(targets)) throw new Error('Shared destinations must be a target array')
      }
      result = workflow.setMode(subject, mode, required('--by'), targets)
    } else if (command === 'share report') result = workflow.report(subject)
    else if (command === 'share requests') result = workflow.requests(subject)
    else if (command === 'share request') result = workflow.request(subject, required('--key'))
    else {
      const key = required('--key')
      const ref = required('--ref')
      const entry = workflow.report(subject).publications.find((entry) => entry.key === key)
      if (!entry) throw new Error('Choose an exact retained outbox key')
      const read = sharedRead(required('--file'), ref, entry.target.provider, entry.target.kind)
      result = await workflow.reconcile(
        subject,
        key,
        ref,
        {
          invoke: async (call) => {
            if (
              call.args.ref !== ref ||
              !['docs.read', 'tracker.read-item'].includes(call.operation)
            )
              throw new Error('Import authorizes one matching read only')
            return read
          },
        },
        'import',
      )
    }
  }
  emitCommand(command, result, io, json)
  return code
}
