import { readFileSync } from 'node:fs'
import { FlowEngine } from '../flow/engine.js'
import { checkShape } from '../flow/registry.js'
import {
  checkSlicePlan,
  parseSlicePlan,
  SLICE_SCHEMA,
  SLICE_SECTIONS,
  slicingContext,
} from '../slices/contract.js'
import { canonicalPath } from '../state/paths.js'
import { StateStore } from '../state/store.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'

export function slicesCommand(
  command: string,
  { positional, options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
): number {
  if (positional.length !== (command === 'slices check' ? 1 : 0))
    throw new CliError(
      'Provide one file for slices check; plan/schema use options only',
      EXIT.input,
    )
  if (command === 'slices schema') {
    io.out(
      JSON.stringify(
        { schema: 'wholeloop/slices-schema@1', sliceSchema: SLICE_SCHEMA },
        null,
        json ? undefined : 2,
      ),
    )
    return EXIT.ok
  }
  const engine = new FlowEngine(new StateStore(), root)
  const id = options['--for']
  if (typeof id !== 'string') throw new CliError('Provide --for <scope>', EXIT.input)
  const item = engine.store.get(id)
  if (item.kind !== 'scope') throw new CliError('Slice planning expects a scope')
  const context = slicingContext(engine.store.events(), id)
  if (command === 'slices check') {
    const content = readFileSync(positional[0] ?? '', 'utf8')
    const problems = checkShape(content, SLICE_SECTIONS)
    try {
      checkSlicePlan(parseSlicePlan(content), context)
    } catch (error) {
      problems.push(error instanceof Error ? error.message : 'Invalid slice plan')
    }
    io.out(
      JSON.stringify({ schema: 'wholeloop/slices-check@1', problems }, null, json ? undefined : 2),
    )
    return problems.length ? EXIT.shape : EXIT.ok
  }
  io.out(
    JSON.stringify(
      {
        schema: 'wholeloop/slices-plan@1',
        subject: id,
        ...context,
        repositories: [{ key: 'current', path: canonicalPath(root) }],
        suggestedSlices: [
          { key: 'main', title: item.title, objective: item.body, criteria: context.criteria },
        ],
        questions: [
          {
            id: 'repositories',
            prompt:
              'Confirm the repository roots; name the contract repository if more than one is involved.',
            multi: true,
            options: [],
          },
        ],
      },
      null,
      json ? undefined : 2,
    ),
  )
  return EXIT.ok
}
