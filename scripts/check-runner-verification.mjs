import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { harnessAssets } from './harness-assets.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url))),
  args = process.argv.slice(2)
if (args.some((arg) => arg !== '--retire-success'))
  throw new Error('Supported option: --retire-success')
const destination = realpathSync(
    mkdtempSync(join(tmpdir(), 'wholeloop-owned-verification-evaluation-')),
  ),
  runner = join(destination, 'runner.mjs')
await build({
  entryPoints: [join(root, 'test/evals/runner/verification.ts')],
  outfile: runner,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  define: { __WL_HARNESS__: JSON.stringify(harnessAssets(root)) },
  banner: {
    js: "import {createRequire as __wlVerificationRequire} from 'node:module';const require=__wlVerificationRequire(import.meta.url);",
  },
})
console.log(`Retained evaluation: ${destination}`)
// Scenarios have independent stores and authorities. Give each the same fresh
// controller process too, rather than retaining previous native fixture heaps.
const scenarios = []
for (const scenario of [
  'observed-pass',
  'observed-fail',
  'fixture-refusal',
  'contract-pass',
  'observed-findings',
  'repair-admission',
]) {
  const results = join(destination, scenario)
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, [runner, results, scenario, ...args], {
      cwd: root,
      stdio: 'inherit',
      shell: false,
    })
    child.once('error', () => resolve(1))
    child.once('exit', (code) => resolve(code ?? 1))
  })
  let report
  try {
    report = JSON.parse(readFileSync(join(results, 'report.json'), 'utf8'))
  } catch {
    report = { status: 'failed', reason: 'Original scenario report unavailable' }
  }
  scenarios.push({ scenario, code, report })
}
const report = {
  status: scenarios.every((s) => s.code === 0 && s.report.status === 'passed')
    ? 'passed'
    : 'failed',
  scope:
    'Six fresh model-free controllers; actual owned Docker suites and synthetic native verification only. No models, containment, independent Linux application-host or whole-feature certification.',
  scenarios,
  acceptance: 'not-established',
  publication: 'not-performed',
}
writeFileSync(join(destination, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(
  JSON.stringify({
    status: report.status,
    scenarios: scenarios.map((s) => ({ scenario: s.scenario, status: s.report.status })),
    report: join(destination, 'report.json'),
  }),
)
if (report.status !== 'passed') process.exitCode = 1
