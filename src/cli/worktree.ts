// `wl worktree`: creates, opens, stops, lists and prunes slice worktrees.
import { FlowEngine } from '../flow/engine.js'
import { StateStore } from '../state/store.js'
import { WorktreeManager } from '../worktrees/manager.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'
import { emitCommand } from './presentation.js'

export function worktreeCommand(
  command: string,
  { positional, options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
): number {
  const name = command.split(' ')[1]
  const id = positional[0]
  const value = (key: string) => (typeof options[key] === 'string' ? options[key] : undefined)
  if (positional.length > 1 || (name === 'list' && id))
    throw new CliError('Unexpected worktree argument')
  if (!['list', 'prune'].includes(name ?? '') && !id)
    throw new CliError('Provide a slice or part ID', EXIT.input)
  try {
    const manager = new WorktreeManager(new FlowEngine(new StateStore(), root))
    let payload: unknown
    if (name === 'list')
      payload = { schema: 'wholeloop/worktree-list@1', worktrees: manager.list() }
    else if (name === 'create')
      payload = manager.create(id ?? '', {
        ...(value('--repo') ? { repo: value('--repo') as string } : {}),
        ...(value('--base') ? { base: value('--base') as string } : {}),
        ...(value('--after') ? { after: value('--after') as string } : {}),
      })
    else if (name === 'open') payload = manager.open(id ?? '')
    else if (name === 'stop') {
      if (options['--abandon'] !== true && value('--reason'))
        throw new CliError('--reason requires --abandon')
      if (options['--abandon'] === true && !value('--reason'))
        throw new CliError('--abandon requires --reason <why>', EXIT.input)
      payload = manager.stop(
        id ?? '',
        options['--abandon'] === true ? value('--reason') : undefined,
      )
    } else payload = manager.prune(id, options['--dry-run'] === true)
    emitCommand(command, payload, io, json)
    return EXIT.ok
  } catch (error) {
    if (error instanceof CliError) throw error
    throw new CliError(
      error instanceof Error ? error.message : 'Worktree operation failed',
      EXIT.precondition,
    )
  }
}
