// `wl next` and `wl setup`, with the questions they return for missing input.
import { FlowEngine } from '../flow/engine.js'
import { configuredCheckpoints, impactSchedule } from '../impact/schedule.js'
import { SharingWorkflow } from '../sharing/workflow.js'
import { ITEM_ID } from '../state/events.js'
import { unread } from '../state/mailbox.js'
import { StateStore } from '../state/store.js'
import { next } from '../utilities/next.js'
import { setup } from '../utilities/setup.js'
import { worktreeRecords } from '../worktrees/contracts.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'
import { sharedRead } from './sharing-read.js'
import { statusSummary } from './summary.js'

export function utilityCommand(
  command: string,
  { positional, options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
): number {
  if (positional.length > (command === 'setup' ? 0 : 1))
    throw new CliError(`Too many arguments for ${command}`)
  const value = (name: string) => (typeof options[name] === 'string' ? options[name] : undefined)
  try {
    let result: { code: number; payload: unknown }
    if (command === 'setup')
      result = setup(root, {
        ...(value('--scope') ? { scope: value('--scope') as string } : {}),
        ...(value('--profile') ? { profile: value('--profile') as string } : {}),
        ...(value('--docs') ? { docs: value('--docs') as string } : {}),
        ...(value('--tracker') ? { tracker: value('--tracker') as string } : {}),
      })
    else {
      const store = new StateStore()
      const engine = new FlowEngine(store, root)
      if (command === 'next') {
        const input = positional[0]
        if (value('--file')) {
          if (!input || !/^https?:\/\//i.test(input))
            throw new CliError('next --file requires an HTTPS work URL')
          const provider = value('--provider')
          const kind = value('--kind')
          if (!provider || (kind !== 'docs' && kind !== 'tracker'))
            throw new CliError('Provide --provider and --kind docs|tracker')
          const adopted = new SharingWorkflow(engine).importRead(
            input,
            sharedRead(value('--file') ?? '', input, provider, kind),
            {
              provider,
              kind,
              ...(value('--owner') ? { owner: value('--owner') as string } : {}),
              ...(value('--title') ? { title: value('--title') as string } : {}),
            },
          )
          result =
            adopted.status === 'question'
              ? {
                  code: EXIT.input,
                  payload: { ...adopted, schema: 'wholeloop/next@1', action: null },
                }
              : next(engine, adopted.subject, value('--owner'))
        } else result = next(engine, input, value('--owner'))
      } else {
        const id = positional[0]
        if (id && !ITEM_ID.test(id)) throw new CliError('status expects a typed item ID')
        const items = id ? [store.get(id)] : store.list()
        const workspaces = worktreeRecords(store.events())
        const messages = unread(
          store.events(),
          value('--for') ?? 'conductor',
          value('--reader') ?? value('--for') ?? 'conductor',
        )
        result = {
          code: EXIT.ok,
          payload: {
            schema: 'wholeloop/status@1',
            items: items.map(({ id, kind, title, owner, status, updatedAt }) => ({
              id,
              kind,
              title,
              owner,
              status,
              updatedAt,
              flow: engine.plan(id),
              ...(impactSchedule(store.events(), id, configuredCheckpoints(engine.config()))
                ? {
                    impact: impactSchedule(
                      store.events(),
                      id,
                      configuredCheckpoints(engine.config()),
                    ),
                  }
                : {}),
              ...(workspaces.some((workspace) => workspace.subject === id)
                ? { workspace: workspaces.find((workspace) => workspace.subject === id) }
                : {}),
            })),
            unreadCount: messages.filter((message) => !id || message.thread === id).length,
          },
        }
      }
    }
    io.out(
      json
        ? JSON.stringify(result.payload)
        : command === 'status'
          ? statusSummary(result.payload as Parameters<typeof statusSummary>[0])
          : JSON.stringify(result.payload, null, 2),
    )
    return result.code
  } catch (error) {
    if (error instanceof CliError) throw error
    throw new CliError(
      error instanceof Error ? error.message : 'Utility command failed',
      EXIT.precondition,
    )
  }
}
