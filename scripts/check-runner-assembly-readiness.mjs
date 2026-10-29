import { spawn } from 'node:child_process'
import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { harnessAssets } from './harness-assets.mjs'
import { privateEvaluator } from './private-evaluator.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const args = process.argv.slice(2)
if (
  args.some(
    (arg) =>
      ![
        '--retire-success',
        '--product-qa',
        '--product-qa-failure',
        '--product-qa-api',
        '--product-qa-private',
        '--product-qa-private-unproven',
        '--product-qa-private-failure',
        '--product-qa-browser',
        '--product-qa-browser-failure',
        '--acceptance',
        '--acceptance-reject',
        '--handoff',
      ].includes(arg),
  )
)
  throw new Error(
    'Supported options: --retire-success, --product-qa, --product-qa-failure, --product-qa-api, --product-qa-private, --product-qa-private-unproven, --product-qa-private-failure, --product-qa-browser, --product-qa-browser-failure, --acceptance, --acceptance-reject, --handoff',
  )
const destination = realpathSync(
    mkdtempSync(join(tmpdir(), 'wholeloop-runner-assembly-readiness-')),
  ),
  runner = join(destination, 'runner.mjs')
await build({
  entryPoints: [join(root, 'test/evals/runner/assembly-readiness.ts')],
  outfile: runner,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  define: {
    __WL_HARNESS__: JSON.stringify(harnessAssets(root)),
    __WL_PRIVATE_EVALUATOR__: JSON.stringify(await privateEvaluator(import.meta.url)),
  },
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
