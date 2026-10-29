import { spawn } from 'node:child_process'
import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const args = process.argv.slice(2)
if (!(args.length === 1 || (args.length === 2 && args[1] === '--acceptance')))
  throw new Error('Supply one retained disposable runner fixture store and optional --acceptance')
const root = dirname(dirname(fileURLToPath(import.meta.url))),
  destination = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-feature-readiness-'))),
  runner = join(destination, 'runner.mjs')
await build({
  entryPoints: [join(root, 'test/evals/runner/feature-readiness.ts')],
  outfile: runner,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  banner: {
    js: "import {createRequire as __wlFeatureRequire} from 'node:module';const require=__wlFeatureRequire(import.meta.url);",
  },
})
console.log(`Retained metadata control: ${destination}`)
const child = spawn(process.execPath, [runner, ...args], {
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
