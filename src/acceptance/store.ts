import { randomUUID } from 'node:crypto'
import { existsSync, readdirSync } from 'node:fs'
import { contractDigest } from '../contracts/compatibility.js'
import { DeliveryBudgets } from '../delivery/budgets.js'
import { readSourceFile } from '../delivery/input.js'
import { DeliveryJournalError } from '../delivery/journal-error.js'
import { DeliveryPlanning } from '../delivery/planning-store.js'
import { deliveryAttempts } from '../delivery/reducer.js'
import { EnvironmentResources } from '../environment/runtime.js'
import { AcceptanceArtifacts } from './artifacts.js'
import {
  type AcceptanceBoundary,
  DockerAcceptanceBoundary,
  sameAcceptanceInputs,
} from './boundary.js'
import {
  ACCEPTANCE_SCHEMAS,
  type AcceptanceArtifact,
  type AcceptanceBindings,
  type AcceptanceCase,
  type AcceptanceCaseResult,
  AcceptanceError,
  type AcceptanceHumanNote,
  type AcceptancePlan,
  type AcceptanceReport,
  type AcceptanceStatus,
  acceptanceShape,
  acceptanceTime,
  validateAcceptancePlan,
} from './contracts.js'

export interface AcceptanceHost {
  id: string
  version: string
  capability: string
  provenance: 'fixture' | 'host-observed'
  execute(
    test: Readonly<AcceptanceCase>,
    context: {
      invocation: string
      bindings: AcceptanceBindings
      signal: AbortSignal
      deadline: string
      timeoutMs: number
      capture(input: Uint8Array, mediaType: AcceptanceArtifact['mediaType']): string
    },
  ): Promise<
    Pick<
      AcceptanceCaseResult,
      'status' | 'origin' | 'invocationState' | 'assertions' | 'artifacts' | 'process' | 'reason'
    >
  >
  stop?(invocation: string): Promise<'stopped' | 'unknown'>
}
/** Fixed controller hosts call this boundary. There is intentionally no result/JSON import command. */
export class DeliveryAcceptance {
  readonly planning: DeliveryPlanning
  readonly budgets: DeliveryBudgets
  readonly artifacts: AcceptanceArtifacts
  constructor(
    store?: string,
    readonly options: {
      now?: () => string
      planAccepted?: (grant: string, plan: string) => boolean
    } = {},
  ) {
    this.planning = new DeliveryPlanning(store)
    this.budgets = new DeliveryBudgets(this.planning.sources.files.root, options.now)
    this.artifacts = new AcceptanceArtifacts(this.budgets)
  }
  private now() {
    return this.options.now?.() ?? new Date().toISOString()
  }
  prepare(value: unknown) {
    acceptanceShape(value, ACCEPTANCE_SCHEMAS.plan)
    const input = value as AcceptancePlan
    const delivery = this.planning.getPlan(input.run, input.revision)
    const plan = validateAcceptancePlan(input, delivery.plan),
      digest = contractDigest(plan)
    const files = this.planning.sources.files
    return files.locked(() => {
      const path = `delivery/acceptance-plans/${plan.run}/${plan.revision}.json`
      if (existsSync(files.path(path))) {
        const current = this.readPlan(path)
        if (current.digest !== digest) throw new AcceptanceError('pinned-case-definitions')
        const index = `delivery/acceptance-index/${digest}.json`
        if (!existsSync(files.path(index)))
          files.atomic(
            index,
            `${JSON.stringify({ schema: 'wholeloop/acceptance-plan-record@1', ...current })}\n`,
          )
        else this.readPlan(index, digest)
        return current
      }
      const state = this.currentState(plan.run)
      if (
        state &&
        deliveryAttempts(state).records.some(
          (attempt) => attempt.role === 'builder' && attempt.basis === plan.plan,
        )
      )
        throw new AcceptanceError('acceptance-defined-after-builder-admission')
      const record = { schema: 'wholeloop/acceptance-plan-record@1', digest, plan }
      acceptanceShape(record, ACCEPTANCE_SCHEMAS.record)
      files.atomic(`delivery/acceptance-index/${digest}.json`, `${JSON.stringify(record)}\n`)
      files.atomic(path, `${JSON.stringify(record)}\n`)
      return { digest, plan }
    })
  }
  get(digest: string) {
    this.digest(digest)
    const record = this.readPlan(`delivery/acceptance-index/${digest}.json`, digest)
    const pinned = this.readPlan(
      `delivery/acceptance-plans/${record.plan.run}/${record.plan.revision}.json`,
      digest,
    )
    if (pinned.digest !== digest) throw new AcceptanceError('unpinned-case-definitions')
    return record
  }
  boundary(environment: string) {
    return new DockerAcceptanceBoundary(
      new EnvironmentResources(this.planning.sources.files),
      environment,
    )
  }
  async executeCase(
    digest: string,
    caseId: string,
    key: string,
    boundary: AcceptanceBoundary,
    host: AcceptanceHost,
  ) {
    const { plan } = this.get(digest),
      test = this.test(plan, caseId)
    this.key(key)
    if (test.owner !== 'machine' || test.applicability !== 'applicable')
      throw new AcceptanceError('case-not-machine-executable')
    if (
      typeof host.execute !== 'function' ||
      host.capability !== test.runner.capability ||
      host.provenance !== boundary.provenance
    )
      throw new AcceptanceError('unavailable-observation-host')
    this.authority(plan)
    const bindings = await boundary.observe(plan)
    this.bindings(plan, bindings)
    this.budgets.start(plan.run)
    this.authority(plan)
    const budget = this.budgets.inspect(plan.run)
    const timeoutMs = Math.min(
      test.timeoutMs,
      budget.remainingMs ?? test.timeoutMs,
      budget.limits?.attemptMs ?? test.timeoutMs,
    )
    const deadline = new Date(Date.parse(this.now()) + timeoutMs).toISOString()
    const base = this.casePath(digest, caseId),
      path = `${base}/${key}`,
      files = this.planning.sources.files
    let invocation = ''
    let sequence = 0
    files.locked(() => {
      if (existsSync(files.path(`${path}/intent.json`))) {
        const intent = this.read(`${path}/intent.json`, ACCEPTANCE_SCHEMAS.intent)
        if (
          intent.plan !== digest ||
          intent.case !== caseId ||
          intent.key !== key ||
          !sameAcceptanceInputs(intent.bindings as unknown as AcceptanceBindings, bindings)
        )
          throw new AcceptanceError('case-key-conflict')
        return
      }
      for (const prior of this.results(digest, caseId))
        if (prior.invocationState === 'unknown' && sameAcceptanceInputs(prior.bindings, bindings))
          throw new AcceptanceError('prior-invoker-unknown')
      if (existsSync(files.path(base)))
        for (const previous of readdirSync(files.path(base))) {
          this.key(previous)
          if (
            existsSync(files.path(`${base}/${previous}/intent.json`)) &&
            !existsSync(files.path(`${base}/${previous}/result.json`))
          )
            throw new AcceptanceError('prior-case-intent-unresolved')
        }
      this.authority(plan)
      invocation = randomUUID()
      sequence = existsSync(files.path(base)) ? readdirSync(files.path(base)).length + 1 : 1
      const intent = {
        schema: 'wholeloop/acceptance-case-intent@1',
        plan: digest,
        case: caseId,
        key,
        sequence,
        invocation,
        bindings,
        at: this.now(),
        deadline,
        host: this.host(host),
        provenance: host.provenance,
      }
      acceptanceShape(intent, ACCEPTANCE_SCHEMAS.intent)
      files.atomic(`${path}/intent.json`, `${JSON.stringify(intent)}\n`)
    })
    if (!invocation) {
      if (existsSync(files.path(`${path}/result.json`)))
        return this.result(`${path}/result.json`, digest, test)
      throw new AcceptanceError('case-intent-unresolved')
    }
    const startedAt = this.now(),
      abort = new AbortController()
    let complete = false,
      dispatched = false,
      observedStopped = false
    const timer = setTimeout(
      () => abort.abort(),
      Math.max(1, Date.parse(deadline) - Date.parse(this.now())),
    )
    if (this.now() >= deadline) abort.abort()
    const watch = setInterval(() => {
      try {
        this.authority(plan)
      } catch {
        abort.abort()
      }
    }, 250)
    const metadata = {
      schema: 'wholeloop/acceptance-case-result@1' as const,
      plan: digest,
      case: caseId,
      key,
      sequence,
      invocation,
      bindings,
      provenance: host.provenance,
      host: this.host(host),
      startedAt,
    }
    const captures = new Set<string>()
    let receipt: AcceptanceCaseResult
    try {
      const observed = await Promise.race([
        Promise.resolve().then(() => {
          // Intent persistence consumes the original deadline; it cannot create a fresh execution window.
          if (abort.signal.aborted || this.now() >= deadline) {
            abort.abort()
            throw new AcceptanceError('case-cancelled')
          }
          dispatched = true
          return host.execute(structuredClone(test), {
            invocation,
            bindings: structuredClone(bindings),
            signal: abort.signal,
            deadline,
            timeoutMs: Math.max(1, Date.parse(deadline) - Date.parse(this.now())),
            capture: (bytes, mediaType) => {
              if (complete || abort.signal.aborted || this.now() >= deadline)
                throw new AcceptanceError('late-case-capture')
              this.authority(plan)
              const digest = this.artifacts.capture(plan.run, bytes, mediaType).digest
              captures.add(digest)
              return digest
            },
          })
        }),
        new Promise<never>((_, reject) => {
          if (abort.signal.aborted) reject(new AcceptanceError('case-cancelled'))
          else
            abort.signal.addEventListener(
              'abort',
              () => reject(new AcceptanceError('case-cancelled')),
              { once: true },
            )
        }),
      ])
      if (
        Object.keys(observed).some(
          (key) =>
            ![
              'status',
              'origin',
              'invocationState',
              'assertions',
              'artifacts',
              'process',
              'reason',
            ].includes(key),
        )
      )
        throw new AcceptanceError('unexpected-host-metadata')
      if (observed.artifacts.some((digest) => !captures.has(digest)))
        throw new AcceptanceError('artifact-not-captured-by-invocation')
      receipt = { ...observed, ...metadata, endedAt: this.now() }
      acceptanceShape(receipt, ACCEPTANCE_SCHEMAS.result)
      observedStopped = receipt.invocationState === 'stopped'
      this.validateResult(receipt, test, plan)
      if (abort.signal.aborted || this.now() >= deadline) {
        abort.abort()
        throw new AcceptanceError('case-cancelled')
      }
      this.authority(plan)
      const current = await boundary.observe(plan)
      if (!sameAcceptanceInputs(bindings, current)) throw new AcceptanceError('changed-case-inputs')
      this.authority(plan)
      if (abort.signal.aborted || this.now() >= deadline) {
        abort.abort()
        throw new AcceptanceError('case-cancelled')
      }
    } catch (error) {
      let stopped: 'stopped' | 'unknown' = !dispatched || observedStopped ? 'stopped' : 'unknown'
      if (stopped === 'unknown' && host.stop) {
        try {
          stopped = await Promise.race([
            host.stop(invocation),
            new Promise<'unknown'>((resolve) => {
              const timer = setTimeout(() => resolve('unknown'), 5000)
              timer.unref()
            }),
          ])
        } catch {}
      }
      receipt = {
        ...metadata,
        status: abort.signal.aborted ? 'interrupted' : 'unavailable',
        origin: 'controller-observation',
        invocationState: stopped,
        endedAt: this.now(),
        assertions: [],
        artifacts: [],
        reason: error instanceof AcceptanceError ? error.problem : 'host-observation-unavailable',
      }
    } finally {
      complete = true
      clearTimeout(timer)
      clearInterval(watch)
    }
    acceptanceShape(receipt, ACCEPTANCE_SCHEMAS.result)
    files.locked(() => {
      if (existsSync(files.path(`${path}/result.json`)))
        throw new AcceptanceError('case-result-already-recorded')
      files.atomic(`${path}/result.json`, `${JSON.stringify(receipt)}\n`)
    })
    return receipt
  }
  async recordHuman(
    digest: string,
    caseId: string,
    boundary: AcceptanceBoundary,
    input: {
      schema: 'wholeloop/acceptance-human-request@1'
      by: string
      note: string
      status: 'passed' | 'failed'
    },
  ) {
    acceptanceShape(input, ACCEPTANCE_SCHEMAS.humanRequest)
    const { plan } = this.get(digest),
      test = this.test(plan, caseId)
    if (test.owner !== 'human' || test.applicability !== 'applicable')
      throw new AcceptanceError('not-a-human-case')
    const bindings = await boundary.observe(plan)
    this.bindings(plan, bindings)
    const note: AcceptanceHumanNote = {
      schema: 'wholeloop/acceptance-human-note@1',
      sequence: 1,
      plan: digest,
      case: caseId,
      bindings,
      by: input.by,
      note: input.note,
      status: input.status,
      at: this.now(),
      origin: 'operator-note',
      provenance: boundary.provenance,
    }
    if (!input.by.trim() || !input.note.trim()) throw new AcceptanceError('empty-human-observation')
    const files = this.planning.sources.files
    files.locked(() => {
      note.sequence = this.humanNotes(digest, caseId).length + 1
      acceptanceShape(note, ACCEPTANCE_SCHEMAS.human)
      files.atomic(
        `delivery/acceptance-human/${digest}/${caseId}/${randomUUID()}.json`,
        `${JSON.stringify(note)}\n`,
      )
    })
    return note
  }
  async report(digest: string, boundary: AcceptanceBoundary): Promise<AcceptanceReport> {
    const { plan } = this.get(digest),
      bindings = await boundary.observe(plan)
    this.bindings(plan, bindings)
    let fixture = boundary.provenance === 'fixture'
    const cases: AcceptanceReport['cases'] = []
    for (const test of plan.cases) {
      if (test.applicability === 'not-applicable') {
        cases.push({ id: test.id, owner: test.owner, status: 'not-applicable', evidence: [] })
        continue
      }
      if (test.owner === 'human') {
        const notes = this.humanNotes(digest, test.id).sort((a, b) => a.sequence - b.sequence)
        const note = notes.at(-1)
        if (note?.provenance === 'fixture') fixture = true
        cases.push({
          id: test.id,
          owner: test.owner,
          status: !note
            ? 'pending-human'
            : !sameAcceptanceInputs(note.bindings, bindings)
              ? 'stale'
              : note.status,
          evidence: note ? [contractDigest(note)] : [],
        })
      } else {
        const results = this.results(digest, test.id).sort((a, b) => a.sequence - b.sequence)
        const result = results.at(-1)
        if (result?.provenance === 'fixture') fixture = true
        cases.push({
          id: test.id,
          owner: test.owner,
          status: !result
            ? 'unavailable'
            : !sameAcceptanceInputs(result.bindings, bindings)
              ? 'stale'
              : result.status,
          evidence: result ? [contractDigest(result)] : [],
        })
      }
    }
    const state = this.currentState(plan.run)
    if (state && (state.plans.at(-1)?.digest !== plan.plan || state.source !== plan.source))
      for (const entry of cases) {
        if (entry.status !== 'not-applicable') entry.status = 'stale'
      }
    const delivery = this.planning.getPlan(plan.run, plan.revision).plan
    const worst = (statuses: AcceptanceStatus[]): AcceptanceStatus =>
      (['stale', 'failed', 'interrupted', 'pending-human', 'unavailable'].find((s) =>
        statuses.includes(s as AcceptanceStatus),
      ) as AcceptanceStatus) ?? 'passed'
    const coverage = delivery.criteria.map((criterion) => {
      const matching = cases.filter(
        (c) =>
          c.status !== 'not-applicable' && this.test(plan, c.id).criteria.includes(criterion.id),
      )
      return {
        criterion: criterion.id,
        cases: matching.map((c) => c.id),
        status: worst(matching.map((c) => c.status as AcceptanceStatus)),
      }
    })
    const status = worst(coverage.map((c) => c.status))
    const receipt: AcceptanceReport = {
      schema: 'wholeloop/acceptance-report@1',
      plan: digest,
      bindings,
      at: this.now(),
      status,
      cases,
      coverage,
      acceptance:
        status !== 'passed'
          ? 'not-established'
          : fixture
            ? 'fixture-only'
            : cases.some((c) => c.owner === 'human')
              ? 'operator-and-machine'
              : 'delegated-machine',
      publication: 'not-performed',
    }
    acceptanceShape(receipt, ACCEPTANCE_SCHEMAS.report)
    return receipt
  }
  async seal(digest: string, boundary: AcceptanceBoundary) {
    const report = await this.report(digest, boundary)
    this.authority(this.get(digest).plan)
    const captured = this.artifacts.capture(
      this.get(digest).plan.run,
      Buffer.from(JSON.stringify(report)),
      'application/json',
    )
    return { report, ...captured }
  }
  private currentState(run: string) {
    try {
      return this.budgets.lifecycle.journal.get(run)
    } catch (error) {
      if (error instanceof DeliveryJournalError && error.problem === 'unknown-run') return undefined
      throw error
    }
  }
  private authority(plan: AcceptancePlan) {
    const state = this.budgets.lifecycle.journal.get(plan.run)
    const authority = state.grant
      ? this.budgets.lifecycle.authority.inspect(state.grant.id)
      : undefined
    if (
      authority?.status !== 'active' ||
      authority.digest !== state.grant?.digest ||
      !authority.grant.effects.includes('test.run') ||
      !authority.grant.effects.includes('report.write') ||
      !['planned', 'queued', 'running'].includes(state.state)
    )
      throw new AcceptanceError('inactive-acceptance-authority')
    if (
      state.plans.at(-1)?.digest !== plan.plan ||
      state.plans.at(-1)?.revision !== plan.revision ||
      state.source !== plan.source
    )
      throw new AcceptanceError('changed-delivery-basis')
    if (
      authority.grant.basis.kind === 'plan'
        ? authority.grant.basis.digest !== plan.plan
        : !authority.grant.decisions.includes('delivery-plan') ||
          !this.options.planAccepted?.(authority.digest, plan.plan)
    )
      throw new AcceptanceError('unaccepted-delivery-plan')
    if (this.budgets.inspect(plan.run).problem) throw new AcceptanceError('acceptance-budget')
  }
  private validateResult(result: AcceptanceCaseResult, test: AcceptanceCase, plan: AcceptancePlan) {
    if (
      result.status === 'passed' &&
      test.runner.kind === 'cli' &&
      (!result.process || !Number.isInteger(result.process.code))
    )
      throw new AcceptanceError('missing-observed-process')
    acceptanceTime(result.startedAt)
    acceptanceTime(result.endedAt)
    if (result.endedAt < result.startedAt) throw new AcceptanceError('invalid-observation-time')
    if (result.process) {
      acceptanceTime(result.process.startedAt)
      acceptanceTime(result.process.endedAt)
      if (
        result.process.startedAt < result.startedAt ||
        result.process.endedAt > result.endedAt ||
        result.process.endedAt < result.process.startedAt
      )
        throw new AcceptanceError('process-observation-time')
    }
    if (
      new Set(result.assertions.map((a) => a.id)).size !== result.assertions.length ||
      result.assertions.some((a) => !test.assertions.some((expected) => expected.id === a.id))
    )
      throw new AcceptanceError('unexpected-assertion')
    for (const digest of result.artifacts) this.artifacts.read(plan.run, digest)
    if (result.assertions.some((a) => !result.artifacts.includes(a.evidence)))
      throw new AcceptanceError('assertion-artifact-missing')
    if (
      result.status === 'passed' &&
      (result.invocationState !== 'stopped' ||
        result.assertions.length !== test.assertions.length ||
        result.assertions.some((a) => a.status !== 'passed'))
    )
      throw new AcceptanceError('incomplete-case-coverage')
  }
  private results(digest: string, caseId: string): AcceptanceCaseResult[] {
    const files = this.planning.sources.files,
      base = this.casePath(digest, caseId)
    if (!existsSync(files.path(base))) return []
    return readdirSync(files.path(base))
      .sort()
      .flatMap((key) => {
        this.key(key)
        const path = `${base}/${key}/result.json`
        return existsSync(files.path(path))
          ? [this.result(path, digest, this.test(this.get(digest).plan, caseId))]
          : []
      })
  }
  private result(path: string, digest: string, test: AcceptanceCase) {
    const result = this.read(path, ACCEPTANCE_SCHEMAS.result) as unknown as AcceptanceCaseResult
    const intent = this.read(
      path.replace(/result\.json$/, 'intent.json'),
      ACCEPTANCE_SCHEMAS.intent,
    )
    if (
      result.plan !== digest ||
      result.case !== test.id ||
      result.key !== intent.key ||
      result.sequence !== intent.sequence ||
      result.startedAt < String(intent.at) ||
      (result.status === 'passed' &&
        (result.startedAt > String(intent.deadline) || result.endedAt > String(intent.deadline))) ||
      result.invocation !== intent.invocation ||
      contractDigest(result.bindings) !== contractDigest(intent.bindings) ||
      contractDigest(result.host) !== contractDigest(intent.host) ||
      result.provenance !== intent.provenance
    )
      throw new AcceptanceError('changed-case-binding')
    this.validateResult(result, test, this.get(digest).plan)
    return result
  }
  private humanNotes(digest: string, caseId: string) {
    const files = this.planning.sources.files,
      path = `delivery/acceptance-human/${digest}/${caseId}`
    if (!existsSync(files.path(path))) return []
    return readdirSync(files.path(path))
      .sort()
      .map((name) => {
        if (!/^[a-f0-9-]{36}\.json$/.test(name)) throw new AcceptanceError('unknown-human-record')
        const note = this.read(
          `${path}/${name}`,
          ACCEPTANCE_SCHEMAS.human,
        ) as unknown as AcceptanceHumanNote
        if (note.plan !== digest || note.case !== caseId)
          throw new AcceptanceError('changed-human-binding')
        acceptanceTime(note.at)
        return note
      })
  }
  private readPlan(path: string, expected?: string) {
    const value = this.read(path, ACCEPTANCE_SCHEMAS.record) as unknown as {
      digest: string
      plan: AcceptancePlan
    }
    if (value.digest !== contractDigest(value.plan) || (expected && expected !== value.digest))
      throw new AcceptanceError('plan-record-damaged')
    validateAcceptancePlan(
      value.plan,
      this.planning.getPlan(value.plan.run, value.plan.revision).plan,
    )
    return { digest: value.digest, plan: value.plan }
  }
  private read(path: string, schema: Parameters<typeof acceptanceShape>[1]) {
    const value = JSON.parse(
      readSourceFile(this.planning.sources.files.root, path, 8 * 1024 * 1024),
    ) as Record<string, unknown>
    acceptanceShape(value, schema)
    return value
  }
  private bindings(plan: AcceptancePlan, value: AcceptanceBindings) {
    acceptanceShape(value, ACCEPTANCE_SCHEMAS.result.properties.bindings)
    const repositories = this.planning
      .getPlan(plan.run, plan.revision)
      .plan.repositories.map((r) => r.id)
      .sort()
    if (
      contractDigest(value.candidates.map((c) => c.repository).sort()) !==
      contractDigest(repositories)
    )
      throw new AcceptanceError('candidate-repository-mismatch')
  }
  private host(host: AcceptanceHost) {
    return { id: host.id, version: host.version, capability: host.capability }
  }
  private digest(value: string) {
    if (!/^[a-f0-9]{64}$/.test(value)) throw new AcceptanceError('invalid-digest')
  }
  private key(value: string) {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(value)) throw new AcceptanceError('invalid-key')
  }
  private test(plan: AcceptancePlan, id: string) {
    this.key(id)
    const value = plan.cases.find((c) => c.id === id)
    if (!value) throw new AcceptanceError('unknown-case')
    return value
  }
  private casePath(digest: string, caseId: string) {
    this.digest(digest)
    this.key(caseId)
    return `delivery/acceptance-cases/${digest}/${caseId}`
  }
}
