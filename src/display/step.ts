// Projects existing command observations into the public layout without inventing work or approval.
import { isObject } from '../config/schema.js'
import type { StepName } from '../flow/registry.js'
import { displayDetails } from './details.js'
import { type Display, renderDisplay } from './render.js'

export const STEP_LABELS: Record<StepName, string> = {
  research: 'Research',
  'frame-problem': 'Frame',
  'write-spec': 'Spec',
  'cut-scopes': 'Scopes',
  'slice-work': 'Slices',
  'build-slice': 'Build',
  'verify-works': 'Verify',
  'review-code': 'Review',
  'open-pr': 'Open PR',
  'prepare-launch': 'Prepare launch',
  'ramp-exposure': 'Ramp',
  'measure-impact': 'Measure',
  'decide-next': 'Decide',
}
const GROUPS: Record<string, StepName> = {
  research: 'research',
  frame: 'frame-problem',
  spec: 'write-spec',
  scopes: 'cut-scopes',
  slices: 'slice-work',
  build: 'build-slice',
  verify: 'verify-works',
  review: 'review-code',
  pr: 'open-pr',
  launch: 'prepare-launch',
  ramp: 'ramp-exposure',
  measure: 'measure-impact',
  learn: 'decide-next',
  env: 'build-slice',
}
const record = (value: unknown): Record<string, unknown> => (isObject(value) ? value : {})
const value = (input: unknown): string =>
  typeof input === 'string' || typeof input === 'number' ? String(input) : ''
const list = (input: unknown): unknown[] => (Array.isArray(input) ? input : [])
const phrases = (input: unknown): string[] =>
  list(input).flatMap((entry) => {
    const detail = record(entry)
    const question = value(detail.prompt) || value(detail.question)
    const reason = value(detail.reason) || value(detail.missing)
    const text = value(entry) || [question, reason].filter(Boolean).join(' — ')
    const options = list(detail.options)
      .map((option) => {
        const choice = record(option),
          label = value(choice.label) || value(choice.value)
        return `${label}${choice.value !== undefined && choice.value !== choice.label ? ` (${value(choice.value)})` : ''}`
      })
      .filter(Boolean)
    return text
      ? [
          text,
          ...(options.length ? [`Choices: ${options.join(' · ')}`] : []),
          ...(detail.freeText === true ? ['You can also enter your own answer.'] : []),
        ]
      : []
  })
const choices: Record<string, string> = {
  'approve-spec': 'Approve the specification',
  'approve-scopes': 'Approve the scopes',
  'approve-build-plan': 'Approve the build plan',
  'test-it': 'Confirm human testing',
}

export function isStepCommand(command: string): boolean {
  if (command === 'build') return false
  return (
    Object.hasOwn(GROUPS, command.split(' ')[0] ?? '') ||
    ['step', 'gate', 'challenge', 'fanout'].includes(command.split(' ')[0] ?? '') ||
    command === 'answer'
  )
}

