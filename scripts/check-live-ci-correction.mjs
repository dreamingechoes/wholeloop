import { spawn } from 'node:child_process'
import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { harnessAssets } from './harness-assets.mjs'

// P8-01: the live CI correction scenario on the trial repository. It requires
// explicit quota/publication confirmation (see the evaluation entrypoint).
const root = dirname(dirname(fileURLToPath(import.meta.url))),
  destination = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-live-ci-correction-runner-'))),
  runner = join(destination, 'runner.mjs')
await build({
  entryPoints: [join(root, 'test/evals/live-implementation/ci-run.ts')],
  outfile: runner,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  // The route is composed in this process, like the CI continuation rehearsal, so the
  // bundle needs the harness assets the installed controller would otherwise carry.
  define: {
    __WL_HARNESS__: JSON.stringify(harnessAssets(root)),
    __WL_VERSION__: JSON.stringify(
      JSON.parse((await import('node:fs')).readFileSync(join(root, 'package.json'), 'utf8'))
        .version,
    ),
  },
  banner: {
    js: "import {createRequire as __wlRunnerRequire} from 'node:module';const require=__wlRunnerRequire(import.meta.url);",
  },
})
const child = spawn(process.execPath, [runner, ...process.argv.slice(2)], {
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
