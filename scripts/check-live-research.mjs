import { spawn } from 'node:child_process'
import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

// Live EVAL-10 trial: spends model quota and refuses without explicit
// confirmation in the environment (see test/evals/live-research/run.ts).
if (process.argv.length !== 2) throw new Error('The live research trial takes no options')
const root = dirname(dirname(fileURLToPath(import.meta.url))),
  destination = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-live-research-runner-'))),
  runner = join(destination, 'runner.mjs')
await build({
  entryPoints: [join(root, 'test/evals/live-research/run.ts')],
  outfile: runner,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  define: {
    __WL_VERSION__: JSON.stringify(
      JSON.parse((await import('node:fs')).readFileSync(join(root, 'package.json'), 'utf8'))
        .version,
    ),
  },
  banner: {
    js: "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);",
  },
})
const child = spawn(process.execPath, [runner], { cwd: root, stdio: 'inherit', shell: false })
child.once('error', () => {
  process.exitCode = 1
})
child.once('exit', (code) => {
  process.exitCode = code ?? 1
})
