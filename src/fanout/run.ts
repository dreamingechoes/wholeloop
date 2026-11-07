// Runs one planned gate round through headless workers; planning, suites and repair stay explicit.
import { mkdirSync, rmSync } from 'node:fs'
import type { FlowEngine } from '../flow/engine.js'
import type { GateKind } from '../gates/contracts.js'
import { inspectGateRound } from '../gates/execution.js'
import { workspaceSnapshot } from '../gates/snapshot.js'
import { gateRuns } from '../gates/state.js'
import { GateWorkflow } from '../gates/workflow.js'
import { HeadlessHost, type HeadlessOptions } from './host.js'

/** Consume an existing round once; gate planning, suite execution and repair stay explicit. */
export async function runHeadless(
  engine: FlowEngine,
  subject: string,
  gate: GateKind,
  options: HeadlessOptions,
) {
  const round = gateRuns(engine.store.events())
    .filter((run) => run.subject === subject && run.gate === gate)
    .at(-1)
    ?.rounds.at(-1)
  if (!round) throw new Error('Plan the gate before headless fan-out')
  const plan = round.plan
  const unchanged = () => {
    if (workspaceSnapshot(plan.repository).digest !== plan.snapshot.digest)
      throw new Error('Headless gate workspace changed; preserve edits and inspect the workers')
  }
  unchanged()
  if (round.decision)
    return {
      schema: 'wholeloop/fanout@1',
      engine: 'headless',
      adapter: options.adapter.id,
      subject,
      run: plan.run,
      round: plan.round,
      status: round.decision.report.verdict,
      cached: true,
      workers: [],
      verdict: round.decision.report,
    }
  if (
    plan.units.some((unit) => unit.id === 'suite') &&
    !round.results.some((result) => result.unit === 'suite')
  )
    throw new Error('Run wl verify suite for this round before read-only headless workers')
  const path = `fanout/${plan.run}/${plan.round}/lock`
  const lock = engine.store.files.path(path)
  engine.store.files.directory(`fanout/${plan.run}/${plan.round}`)
  try {
    mkdirSync(lock, { mode: 0o700 })
  } catch {
    throw new Error('Fan-out round is locked; inspect its owner before recovering a stopped run')
  }
  let host: HeadlessHost | undefined
  try {
    engine.store.files.atomic(
      `${path}/owner.json`,
      `${JSON.stringify({ pid: process.pid, started: new Date().toISOString() })}\n`,
    )
    host = new HeadlessHost(engine, options)
    await inspectGateRound(engine, plan, host, false, unchanged)
    unchanged()
    const verdict = host.stopped() ? undefined : new GateWorkflow(engine).verdict(subject, gate)
    return {
      schema: 'wholeloop/fanout@1',
      engine: 'headless',
      adapter: options.adapter.id,
      subject,
      run: plan.run,
      round: plan.round,
      status: verdict?.verdict ?? 'stopped',
      cached: false,
      workers: host.records,
      verdict: verdict?.report ?? null,
    }
  } finally {
    host?.close()
    rmSync(lock, { recursive: true })
  }
}
