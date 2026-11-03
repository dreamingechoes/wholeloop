import { spawn } from 'node:child_process'
import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

// No option selects Codex; `claude` selects the contained Claude Code control (ADR-0203).
const target = process.argv.slice(2)
if (target.length > 1 || (target.length === 1 && target[0] !== 'claude'))
  throw new Error('The model-free native boundary control takes no option or claude')
const entry = target[0] === 'claude' ? 'claude-boundary' : 'native-boundary'
const root = dirname(dirname(fileURLToPath(import.meta.url))),
  destination = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-native-boundary-evaluation-'))),
  runner = join(destination, 'runner.mjs')
await build({
  entryPoints: [join(root, `test/evals/${entry}/run.ts`)],
  outfile: runner,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  banner: {
    js: "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);",
  },
})
console.log(`Retained native boundary control: ${destination}`)
const child = spawn(process.execPath, [runner], { cwd: root, stdio: 'inherit', shell: false })
child.once('error', () => {
  process.exitCode = 1
})
child.once('exit', (code) => {
  process.exitCode = code ?? 1
})
