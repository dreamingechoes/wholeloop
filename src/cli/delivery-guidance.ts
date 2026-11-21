// `wl delivery guidance`: proposes a plan's guidance pins from each repository's pinned base
// (P6-40).
import { resolve } from 'node:path'
import { loadConfig, userConfigPath } from '../config/load.js'
import { isObject } from '../config/schema.js'
import { proposeGuidance } from '../delivery/guidance-tree.js'
import { readSourceFile } from '../delivery/input.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'
import { emitCommand } from './presentation.js'

const read = (root: string, file: string) => {
  try {
    return JSON.parse(readSourceFile(root, file, 8 * 1024 * 1024)) as unknown
  } catch {
    throw new CliError(
      'Provide one bounded regular UTF-8 JSON file under the selected root; contents omitted',
    )
  }
}

/**
 * Propose a plan's guidance pins from each repository's pinned base (P6-40).
 *
 * The output goes into the plan's `guidance` before it is prepared and
 * authorized, so the grant covers exactly these bytes. Ambiguous slots are
 * questions answered through `--answers`; nothing is written anywhere.
 */
export function deliveryGuidanceCommand(
  { options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
): number {
  const file = options['--file'],
    answers = options['--answers'],
    selected = options['--root']
  if (typeof file !== 'string')
    throw new CliError(
      'Use delivery guidance --file <proposal.json> [--answers <answers.json>]',
      EXIT.input,
    )
  const base = typeof selected === 'string' ? resolve(root, selected) : root
  const proposal = read(base, file)
  const repositories =
    isObject(proposal) && Array.isArray(proposal.repositories)
      ? proposal.repositories.filter(
          (entry): entry is { id: string; root: string; base: string } =>
            isObject(entry) &&
            typeof entry.id === 'string' &&
            typeof entry.root === 'string' &&
            typeof entry.base === 'string' &&
            /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(entry.base),
        )
      : []
  if (
    !repositories.length ||
    (isObject(proposal) &&
      Array.isArray(proposal.repositories) &&
      repositories.length !== proposal.repositories.length)
  )
    throw new CliError(
      'The proposal needs repositories with id, absolute root and a full base commit',
      EXIT.precondition,
    )
  let chosen: Record<string, string> | undefined
  if (typeof answers === 'string') {
    const value = read(base, answers)
    if (
      !isObject(value) ||
      value.schema !== 'wholeloop/delivery-guidance-answers@1' ||
      !isObject(value.answers) ||
      Object.values(value.answers).some((entry) => typeof entry !== 'string')
    )
      throw new CliError(
        'Answers use wholeloop/delivery-guidance-answers@1 with string choices',
        EXIT.precondition,
      )
    chosen = value.answers as Record<string, string>
  }
  // The same configured bindings a supervised step in that repository would use.
  const bindings = (id: string) => {
    const repository = repositories.find((entry) => entry.id === id)
    if (!repository) return {}
    const slots = loadConfig({ root: repository.root, userFile: userConfigPath() }).values.slots
    return isObject(slots)
      ? Object.fromEntries(
          Object.entries(slots).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        )
      : {}
  }
  let result: ReturnType<typeof proposeGuidance>
  try {
    result = proposeGuidance(repositories, { bindings, ...(chosen ? { answers: chosen } : {}) })
  } catch {
    throw new CliError(
      'Could not read a repository at its pinned base; check the root and commit',
      EXIT.precondition,
    )
  }
  emitCommand('delivery guidance', result, io, json)
  return result.status === 'proposed' ? EXIT.ok : EXIT.precondition
}
