// The operator report: outcomes, next actions, diagnostics and recovery bundles.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { contractDigest } from '../contracts/compatibility.js'
import type { AuthorizationReceipt } from '../delivery/authority.js'
import { DeliveryBudgets } from '../delivery/budgets.js'
import { deliveryEffects } from '../delivery/effect-events.js'
import type { DeliveryEvent, DeliveryOutcome, DeliveryProjection } from '../delivery/events.js'
import { DeliveryLifecycle } from '../delivery/lifecycle.js'
import { VERSION } from '../version.js'
import { git } from '../worktrees/git.js'
import { deliveryRunner } from './events.js'
import { DeliveryRunnerError } from './route.js'

export type OutcomeCategory =
  | 'report'
  | 'code'
  | 'pr'
  | 'queue'
  | 'merge'
  | 'partial'
  | 'blocked'
  | 'failed'
  | 'exhausted'
  | 'stopped'
  | 'in-progress'
const CATEGORY: Record<DeliveryOutcome, OutcomeCategory> = {
  'research-report-complete': 'report',
  'learning-recorded': 'report',
  'completed-with-unknowns': 'report',
  'code-ready': 'code',
  'draft-pr': 'pr',
  'ready-pr': 'pr',
  'merge-queued': 'queue',
  merged: 'merge',
  partial: 'partial',
  blocked: 'blocked',
  failed: 'failed',
  exhausted: 'exhausted',
  stopped: 'stopped',
}
/** Every terminal receipt maps to exactly one operator-visible category. */
export function outcomeCategory(outcome: DeliveryOutcome | undefined): OutcomeCategory {
  return outcome ? CATEGORY[outcome] : 'in-progress'
}
const runId = (run: string) => {
  if (!/^delivery-[a-f0-9]{16}$/.test(run)) throw new DeliveryRunnerError('operator-run')
  return run
}
/** Exact next commands permitted from a state; an empty list means none. */
export function nextActions(
  state: DeliveryProjection,
  requests: readonly string[],
  unresolved: boolean,
  activeAuthority = false,
) {
  if (!requests.length)
    return [
      'planned',
      'queued',
      'running',
      'waiting-input',
      'waiting-external',
      'paused',
      'stopping',
    ].includes(state.state) || unresolved
      ? [`wl delivery status --run ${state.run}`]
      : []
  const owned =
    state.facets.find((facet) => facet.schema === 'wholeloop/delivery-runner@1')?.records ?? []
  const unsettled = owned.some(
    (record) =>
      ['active', 'unknown'].includes(record.ownership) ||
      record.stages.some((stage) =>
        ['prepared', 'running', 'pending', 'unknown'].includes(stage.status),
      ),
  )
  const actions: string[] = [],
    each = (verb: string, extra = '') =>
      requests.map((digest) => `wl delivery ${verb} --digest ${digest}${extra}`)
  if (activeAuthority && !unsettled && ['planned', 'queued'].includes(state.state))
    actions.push(...each('run'))
  if (['planned', 'queued', 'running', 'waiting-external'].includes(state.state))
    actions.push(...each('pause', ' --operator <name>'), ...each('stop', ' --operator <name>'))
  if (state.state === 'paused')
    actions.push(
      ...(activeAuthority && !unsettled ? each('resume', ' --operator <name>') : []),
      ...each('stop', ' --operator <name>'),
    )
  if (state.state === 'waiting-input')
    actions.push(
      ...(activeAuthority
        ? each(
            'human-decide',
            ' --stage <stage> --decision <id> --subject <sha256> --outcome <accept|reject> --operator <name>',
          )
        : []),
      ...each('stop', ' --operator <name>'),
    )
  if (state.state === 'stopping') actions.push(...each('reconcile'))
  if (unsettled || unresolved || ['running', 'waiting-external'].includes(state.state))
    actions.push(...each('reconcile'))
  // ADR-0197: a retained integration or acceptance failure may be continued by a
  // correction revision; the preview names the failure, the owning unit is chosen.
  if (activeAuthority && ['failed', 'blocked'].includes(state.state))
    for (const record of deliveryRunner(state).records)
      for (const stage of record.stages)
        if (
          stage.basis === state.basis.digest &&
          ['failed', 'blocked'].includes(stage.status) &&
          (stage.id === 'acceptance' || stage.id.startsWith('integration:'))
        )
          actions.push(
            `wl delivery continue --run ${state.run} --request ${record.request} --stage ${stage.id} --unit <work-id>`,
          )
        else if (
          stage.basis === state.basis.digest &&
          stage.id === 'ci' &&
          stage.status === 'failed' &&
          !stage.origin &&
          stage.provenance === 'host-observed' &&
          stage.runtime?.backend === 'owned-core'
        )
          actions.push(
            `wl delivery continue-ci --run ${state.run} --request ${record.request} --unit <work-id>`,
          )
  return [...new Set(actions)]
}

