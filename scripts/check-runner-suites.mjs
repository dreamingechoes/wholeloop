import { spawn } from 'node:child_process'
import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { harnessAssets } from './harness-assets.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url))),
  args = process.argv.slice(2)
if (args.some((arg) => arg !== '--retire-success'))
  throw new Error('Supported option: --retire-success')
const destination = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-owned-suite-evaluation-'))),
  runner = join(destination, 'runner.mjs')
await build({
  entryPoints: [join(root, 'test/evals/runner/suites.ts')],
  outfile: runner,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  define: { __WL_HARNESS__: JSON.stringify(harnessAssets(root)) },
  banner: {
    js: "import {createRequire as __wlSuiteRequire} from 'node:module';const require=__wlSuiteRequire(import.meta.url);",
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
