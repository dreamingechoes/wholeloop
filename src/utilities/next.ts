import { CliError } from '../cli/errors.js'
import { EXIT } from '../cli/io.js'
import type { FlowEngine } from '../flow/engine.js'
import { stepDefinition } from '../flow/registry.js'
import { framingMatches } from '../framing/contract.js'
import { ITEM_ID } from '../state/events.js'
import { canonicalPath } from '../state/paths.js'

/** Route recorded identities and scoped title matches before starting new work. */
export function next(engine: FlowEngine, input?: string, owner?: string) {
  if (input && /^https?:\/\//i.test(input))
    throw new CliError(
      'URL adoption is not implemented; use a stored item ID or an idea',
      EXIT.precondition,
    )
  const items = engine.store.list().filter((item) => item.status === 'open')
  let subject = input && ITEM_ID.test(input) ? engine.store.get(input) : undefined
  if (input && !ITEM_ID.test(input)) {
    const matches = framingMatches(
      engine.store.list(),
      engine.store.events(),
      input,
      undefined,
      canonicalPath(engine.root),
    )
    if (matches.length > 1)
      throw new CliError('Several initiatives match this idea; choose one with its ID', EXIT.input)
    if (matches[0] && !matches[0].repository)
      throw new CliError(
        'An initiative matches but has no repository identity; confirm its ID',
        EXIT.input,
      )
    subject = matches[0]
  }
  if (subject?.status === 'closed')
    throw new CliError(`Item is closed: ${subject.id}`, EXIT.precondition)
  if (!input) {
    if (items.length > 1)
      return {
        code: EXIT.input,
        payload: {
          schema: 'wholeloop/next@1',
          questions: [
            {
              id: 'subject',
              prompt: 'Which item should continue?',
              multi: false,
              options: items.map(({ id, title }) => ({ value: id, label: title })),
            },
          ],
          action: null,
        },
      }
    subject = items[0]
  }
  const plan = subject ? engine.plan(subject.id) : undefined
  const blocking =
    plan?.pending.filter(
      (decision) => !plan.next || !stepDefinition(plan.next).after.includes(decision.id),
    ) ?? []
  if (blocking.length)
    return {
      code: EXIT.input,
      payload: {
        schema: 'wholeloop/next@1',
        subject: subject?.id,
        questions: blocking.map(({ id, basis }) => ({
          id: `decision.${id}`,
          basis,
          prompt: `Record the human decision: ${id}`,
          multi: false,
          options: [
            { value: 'approved', label: 'Approved' },
            { value: 'rejected', label: 'Rejected' },
          ],
        })),
        action: null,
        plan,
      },
    }
  if (plan && !plan.next)
    return {
      code: EXIT.ok,
      payload: {
        schema: 'wholeloop/next@1',
        subject: subject?.id,
        questions: [],
        action: null,
        plan,
      },
    }
  const step = subject ? (plan?.next ?? 'frame-problem') : 'frame-problem'
  const result = engine.begin(step, {
    mode: 'flow',
    ...(subject ? { subject: subject.id } : input ? { input } : {}),
    ...(owner ? { owner } : {}),
  })
  return {
    code: result.code,
    payload: {
      schema: 'wholeloop/next@1',
      action: { step, command: `wl step begin ${step}` },
      questions: result.payload.questions,
      contract: result.payload,
      stop: result.payload.available
        ? 'Complete the returned artifact contract before continuing.'
        : 'This step is registered but not implemented.',
    },
  }
}