/** Read-only: replays the journal and changes nothing. */
export function deliveryReport(root: string | undefined, run: string, now?: () => string) {
  const { state, events, authority, report } = new DeliveryBudgets(root, now).reportObservation(
    runId(run),
  )
  return projectDeliveryReport(state, events, authority ?? undefined, report.problem)
}

/** Project one exact validated snapshot without additional reads or mutations. */
export function projectDeliveryReport(
  original: DeliveryProjection,
  journal: readonly DeliveryEvent[],
  grant: AuthorizationReceipt | undefined,
  budgetProblem: string | null,
) {
  const state = structuredClone(original),
    run = state.run,
    events = journal.filter((event) => event.run === run),
    effects = deliveryEffects(state).records,
    runner = deliveryRunner(state).records,
    transitions = events.flatMap((event) =>
      event.payload.schema === 'wholeloop/delivery-control-event@1'
        ? [{ to: event.payload.to, ts: event.ts }]
        : [],
    ),
    unresolved =
      effects.some((effect) => ['pending', 'unknown'].includes(effect.status)) ||
      runner.some((record) =>
        record.stages.some((stage) =>
          ['prepared', 'running', 'pending', 'unknown'].includes(stage.status),
        ),
      )
  return {
    schema: 'wholeloop/delivery-report@1' as const,
    run,
    state: state.state,
    outcome: state.outcome ?? null,
    category: outcomeCategory(state.outcome),
    endpoint: state.policy.endpoint,
    intervention: state.policy.intervention,
    plan: {
      kind: state.basis.kind,
      revision: state.basis.revision ?? null,
      digest: state.basis.digest,
    },
    grant: grant
      ? { id: grant.grant.id, status: grant.status, expiresAt: grant.grant.expiresAt }
      : null,
    stages: runner.flatMap((record) =>
      record.stages.map((stage) => ({
        request: record.request,
        id: stage.id,
        status: stage.status,
        ...(stage.origin ? { reusedFrom: stage.origin.request } : {}),
      })),
    ),
    // Each correction revision names the failure it continues from (ADR-0193).
    continuations: (deliveryRunner(state).continuations ?? []).map((entry) => ({
      revision: entry.revision,
      predecessor: entry.request,
      stage: entry.stage,
      failure: entry.failure,
    })),
    effects: effects.map((effect) => ({
      operation: effect.intent.operation,
      status: effect.status,
      ...(effect.intent.repository ? { repository: effect.intent.repository } : {}),
    })),
    waits: {
      human: transitions.filter((entry) => entry.to === 'waiting-input').length,
      external: transitions.filter((entry) => entry.to === 'waiting-external').length,
    },
    unresolved,
    next: nextActions(
      state,
      runner
        .filter((record) => record.basis === state.basis.digest)
        .map((record) => record.request),
      unresolved,
      budgetProblem === null &&
        grant?.status === 'active' &&
        grant.digest === state.grant?.digest &&
        grant.grant.id === state.grant?.id,
    ),
    updatedAt: state.updatedAt,
  }
}

