import { createHash } from 'node:crypto'
import {
  cpSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { evaluationCatalogSummary, loadEvaluationCatalog } from '../../../src/evaluation/catalog.js'
import { EvaluationSeeds } from '../../../src/evaluation/store.js'

const root = resolve('test/fixtures/delivery-applications'),
  manifest = join(root, 'catalog.json')
function temporary(run: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-fixture-catalog-'))
  try {
    run(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
it('freezes every original fixture literal and metadata file at the reviewed byte baseline', () => {
  const baseline = JSON.parse(readFileSync(join(root, 'baseline.json'), 'utf8')) as {
    files: Record<string, string>
  }
  const files = readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name))
    .filter((p) => p !== join(root, 'baseline.json'))
    .map((p) => p.slice(root.length + 1))
    .sort()
  expect(files).toEqual(Object.keys(baseline.files).sort())
  for (const file of files)
    expect(
      createHash('sha256')
        .update(readFileSync(join(root, file)))
        .digest('hex'),
      file,
    ).toBe(baseline.files[file])
})
it('covers original regression, durable browser/API, integration and hostile-source scenarios without exposing oracles', () => {
  const loaded = loadEvaluationCatalog(manifest),
    summary = evaluationCatalogSummary(loaded)
  expect(summary.scenarios.map((s) => s.category)).toEqual([
    'regression',
    'persistence',
    'integration',
    'adversarial',
  ])
  expect(summary.scenarios.find((s) => s.id === 'durable-board')?.surfaces).toContain('browser')
  expect(
    summary.scenarios.find((s) => s.id === 'protocol-disagreement')?.repositories,
  ).toHaveLength(2)
  expect(JSON.stringify(summary)).not.toContain('Persistent café task')
  expect(summary).toMatchObject({ executed: false, authority: 'not-granted', license: 'MIT' })
})
it('refuses changed source bytes before materialization', () =>
  temporary((dir) => {
    cpSync(root, join(dir, 'catalog'), { recursive: true })
    writeFileSync(
      join(dir, 'catalog', 'lookup', 'baseline.cjs'),
      'console.log("different fixture")\n',
    )
    expect(() => loadEvaluationCatalog(join(dir, 'catalog', 'catalog.json'))).toThrow(
      'changed-fixture-bytes',
    )
  }))
it('pins expected outcomes outside seeded repositories and never overwrites actual worker edits', () =>
  temporary((dir) => {
    const loaded = loadEvaluationCatalog(manifest),
      store = new EvaluationSeeds(join(dir, 'store')),
      request = {
        schema: 'wholeloop/evaluation-seed-request@1',
        catalog: loaded.digest,
        scenario: 'lookup-regression',
        variant: 'baseline',
        key: 'first',
      },
      first = store.seed(loaded, request)
    expect(first.status).toBe('ready')
    const original = store.oracle(first.digest),
      repo = first.repositories[0]
    if (!repo) throw new Error('Missing seeded repository')
    expect(readFileSync(join(repo.root, 'REQUEST.md'), 'utf8')).toContain('ignoring case')
    expect(() => readFileSync(join(repo.root, 'oracle.json'))).toThrow()
    writeFileSync(join(repo.root, 'app.cjs'), 'console.log("worker implementation")\n')
    writeFileSync(join(repo.root, 'oracle.json'), '{"expected":"worker-controlled"}')
    const second = store.seed(loaded, request)
    if (second.status !== 'ready') throw new Error('Incomplete seed')
    expect(second.digest).toBe(first.digest)
    expect(second.repositories[0]?.seedFiles).toBe('changed')
    expect(store.oracle(first.digest)).toEqual(original)
    expect(readFileSync(join(repo.root, 'app.cjs'), 'utf8')).toContain('worker implementation')
    expect(() => store.seed(loaded, { ...request, variant: 'reference' })).toThrow(
      'evaluation-key-conflict',
    )
  }))
it('refuses a changed private oracle instead of adopting worker-proposed expectations', () =>
  temporary((dir) => {
    const loaded = loadEvaluationCatalog(manifest),
      store = new EvaluationSeeds(join(dir, 'store')),
      seed = store.seed(loaded, {
        schema: 'wholeloop/evaluation-seed-request@1',
        catalog: loaded.digest,
        scenario: 'durable-board',
        variant: 'baseline',
        key: 'private',
      }),
      record = store.get(seed.digest)
    writeFileSync(
      store.files.path(record.oracle.ref),
      '{"schema":"wholeloop/evaluation-oracle@1","cases":[]}',
    )
    expect(() => store.inspect(seed.digest)).toThrow('changed-pinned-evaluation-input')
  }))

it('keeps its pinned oracle after the original catalog source changes', () =>
  temporary((dir) => {
    const source = join(dir, 'source')
    cpSync(root, source, { recursive: true })
    const loaded = loadEvaluationCatalog(join(source, 'catalog.json')),
      store = new EvaluationSeeds(join(dir, 'store')),
      seed = store.seed(loaded, {
        schema: 'wholeloop/evaluation-seed-request@1',
        catalog: loaded.digest,
        scenario: 'lookup-regression',
        variant: 'baseline',
        key: 'source-change',
      }),
      expected = store.oracle(seed.digest)
    writeFileSync(join(source, 'lookup', 'oracle.json'), '{"changed":"source standard"}')
    expect(store.oracle(seed.digest)).toEqual(expected)
    expect(() => loadEvaluationCatalog(join(source, 'catalog.json'))).toThrow(
      'changed-fixture-bytes',
    )
  }))
it('refuses tampered completion metadata and preserves existing worker files', () =>
  temporary((dir) => {
    const loaded = loadEvaluationCatalog(manifest),
      store = new EvaluationSeeds(join(dir, 'store')),
      seed = store.seed(loaded, {
        schema: 'wholeloop/evaluation-seed-request@1',
        catalog: loaded.digest,
        scenario: 'lookup-regression',
        variant: 'baseline',
        key: 'tampered',
      })
    const path = store.files.path(`delivery/evaluation-seeds/${seed.digest}/record.json`),
      record = JSON.parse(readFileSync(path, 'utf8'))
    record.oracle.sha256 = 'f'.repeat(64)
    writeFileSync(path, JSON.stringify(record))
    expect(() => store.inspect(seed.digest)).toThrow('changed-seed-record')
  }))
it('inspects expected inputs without executing builder-owned Git configuration', () =>
  temporary((dir) => {
    const loaded = loadEvaluationCatalog(manifest),
      store = new EvaluationSeeds(join(dir, 'store')),
      seed = store.seed(loaded, {
        schema: 'wholeloop/evaluation-seed-request@1',
        catalog: loaded.digest,
        scenario: 'lookup-regression',
        variant: 'baseline',
        key: 'git-config',
      }),
      repo = seed.repositories[0]
    if (!repo) throw new Error('Missing repository')
    writeFileSync(join(repo.root, '.git', 'config'), 'invalid worker-owned Git configuration\n')
    expect(store.inspect(seed.digest).repositories[0]?.seedFiles).toBe('matching')
  }))

it('retains an incomplete workspace instead of replaying setup over existing files', () =>
  temporary((dir) => {
    const loaded = loadEvaluationCatalog(manifest),
      store = new EvaluationSeeds(join(dir, 'store')),
      request = {
        schema: 'wholeloop/evaluation-seed-request@1',
        catalog: loaded.digest,
        scenario: 'lookup-regression',
        variant: 'baseline',
        key: 'partial',
      },
      seed = store.seed(loaded, request),
      recordPath = store.files.path(`delivery/evaluation-seeds/${seed.digest}/record.json`),
      record = readFileSync(recordPath, 'utf8')
    writeFileSync(
      store.files.path(`delivery/evaluation-seeds/${seed.digest}/record-retained.json`),
      record,
    )
    // Simulate loss of the completion marker while retaining its exact bytes for inspection.
    renameSync(
      recordPath,
      store.files.path(`delivery/evaluation-seeds/${seed.digest}/record-moved.json`),
    )
    const repo = seed.repositories[0]
    if (!repo) throw new Error('Missing repository')
    writeFileSync(join(repo.root, 'app.cjs'), 'Actual worker edits remain.\n')
    expect(store.seed(loaded, request).status).toBe('unknown')
    expect(readFileSync(join(repo.root, 'app.cjs'), 'utf8')).toBe('Actual worker edits remain.\n')
  }))
