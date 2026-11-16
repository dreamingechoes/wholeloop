import { spawn } from 'node:child_process'
import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { harnessAssets } from './harness-assets.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const args = process.argv.slice(2)
// --unattended rehearses ADR-0248: the controller continues under the run's envelope grant.
if (args.some((arg) => !['--retire-success', '--unattended'].includes(arg)))
  throw new Error('Supported options: --retire-success, --unattended')
const destination = realpathSync(
    mkdtempSync(join(tmpdir(), 'wholeloop-ci-continuation-evaluation-')),
  ),
  runner = join(destination, 'runner.mjs')
await build({
  entryPoints: [join(root, 'test/evals/runner/ci-continuation.ts')],
  outfile: runner,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  define: { __WL_HARNESS__: JSON.stringify(harnessAssets(root)) },
  banner: {
    js: "import {createRequire as __wlRunnerRequire} from 'node:module';const require=__wlRunnerRequire(import.meta.url);",
  },
})
console.log(`Retained evaluation: ${destination}`)
const child = spawn(process.execPath, [runner, join(destination, 'results'), ...args], {
  cwd: root,
  stdio: 'inherit',
  shell: false,
})
child.once('error', () => {
  process.exitCode = 1
})
child.once('exit', (code) => {
  process.exitCode = code ?? 1
})
