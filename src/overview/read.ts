import { existsSync, lstatSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { loadConfig } from '../config/load.js'
import { isObject } from '../config/schema.js'
import { contractDigest } from '../contracts/compatibility.js'
import { deliveryBudgetClock } from '../delivery/budget-policy.js'
import { configuredCheckpoints } from '../impact/schedule.js'
import { deliveryRunner } from '../runner/events.js'
import { RunnerHumanDecisions } from '../runner/human-decisions.js'
import { projectDeliveryReport } from '../runner/operator-report.js'
import { RunnerStore } from '../runner/store.js'
import { replay } from '../state/events.js'
import { storePath } from '../state/paths.js'
import { StateStore } from '../state/store.js'
import { encodeCursor, journalPosition, OverviewError } from './cursor.js'

export interface OverviewReadOptions {
  root: string
  store?: string
  at?: string
  userFile?: string
}

/** Bound canonical input before legacy readers allocate complete journals. */
function journalBounds(store: StateStore, relative: string, pattern: RegExp, perFile: number) {
  const directory = join(store.files.root, relative)
  if (store.files.path(relative) !== directory) throw new OverviewError('store-unreadable')
  if (!existsSync(directory)) return
  const parent = lstatSync(directory)
  if (!parent.isDirectory() || parent.isSymbolicLink()) throw new OverviewError('store-unreadable')
  let total = 0,
    count = 0
  for (const name of readdirSync(directory)) {
    if (!name.endsWith('.ndjson')) continue
    if (!pattern.test(name) || ++count > 100000) throw new OverviewError('store-unreadable')
    const path = join(directory, name)
    if (store.files.path(`${relative}/${name}`) !== path)
      throw new OverviewError('store-unreadable')
    const stat = lstatSync(path)
    total += stat.size
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > perFile || total > 128 * 1024 * 1024)
      throw new OverviewError('store-unreadable')
  }
}
function stateJournal(store: StateStore) {
  journalBounds(store, 'journal', /^\d{4}-\d{2}\.ndjson$/, 64 * 1024 * 1024)
  const events = store.events()
  if (events.length > 100000) throw new OverviewError('store-unreadable')
  return events
}

