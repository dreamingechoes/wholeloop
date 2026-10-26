import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { isObject } from '../config/schema.js'
import { resolveSlot } from '../discovery/resolve.js'
import { discover } from '../discovery/tree.js'
import type { FlowEngine } from '../flow/engine.js'
import type { GatePlan } from '../gates/contracts.js'
import { workspaceSnapshot } from '../gates/snapshot.js'
import { gateRuns } from '../gates/state.js'
import { canonicalPath, inside } from '../state/paths.js'
import type { ReviewContext } from './contracts.js'
import { ReviewSnapshots } from './snapshots.js'
import { reviewInputs } from './state.js'

export const digest = (value: string) => createHash('sha256').update(value).digest('hex')
export const DEFAULT_REVIEW_RUBRIC =
  'Apply each assigned lens to concrete changed behavior, repository idioms and evidence. Report actionable defects with locations; do not repair code or manufacture approval.'

export function reviewRubric(engine: FlowEngine, root: string) {
  const inventory = discover(root, engine.store.files, engine.home)
  const slots = engine.config().slots
  const binding = resolveSlot('review.rubric', inventory.repo, {
    user: inventory.user,
    ...(isObject(slots) && typeof slots['review.rubric'] === 'string'
      ? { binding: slots['review.rubric'] }
      : {}),
  })
  const selected = binding.selected
  if (!selected || binding.questions.length)
    throw new Error('Resolve review.rubric before reviewing')
  let content = DEFAULT_REVIEW_RUBRIC
  if (selected.origin !== 'harness') {
    const base = selected.origin === 'user' ? engine.home : root
    const file = canonicalPath(isAbsolute(selected.ref) ? selected.ref : join(base, selected.ref))
    if (
      !inside(canonicalPath(base), file) ||
      !statSync(file).isFile() ||
      statSync(file).size > 1024 * 1024
    )
      throw new Error('Review rubric must be a readable local file under 1 MiB')
    content = readFileSync(file, 'utf8')
    if (!content.trim()) throw new Error('Review rubric must not be empty')
  }
  return { ref: selected.ref, origin: selected.origin, digest: digest(content), content }
}

/** Reconstruct pinned patches from private objects; never silently replace a round's input. */
export function prepareReviewInput(engine: FlowEngine, plan: GatePlan): ReviewContext {
  if (plan.gate !== 'review') throw new Error('Review input requires a review gate')
  const previous = gateRuns(engine.store.events())
    .find((run) => run.run === plan.run)
    ?.rounds.find((round) => round.plan.round === plan.round - 1)
  const kept = new Set(previous?.decision?.report.kept.map((finding) => finding.id) ?? [])
  const previousFindings =
    previous?.results.flatMap((result) =>
      result.findings
        .filter((finding) => kept.has(`${result.unit}:${finding.id}`))
        .map((finding) => ({ unit: result.unit, finding })),
    ) ?? []
  const rubric = reviewRubric(engine, plan.repository)
  const { content: _content, ...reference } = rubric
  const entries = reviewInputs(engine.store.events()).filter(
    (entry) => entry.input.run === plan.run,
  )
  const recorded = entries.find((entry) => entry.input.round === plan.round)?.input
  const prior = entries.find((entry) => entry.input.round === plan.round - 1)?.input
  if (
    (recorded ?? prior) &&
    JSON.stringify((recorded ?? prior)?.rubric) !== JSON.stringify(reference)
  )
    throw new Error('Review rubric changed; restore its pinned content and binding')
  const snapshots = new ReviewSnapshots(engine.store, plan.repository)
  if (recorded) {
    if (snapshots.objects !== recorded.objects)
      throw new Error('Review object store does not match its repository')
    const diff = snapshots.diff(recorded.before, recorded.after)
    if (digest(diff) !== recorded.diffDigest)
      throw new Error('Review patch digest does not match its journal')
    return {
      previousFindings,
      input: recorded,
      diff,
      rubric,
      current: workspaceSnapshot(plan.repository).digest === plan.snapshot.digest,
    }
  }
  if (plan.round > 1 && !prior)
    throw new Error('Previous review input is missing; cannot invent an incremental diff')
  if (workspaceSnapshot(plan.repository).digest !== plan.snapshot.digest)
    throw new Error('Workspace changed before review input; seal the round before retrying')
  const capture = snapshots.capture(plan.base.sha, prior?.files)
  const diff = snapshots.diff(capture.before, capture.after)
  const input = {
    run: plan.run,
    round: plan.round,
    ...capture,
    diffDigest: digest(diff),
    rubric: reference,
  }
  const stored = engine.store.transaction((events, append) => {
    const existing = reviewInputs(events).find(
      (entry) => entry.input.run === plan.run && entry.input.round === plan.round,
    )
    if (existing) return existing.input
    if (workspaceSnapshot(plan.repository).digest !== plan.snapshot.digest)
      throw new Error('Workspace changed while capturing review input')
    append(plan.subject, { type: 'review.input', data: input })
    return input
  })
  if (JSON.stringify(stored) !== JSON.stringify(input)) return prepareReviewInput(engine, plan)
  return { input: stored, diff, rubric, current: true, previousFindings }
}
