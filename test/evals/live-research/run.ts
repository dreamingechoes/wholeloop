import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import type { DecisionRubric } from '../../../src/decisions/policy.js'
import { sourceHash } from '../../../src/delivery/input.js'
import { REFERENCE_NATIVE_VERSIONS } from '../../../src/delivery/native-adapters.js'
import type { NativeBindings } from '../../../src/delivery/native-bindings.js'
import type { NativeRuntime } from '../../../src/delivery/native-runtime.js'
import { DEFAULT_DELIVERY_BUDGETS, type DeliveryPlan } from '../../../src/delivery/plan.js'
import { DeliveryPlanning } from '../../../src/delivery/planning-store.js'
import { publicRunnerIdentity } from '../../../src/runner/public-host.js'
import { type RunnerRequest, RunnerStore } from '../../../src/runner/store.js'

/**
 * Live EVAL-10 trial (P6-27): one none-policy research route on a real
 * reference client through the public `wl delivery run`, with the operator's
 * documents. It spends model quota, so it refuses to start without
 * WHOLELOOP_LIVE_CONFIRM=spend-quota. Every outcome is reported, never retried.
 */
if (process.env.WHOLELOOP_LIVE_CONFIRM !== 'spend-quota')
  throw new Error('Set WHOLELOOP_LIVE_CONFIRM=spend-quota to run a live trial that spends quota')
const target = (process.env.WHOLELOOP_LIVE_TARGET ?? 'claude') as 'claude' | 'codex',
  model = process.env.WHOLELOOP_LIVE_MODEL,
  client = process.env.WHOLELOOP_LIVE_CLIENT,
  question = process.env.WHOLELOOP_LIVE_QUESTION
assert.ok(model && client && question, 'Set WHOLELOOP_LIVE_MODEL, _CLIENT and _QUESTION')
assert.ok(!question.includes('\n') && question.length <= 400, 'Ask one bounded question')
const cli = resolve('dist/wl.mjs'),
  home = realpathSync(
    process.env.WHOLELOOP_LIVE_HOME ??
      join(homedir(), '.local', 'state', 'wholeloop-native', target),
  ),
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-live-research-'))),
  state = join(dir, 'state'),
  run = `delivery-${randomBytes(8).toString('hex')}`
const wl = (args: string[], timeout = 60000) => {
  const result = spawnSync(process.execPath, [cli, ...args, '--json'], {
    cwd: dir,
    encoding: 'utf8',
    timeout,
    maxBuffer: 16 * 1024 * 1024,
  })
  return {
    code: result.status,
    value: result.stdout ? (JSON.parse(result.stdout) as Record<string, unknown>) : null,
    errors: result.stderr.slice(0, 4000),
  }
}

const planning = new DeliveryPlanning(state),
  files = planning.sources.files,
  source = planning.sources.capture(
    {
      schema: 'wholeloop/delivery-source-request@1',
      kind: 'inline',
      ref: 'eval-10',
      body: question,
      mapping: [{ id: 'answer', role: 'criterion', startLine: 1, endLine: 1 }],
    },
    dir,
  )
const delegations = (['research-plan', 'research-sources'] as const).map((id) => {
  const rubric: DecisionRubric = {
      schema: 'wholeloop/delegated-decision-rubric@1',
      decision: id,
      purpose:
        id === 'research-plan'
          ? 'Accept a research plan only when its angles can answer the pinned question from public sources.'
          : 'Accept the source work only when every retained claim cites public evidence and refuted or unsupported claims stay visible.',
      // A plan has no claims yet, so its judge gets plan-scoped rules. With the
      // claim rules below, Codex's plan judge on gpt-6-luna rejected a plan for
      // carrying no citations, which only the brief can have (ADR-0206).
      rules:
        id === 'research-plan'
          ? [
              {
                id: 'coverage',
                text: 'The angles together reach every part of the pinned question and say how public evidence will be found.',
              },
              {
                id: 'honesty',
                text: 'The plan keeps missing or contradictory evidence as open questions instead of deciding them in advance.',
              },
            ]
          : [
              {
                id: 'coverage',
                text: 'Every retained load-bearing claim needs cited public evidence.',
              },
              { id: 'honesty', text: 'Missing or contradictory evidence stays an open question.' },
            ],
      outcomes: ['accept', 'reject'],
      // Uncertainties a public-web answer can honestly carry; the judges are told
      // these IDs, and any other uncertainty still blocks the decision.
      unknowns: {
        allowed: ['source-currency', 'coverage-gap', 'conflicting-sources', 'access-limited'],
        defaults: [],
      },
      timeoutMs: 900000,
    },
    text = JSON.stringify(rubric)
  files.atomic(`rubrics/${id}.json`, text)
  return {
    id,
    rubric: { ref: `rubrics/${id}.json`, sha256: sourceHash(text) },
    evidence: ['production'],
    fallback: 'complete-with-unknowns' as const,
  }
})
const plan: DeliveryPlan = {
  schema: 'wholeloop/delivery-plan@1',
  run,
  revision: 1,
  source: source.id,
  owner: 'Campaign Owner',
  scope: {
    outcomes: [{ id: 'answer', text: 'Answer the pinned question from cited public sources.' }],
    exclusions: ['No code, publication or account-bound source.'],
  },
  repositories: [],
  guidance: [],
  policy: {
    endpoint: 'research-report',
    intervention: 'none',
    uncertainty: 'complete-with-unknowns',
    delegations,
  },
  budgets: { ...DEFAULT_DELIVERY_BUDGETS },
  capabilities: [],
  definition: { ready: true, missing: [] },
  criteria: [
    {
      id: 'answer',
      text: question,
      test: 'Read the stored brief; every retained claim cites public evidence.',
      outcomes: ['answer'],
      acceptance: 'machine',
    },
  ],
  work: [
    {
      id: 'background',
      role: 'research',
      criteria: ['answer'],
      after: [],
      consumes: [],
      produces: [],
    },
  ],
  milestones: [
    {
      id: 'report',
      work: ['background'],
      criteria: ['answer'],
      after: [],
      procedure: 'Read the stored research brief.',
    },
  ],
}
const store = new RunnerStore(state),
  prepared = planning.preparePlan(plan),
  grant = store.lifecycle.authority.authorize({
    schema: 'wholeloop/delivery-authorization-request@1',
    id: `authorization-${randomBytes(8).toString('hex')}`,
    operator: 'Campaign Owner',
    basis: { kind: 'plan', digest: prepared.digest, run, revision: 1 },
    effects: ['source.read', 'report.write'],
    decisions: ['research-plan', 'research-sources'],
    repositories: [],
    reads: [],
    effectLimit: 20,
  })
