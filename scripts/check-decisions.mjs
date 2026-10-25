import { spawn } from 'node:child_process'
import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
if (process.argv.length !== 2)
  throw new Error('The delegated-decision control evaluation takes no options')
const destination = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-decision-evaluation-'))),
  runner = join(destination, 'runner.mjs')
await build({
  entryPoints: [join(root, 'test/evals/decisions/run.ts')],
  outfile: runner,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  banner: {
    js: "import {createRequire as createDeliveryFixtureRequire} from 'node:module';const require=createDeliveryFixtureRequire(import.meta.url);",
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
