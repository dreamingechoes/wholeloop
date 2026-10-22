import { existsSync, lstatSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { contractDigest } from '../contracts/compatibility.js'
import { checkShape } from '../flow/registry.js'
import { checkFrame, FRAME_SECTIONS } from '../framing/contract.js'
import { validateFrameReview } from '../framing/finalize.js'
import { workspaceSnapshot } from '../gates/snapshot.js'
import { replay, type StateEvent } from '../state/events.js'
import { StateStore } from '../state/store.js'
import type { ConformanceReport, PreparedConformance, Scenario } from './contracts.js'

export function judgeConformance(run: PreparedConformance, scenario: Scenario): ConformanceReport {
  const missing: string[] = []
  const problems: string[] = []
  const report: ConformanceReport = {
    schema: 'wholeloop/conformance-report@1',
    id: run.id,
    cli: run.target,
    pin: run.pin,
    step: 'frame-problem',
    scenario: run.scenario,
    core: run.core,
    source: run.source,
    scenarioDigest: run.scenarioDigest,
    evidence:
      run.mode === 'fixture'
        ? 'simulation'
        : run.mode === 'live'
          ? 'live-process-and-journal'
          : 'unrun',
    status: 'UNRUN',
    missing,
    problems,
    ...(run.process ? { process: run.process } : {}),
    limitations: [
      'Only the standalone framing scenario is judged; model truth, challenge quality, hook activation, permission isolation and other steps are not proven.',
      'The skill marker checks instruction consumption, not an adversarial attestation of the native loader.',
      'Fresh processes may inherit native authentication/customizations. Native logs, ignored files, external writes and service-side effects are not fully observed.',
      'Exit status and the journal are judged; native stdout is bounded and discarded, not validated as a client protocol.',
      'The bundled fictional owner approves only scripted fixture bytes; final review is client-reported, not proof of human approval, semantic truth or reviewer isolation.',
    ],
  }
  if (run.phase === 'prepared') return report
  if (run.phase !== 'finished') problems.push('process-unfinished')
  if (run.problem) problems.push(run.problem)
  if (run.process?.status !== 'succeeded' || run.process.code !== 0 || run.process.signal !== null)
    problems.push('process-success-missing')
  if (run.mode === 'live' && run.process?.version !== run.pin)
    problems.push('exact-version-not-observed')
  try {
    if (workspaceSnapshot(run.root).digest !== run.baseline) problems.push('workspace-changed')
  } catch {
    problems.push('workspace-unreadable')
  }
  let events: StateEvent[] = []
  const store = new StateStore(run.state)
  try {
    const directory = store.files.path('journal')
    if (existsSync(directory)) {
      const names = readdirSync(directory)
      let bytes = 0
      if (names.length > 32) throw new Error('Unbounded conformance journal')
      for (const name of names) {
        const path = join(directory, name)
        const stat = lstatSync(path)
        bytes += stat.size
        if (
          !/^\d{4}-\d{2}\.ndjson$/.test(name) ||
          !stat.isFile() ||
          stat.isSymbolicLink() ||
          bytes > 2 * 1024 * 1024
        )
          throw new Error('Unsafe or unbounded conformance journal')
      }
    }
    events = store.events()
    if (events.length > 256) throw new Error('Unbounded conformance events')
    replay(events)
  } catch {
    problems.push('invalid-journal')
    report.status = 'FAIL'
    return report
  }
  const created = events.filter((entry) => entry.type === 'item.created')
  const first = created[0]
  if (
    first?.type !== 'item.created' ||
    first.data.kind !== 'initiative' ||
    first.data.owner !== scenario.owner ||
    first.data.repository !== run.root ||
    first.data.parent
  )
    missing.push('item.created:owned-standalone-initiative')
  if (created.length !== 1) problems.push('expected-one-initiative')
  if (first) report.subject = first.subject
  const starts = events.filter((entry) => entry.type === 'step.started')
  const start = starts[0]
  if (
    start?.type !== 'step.started' ||
    start.subject !== first?.subject ||
    start.data.step !== 'frame-problem' ||
    start.data.input !== scenario.input ||
    start.data.mode !== 'standalone'
  )
    missing.push('step.started:frame-problem:standalone')
  if (starts.length !== 1) problems.push('expected-one-step-start')
  const completions = events.filter((entry) => entry.type === 'step.completed')
  const complete = completions[0]
  if (
    complete?.type !== 'step.completed' ||
    start?.type !== 'step.started' ||
    complete.subject !== first?.subject ||
    complete.data.step !== 'frame-problem' ||
    complete.data.run !== start.data.run ||
    events.indexOf(complete) <= events.indexOf(start)
  )
    missing.push('step.completed:frame-problem:same-run')
  if (completions.length !== 1) problems.push('expected-one-step-completion')
  const note = events.find(
    (entry) =>
      entry.type === 'note.added' &&
      entry.subject === first?.subject &&
      entry.data.text === `conformance-marker:${run.marker}`,
  )
  if (
    !note ||
    !start ||
    !complete ||
    events.indexOf(note) <= events.indexOf(start) ||
    events.indexOf(note) >= events.indexOf(complete)
  )
    missing.push('note.added:installed-skill-marker')
  const outcome = events.find(
    (entry) =>
      entry.type === 'frame.decided' &&
      entry.subject === first?.subject &&
      complete?.type === 'step.completed' &&
      entry.data.run === complete.data.run &&
      entry.data.outcome === 'go' &&
      events.indexOf(entry) > events.indexOf(complete),
  )
  if (!outcome) missing.push('frame.decided:go:same-run')
  const decisions = events.filter((entry) => entry.type === 'frame.decided')
  if (
    decisions.length !== 1 ||
    (outcome?.type === 'frame.decided' &&
      (outcome.data.reason !== scenario.approval.decision.reason ||
        outcome.data.reopen !== undefined))
  )
    problems.push('scripted-decision-mismatch')
  if (
    events.some(
      (entry) =>
        entry.type === 'step.skipped' ||
        entry.type === 'decision.recorded' ||
        entry.type === 'item.closed',
    )
  )
    problems.push('unexpected-skip-approval-or-closure')
  if (complete?.type === 'step.completed') {
    if (complete.data.artifact.content !== scenario.artifact)
      problems.push('scripted-final-artifact-mismatch')
    const reviews = events.filter(
      (entry) => entry.type === 'note.added' && entry.data.text.startsWith('Framing final review:'),
    )
    const finalReview = reviews[0]
    if (
      reviews.length !== 1 ||
      finalReview?.type !== 'note.added' ||
      finalReview.subject !== complete.subject ||
      !start ||
      events.indexOf(finalReview) <= events.indexOf(start) ||
      events.indexOf(finalReview) >= events.indexOf(complete)
    )
      missing.push('note.added:final-framing-review')
    else {
      try {
        const review = validateFrameReview(
          complete.data.artifact.content,
          JSON.parse(finalReview.data.text.slice('Framing final review: '.length)),
          { subject: complete.subject, run: complete.data.run, owner: scenario.owner },
        )
        if (
          review.sha256 !== scenario.approval.sha256 ||
          contractDigest(review.decision) !== contractDigest(scenario.approval.decision)
        )
          throw new Error()
        if (run.mode === 'live' && review.reviewer.by === 'SIMULATED fixture reviewer')
          throw new Error()
      } catch {
        problems.push('invalid-final-framing-review')
      }
    }
    const expected = `items/${complete.subject}/artifacts/frame-problem/${complete.data.run}.md`
    if (
      complete.data.artifact.path !== expected ||
      [
        ...checkShape(complete.data.artifact.content, FRAME_SECTIONS),
        ...checkFrame(complete.data.artifact.content),
      ].length
    )
      problems.push('invalid-framing-artifact')
    try {
      if (store.files.read(expected) !== complete.data.artifact.content)
        problems.push('artifact-projection-mismatch')
    } catch {
      problems.push('artifact-projection-unreadable')
    }
    const item = replay(events).get(complete.subject)
    if (item?.owner !== scenario.owner || item.repository !== run.root || item.status !== 'open')
      problems.push('initiative-projection-mismatch')
  }
  report.status =
    missing.length || problems.length ? 'FAIL' : run.mode === 'fixture' ? 'FIXTURE_PASS' : 'PASS'
  return report
}
