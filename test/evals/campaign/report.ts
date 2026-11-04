/**
 * The P6-27 three-run report: groups live trial reports by scenario, client,
 * version and model and decides, from the retained facts alone, whether each
 * group has three passing trials. Nothing is inferred from a model's claims:
 * a pass needs a completed run with an outcome its route allows, zero
 * controller waits for input and every native launch succeeded and
 * host-observed. Failed attempts stay listed with their observed cause.
 */
export interface LiveTrial {
  schema: 'wholeloop/live-trial@1'
  scenario: string
  target: string
  version: string
  model: string
  run: string
  seconds: number
  exit: number | null
  status: {
    state?: string
    outcome?: string | null
    stages?: { id: string; status: string }[]
  } | null
  humanWaits: number
  native: { status: string; reason: string | null; provenance: string | null }[]
  usage?: { outputTokens: number; costMicros: number; unreported: number }
}

/** Outcomes each scenario's route may complete with. */
const OUTCOMES: Record<string, string[]> = {
  'EVAL-10': ['research-report-complete', 'completed-with-unknowns'],
  // None-policy implementation to PR, and the conditional merge.
  'EVAL-09': ['draft-pr', 'ready-pr'],
  'EVAL-08': ['merged'],
}
const REQUIRED = 3
/**
 * Launch reasons that mean the run never had a fair chance: the observer
 * refused the launch, or the client was denied for credentials or its usage
 * window. By the campaign rule (2026-11-04) such an attempt is repeated
 * without invalidating the batch, but stays listed. The reason comes from
 * the retained receipt, never from interpreting client text.
 */
const INFRASTRUCTURE = new Set(['runtime-unobserved', 'permission-denied'])

export function trialVerdict(trial: Readonly<LiveTrial>): {
  passed: boolean
  cause: string | null
  infrastructure: boolean
} {
  const failed = trial.native.find(
    (launch) => launch.status !== 'succeeded' || launch.provenance !== 'host-observed',
  )
  if (trial.humanWaits !== 0)
    return { passed: false, cause: `human-waits:${trial.humanWaits}`, infrastructure: false }
  if (failed)
    return {
      passed: false,
      cause: `launch-${failed.status}:${failed.reason ?? 'unrecorded'}`,
      infrastructure: failed.status !== 'succeeded' && INFRASTRUCTURE.has(failed.reason ?? ''),
    }
  if (trial.status?.state !== 'completed') {
    const stage = trial.status?.stages?.find((entry) => entry.status !== 'passed')
    return {
      passed: false,
      cause: `run-${trial.status?.state ?? 'unknown'}${stage ? `:${stage.id}:${stage.status}` : ''}`,
      infrastructure: false,
    }
  }
  if (!(OUTCOMES[trial.scenario] ?? []).includes(trial.status.outcome ?? ''))
    return {
      passed: false,
      cause: `outcome:${trial.status.outcome ?? 'none'}`,
      infrastructure: false,
    }
  if (!trial.native.length)
    return { passed: false, cause: 'no-native-launch', infrastructure: false }
  return { passed: true, cause: null, infrastructure: false }
}

export function campaignReport(
  trials: readonly Readonly<LiveTrial>[],
  required: readonly { scenario: string; target: string }[] = [],
) {
  const groups = new Map<string, Readonly<LiveTrial>[]>()
  for (const trial of trials) {
    if (trial.schema !== 'wholeloop/live-trial@1') throw new Error('Not a live trial report')
    const key = [trial.scenario, trial.target, trial.version, trial.model].join('|')
    groups.set(key, [...(groups.get(key) ?? []), trial])
  }
  const rows = [...groups.values()].map((group) => {
    const [first] = group as [Readonly<LiveTrial>],
      attempts = group.map((trial) => ({
        run: trial.run,
        seconds: trial.seconds,
        launches: trial.native.length,
        humanWaits: trial.humanWaits,
        outcome: trial.status?.outcome ?? null,
        outputTokens: trial.usage?.outputTokens ?? null,
        ...trialVerdict(trial),
      })),
      passes = attempts.filter((attempt) => attempt.passed),
      // Attempts in the order given; infrastructure failures are set aside and
      // the first three remaining attempts must all pass (validation spec 09).
      counted = attempts.filter((attempt) => !attempt.infrastructure).slice(0, REQUIRED),
      verdict =
        counted.length < REQUIRED
          ? ('pending' as const)
          : counted.every((attempt) => attempt.passed)
            ? ('three-passes' as const)
            : ('failed' as const)
    return {
      scenario: first.scenario,
      target: first.target,
      version: first.version,
      model: first.model,
      passed: passes.length,
      attempted: attempts.length,
      verdict,
      infrastructure: attempts.filter((attempt) => attempt.infrastructure).length,
      // Client-reported, never metered: only passing runs size a campaign.
      outputTokens: passes.reduce((sum, attempt) => sum + (attempt.outputTokens ?? 0), 0),
      attempts,
    }
  })
  for (const need of required)
    if (!rows.some((row) => row.scenario === need.scenario && row.target === need.target))
      rows.push({
        scenario: need.scenario,
        target: need.target,
        version: '',
        model: '',
        passed: 0,
        attempted: 0,
        verdict: 'pending',
        infrastructure: 0,
        outputTokens: 0,
        attempts: [],
      })
  rows.sort((a, b) => a.scenario.localeCompare(b.scenario) || a.target.localeCompare(b.target))
  return {
    schema: 'wholeloop/campaign-report@1' as const,
    required: REQUIRED,
    complete: rows.length > 0 && rows.every((row) => row.verdict === 'three-passes'),
    rows,
    acceptance: 'not-established' as const,
  }
}

/** A short table for the journal or a terminal; the JSON stays authoritative. */
export function campaignMarkdown(report: ReturnType<typeof campaignReport>) {
  const lines = [
    '| Scenario | Client | Passed | Attempted | Infrastructure | Verdict | Failure causes |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...report.rows.map(
      (row) =>
        `| ${row.scenario} | ${row.target} ${row.version} | ${row.passed} | ${row.attempted} | ${row.infrastructure} | ${row.verdict} | ${
          [...new Set(row.attempts.filter((a) => !a.passed).map((a) => a.cause))].join(', ') || '—'
        } |`,
    ),
  ]
  return `${lines.join('\n')}\n`
}