/** Required facts are observed twice at one time; no cache repair, lock write or listener. */
export function readOverview(options: OverviewReadOptions) {
  let at = options.at ?? new Date().toISOString()
  if (!Number.isFinite(Date.parse(at)) || new Date(at).toISOString() !== at)
    throw new OverviewError('store-unreadable')
  try {
    let clock = deliveryBudgetClock(() => at)
    const store = new StateStore(options.store ?? storePath()),
      runner = new RunnerStore(
        store.files.root,
        () => at,
        () => clock,
      ),
      journal = runner.lifecycle.journal,
      locked = () => existsSync(store.files.path('.lock')),
      snapshot = () => {
        journalBounds(store, 'delivery/journal', /^\d{16}\.ndjson$/, 8 * 1024 * 1024)
        const value = journal.snapshot()
        if (value.events.length > 100000) throw new OverviewError('store-unreadable')
        return value
      },
      configuration = () => {
        const config = loadConfig({
            root: options.root,
            ...(options.userFile !== undefined ? { userFile: options.userFile } : {}),
          }).values,
          flow = config.flow,
          decisions = isObject(flow) ? flow.decisions : undefined,
          additions =
            isObject(decisions) && Array.isArray(decisions.add)
              ? decisions.add.filter((value): value is string => typeof value === 'string')
              : []
        return { additions, checkpoints: configuredCheckpoints(config) }
      },
      observe = (states: ReturnType<typeof journal.snapshot>['states']) => {
        const config = configuration(),
          grants = new Map(
            [...states.values()].map((state) => [
              state.run,
              state.grant ? runner.lifecycle.authority.inspect(state.grant.id) : undefined,
            ]),
          ),
          budgetReports = new Map(
            [...states.keys()].map((run) => [run, runner.budgets.inspect(run)]),
          ),
          runners = new Map<string, ReturnType<RunnerStore['inspect']>>(),
          humans = new Map<string, NonNullable<ReturnType<RunnerHumanDecisions['pending']>>>(),
          decidedHumans = new Map<
            string,
            { record: string; outcome: 'accept' | 'reject'; at: string }
          >(),
          human = new RunnerHumanDecisions(runner)
        for (const original of states.values()) {
          // Facet accessors historically install an empty facet; keep the captured state immutable.
          const state = structuredClone(original)
          const grant = grants.get(state.run)
          if (
            state.grant &&
            (grant?.digest !== state.grant.digest || grant.grant.id !== state.grant.id)
          )
            throw new OverviewError('store-unreadable')
          for (const record of deliveryRunner(state).records) {
            const status = runner.inspect(record.request)
            runners.set(record.request, status)
            if (
              state.state !== 'waiting-input' ||
              grant?.status !== 'active' ||
              status.problems.includes('unavailable-or-changed-basis')
            )
              continue
            const request = runner.get(record.request)
            for (const stage of record.stages) {
              if (!['prepared', 'running', 'pending'].includes(stage.status)) continue
              const pending = human.pending(request, stage)
              if (pending) {
                const key = `${record.request}:${stage.id}`
                humans.set(key, pending)
                const decided = human.decided(request, stage)
                if (decided)
                  decidedHumans.set(key, {
                    record: contractDigest(decided),
                    outcome: decided.outcome,
                    at: decided.at,
                  })
              }
            }
          }
        }
        return { config, grants, runners, humans, decidedHumans, budgetReports }
      },
      fingerprint = (facts: ReturnType<typeof observe>) =>
        contractDigest({
          config: facts.config,
          grants: [...facts.grants],
          runners: [...facts.runners],
          humans: [...facts.humans],
          decidedHumans: [...facts.decidedHumans],
          budgetReports: [...facts.budgetReports].map(([run, report]) => [
            run,
            { problem: report.problem, limits: report.limits, deadline: report.deadline },
          ]),
        })
    let lastProblem: OverviewError | undefined
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (locked()) throw new OverviewError('store-busy')
        const stateEvents = stateJournal(store),
          items = replay(stateEvents),
          delivery = snapshot(),
          position = journalPosition(stateEvents, delivery.events)
        if (options.at === undefined) {
          // A commit captured after invocation began must not look like a
          // clock rollback. Keep both observations on this attempt's clock;
          // an explicit as-of clock remains fixed for deterministic replay.
          at = new Date().toISOString()
          clock = deliveryBudgetClock(() => at)
        }
        const facts = observe(delivery.states)
        if (locked()) throw new OverviewError('store-busy')
        const confirmedState = stateJournal(store),
          confirmedDelivery = snapshot(),
          confirmed = observe(confirmedDelivery.states)
        if (locked()) throw new OverviewError('store-busy')
        if (
          encodeCursor(position) !==
            encodeCursor(journalPosition(confirmedState, confirmedDelivery.events)) ||
          fingerprint(facts) !== fingerprint(confirmed)
        ) {
          lastProblem = undefined
          continue
        }
        return {
          at,
          root: options.root,
          store: store.files.root,
          cursor: encodeCursor(position),
          position,
          stateEvents,
          deliveryEvents: delivery.events,
          items,
          states: delivery.states,
          configuration: facts.config,
          configurationDigest: contractDigest(facts.config),
          grants: facts.grants,
          runners: facts.runners,
          humans: facts.humans,
          decidedHumans: facts.decidedHumans,
          budgetReports: facts.budgetReports,
          reports: new Map(
            [...delivery.states.values()].map((state) => [
              state.run,
              projectDeliveryReport(
                state,
                delivery.events,
                facts.grants.get(state.run),
                facts.budgetReports.get(state.run)?.problem ?? null,
              ),
            ]),
          ),
        }
      } catch (error) {
        if (locked() || (error instanceof OverviewError && error.problem === 'store-busy'))
          throw new OverviewError('store-busy')
        // A writer can finish between an interrupted read and this catch.
        // Retry validation of actual bytes; a consistently bad journal still
        // fails closed, without publishing a partial view or repairing state.
        lastProblem = error instanceof OverviewError ? error : new OverviewError('store-unreadable')
      }
    }
    throw lastProblem ?? new OverviewError('store-busy')
  } catch (error) {
    if (error instanceof OverviewError) throw error
    // Legacy validators can include private IDs, paths or payload fragments in errors.
    throw new OverviewError('store-unreadable')
  }
}

export type OverviewRead = ReturnType<typeof readOverview>