const SAFE = /^[a-z][a-z0-9-]{0,63}$/
/** Redacted by construction: categories, digests and enumerated states only. */
export function deliveryDiagnostics(root: string | undefined, run: string) {
  const lifecycle = new DeliveryLifecycle(root),
    snapshot = lifecycle.journal.runSnapshot(runId(run)),
    state = snapshot.state,
    events = snapshot.events.filter((event) => event.run === run),
    category = (event: DeliveryEvent) => {
      const payload = event.payload as unknown as Record<string, unknown>,
        kind = String(payload.schema ?? '').replace(/^wholeloop\/delivery-|@1$/g, ''),
        action =
          typeof payload.action === 'string' && SAFE.test(payload.action)
            ? payload.action
            : undefined,
        to = typeof payload.to === 'string' && SAFE.test(payload.to) ? payload.to : undefined
      return {
        kind: SAFE.test(kind) ? kind : 'unrecognized',
        ...(action ? { action } : {}),
        ...(to ? { to } : {}),
      }
    }
  return {
    schema: 'wholeloop/delivery-diagnostics@1' as const,
    core: VERSION,
    run,
    state: state.state,
    outcome: state.outcome ?? null,
    events: events.map((event) => ({
      sequence: event.sequence,
      ts: event.ts,
      actor: event.actor.kind,
      digest: event.digest,
      ...category(event),
    })),
    effects: deliveryEffects(state).records.map((effect) => ({
      operation: effect.intent.operation,
      status: effect.status,
    })),
    excluded: [
      'prompts',
      'conversations',
      'environment',
      'source-content',
      'provider-responses',
      'credentials',
      'reasons',
    ],
  }
}

interface BundleFile {
  path: string
  bytes: number
  sha256: string
}
interface BundleManifest {
  schema: 'wholeloop/delivery-recovery-bundle@1'
  run: string
  core: string
  files: BundleFile[]
  authority: 'not-restored'
}
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
function listFiles(base: string, directory: string): string[] {
  const absolute = join(base, directory)
  if (!existsSync(absolute)) return []
  return readdirSync(absolute, { withFileTypes: true })
    .flatMap((entry) => {
      const path = `${directory}/${entry.name}`
      if (entry.isSymbolicLink()) throw new DeliveryRunnerError('recovery-bundle-link')
      if (entry.isDirectory()) return listFiles(base, path)
      return entry.isFile() && !entry.name.endsWith('.tmp') ? [path] : []
    })
    .sort()
}

/**
 * An explicit private bundle: the journal plus the run's plans and artifacts,
 * each with its checksum. It is never produced by default diagnostics.
 */
