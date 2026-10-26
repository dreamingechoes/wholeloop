import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import { buildCriteria } from '../build/contracts.js'
import { loadExtensionOptions } from '../config/load.js'
import { isObject } from '../config/schema.js'
import { type Criterion, lintCriteria } from '../definition/criteria.js'
import { resolveSlot } from '../discovery/resolve.js'
import { knownSlot } from '../discovery/rules.js'
import { discover } from '../discovery/tree.js'
import type { FlowEngine } from '../flow/engine.js'
import { replay, type StateEvent } from '../state/events.js'
import {
  type ContractGateInput,
  contractGateInput,
  contractGateUnits,
} from '../verification/contract-gate.js'
import { verificationCriteria } from '../verification/contracts.js'
import { testabilityResult, testPath } from '../verification/testability.js'
import { worktreeRecords } from '../worktrees/contracts.js'
import { namedBase, repository } from '../worktrees/git.js'
import { WorktreeManager } from '../worktrees/manager.js'
import {
  type GateKind,
  type GatePlan,
  type GateResult,
  type GateVote,
  validateGateResult,
  validateGateVote,
} from './contracts.js'
import { gateLenses } from './lenses.js'
import { gateReport } from './report.js'
import { changedPaths, workspaceSnapshot } from './snapshot.js'
import { gateRuns } from './state.js'

export interface GateOptions {
  repo?: string
  base?: string
  rounds?: number
  extend?: number
  reason?: string
  newRun?: boolean
  criteria?: Criterion[]
  contracts?: ContractGateInput
}
const latestRun = (events: readonly StateEvent[], subject: string, gate: GateKind) =>
  gateRuns(events)
    .filter((run) => run.subject === subject && run.gate === gate)
    .at(-1)
const languages = (paths: string[]) =>
  [
    ...new Set(
      paths.flatMap((path) => {
        const extension = path.split('.').at(-1)?.toLowerCase() ?? ''
        const names: Record<string, string> = {
          ts: 'typescript',
          tsx: 'typescript',
          js: 'javascript',
          jsx: 'javascript',
          py: 'python',
          go: 'go',
          rs: 'rust',
          rb: 'ruby',
          java: 'java',
          swift: 'swift',
          html: 'html',
          css: 'css',
          sh: 'shell',
        }
        return names[extension] ? [names[extension]] : []
      }),
    ),
  ].sort()

export class GateWorkflow {
  constructor(readonly engine: FlowEngine) {}

