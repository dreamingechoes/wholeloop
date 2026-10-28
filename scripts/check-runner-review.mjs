import { spawn } from 'node:child_process'
import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { harnessAssets } from './harness-assets.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const args = process.argv.slice(2)
if (args.some((arg) => arg !== '--repeat-review'))
  throw new Error('The model-free review control supports only --repeat-review')
const destination = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-runner-review-'))),
  runner = join(destination, 'runner.mjs')
await build({
  entryPoints: [
    join(
      root,
      args.includes('--repeat-review')
        ? 'test/evals/runner/repeated-review.ts'
        : 'test/evals/runner/review-continuation.ts',
    ),
  ],
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
