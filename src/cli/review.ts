// `wl review`: review inputs and comment drafts.
import { FlowEngine } from '../flow/engine.js'
import { reviewCommentPlan } from '../review/comments.js'
import { ReviewWorkflow } from '../review/workflow.js'
import { StateStore } from '../state/store.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { roundOverrides } from './gate.js'
import { EXIT, type Io } from './io.js'
import { emitStep } from './presentation.js'

export function reviewCommand(
  command: string,
  { positional, options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
) {
  const value = (key: string) => (typeof options[key] === 'string' ? options[key] : undefined)
  try {
    const engine = new FlowEngine(new StateStore(), root)
    const workflow = new ReviewWorkflow(engine)
    let payload: unknown
    if (command === 'review begin') {
      if (positional.length > 1) throw new Error('Provide one branch or PR reference')
      const input = positional[0]
      const rounds = value('--rounds') ? roundOverrides(value('--rounds') ?? '').review : undefined
      if (value('--rounds') && rounds === undefined)
        throw new Error('The rounds override must include review')
      payload = workflow.begin({
        ...(value('--for') ? { subject: value('--for') as string } : {}),
        ...(value('--branch')
          ? { branch: value('--branch') as string }
          : input && !/^https?:\/\//i.test(input)
            ? { branch: input }
            : {}),
        ...(input && /^https?:\/\//i.test(input) ? { pr: input } : {}),
        ...(value('--base') ? { base: value('--base') as string } : {}),
        ...(value('--owner') ? { owner: value('--owner') as string } : {}),
        ...(rounds !== undefined ? { rounds } : {}),
      })
    } else {
      if (positional.length || !value('--for')) throw new Error('Provide --for <id>')
      if (command === 'review comment-plan') {
        if (!value('--pr')) throw new Error('Provide --pr <url>')
        payload = reviewCommentPlan(engine, value('--for') ?? '', value('--pr') ?? '')
      } else
        payload =
          command === 'review input'
            ? workflow.input(value('--for') ?? '')
            : {
                schema: 'wholeloop/review-complete@1',
                receipt: workflow.complete(value('--for') ?? ''),
              }
    }
    emitStep(command, payload, io, json, positional)
    return typeof payload === 'object' &&
      payload &&
      'status' in payload &&
      payload.status === 'question'
      ? EXIT.input
      : EXIT.ok
  } catch (error) {
    throw new CliError(
      error instanceof Error ? error.message : 'Review operation failed',
      EXIT.precondition,
    )
  }
}
