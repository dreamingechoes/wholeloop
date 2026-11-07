// Summaries over profiles written by preload.mjs (P7-04). Pure functions over
// the profile directory; shared by route.mjs and compare.mjs.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROLES = new Set(['wl.mjs', 'wl-runner.mjs', 'runner.mjs'])

export function profiles(directory) {
  return readdirSync(directory)
    .filter((name) => /^profile-\d+\.json$/.test(name))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(directory, name), 'utf8')))
}

const calls = (counts, test) =>
  Object.entries(counts ?? {})
    .filter(([name]) => test(name))
    .reduce((total, [, entry]) => total + entry.calls, 0)

/** Per-phase wall time from transitions, plus the counters that dominated the P6-39 audit. */
export function phaseTable(profile) {
  const wall = {}
  let phase = 'bootstrap',
    begin = 0
  for (const transition of profile.transitions) {
    wall[phase] = (wall[phase] ?? 0) + transition.milliseconds - begin
    begin = transition.milliseconds
    phase = transition.phase
  }
  wall[phase] = (wall[phase] ?? 0) + profile.wallMilliseconds - begin
  return Object.keys({ ...wall, ...profile.phases }).map((name) => {
    const counts = profile.phases[name] ?? {}
    return {
      phase: name,
      seconds: Number(((wall[name] ?? 0) / 1000).toFixed(3)),
      git: calls(counts, (key) => key.startsWith('process.') && key.includes('.git.')),
      docker: calls(counts, (key) => key.startsWith('process.') && key.includes('.docker.')),
      fsync: calls(counts, (key) => key === 'fs.fsyncSync'),
      lstat: calls(counts, (key) => key === 'fs.lstatSync'),
      exists: calls(counts, (key) => key === 'fs.existsSync'),
      json: calls(counts, (key) => key.startsWith('JSON.')),
    }
  })
}

export function topCallers(profile, limit = 20) {
  return Object.entries(profile.callers ?? {})
    .map(([key, entry]) => ({
      caller: key.slice(key.indexOf(' @ ') + 3),
      operation: entry.operation,
      phase: entry.phase,
      calls: entry.calls,
    }))
    .sort((a, b) => b.calls - a.calls || a.caller.localeCompare(b.caller))
    .slice(0, limit)
}

/** The controller processes only: the CLI parent, the runner bundle and a bundled eval runner. */
export function controllers(directory) {
  return profiles(directory).filter((profile) => ROLES.has(profile.role))
}

export function markdown(rows) {
  if (!rows.length) return '(no rows)\n'
  const keys = Object.keys(rows[0])
  return `| ${keys.join(' | ')} |\n| ${keys.map(() => '---').join(' | ')} |\n${rows
    .map((row) => `| ${keys.map((key) => String(row[key])).join(' | ')} |`)
    .join('\n')}\n`
}

/** The functional outcome two rehearsals must share before their counters can be compared. */
export function comparable(report) {
  const sorted = (values) =>
    [...values].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  return {
    execution: report.execution,
    exit: report.exit,
    state: report.status?.state,
    outcome: report.status?.outcome,
    stages: report.status?.stages?.map((stage) => ({ id: stage.id, status: stage.status })),
    native: sorted(
      (report.native ?? []).map((entry) => ({
        status: entry.status,
        provenance: entry.provenance,
      })),
    ),
    humanWaits: report.humanWaits,
    publication: report.publication,
    effects: (report.effects ?? []).map((entry) => ({
      operation: entry.operation,
      status: entry.status,
    })),
    cases: sorted(
      (report.cases ?? []).map((entry) => ({ host: entry.host, status: entry.status })),
    ),
    verdict: report.verdict,
  }
}
