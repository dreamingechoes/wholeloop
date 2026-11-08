// Runs every low-quota native check for one installed client and writes a receipt plus a handoff.
// Without --live it only observes the version and prints the plan; no model is called.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { openCodeVersionProbe, versionProbe } from '../../../src/diagnostics/doctor.js'
import { framingProbe } from './framing.js'
import { CLIENTS, parseArguments, probePlan } from './plan.js'
import { readonlyProbe } from './readonly.js'
import { type ProbeOutcome, type Receipt, writeReceipt } from './receipt.js'

const args = parseArguments(process.argv.slice(2))
const root = process.cwd(),
  core = join(root, 'dist', 'wl.mjs'),
  { binary } = CLIENTS[args.client],
  started = new Date().toISOString()
const head = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' })
const dirty = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' })
const source =
  head.status === 0 ? `${head.stdout.trim()}${dirty.stdout.trim() ? '+dirty' : ''}` : null

const controller = new AbortController()
process.once('SIGINT', () => controller.abort())
process.once('SIGTERM', () => controller.abort())

const observed = args.client === 'opencode' ? openCodeVersionProbe() : versionProbe(binary)
const version = observed.status === 'observed' ? (observed.version ?? null) : null
const outcomes: ProbeOutcome[] = []
for (const probe of probePlan(args.client, args.probes)) {
  const outcome: ProbeOutcome = {
    id: probe.id,
    tasks: probe.tasks,
    cost: probe.cost,
    status: 'UNRUN',
    reasons: [],
  }
  outcomes.push(outcome)
  if (probe.id === 'version') {
    outcome.status = version ? 'OBSERVED' : 'BLOCKED'
    outcome.reasons = [
      version
        ? `Observed ${binary} ${version}.`
        : `No version observed (${observed.reason ?? 'unknown'}).`,
    ]
    continue
  }
  if (!args.live) {
    outcome.reasons = [`Not run: add --live to spend ${probe.cost}.`]
    continue
  }
  if (!version) {
    outcome.status = 'BLOCKED'
    outcome.reasons = ['Skipped: the client version was not observed.']
    continue
  }
  if (controller.signal.aborted) {
    outcome.reasons = ['Not run: cancelled.']
    continue
  }
  console.error(`Running ${probe.id} on ${binary} ${version} (${probe.cost})…`)
  if (probe.id === 'readonly') {
    const result = await readonlyProbe({
      client: args.client,
      version,
      timeoutMs: args.timeoutSeconds * 1000,
      signal: controller.signal,
    })
    outcome.status = result.status
    outcome.reasons = result.reasons
    outcome.details = { ...result }
  } else {
    if (!existsSync(core)) {
      outcome.status = 'BLOCKED'
      outcome.reasons = ['dist/wl.mjs is missing; run npm run build first.']
      continue
    }
    const result = await framingProbe({
      core,
      client: args.client,
      version,
      timeoutMs: Math.max(args.timeoutSeconds, 600) * 1000,
      signal: controller.signal,
    })
    outcome.status = result.status
    outcome.reasons = result.reasons
    outcome.details = { ...result }
  }
}

const receipt: Receipt = {
  schema: 'wholeloop/native-check@1',
  client: args.client,
  binary,
  version,
  platform: { os: process.platform, arch: process.arch, node: process.version },
  source,
  live: args.live,
  started,
  finished: new Date().toISOString(),
  probes: outcomes,
}
const directory =
  args.evidence ??
  join(
    homedir(),
    '.local',
    'state',
    'wholeloop-native-checks',
    `${args.client}-${started.replace(/[:.]/g, '-')}`,
  )
writeReceipt(directory, receipt)
for (const outcome of outcomes)
  console.log(
    `${outcome.id.padEnd(9)} ${outcome.status.padEnd(12)} ${outcome.tasks.join(', ').padEnd(14)} ${outcome.reasons.join(' ')}`,
  )
console.log(`\nReceipt and handoff: ${directory}`)
process.exitCode = outcomes.some((outcome) => outcome.status === 'FAIL') ? 1 : 0
