// Equivalence comparison of two profiled rehearsals (P7-04):
//   node scripts/perf/compare.mjs <before-rehearsal> <before-profiles> <after-rehearsal> <after-profiles>
// Counters are only comparable when both runs reached the same functional
// outcome, so a different outcome fails before any number is printed.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { comparable, controllers, markdown, phaseTable } from './report.mjs'

const [beforeRun, beforeProfiles, afterRun, afterProfiles] = process.argv.slice(2)
if (!afterProfiles) {
  console.error(
    'Usage: compare.mjs <before-rehearsal> <before-profiles> <after-rehearsal> <after-profiles>',
  )
  process.exit(2)
}
const report = (directory) =>
  JSON.parse(readFileSync(join(directory, 'results/report.json'), 'utf8'))
assert.deepEqual(
  comparable(report(afterRun)),
  comparable(report(beforeRun)),
  'The rehearsals reached different outcomes; counters are not comparable',
)
const rows = (directory) => {
  const all = controllers(directory)
  for (const profile of all)
    assert.equal(profile.overflow, 0, 'A profile overflowed; rerun before comparing')
  return all.flatMap((profile) =>
    phaseTable(profile).map((row) => ({ role: profile.role, ...row })),
  )
}
const before = rows(beforeProfiles),
  after = rows(afterProfiles)
const key = (row) => `${row.role}\0${row.phase}`
const merged = [...new Set([...before, ...after].map(key))].map((id) => {
  const a = before.find((row) => key(row) === id),
    b = after.find((row) => key(row) === id)
  const [role, phase] = id.split('\0')
  return {
    role,
    phase,
    seconds: `${a?.seconds ?? 0} → ${b?.seconds ?? 0}`,
    git: `${a?.git ?? 0} → ${b?.git ?? 0}`,
    fsync: `${a?.fsync ?? 0} → ${b?.fsync ?? 0}`,
    lstat: `${a?.lstat ?? 0} → ${b?.lstat ?? 0}`,
  }
})
console.log('Equivalent functional outcome.\n')
console.log(markdown(merged))
