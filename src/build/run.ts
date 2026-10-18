import { isObject } from '../config/schema.js'
import { type GateHost, inspectGateRound } from '../gates/execution.js'
import { workspaceSnapshot } from '../gates/snapshot.js'
import { gateRuns } from '../gates/state.js'
import { GateWorkflow } from '../gates/workflow.js'
import { type BuilderPlan, latestBuilderPlan } from './contracts.js'
import type { BuildWorkflow } from './workflow.js'

export type BuildContext = ReturnType<BuildWorkflow['prepare']>
export interface BuildHost extends GateHost {
  plan(context: BuildContext): Promise<BuilderPlan>
  implement(context: BuildContext, findings: unknown): Promise<void>
}
export interface BuildOptions {
  base?: string
  after?: string
  mode?: 'native' | 'sequential'
  gateLease?: () => Promise<() => void>
}
async function schedule<T>(
  inputs: readonly T[],
  operation: (input: T) => Promise<void>,
  sequential: boolean,
) {
  if (!sequential) {
    const settled = await Promise.allSettled(inputs.map(operation))
    const failure = settled.find((result) => result.status === 'rejected')
    if (failure?.status === 'rejected') throw failure.reason
  } else for (const input of inputs) await operation(input)
}

/** Hosts own tools; the core owns plans, coverage, budgets and the stop before PR. */
export async function runBuild(
  workflow: BuildWorkflow,
  subject: string,
  host: BuildHost,
  options: BuildOptions = {},
) {
  if (host.stopped()) return { status: 'stopped', subject }
  const context = workflow.prepare(subject, options)
  const engine = workflow.engineFor(subject)
  const personal =
    context.workspace.mode === 'worktree' ? workspaceSnapshot(engine.root).digest : undefined
  const checkPersonal = () => {
    if (personal && workspaceSnapshot(engine.root).digest !== personal)
      throw new Error(
        'Personal checkout changed during the build; preserve its files and inspect the host',
      )
  }

  let recorded = latestBuilderPlan(engine.store.events(), subject, context.run)
  if (!recorded) {
    let plan: BuilderPlan
    try {
      plan = await host.plan(context)
    } finally {
      checkPersonal()
    }
    workflow.recordPlan(subject, plan, context.snapshot)
    recorded = latestBuilderPlan(engine.store.events(), subject, context.run)
  }
  workflow.ready(subject)
  const initialEvents = engine.store.events()
  const planIndex = recorded ? initialEvents.findIndex((event) => event.id === recorded.id) : -1
  const runs = gateRuns(initialEvents).filter((run) => run.subject === subject)
  const latestGate = [...initialEvents]
    .reverse()
    .find((event) => event.subject === subject && event.type === 'gate.planned')
  const last = runs
    .find((run) => latestGate?.type === 'gate.planned' && run.run === latestGate.data.plan.run)
    ?.rounds.at(-1)
  const hasCurrentGate = initialEvents.some(
    (event, index) =>
      index > planIndex && event.subject === subject && event.type === 'gate.planned',
  )
  let implement = !hasCurrentGate || (!!last?.decision && last.decision.report.verdict !== 'PASS')
  let findings: unknown = last?.decision?.report ?? []
  const gates = new GateWorkflow(engine)
  const sequential =
    options.mode === 'sequential' || context.preflight.profile.includes('Run one worker at a time')
  for (;;) {
    if (host.stopped()) return { status: 'stopped', subject }
    workflow.ready(subject)
    // Preserve an exhausted run on resume: do not spend another builder attempt first.
    const exhausted = gateRuns(engine.store.events())
      .filter((run) => run.subject === subject)
      .find((run) => {
        const round = run.rounds.at(-1)
        return round?.decision?.report.verdict === 'EXHAUSTED' && round.plan.round >= run.budget
      })
    if (exhausted)
      return {
        status: 'exhausted',
        subject,
        gate: exhausted.gate,
        report: exhausted.rounds.at(-1)?.decision?.report,
      }
    if (implement) {
      try {
        await host.implement(context, findings)
      } finally {
        checkPersonal()
      }
    }
    let repair = false
    for (const kind of ['verify', 'review'] as const) {
      if (host.stopped()) return { status: 'stopped', subject }
      const release = options.gateLease ? await options.gateLease() : () => {}
      try {
        const events = engine.store.events()
        const prior = gateRuns(events)
          .filter((run) => run.subject === subject && run.gate === kind)
          .at(-1)
          ?.rounds.at(-1)
        const currentPlan = latestBuilderPlan(events, subject, context.run)
        const fresh =
          prior &&
          events.findIndex(
            (event) => event.type === 'gate.planned' && event.data.plan.run === prior.plan.run,
          ) > (currentPlan ? events.indexOf(currentPlan) : -1)
        if (
          fresh &&
          prior?.decision?.report.verdict === 'PASS' &&
          prior.plan.snapshot.digest === workspaceSnapshot(context.workspace.path).digest
        )
          continue
        const { plan } = gates.plan(subject, kind, {
          ...(prior?.decision?.report.verdict === 'PASS' ? { newRun: true } : {}),
        })
        await inspectGateRound(engine, plan, host, sequential, checkPersonal)
        if (host.stopped()) return { status: 'stopped', subject }
        const result = gates.verdict(subject, kind)
        if (result.verdict === 'EXHAUSTED')
          return { status: 'exhausted', subject, gate: kind, report: result.report }
        if (result.verdict !== 'PASS') {
          findings = result.report
          repair = true
          implement = true
          break
        }
      } finally {
        release()
      }
    }
    if (!repair) {
      checkPersonal()
      return {
        status: 'green',
        subject,
        receipt: workflow.complete(subject),
        next: 'Human testing; no push or pull request',
      }
    }
  }
}

/** Schedule ready dependency waves; pace changes concurrency, never gate coverage. */
export async function runBuildGroup(
  workflow: BuildWorkflow,
  input: string,
  hostFor: (subject: string) => BuildHost,
  options: BuildOptions = {},
) {
  const profile = workflow.engine.config().profile
  const pace = isObject(profile) ? profile.pace : 'guided'
  let tail = Promise.resolve()
  const gateLease = () => {
    const previous = tail
    let release = () => {}
    tail = new Promise<void>((resolve) => {
      release = resolve
    })
    return previous.then(() => release)
  }
  const results: Awaited<ReturnType<typeof runBuild>>[] = []
  const processed = new Set<string>()
  for (;;) {
    const route = workflow.route(input)
    const ready = route.candidates.filter((id) => !processed.has(id))
    if (!ready.length) return { results, route }
    const run = async (subject: string) => {
      processed.add(subject)
      const result = await runBuild(workflow, subject, hostFor(subject), {
        ...options,
        ...(pace === 'guided' ? { mode: 'sequential' as const } : {}),
        ...(pace === 'staged' ? { gateLease } : {}),
      })
      results.push(result)
    }
    await schedule(ready, run, pace === 'guided')
    if (results.some((result) => result.status !== 'green'))
      return { results, route: workflow.route(input) }
  }
}
