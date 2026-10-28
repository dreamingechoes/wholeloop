import { spawn } from 'node:child_process'
import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { harnessAssets } from './harness-assets.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
if (process.argv.length !== 2)
  throw new Error('The model-free native history control takes no options')
const destination = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-runner-native-history-'))),
  runner = join(destination, 'runner.mjs')
await build({
  entryPoints: [join(root, 'test/evals/runner/native-history.ts')],
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
const child = spawn(process.execPath, [runner, join(destination, 'results')], {
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