  plan(subject: string, gate: GateKind, options: GateOptions = {}) {
    const item = this.engine.store.get(subject)
    if (!['slice', 'part', 'review'].includes(item.kind) || item.status === 'closed')
      throw new Error('Gates need an open slice, part or standalone review item')
    const events = this.engine.store.events()
    const existing = latestRun(events, subject, gate)
    const first = existing?.rounds[0]?.plan
    const allocation = worktreeRecords(events).find((entry) => entry.subject === subject)
    if (allocation && (allocation.status !== 'active' || allocation.abandoned))
      throw new Error('Gates need an active workspace lease')
    if (allocation) new WorktreeManager(this.engine).open(subject)
    const repo = repository(
      options.repo
        ? resolve(this.engine.root, options.repo)
        : (first?.repository ?? allocation?.path ?? item.repository ?? this.engine.root),
    )
    if ((allocation && allocation.path !== repo.path) || (first && first.repository !== repo.path))
      throw new Error('Gate repository must match its pinned workspace')
    const base =
      (!options.newRun ? first?.base : undefined) ??
      (options.base ? namedBase(repo.path, options.base) : (allocation?.base ?? first?.base))
    if (!base) throw new Error('Provide a named --base for a standalone gate')
    if (
      first &&
      !options.newRun &&
      options.base &&
      namedBase(repo.path, options.base).ref !== first.base.ref
    )
      throw new Error('Gate base is already pinned')
    const config = this.engine.config()
    const settings = isObject(config.gates) ? config.gates : {}
    const gateSettings = isObject(settings[gate]) ? settings[gate] : {}
    const inventory = discover(repo.path, this.engine.store.files, this.engine.home)
    const configuredSlots = isObject(config.slots) ? config.slots : {}
    const slots = [
      ...new Set([
        ...inventory.repo.assets.flatMap((asset) => asset.slots),
        ...Object.keys(configuredSlots),
      ]),
    ]
      .filter((slot) => {
        if (!knownSlot(slot)) return false
        const selected = resolveSlot(slot, inventory.repo, {
          user: inventory.user,
          ...(typeof configuredSlots[slot] === 'string' ? { binding: configuredSlots[slot] } : {}),
        }).selected
        return selected && selected.origin !== 'harness'
      })
      .sort()
    const paths = changedPaths(repo.path, base.sha)
    const inputs = { paths, languages: languages(paths), slots }
    const catalogOptions = loadExtensionOptions({
      root: this.engine.root,
      userFile: this.engine.userFile,
    })
    const lenses = gateLenses(gate, config, catalogOptions, inputs)
    const policy = lenses.policy
    if (first && !options.newRun && first.policy !== policy)
      throw new Error('Gate policy changed mid-run; restore its pinned lens configuration')
    let recordedCriteria = verificationCriteria(events, subject)
    if (!recordedCriteria && item.kind !== 'review') {
      try {
        recordedCriteria = buildCriteria(events, subject)
      } catch {
        /* Missing agreement is handled below. */
      }
    }
    if (
      gate === 'verify' &&
      recordedCriteria &&
      options.criteria &&
      JSON.stringify(recordedCriteria) !== JSON.stringify(options.criteria)
    )
      throw new Error('Recorded agreed criteria cannot be overridden by a verification invocation')
    const contractInput =
      options.contracts ?? (!options.newRun && first ? contractGateInput(first.units) : undefined)
    if (contractInput && (gate !== 'verify' || item.kind !== 'review'))
      throw new Error('Contract verification needs a standalone machine review subject')
    const contracts = contractInput
      ? contractGateUnits(this.engine.store.files.root, repo.path, contractInput)
      : undefined
    let criteria = options.criteria ?? recordedCriteria
    if (gate === 'verify') {
      if (
        contracts &&
        (criteria?.length ||
          (!options.newRun && first?.units.some((unit) => unit.origin === 'agreed:criteria')))
      )
        throw new Error(
          'Contract-only verification cannot replace or invent agreed product criteria',
        )
      if (!contracts) {
        const parent = item.kind === 'part' ? item.parent : item.id
        const defined = [...events]
          .reverse()
          .find((entry) => entry.subject === parent && entry.type === 'slice.defined')
        criteria ??=
          defined?.type === 'slice.defined' ? defined.data.definition.criteria : undefined
        if (!criteria && item.kind !== 'review') criteria = buildCriteria(events, subject)
        if (!criteria && first && !options.newRun)
          criteria = first.units
            .filter((unit) => unit.lens === 'acceptance')
            .map((unit) => JSON.parse(unit.asks) as Criterion)
        if (!criteria?.length)
          throw new Error(
            'Supply agreed criteria before verification; missing criteria cannot be invented',
          )
        const problems = lintCriteria(criteria)
        if (problems.length) throw new Error('Verification needs testable, unique agreed criteria')
      }
      lenses.units.unshift(
        {
          id: 'suite',
          lens: 'suite',
          asks: 'Run the resolved repository suite once and report its actual output.',
          prompt:
            'Report observed commands, exit codes and output. Unavailable execution blocks the gate.',
          origin: 'builtin:suite',
          failSafe: true,
        },
        ...(contracts?.units ??
          criteria?.map((criterion) => ({
            id: `criteria/${criterion.id}`,
            lens: 'acceptance',
            asks: JSON.stringify(criterion),
            prompt:
              'Check this criterion verbatim against observed behavior. Ask whether each changed test could fail.',
            origin: 'agreed:criteria',
            failSafe: true,
          })) ??
          []),
      )
      if (paths.some(testPath))
        lenses.units.push({
          id: 'testability',
          lens: 'testability',
          asks: 'Check changed tests for known constant assertions and ask whether deleting the feature could leave them green.',
          prompt:
            'Core lint is additive; independently examine mutation sensitivity in the criterion checks.',
          origin: 'builtin:testability',
          failSafe: true,
        })
      if (paths.some(testPath))
        lenses.units.push({
          id: 'changed-tests',
          lens: 'test-group',
          asks: `Would these changed tests fail if the feature were removed? ${paths.filter(testPath).join(', ')}`,
          prompt:
            'Inspect behavior, assertions, setup and reachable failures; do not edit tests. Constant lint alone is insufficient.',
          origin: 'builtin:changed-tests',
          failSafe: true,
        })
      const coverage = (unit: GatePlan['units'][number]) =>
        unit.lens === 'acceptance' || unit.origin === 'delivery:contracts'
      const previousCriteria = first?.units.filter(coverage)
      if (
        previousCriteria &&
        !options.newRun &&
        JSON.stringify(previousCriteria) !== JSON.stringify(lenses.units.filter(coverage))
      )
        throw new Error(
          contracts
            ? 'Declared verification contracts changed mid-run'
            : 'Agreed verification criteria changed mid-run',
        )
    }
    const snapshot = workspaceSnapshot(repo.path)
    if (contracts && contracts.observed.snapshot.digest !== snapshot.digest)
      throw new Error('Contract candidate changed while planning verification')
    if (first && !options.newRun && first.snapshot.branch !== snapshot.branch)
      throw new Error('Gate branch changed between rounds; restore the pinned branch')
    return this.engine.store.transaction((currentEvents, append) => {
      const current = latestRun(currentEvents, subject, gate)
      if (current?.run !== existing?.run || current?.rounds.length !== existing?.rounds.length)
        throw new Error('Gate advanced concurrently; request its plan again')
      let budget = existing?.budget ?? options.rounds ?? Number(gateSettings.rounds)
      if (!Number.isInteger(budget) || budget < 1 || budget > 10)
        throw new Error('Gate rounds must be between 1 and 10')
      if (
        existing &&
        options.rounds !== undefined &&
        options.rounds !== existing.budget &&
        !options.newRun
      )
        throw new Error('Use an explicit extension with a reason to increase a running budget')
      if (options.reason && options.extend === undefined)
        throw new Error('An extension reason requires --extend')
      if (options.extend !== undefined) {
        if (
          !existing ||
          options.newRun ||
          !options.reason?.trim() ||
          !Number.isInteger(options.extend) ||
          options.extend <= budget ||
          options.extend > 10
        )
          throw new Error('Extend an existing gate to a larger budget up to 10, with a reason')
        append(subject, {
          type: 'gate.extended',
          data: { run: existing.run, budget: options.extend, reason: options.reason },
        })
        budget = options.extend
      }
      const previous = current?.rounds.at(-1)
      if (options.newRun) {
        if (previous?.decision?.report.verdict !== 'PASS')
          throw new Error('Only a passing prior run can start a fresh gate budget')
        budget = options.rounds ?? Number(gateSettings.rounds)
      } else if (previous && !previous.decision) {
        return { schema: 'wholeloop/gate-plan@1', plan: previous.plan, budget, resumed: true }
      } else if (previous?.decision?.report.verdict === 'PASS')
        return {
          schema: 'wholeloop/gate-plan@1',
          plan: previous.plan,
          budget,
          resumed: true,
          complete: snapshot.digest === previous.plan.snapshot.digest,
          stale: snapshot.digest !== previous.plan.snapshot.digest,
        }
      const round = options.newRun ? 1 : (current?.rounds.length ?? 0) + 1
      if (round > budget)
        throw new Error(
          'Gate budget exhausted; explicitly extend it or take over the open findings',
        )
      const plan: GatePlan = {
        schema: 'wholeloop/gate-round@1',
        subject,
        run: !options.newRun && existing ? existing.run : `gate-${randomBytes(8).toString('hex')}`,
        gate,
        round,
        budget,
        policy,
        repository: repo.path,
        base,
        snapshot,
        inputs,
        units: lenses.units,
        excluded: lenses.excluded,
        verifiers: !options.newRun && first ? first.verifiers : Number(settings.verifiers),
        refutations: 0,
      }
      plan.refutations = Math.floor(plan.verifiers / 2) + 1
      append(subject, { type: 'gate.planned', data: { plan } })
      if (plan.units.some((unit) => unit.id === 'testability'))
        append(subject, {
          type: 'gate.submitted',
          data: { run: plan.run, round: plan.round, result: testabilityResult(plan) },
        })
      return { schema: 'wholeloop/gate-plan@1', plan, budget, resumed: false }
    })
  }

