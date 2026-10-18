import { FlowEngine } from '../flow/engine.js'
import { SCOPE_SCHEMA, scopeContext } from '../scopes/contract.js'
import { StateStore } from '../state/store.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'

export function scopesCommand(
  command: string,
  { positional, options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
): number {
  if (positional.length) throw new CliError('Scope commands take options, not positional arguments')
  if (command === 'scopes schema') {
    io.out(
      JSON.stringify(
        { schema: 'wholeloop/scopes-schema@1', scopeSchema: SCOPE_SCHEMA },
        null,
        json ? undefined : 2,
      ),
    )
    return EXIT.ok
  }
  const id = options['--for']
  if (typeof id !== 'string') throw new CliError('Provide --for <initiative>', EXIT.input)
  const engine = new FlowEngine(new StateStore(), root)
  const item = engine.store.get(id)
  if (item.kind !== 'initiative') throw new CliError('Scope planning expects an initiative')
  const context = scopeContext(engine.store.events(), id)
  io.out(
    JSON.stringify(
      {
        schema: 'wholeloop/scopes-plan@1',
        subject: id,
        ...context,
        suggestedScopes: [
          {
            key: 'main',
            title: item.title,
            goal: context.impact ?? item.body,
            metrics: context.metrics,
            stories: context.stories,
          },
        ],
        questions: [
          {
            id: 'scope:main:delivery',
            prompt: 'Choose feature or proof-of-concept delivery.',
            multi: false,
            options: ['feature', 'proof-of-concept'].map((value) => ({ value, label: value })),
          },
          {
            id: 'scope:main:flag',
            prompt: 'Name the flag or explain its absence.',
            multi: false,
            options: [],
          },
          {
            id: 'scope:main:complexity',
            prompt: 'Choose simple or complex and explain why.',
            multi: false,
            options: ['simple', 'complex'].map((value) => ({ value, label: value })),
          },
          ...(!context.sourceSpec
            ? [
                {
                  id: 'scope:metricIds',
                  prompt: 'Provide the metric catalog or an explicit measurement exception.',
                  multi: false,
                  options: [],
                },
              ]
            : []),
        ],
      },
      null,
      json ? undefined : 2,
    ),
  )
  return EXIT.ok
}
