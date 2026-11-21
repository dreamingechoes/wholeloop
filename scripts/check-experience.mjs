// Refuses quota spending before building or launching; offline replay never invokes a client.
import { spawn } from 'node:child_process'
import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const args = process.argv.slice(2)
if (
  !args.includes('--replay') &&
  !args.includes('--calibrate') &&
  process.env.WHOLELOOP_LIVE_CONFIRM !== 'spend-quota'
) {
  console.error(
    'Refusing live experience check: WHOLELOOP_LIVE_CONFIRM must be spend-quota. No client started.',
  )
  process.exit(3)
}
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const destination = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-experience-runner-')))
const runner = join(destination, 'runner.mjs')
await build({
  entryPoints: [join(root, 'test/evals/experience/run.ts')],
  outfile: runner,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
})
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