export function exportRecoveryBundle(root: string, run: string, out: string) {
  const store = resolve(root)
  new DeliveryLifecycle(store).journal.get(runId(run))
  const target = resolve(out)
  if (existsSync(target)) throw new DeliveryRunnerError('recovery-bundle-exists')
  const paths = [
      ...listFiles(store, 'delivery/journal'),
      ...listFiles(store, `delivery/plans/${run}`),
      ...listFiles(store, `delivery/artifacts/${run}`),
    ],
    files: BundleFile[] = []
  let total = 0
  for (const path of paths) {
    const bytes = readFileSync(join(store, path))
    total += bytes.length
    if (total > 512 * 1024 * 1024) throw new DeliveryRunnerError('recovery-bundle-size')
    mkdirSync(dirname(join(target, 'files', path)), { recursive: true, mode: 0o700 })
    writeFileSync(join(target, 'files', path), bytes, { mode: 0o600 })
    files.push({ path, bytes: bytes.length, sha256: hash(bytes) })
  }
  const manifest: BundleManifest = {
    schema: 'wholeloop/delivery-recovery-bundle@1',
    run,
    core: VERSION,
    files,
    authority: 'not-restored',
  }
  writeFileSync(join(target, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, {
    mode: 0o600,
  })
  return { manifest: contractDigest(manifest), files: files.length, bytes: total }
}

/**
 * Verify every byte, require each plan repository to be rebound to a local
 * repository holding its base, and copy the records into an inert archive. Live
 * journal, claims and grants of the target store are never touched.
 */
export function importRecoveryBundle(
  bundle: string,
  root: string,
  rebind: Readonly<Record<string, string>>,
) {
  const source = resolve(bundle),
    manifest = JSON.parse(readFileSync(join(source, 'manifest.json'), 'utf8')) as BundleManifest
  if (
    manifest.schema !== 'wholeloop/delivery-recovery-bundle@1' ||
    manifest.authority !== 'not-restored' ||
    !Array.isArray(manifest.files)
  )
    throw new DeliveryRunnerError('recovery-bundle-manifest')
  runId(manifest.run)
  const listed = new Set(manifest.files.map((file) => file.path))
  for (const path of listFiles(source, 'files').map((path) => path.replace(/^files\//, '')))
    if (!listed.has(path)) throw new DeliveryRunnerError('recovery-bundle-unlisted-file')
  for (const file of manifest.files) {
    const path = resolve(source, 'files', file.path)
    if (
      relative(join(source, 'files'), path).startsWith('..') ||
      !existsSync(path) ||
      !statSync(path).isFile()
    )
      throw new DeliveryRunnerError('recovery-bundle-file')
    const bytes = readFileSync(path)
    if (bytes.length !== file.bytes || hash(bytes) !== file.sha256)
      throw new DeliveryRunnerError('recovery-bundle-tampered')
  }
  const plans = manifest.files
    .filter((file) => file.path.startsWith(`delivery/plans/${manifest.run}/`))
    .map(
      (file) =>
        JSON.parse(readFileSync(join(source, 'files', file.path), 'utf8')) as {
          value?: { repositories?: { id: string; base: string }[] }
        },
    )
  const repositories = new Map<string, string>()
  for (const plan of plans)
    for (const repository of plan.value?.repositories ?? [])
      repositories.set(repository.id, repository.base)
  if (!plans.length) throw new DeliveryRunnerError('recovery-bundle-plan-missing')
  const bindings: { repository: string; path: string; base: string }[] = []
  for (const [id, base] of [...repositories].sort()) {
    const path = rebind[id]
    if (!path) throw new DeliveryRunnerError('recovery-bundle-rebinding-required')
    try {
      git(resolve(path), ['cat-file', '-e', `${base}^{commit}`])
    } catch {
      throw new DeliveryRunnerError('recovery-bundle-rebinding-base')
    }
    bindings.push({ repository: id, path: resolve(path), base })
  }
  if (Object.keys(rebind).some((id) => !repositories.has(id)))
    throw new DeliveryRunnerError('recovery-bundle-rebinding-unknown')
  const digest = contractDigest(manifest),
    archive = join(resolve(root), 'delivery/imports', digest)
  if (existsSync(archive)) throw new DeliveryRunnerError('recovery-bundle-already-imported')
  for (const file of manifest.files) {
    mkdirSync(dirname(join(archive, 'files', file.path)), { recursive: true, mode: 0o700 })
    writeFileSync(
      join(archive, 'files', file.path),
      readFileSync(join(source, 'files', file.path)),
      { mode: 0o600 },
    )
  }
  const record = {
    schema: 'wholeloop/delivery-recovery-import@1' as const,
    bundle: digest,
    run: manifest.run,
    bindings,
    authority: 'not-restored' as const,
    claims: 'not-restored' as const,
  }
  writeFileSync(join(archive, 'import.json'), `${JSON.stringify(record, null, 2)}\n`, {
    mode: 0o600,
  })
  return record
}
