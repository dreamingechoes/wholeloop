// `wl state`, `note`, `link` and `open`: typed items in the external store.
import { readFileSync } from 'node:fs'
import { openText } from '../display/commands.js'
import { type ItemInput, type ItemKind, type ItemPatch, KINDS } from '../state/events.js'
import { projections } from '../state/projections.js'
import { StateStore } from '../state/store.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'
import { emitCommand } from './presentation.js'

export function stateCommand(
  command: string,
  { positional: args, options }: ReturnType<typeof parseArguments>,
  json: boolean,
  io: Io,
): number {
  const value = (name: string) => (typeof options[name] === 'string' ? options[name] : undefined)
  const require = (input: string | undefined, description: string): string => {
    if (!input) throw new CliError(`Provide ${description}`, EXIT.input)
    return input
  }
  const maximum =
    command === 'note' || command === 'link'
      ? 2
      : command === 'state list' || command === 'state rebuild'
        ? 0
        : 1
  if (args.length > maximum) throw new CliError(`Too many arguments for ${command}`)
  if (command === 'open' && json && options['--raw'])
    throw new CliError('Choose --raw or --json, not both')
  try {
    const store = new StateStore()
    let payload: Record<string, unknown>
    let readable: string | undefined
    const id = () => require(args[0], 'an item id')
    switch (command) {
      case 'state create': {
        const kind = require(args[0], 'an item kind')
        if (!KINDS.includes(kind as ItemKind)) throw new CliError(`Unknown item kind: ${kind}`)
        const input: ItemInput = {
          kind: kind as ItemKind,
          title: require(value('--title'), '--title'),
          owner: require(value('--owner'), '--owner'),
          body: value('--body-file') ? readFileSync(value('--body-file') ?? '', 'utf8') : '',
        }
        const parent = value('--parent')
        if (parent !== undefined) input.parent = parent
        payload = { item: store.create(input) }
        break
      }
      case 'state update': {
        const patch: ItemPatch = {
          ...(value('--body-file')
            ? { body: readFileSync(value('--body-file') ?? '', 'utf8') }
            : {}),
        }
        const title = value('--title')
        const owner = value('--owner')
        if (title !== undefined) patch.title = title
        if (owner !== undefined) patch.owner = owner
        const status = value('--status')
        if (status && status !== 'open' && status !== 'closed')
          throw new CliError('--status must be open or closed')
        if (status === 'open' || status === 'closed') patch.status = status
        payload = { item: store.update(id(), patch) }
        break
      }
      case 'state get':
        payload = { item: store.get(id()) }
        break
      case 'state list':
        payload = {
          items: store.list().map(({ id, kind, title, owner, status, parent }) => ({
            id,
            kind,
            title,
            owner,
            status,
            ...(parent ? { parent } : {}),
          })),
        }
        break
      case 'state show':
        payload = args[0]
          ? { item: store.get(args[0]) }
          : { store: store.files.root, items: store.list() }
        break
      case 'state rebuild':
        payload = { files: store.rebuild() }
        break
      case 'note':
        payload = { item: store.note(id(), require(args[1], 'the note text')) }
        break
      case 'link':
        payload = { item: store.link(id(), require(args[1], 'an http(s) URL')) }
        break
      case 'open': {
        const item = store.get(id())
        readable =
          projections(new Map([[item.id, item]])).get(`items/${item.id}/${item.kind}.md`) ?? ''
        payload = { id: item.id, content: readable }
        if (!json && !options['--raw']) readable = openText(item)
        break
      }
      default:
        throw new Error(`Missing state handler: ${command}`)
    }
    if (!json && readable !== undefined) io.out(readable)
    else
      emitCommand(
        command,
        { schema: `wholeloop/${command.replaceAll(' ', '-')}@1`, ...payload },
        io,
        json,
      )
    return EXIT.ok
  } catch (error) {
    if (error instanceof CliError) throw error
    const message = error instanceof Error ? error.message : String(error)
    const precondition =
      /Unknown item|Missing parent|outside git|escapes its root|Store is locked/.test(message)
    throw new CliError(message, precondition ? EXIT.precondition : EXIT.shape)
  }
}