export function stepDisplay(
  command: string,
  payload: Record<string, unknown>,
  args: readonly string[] = [],
): Display {
  if (
    command === 'step begin' &&
    record(payload.plan).schema &&
    value(payload.schema) === 'wholeloop/step-begin@1'
  )
    return stepDisplay('research plan', record(payload.plan), args)
  const receipt = record(payload.receipt ?? payload.completion)
  const context = record(payload.context)
  const report = record(payload.report ?? receipt.report)
  const plan = record(payload.plan ?? context.plan ?? report.plan ?? record(context.record).plan)
  const preparation = record(payload.preflight)
  const subject =
    value(payload.subject) ||
    value(record(payload.subject).id) ||
    value(receipt.subject) ||
    value(preparation.subject)
  const explicit =
    value(payload.step) ||
    value(receipt.step) ||
    (command === 'step plan'
      ? value(payload.next)
      : command.startsWith('step ')
        ? (args[0] ?? '')
        : '')
  const gate =
    value(payload.gate) ||
    value(plan.gate) ||
    (['review', 'verify'].includes(args[0] ?? '') ? args[0] : '')
  const step = Object.hasOwn(STEP_LABELS, explicit)
    ? (explicit as StepName)
    : (GROUPS[command.split(' ')[0] ?? ''] ??
      (gate && ['gate', 'fanout'].includes(command.split(' ')[0] ?? '')
        ? gate === 'review'
          ? 'review-code'
          : 'verify-works'
        : undefined))
  const label = step
    ? STEP_LABELS[step]
    : command === 'answer'
      ? 'Choice saved'
      : ['gate', 'fanout'].includes(command.split(' ')[0] ?? '')
        ? 'Checks'
        : 'Plan'
  const title =
    value(payload.title) ||
    value(payload.input) ||
    value(payload.question) ||
    value(plan.question) ||
    value(preparation.title)
  const rows: { label: string; value: string }[] = []
  const row = (label: string, input: unknown) => {
    const text = value(input)
    if (text) rows.push({ label, value: text })
  }
  if (command === 'spec check' && args[0]) row('File', args[0])
  const cost = record(payload.cost)
  if (typeof cost.workers === 'number') {
    row('Workers', cost.workers)
    row(
      'Requested tier',
      list(cost.modelTiers)
        .map((entry) => `${value(record(entry).tier)} × ${value(record(entry).workers)}`)
        .join(' · ') || 'None',
    )
    const estimate = record(cost.estimate)
    row(
      'Estimate',
      `${value(estimate.value)} worker ${estimate.value === 1 ? 'call' : 'calls'}${typeof estimate.declaredInputBytes === 'number' ? ` · ${Math.ceil(estimate.declaredInputBytes / 1024)} KiB declared input` : ' · context not prepared'}`,
    )
  }

  const open = [
    ...(typeof cost.workers === 'number'
      ? [
          'Estimate covers current assignments only; later findings, client overhead, tokens, time and price remain unknown. Requested tiers do not prove the client model.',
        ]
      : []),
    ...phrases(payload.questions),
    ...phrases(payload.unknowns),
    ...phrases(payload.warnings),
    ...phrases(payload.openQuestions),
    ...phrases(plan.openQuestions),
    ...phrases(report.openQuestions),
    ...phrases(report.unknowns),
  ]
  const produced: string[] = []
  const next: string[] = []
  if (command === 'verify suite') {
    for (const finding of list(payload.findings)) {
      const entry = record(finding)
      open.push(value(entry.text), ...phrases(entry.evidence))
    }
    if (payload.roundSpent === false) row('Evaluation', 'Not started; budget retained')
  }
  if (value(payload.schema).includes('-schema@')) row('Format', 'Available with --json')
  else {
    row('Answer', receipt.answer)
    row('Recommendation', receipt.recommendation)
    row('Confidence', receipt.confidence ?? record(payload.certainty).confidence)
    open.push(...phrases(receipt.notChecked), ...phrases(record(payload.certainty).notChecked))
    row('Mode', payload.mode)
    row('Owner', payload.owner)
    const status = value(payload.verdict ?? payload.status ?? record(payload.result).status)
    if (status)
      row(
        'Status',
        (
          {
            question: 'Your input needed',
            'needs-sources': 'Choose sources',
            'needs-conclusion': 'Answer needed',
          } as Record<string, string>
        )[status] ?? status.replaceAll('-', ' '),
      )
    row('Decision', record(payload.decision).outcome ?? receipt.outcome)
    row('Checkpoint', payload.checkpoint ?? plan.checkpoint)
    for (const entry of list(report.kept)) {
      const finding = record(record(entry).finding)
      const text =
        value(finding.text) ||
        value(finding.summary) ||
        value(finding.message) ||
        value(finding.title)
      if (text) open.push(text)
    }
    if (list(report.missing).length) row('Not checked', list(report.missing).map(value).join(' · '))
    if (payload.current === false)
      open.push('The observed work has changed; check it again before continuing.')
    const round = payload.round ?? plan.round
    if (round !== undefined) row('Round', round)
    for (const [key, name] of [
      ['criteria', 'Criteria'],
      ['lenses', 'Review areas'],
      ['angles', 'Research angles'],
      ['jobs', 'Workers'],
    ] as const) {
      const entries =
        key === 'jobs' && typeof cost.workers === 'number' ? undefined : (payload[key] ?? plan[key])
      if (Array.isArray(entries)) row(name, entries.length)
    }
    const sources =
      payload.selected ?? payload.sources ?? record(payload.selection).sources ?? plan.sources
    if (Array.isArray(sources))
      row(
        'Sources',
        sources
          .map((entry) => value(entry) || value(record(entry).id))
          .filter(Boolean)
          .join(' · ') || 'None selected',
      )
    if (payload.status === 'needs-sources') {
      row('Sources', 'Choose before research starts')
      for (const candidate of list(payload.candidates)) {
        const entry = record(candidate)
        row(
          value(entry.name) || value(entry.label) || value(entry.id),
          entry.access === 'available in this client'
            ? 'available in this client · authentication unverified'
            : value(entry.access) || value(record(entry.access).label),
        )
      }
      for (const candidate of list(payload.unusable)) {
        const entry = record(candidate)
        open.push(`${value(entry.server)}: ${value(entry.label)}; ${value(entry.guide)}`)
      }
      open.push('Which sources may I use, and where should I remember your choice?')
    }
    if (payload.status === 'needs-conclusion')
      open.push('Write the answer and recommendation from the collected evidence.')
    const artifact = value(payload.artifact) || value(receipt.artifact) || value(receipt.produced)
    if (artifact) produced.push(`${artifact}${subject ? ` · wl open ${subject}` : ''}`)
    for (const item of list(payload.artifacts)) {
      const text = value(item) || value(record(item).path)
      if (text) produced.push(text)
    }
    for (const key of ['url', 'ref', 'path'] as const) {
      const text = value(payload[key])
      if (text) produced.push(text)
    }
    if (payload.reason) open.push(value(payload.reason))
    const following =
      typeof payload.next === 'string' ? payload : record(payload.next ?? receipt.next)
    const pending = [...list(payload.pending), ...list(following.pending)]
    for (const decision of pending) {
      const id = value(decision) || value(record(decision).id)
      open.push(
        (Object.hasOwn(choices, id) ? choices[id] : undefined) ??
          'A decision from you is required before continuing.',
      )
    }
    if (
      !pending.length &&
      following.available === true &&
      Object.hasOwn(STEP_LABELS, value(following.next))
    )
      next.push(STEP_LABELS[value(following.next) as StepName])
    if (command === 'answer') row('Remembered for', payload.scope)
    // Binding/profile/preflight/digest data stays available to clients without becoming presentation.
    if (list(payload.missing).length && !list(payload.questions).length)
      open.push('Provide the missing inputs before continuing.')
    if (payload.message) open.push(value(payload.message))
    const details = displayDetails(payload, plan, report)
    rows.push(...details.rows)
    open.push(
      ...details.open.map((problem) =>
        command === 'spec check' && args[0] ? `${args[0]}: ${problem}` : problem,
      ),
    )
    produced.push(...details.produced)
    if (command.startsWith('env ')) {
      const entries = payload.write ? [{ write: payload.write }] : list(payload.entries)
      row('Declared writes', entries.length)
      for (const entry of entries) {
        const write = record(record(entry).write)
        row('Resource', write.resource)
        row('Effect', write.effect)
        row('Declared by', write.by)
        row('Undo from', record(write.undo).cwd)
        row(
          'Undo arguments',
          list(record(write.undo).argv)
            .map((arg) => JSON.stringify(value(arg)))
            .join(' '),
        )
      }
      open.push('Undo commands are declarations; no cleanup was executed.')
      if (!entries.length)
        open.push('No external writes are declared; this does not prove there were no effects.')
    }
  }
  return renderDisplay({
    header: `${label}${subject ? ` — ${subject}` : ''}${title ? ` "${title}"` : ''}`,
    rows,
    produced: [...new Set(produced)],
    open: [...new Set(open.filter(Boolean))],
    next,
  })
}
