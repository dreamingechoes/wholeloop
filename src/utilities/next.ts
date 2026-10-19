import { CliError } from '../cli/errors.js'
import { EXIT } from '../cli/io.js'
import type { FlowEngine } from '../flow/engine.js'
import { stepDefinition } from '../flow/registry.js'
import { framingMatches } from '../framing/contract.js'
import { configuredCheckpoints, impactSchedule } from '../impact/schedule.js'
import { blockingDependencies, buildChildren } from '../slices/routing.js'
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
  let plan = subject ? engine.plan(subject.id) : undefined
  if (subject && blockingDependencies(engine.store.events(), subject.id).length)
    return {
      code: EXIT.precondition,
      payload: {
        schema: 'wholeloop/next@1',
        subject: subject.id,
        action: null,
        questions: [],
        blockedBy: blockingDependencies(engine.store.events(), subject.id),
        stop: 'Complete the recorded dependencies before continuing this work.',
      },
    }
  if (subject?.kind === 'initiative' && plan?.next === 'slice-work' && !plan.pending.length) {
    const children = items.filter((item) => item.kind === 'scope' && item.parent === subject?.id)
    if (children.length !== 1)
      return {
        code: children.length ? EXIT.input : EXIT.precondition,
        payload: {
          schema: 'wholeloop/next@1',
          subject: subject.id,
          action: null,
          questions: children.length
            ? [
                {
                  id: 'scope',
                  prompt: 'Which scope should continue?',
                  multi: false,
                  options: children.map(({ id, title }) => ({ value: id, label: title })),
                },
              ]
            : [],
          stop: children.length
            ? 'Choose an explicit scope ID.'
            : 'No open scopes remain; inspect status before continuing.',
        },
      }
    subject = children[0]
    plan = subject ? engine.plan(subject.id) : undefined
  }
  while (subject && plan?.next === 'build-slice' && !plan.pending.length) {
    const events = engine.store.events()
    const children = buildChildren(events, subject.id)
    if (children === undefined) break
    const ready = children.filter((item) => !blockingDependencies(events, item.id).length)
    if (ready.length !== 1)
      return {
        code: ready.length ? EXIT.input : EXIT.precondition,
        payload: {
          schema: 'wholeloop/next@1',
          subject: subject.id,
          action: null,
          questions: ready.length
            ? [
                {
                  id: 'work',
                  prompt: 'Which ready slice or part should continue?',
                  multi: false,
                  options: ready.map(({ id, title }) => ({ value: id, label: title })),
                },
              ]
            : [],
          blocked: children
            .filter((item) => !ready.includes(item))
            .map((item) => ({ id: item.id, blockedBy: blockingDependencies(events, item.id) })),
          stop: ready.length
            ? 'Choose an explicit work ID.'
            : 'No open work is ready; inspect dependencies and completed children.',
        },
      }
    subject = ready[0]
    plan = subject ? engine.plan(subject.id) : undefined
  }
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
        questions: blocking.map(({ id, basis, subject: decisionSubject }) => ({
          id: `decision.${id}`,
          basis,
          subject: decisionSubject,
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
  const due =
    subject && plan?.next === 'decide-next'
      ? impactSchedule(
          engine.store.events(),
          subject.id,
          configuredCheckpoints(engine.config()),
        )?.checkpoints.find((checkpoint) => checkpoint.status === 'due')
      : undefined
  if (subject && due)
    return {
      code: EXIT.ok,
      payload: {
        schema: 'wholeloop/next@1',
        subject: subject.id,
        questions: [],
        action: {
          step: 'measure-impact',
          command: `wl measure begin --for ${subject.id} --checkpoint ${due.key}`,
        },
        checkpoint: due,
        stop: 'A measured scope has a due checkpoint; begin it explicitly before collecting new evidence.',
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
