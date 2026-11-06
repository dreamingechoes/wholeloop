import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url))),
  biome = join(root, 'node_modules/@biomejs/biome/bin/biome'),
  snippet = (code) => `\`${code}\``,
  alternatives = (values) => `or { ${values.map(snippet).join(', ')} }`,
  iterations = (inner) => `or {
    or { JsForOfStatement(), JsForInStatement(), JsForStatement(), JsWhileStatement(), JsDoWhileStatement() } as $loop where {
      $loop <: contains ${inner}
    },
    ${snippet('$items.$method($body)')} where {
      $method <: ${alternatives(['map', 'flatMap', 'filter', 'some', 'every', 'find', 'forEach', 'reduce', 'reduceRight', 'sort'])},
      $body <: contains ${inner}
    }
  }`,
  rules = [
    {
      id: 'nested-array-search',
      query: iterations(`${snippet('$values.$search($predicate)')} where {
        $search <: ${alternatives(['find', 'findIndex', 'filter', 'some', 'every', 'includes', 'indexOf'])}
      }`),
      question:
        'Can an ordered, first-match index replace repeated searches without changing semantics?',
    },
    {
      id: 'repeated-read-or-replay',
      query: iterations(`${snippet('$read($input)')} where {
        $read <: ${alternatives(['replay', 'gateRuns', 'readSourceFile', 'readFileSync', 'JSON.parse', 'JSON.stringify'])}
      }`),
      question:
        'Is this input invariant within the iteration, and where must fresh validation resume?',
    },
    {
      id: 'process-in-iteration',
      query: iterations(`${snippet('$launch($args)')} where {
        $launch <: ${alternatives(['spawnSync', 'execSync', 'execFileSync'])}
      }`),
      question:
        'Can one bounded query serve the batch while preserving each original ownership check?',
    },
  ]

function search(rule, paths) {
  // Pass patterns as arguments, never shell text: Grit variables and backticks
  // are executable shell syntax. Biome parses TypeScript without importing it.
  const result = spawnSync(
    process.execPath,
    [
      biome,
      'search',
      rule.query,
      ...paths,
      '--reporter=json',
      '--max-diagnostics=none',
      '--vcs-enabled=false',
    ],
    { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, shell: false },
  )
  if (result.error) throw result.error
  if (result.status !== 0)
    throw new Error(`Structural search failed for ${rule.id}: ${result.stderr}`)
  const report = JSON.parse(result.stdout)
  if (report.summary.errors || report.summary.diagnosticsNotPrinted || report.summary.skipped)
    throw new Error(`Structural search is incomplete for ${rule.id}`)
  // Biome's summary.matches counts processed files, not matched syntax nodes.
  return report.diagnostics
    .filter((diagnostic) => diagnostic.category === 'search')
    .map((diagnostic) => diagnostic.location)
}

const args = process.argv.slice(2)
if (args.includes('--self-test')) {
  assert.deepEqual(args, ['--self-test'])
  const directory = mkdtempSync(join(tmpdir(), 'wholeloop-static-performance-')),
    fixture = join(directory, 'calibration.ts')
  writeFileSync(
    fixture,
    [
      'const unrelated = a.map(x => x + 1)',
      'const nested = a.map(x => b.find(y => y.id === x.id))',
      'for (const x of a) { consume(x) }',
      'for (const x of a) { const found = b.find(y => y.id === x.id); consume(found) }',
      'const text = "a.map(x => b.find(y => y.id === x.id))"',
      '// for (const x of a) { replay(events) }',
      'for (const x of a) { consume(replay(events)) }',
      'const decoded = a.map(x => JSON.parse(x))',
      'for (const x of a) { spawnSync(x) }',
      'for (let i = 0; i < a.length; i++) { consume(b.find(x => x.id === a[i])) }',
      'while (ready()) { consume(JSON.parse(next())) }',
      'do { spawnSync(command, args, options) } while (ready())',
      'for (let x of a) { consume(b.includes(x)) }',
      'a.reduce((sum, x) => sum + b.find(y => y.id === x.id).value, 0)',
    ].join('\n'),
  )
  const expected = [
    [2, 4, 10, 13, 14],
    [7, 8, 11],
    [9, 12],
  ]
  rules.forEach((rule, index) => {
    assert.deepEqual(
      search(rule, [fixture]).map((location) => location.start.line),
      expected[index],
    )
  })
  console.log(
    'STATIC PERFORMANCE CALIBRATION PASS (3 rules; positive, negative, comment and string controls)',
  )
} else {
  if (args.some((arg) => arg.startsWith('-'))) throw new Error('Supply source paths or --self-test')
  const paths = args.length ? args : ['src']
  console.log(
    JSON.stringify(
      {
        schema: 'wholeloop/static-performance-candidates@1',
        classification: 'advisory-candidates-only',
        limitations:
          'Local syntax only: aliases, indirect calls, cross-function duplication, freshness and runtime complexity require manual review and isolated execution. Absence of matches is not proof of efficiency.',
        paths,
        rules: rules.map((rule) => {
          const candidates = search(rule, paths)
          return { id: rule.id, question: rule.question, count: candidates.length, candidates }
        }),
      },
      null,
      2,
    ),
  )
}