  submit(subject: string, run: string, round: number, result: GateResult | GateVote) {
    if ('unit' in result) validateGateResult(result)
    else validateGateVote(result)
    return this.engine.store.transaction((events, append) => {
      const active = gateRuns(events).find(
        (entry) => entry.run === run && entry.subject === subject,
      )
      if (!active) throw new Error('Unknown gate run')
      const current = active.rounds.at(-1)
      if (!current || current.plan.round !== round || current.decision)
        throw new Error('Submit to the current unsealed gate round')
      if (workspaceSnapshot(current.plan.repository).digest !== current.plan.snapshot.digest)
        throw new Error(
          'Workspace changed during a read-only gate round; seal it as failed before retrying',
        )
      if ('unit' in result)
        append(subject, { type: 'gate.submitted', data: { run, round, result } })
      else append(subject, { type: 'gate.examined', data: { run, round, vote: result } })
      return { schema: 'wholeloop/gate-submit@1', subject, run, round, recorded: true }
    })
  }

  verdict(subject: string, gate: GateKind) {
    return this.engine.store.transaction((events, append) => {
      if (!replay(events).has(subject)) throw new Error('Unknown gate subject')
      const run = latestRun(events, subject, gate)
      const current = run?.rounds.at(-1)
      if (!run || !current) throw new Error('Plan a gate round first')
      let observed: string
      try {
        observed = workspaceSnapshot(current.plan.repository).digest
      } catch {
        observed = '0'.repeat(64)
      }
      const report =
        current.decision?.report ??
        gateReport(current.plan, current.results, current.votes, observed, run.budget)
      if (!current.decision) {
        append(subject, {
          type: 'gate.decided',
          data: { run: run.run, round: current.plan.round, observed, report },
        })
        append(subject, {
          type: 'msg.sent',
          data: {
            to: 'builder',
            from: `gate-${gate}`,
            kind: 'status',
            body: `${gate} round ${current.plan.round}/${run.budget}: ${report.verdict}; missing ${report.missing.length}, kept ${report.kept.length}, unchanged ${report.unchanged}. Findings: items/${subject}/gates/${run.run}/${current.plan.round}.json`,
          },
        })
      }
      const stale =
        !!current.decision && report.verdict === 'PASS' && observed !== current.plan.snapshot.digest
      return {
        schema: 'wholeloop/gate-verdict@1',
        subject,
        run: run.run,
        gate,
        round: current.plan.round,
        budget: run.budget,
        report,
        current: !stale,
        verdict: stale ? 'STALE' : report.verdict,
      }
    })
  }
}
