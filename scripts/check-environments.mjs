import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const args = process.argv.slice(2)
if (args.some((arg) => arg !== '--retire-success'))
  throw new Error('Supported option: --retire-success')
const destination = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-docker-evaluation-')))
mkdirSync(join(destination, 'results'))
const runner = join(destination, 'runner.mjs')
await build({
  entryPoints: [resolve(root, 'test/evals/environment/run.ts')],
  outfile: runner,
  bundle: true,
  platform: 'node',
  format: 'esm',
  banner: {
    js: "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);",
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
