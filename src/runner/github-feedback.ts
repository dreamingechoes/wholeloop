// Reads GitHub check and review feedback, projecting it in memory before anything is kept.
import { isObject } from '../config/schema.js'
import { type CiFeedbackRead, ciFeedbackEvidence, validateCiFeedback } from './ci-feedback.js'
import { ciFeedback } from './ci-repair.js'
import { DeliveryRunnerError } from './route.js'

type Source = CiFeedbackRead['items'][number]['source']
const SHA = /^[a-f0-9]{40,64}$/
const positive = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) > 0
/** Project in memory before any caller can retain the API response. */
function feedbackItems(source: Source, values: unknown[], head: string): CiFeedbackRead['items'] {
  return values.flatMap((value) => {
    if (
      !isObject(value) ||
      !positive(value.id) ||
      typeof value.body !== 'string' ||
      !Object.hasOwn(value, 'user') ||
      (value.user !== null && (!isObject(value.user) || !positive(value.user.id)))
    )
      throw new DeliveryRunnerError('ci-feedback-host-item')
    if (source === 'review') {
      if (
        !['PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'COMMENTED', 'DISMISSED'].includes(
          String(value.state),
        )
      )
        throw new DeliveryRunnerError('ci-feedback-host-review')
      // An empty positive/neutral review contains no message to adopt. A
      // changes-requested state still blocks even when it has no body.
      if (!value.body.trim() && value.state !== 'CHANGES_REQUESTED') return []
    }
    const commit = source === 'issue-comment' ? undefined : value.commit_id
    if (
      commit !== undefined &&
      commit !== null &&
      (typeof commit !== 'string' || !SHA.test(commit))
    )
      throw new DeliveryRunnerError('ci-feedback-host-commit')
    const revisionSource =
        typeof commit === 'string' ? ('host-commit' as const) : ('current-head-snapshot' as const),
      revision = typeof commit === 'string' ? commit : head,
      projected = ciFeedback(
        [
          {
            id: `${source}:${value.id}:${source === 'review' ? value.state : ''}`,
            author: isObject(value.user) ? `github-user:${value.user.id}` : 'host-deleted-author',
            revision,
            body: value.body,
          },
        ],
        head,
      )[0]
    if (!projected) throw new DeliveryRunnerError('ci-feedback-host-projection')
    const { reason: _reason, ...item } = projected
    return [{ ...item, source, revisionSource }]
  })
}

/** Only fixed relative GET paths; truncation, cancellation and a moved PR refuse. */
export async function readGithubFeedback(input: {
  repository: string
  pr: string
  head: string
  base: string
  signal: AbortSignal
  api(endpoint: string, signal: AbortSignal): Promise<unknown>
}): Promise<CiFeedbackRead> {
  const prefix = `${input.repository}/pull/`,
    number = input.pr.slice(prefix.length),
    current = () => {
      if (input.signal.aborted) throw new DeliveryRunnerError('ci-feedback-cancelled')
    },
    pull = async () => {
      current()
      const value = await input.api(`pulls/${number}`, input.signal)
      current()
      if (
        !isObject(value) ||
        !isObject(value.head) ||
        !isObject(value.base) ||
        value.html_url !== input.pr ||
        value.state !== 'open' ||
        value.head.sha !== input.head ||
        value.base.ref !== input.base
      )
        throw new DeliveryRunnerError('ci-feedback-host-head')
    }
  if (!input.pr.startsWith(prefix) || !/^[1-9][0-9]*$/.test(number))
    throw new DeliveryRunnerError('ci-feedback-host-pr')
  await pull()
  const items: CiFeedbackRead['items'] = []
  for (const [source, endpoint] of [
    ['issue-comment', `issues/${number}/comments`],
    ['review-comment', `pulls/${number}/comments`],
    ['review', `pulls/${number}/reviews`],
  ] as const) {
    let complete = false
    const ids = new Set<number>()
    for (let page = 1; page <= 3; page++) {
      current()
      const values = await input.api(`${endpoint}?per_page=100&page=${page}`, input.signal)
      current()
      if (!Array.isArray(values) || values.length > 100)
        throw new DeliveryRunnerError('ci-feedback-host-page')
      for (const value of values) {
        if (!isObject(value) || !positive(value.id) || ids.has(value.id))
          throw new DeliveryRunnerError('ci-feedback-host-page-identity')
        ids.add(value.id)
      }
      items.push(...feedbackItems(source, values, input.head))
      if (values.length < 100) {
        complete = true
        break
      }
    }
    if (!complete) throw new DeliveryRunnerError('ci-feedback-host-truncated')
  }
  await pull()
  const facts: Omit<CiFeedbackRead, 'evidence'> = {
      schema: 'wholeloop/delivery-ci-feedback@1',
      repository: input.repository,
      pr: input.pr,
      head: input.head,
      base: input.base,
      observedAt: new Date().toISOString(),
      complete: true,
      items: items.sort((a, b) => a.identity.localeCompare(b.identity)),
      provenance: 'host-observed',
    },
    read = { ...facts, evidence: ciFeedbackEvidence(facts) }
  validateCiFeedback(read)
  return read
}
