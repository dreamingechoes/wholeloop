import { spawnSync } from 'node:child_process'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The repository gate. Every step runs in order and stops at the first
 * failure; the last line is always `CHECK PASS` or `CHECK FAIL (<step>)`, so
 * a reader never has to infer the outcome from scattered tool output.
 *
 * `--fast` is the per-commit loop: it runs only the tests related to the
 * files changed against HEAD (all tests when shared configuration changed) and
 * skips the offline npm install. The full gate stays mandatory before any
 * push and when a roadmap task closes.
 */
const root = dirname(dirname(fileURLToPath(import.meta.url))),
  fast = process.argv.includes('--fast'),
  unknown = process.argv.slice(2).filter((arg) => arg !== '--fast')
if (unknown.length) {
  console.error(`Unknown option: ${unknown.join(' ')}`)
  process.exit(2)
}

const git = (args) =>
  spawnSync('git', args, { cwd: root, encoding: 'utf8' })
    .stdout.split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

/** Test selection for the fast loop; `undefined` means the whole suite. */
function relatedTests() {
  const changed = [
    ...new Set([
      ...git(['diff', '--name-only', 'HEAD']),
      ...git(['ls-files', '--others', '--exclude-standard']),
    ]),
  ]
  // Shared configuration can change any test's behaviour; run everything.
  const global = [
    'package.json',
    'package-lock.json',
    'vitest.config.ts',
    'tsconfig.json',
    'scripts/harness-assets.mjs',
  ]
  if (changed.some((file) => global.includes(file))) return undefined
  return changed.filter((file) => /^(src|test)\/.+\.(ts|json)$/.test(file))
}

const npm = (script) => ['npm', ['run', script]]
const node = (...args) => ['node', args]
const steps = [
  ['lint', ...npm('lint')],
  ['typecheck', ...npm('typecheck')],
  ['build', ...npm('build')],
  ['test', ...npm('test')],
  ['smoke', ...npm('smoke')],
  ['package', ...node('scripts/check-package.mjs')],
  ['commits', ...npm('commits:check')],
  ['docs', ...npm('docs:check')],
  ['commands', ...node('scripts/generate-commands.mjs', '--check')],
  ['config', ...node('scripts/generate-config.mjs', '--check')],
  ['providers', ...node('scripts/generate-providers.mjs', '--check')],
  ['harness', ...npm('harness:check')],
  ['maintainer', ...npm('maintainer:check')],
  ['roadmap', ...npm('roadmap:check')],
  ['markdown', ...npm('lint:md')],
  ['mermaid', ...npm('lint:mermaid')],
]

const started = Date.now()
for (const [name, command, args] of steps) {
  let selected = args
  if (fast && name === 'package') {
    console.log('\n> package: skipped in --fast (offline npm install runs in the full gate)')
    continue
  }
  if (fast && name === 'test') {
    const related = relatedTests()
    if (related && !related.length) {
      console.log('\n> test: no changed source or test files; skipped in --fast')
      continue
    }
    selected = related ? ['exec', '--', 'vitest', 'related', '--run', ...related] : ['run', 'test']
  }
  const result = spawnSync(command, selected, { cwd: root, stdio: 'inherit' })
  if (result.status !== 0) {
    console.log(`\nCHECK FAIL (${name})`)
    process.exit(result.status ?? 1)
  }
}
const seconds = Math.round((Date.now() - started) / 1000)
console.log(`\nCHECK PASS${fast ? ' (fast)' : ''} in ${seconds}s`)
