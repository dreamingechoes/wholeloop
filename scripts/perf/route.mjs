// One command for a profiled model-free EVAL-09 rehearsal (P7-04):
//   npm run perf:route [-- --callers]
// It runs the rehearsal with the measurement-only preload in every Node
// process it starts and prints a per-phase table for each controller process.
// Profiles and the summary stay in the printed directory; nothing is uploaded.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { controllers, markdown, phaseTable, topCallers } from './report.mjs'

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url)))),
  output = mkdtempSync(join(tmpdir(), 'wholeloop-perf-')),
  callers = process.argv.includes('--callers')
const result = spawnSync(
  process.execPath,
  [join(root, 'scripts/check-live-implementation.mjs'), '--rehearse'],
  {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: {
      ...process.env,
      NODE_OPTIONS:
        `${process.env.NODE_OPTIONS ?? ''} --import ${join(root, 'scripts/perf/preload.mjs')}`.trim(),
      WHOLELOOP_PERF_OUTPUT: output,
      ...(callers ? { WHOLELOOP_PERF_CALLERS: '1' } : {}),
    },
  },
)
const retained = /"retained":"([^"]+)"/.exec(result.stdout ?? '')?.[1]
const summary = controllers(output).map((profile) => ({
  role: profile.role,
  pid: profile.pid,
  seconds: Number((profile.wallMilliseconds / 1000).toFixed(3)),
  peakRssBytes: profile.peakBytes.rss,
  overflow: profile.overflow,
  ...(callers ? { callerOverflow: profile.callerOverflow } : {}),
  phases: phaseTable(profile),
  ...(callers ? { callers: topCallers(profile) } : {}),
}))
writeFileSync(
  join(output, 'summary.json'),
  `${JSON.stringify({ retained, exit: result.status, summary }, null, 2)}\n`,
)
for (const entry of summary) {
  console.log(
    `\n${entry.role} (pid ${entry.pid}): ${entry.seconds}s, peak RSS ${entry.peakRssBytes} bytes, overflow ${entry.overflow}${entry.callers ? `, caller overflow ${entry.callerOverflow}` : ''}\n`,
  )
  console.log(markdown(entry.phases))
  if (entry.callers) console.log(markdown(entry.callers))
}
console.log(`profiles and summary: ${output}${retained ? `\nrehearsal: ${retained}` : ''}`)
process.exitCode = result.status ?? 1