store.lifecycle.track({ run, revision: 1, grant: grant.grant.id })
const bindings: NativeBindings = {
    schema: 'wholeloop/native-bindings@1',
    bindings: [
      {
        target,
        version: REFERENCE_NATIVE_VERSIONS[target],
        model,
        roles: ['planner', 'challenger', 'researcher'],
      },
    ],
  },
  // WHOLELOOP_LIVE_CREDENTIAL names an API-key item stored with
  // `wl delivery credential-store`, so P6-35's missing, invalid and injected
  // credential trials run through the same route as the campaign. Without it
  // the client keeps its own sign-in in the dedicated home. A credential
  // replaces the home: the controller gives each launch a disposable one.
  credential = process.env.WHOLELOOP_LIVE_CREDENTIAL,
  runtime: NativeRuntime = {
    schema: 'wholeloop/native-runtime@1',
    clients: [
      credential
        ? {
            target,
            client: realpathSync(client),
            credential: {
              store: process.platform === 'darwin' ? 'macos-keychain' : 'secret-service',
              item: credential,
              kind: 'api-key',
            },
          }
        : { target, client: realpathSync(client), store: home },
    ],
  }
writeFileSync(join(dir, 'bindings.json'), JSON.stringify(bindings))
writeFileSync(join(dir, 'runtime.json'), JSON.stringify(runtime))
const request: RunnerRequest = {
  schema: 'wholeloop/delivery-runner-request@1',
  key: 'eval-10',
  run,
  revision: 1,
  plan: prepared.digest,
  grant: grant.grant.id,
  host: publicRunnerIdentity(bindings, runtime),
  pollMs: 1000,
}
writeFileSync(join(dir, 'request.json'), JSON.stringify(request))
const digest = contractDigest(request),
  documents = ['--bindings', 'bindings.json', '--runtime', 'runtime.json', '--root', dir],
  prepare = wl([
    'delivery',
    'runner-prepare',
    '--file',
    'request.json',
    '--root',
    dir,
    '--store',
    state,
  ])
assert.equal(prepare.code, 0, prepare.errors)
console.log(
  JSON.stringify({ retained: dir, run, digest, target, model, started: new Date().toISOString() }),
)
const started = Date.now(),
  result = wl(
    ['delivery', 'run', '--digest', digest, ...documents, '--store', state],
    5 * 3600 * 1000,
  ),
  seconds = Math.round((Date.now() - started) / 1000)

// Every native receipt the run retained, whatever its outcome.
const receipts: Record<string, unknown>[] = []
const walk = (path: string) => {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const full = join(path, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (entry.name.startsWith('receipt-') && entry.name.endsWith('.json'))
      receipts.push(JSON.parse(readFileSync(full, 'utf8')) as Record<string, unknown>)
  }
}
try {
  walk(join(state, 'delivery', 'native'))
} catch {
  /* No native launch happened; the report says so. */
}

const KEYS = [
  'inputTokens',
  'outputTokens',
  'cacheReadTokens',
  'cacheCreationTokens',
  'costMicros',
] as const
function totalUsage(receipts: readonly Record<string, unknown>[]) {
  const total: Record<(typeof KEYS)[number] | 'unreported', number> = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    costMicros: 0,
    unreported: 0,
  }
  for (const receipt of receipts) {
    const usage = receipt.usage as Partial<Record<(typeof KEYS)[number], number>> | undefined
    if (!usage) total.unreported++
    else for (const key of KEYS) total[key] += usage[key] ?? 0
  }
  return { provenance: 'client-reported', ...total }
}
const states = store.lifecycle.journal
    .events()
    .filter((event) => event.run === run)
    .flatMap((event) => ('to' in event ? [event.to] : [])),
  report = {
    schema: 'wholeloop/live-trial@1',
    scenario: 'EVAL-10',
    target,
    version: REFERENCE_NATIVE_VERSIONS[target],
    model,
    run,
    digest,
    seconds,
    exit: result.code,
    status: result.value?.status ?? null,
    preflight: result.value?.preflight ?? null,
    errors: result.errors,
    // Intervention comes from controller state, never from the model's claim.
    humanWaits: states.filter((to) => to === 'waiting-input').length,
    native: receipts.map((receipt) => ({
      status: receipt.status,
      reason: receipt.reason ?? null,
      version: receipt.version,
      model: receipt.model,
      provenance: (receipt.observation as { provenance?: string } | undefined)?.provenance ?? null,
      usage: receipt.usage ?? null,
    })),
    // Client-reported, never metered: a launch without a report counts as unknown.
    usage: totalUsage(receipts),
  }
mkdirSync(join(dir, 'results'), { recursive: true })
writeFileSync(join(dir, 'results', 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(
  JSON.stringify({
    ...report,
    status: (report.status as { state?: string } | null)?.state ?? null,
    native: report.native.length,
  }),
)
