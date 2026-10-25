import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { acceptanceShape } from '../acceptance/contracts.js'
import { contractDigest } from '../contracts/compatibility.js'
import { readSourceBytes, readSourceFile, safeSourceText, sourceHash } from '../delivery/input.js'
import { assemblyGitArguments, assemblyGitEnvironment } from '../integration/git-process.js'
import { StoreFiles } from '../state/files.js'
import { canonicalPath, inside, storePath } from '../state/paths.js'
import { EvaluationFixtureError, evaluationOracle, type loadEvaluationCatalog } from './catalog.js'
import recordSchema from './schemas/seed-record-v1.json' with { type: 'json' }
import requestSchema from './schemas/seed-request-v1.json' with { type: 'json' }

export const EVALUATION_SEED_SCHEMA = requestSchema
export const EVALUATION_SEED_RECORD_SCHEMA = recordSchema
export interface EvaluationSeedRequest {
  schema: 'wholeloop/evaluation-seed-request@1'
  catalog: string
  scenario: string
  variant: 'baseline' | 'reference'
  key: string
}
export interface EvaluationSeedRecord {
  schema: 'wholeloop/evaluation-seed-record@1'
  digest: string
  seal: string
  request: EvaluationSeedRequest
  license: 'MIT'
  category: string
  surfaces: string[]
  requirements: { ref: string; sha256: string; bytes: number }
  oracle: { ref: string; sha256: string; bytes: number }
  definition: ReturnType<typeof loadEvaluationCatalog>['catalog']['scenarios'][number]
  repositories: {
    id: string
    root: string
    head: string
    files: { target: string; sha256: string; bytes: number }[]
  }[]
  execution: 'git-seed-only'
  authority: 'not-granted'
  nativeAcceptance: 'not-established'
}
/** Explicit disposable fixture setup is separate from delivery grants and runs no application/model code. */
export class EvaluationSeeds {
  readonly files: StoreFiles
  constructor(store = storePath()) {
    this.files = new StoreFiles(store)
  }
  private relative(digest: string) {
    if (!/^[a-f0-9]{64}$/.test(digest)) throw new EvaluationFixtureError('invalid-seed-id')
    return `delivery/evaluation-seeds/${digest}`
  }
  private git(root: string, args: string[], home: string, hooks: string) {
    const result = spawnSync('git', assemblyGitArguments(hooks, 'Fixture Owner', args), {
      cwd: root,
      encoding: 'utf8',
      env: assemblyGitEnvironment(home),
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    })
    if (result.status !== 0 || result.error)
      throw new EvaluationFixtureError('seed-git-unavailable')
    return result.stdout.trim()
  }
  seed(loaded: ReturnType<typeof loadEvaluationCatalog>, value: unknown) {
    acceptanceShape(value, requestSchema)
    const request = structuredClone(value) as EvaluationSeedRequest,
      scenario = loaded.catalog.scenarios.find((s) => s.id === request.scenario)
    if (request.catalog !== loaded.digest || !scenario)
      throw new EvaluationFixtureError('seed-catalog-binding')
    const digest = contractDigest(request),
      relative = this.relative(digest),
      input = (ref: string, sha256: string) => {
        const file = loaded.files.get(ref)
        if (!file || file.sha256 !== sha256 || sourceHash(file.body) !== sha256)
          throw new EvaluationFixtureError('changed-materialization-input')
        return file
      },
      requirements = input(scenario.requirements.ref, scenario.requirements.sha256),
      oracle = input(scenario.oracle.ref, scenario.oracle.sha256)
    evaluationOracle(JSON.parse(oracle.body), scenario)
    return this.files.locked(() => {
      const snapshot = {
        catalog: loaded.catalog,
        files: [...loaded.files.values()]
          .map(({ body: _body, ...file }) => file)
          .sort((a, b) => (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0)),
      }
      if (contractDigest(snapshot) !== request.catalog)
        throw new EvaluationFixtureError('changed-catalog-snapshot')
      const snapshotPath = `delivery/evaluation-catalogs/${request.catalog}.json`,
        oldSnapshot = this.files.read(snapshotPath)
      if (oldSnapshot && contractDigest(JSON.parse(oldSnapshot)) !== request.catalog)
        throw new EvaluationFixtureError('changed-catalog-snapshot')
      if (!oldSnapshot) this.files.atomic(snapshotPath, `${JSON.stringify(snapshot)}\n`)

      const key = `delivery/evaluation-keys/${request.key}.json`,
        prior = this.files.read(key)
      if (prior && prior !== `${digest}\n`)
        throw new EvaluationFixtureError('evaluation-key-conflict')
      if (existsSync(this.files.path(`${relative}/record.json`))) return this.inspect(digest)
      const home = this.files.path(`${relative}/home`),
        hooks = this.files.path(`${relative}/hooks-disabled`)
      mkdirSync(home, { recursive: true, mode: 0o700 })
      mkdirSync(hooks, { recursive: true, mode: 0o700 })
      const paths = scenario.repositories.map((repo) => ({
        id: repo.id,
        root: canonicalPath(
          join(this.files.path('delivery/evaluation-workspaces'), digest, repo.id),
        ),
      }))
      for (const repo of paths)
        if (!inside(this.files.root, repo.root))
          throw new EvaluationFixtureError('evaluation-workspace-boundary')
      const pin = {
        schema: 'wholeloop/evaluation-seed-intent@1',
        digest,
        request,
        definition: scenario,
        requirements: requirements.sha256,
        oracle: oracle.sha256,
        paths,
      }
      const intent = `${JSON.stringify(pin)}\n`,
        old = this.files.read(`${relative}/intent.json`)
      if (old && old !== intent) throw new EvaluationFixtureError('changed-evaluation-intent')
      if (!old) this.files.atomic(`${relative}/intent.json`, intent)
      if (!prior) this.files.atomic(key, `${digest}\n`)
      for (const [name, file] of [
        ['requirements.md', requirements],
        ['oracle.json', oracle],
      ] as const) {
        const path = `${relative}/${name}`,
          existing = this.files.read(path)
        if (existing !== undefined && existing !== file.body)
          throw new EvaluationFixtureError('changed-pinned-evaluation-input')
        if (existing === undefined) this.files.atomic(path, file.body)
      }
      // Existing paths may contain a partial setup or actual worker edits. Never retry by overwriting either.
      if (paths.some((p) => existsSync(p.root)))
        return {
          schema: 'wholeloop/evaluation-seed@1' as const,
          digest,
          status: 'unknown' as const,
          reason: 'existing-workspace-without-completed-seed',
          catalog: request.catalog,
          scenario: scenario.id,
          variant: request.variant,
          repositories: paths,
          expected: 'pinned' as const,
          execution: 'git-seed-only' as const,
          authority: 'not-granted' as const,
          nativeAcceptance: 'not-established' as const,
        }
      const repositories = paths.map((repo) => {
        const definition = scenario.repositories.find((r) => r.id === repo.id)
        if (!definition) throw new EvaluationFixtureError('unknown-seed-repository')
        mkdirSync(repo.root, { recursive: true, mode: 0o700 })
        const files = [
          ...definition[request.variant].map((file) => ({
            target: file.target,
            file: input(file.ref, file.sha256),
          })),
          { target: 'REQUEST.md', file: requirements },
        ]
        for (const { target, file } of files) {
          const path = join(repo.root, target)
          mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
          writeFileSync(path, file.body, { flag: 'wx', mode: 0o644 })
        }
        this.git(repo.root, ['init', '-b', 'main'], home, hooks)
        this.git(repo.root, ['add', '--all'], home, hooks)
        this.git(
          repo.root,
          [
            'commit',
            '-m',
            'test: seed a disposable delivery evaluation',
            '-m',
            'Pin an original application while keeping its expected outcomes in the controller store.',
          ],
          home,
          hooks,
        )
        const head = this.git(repo.root, ['rev-parse', 'HEAD'], home, hooks)
        if (!/^[a-f0-9]{40}$/.test(head)) throw new EvaluationFixtureError('unobserved-seed-commit')
        return {
          ...repo,
          head,
          files: files.map(({ target, file }) => ({
            target,
            sha256: file.sha256,
            bytes: file.bytes,
          })),
        }
      })
      const record: EvaluationSeedRecord = {
        schema: 'wholeloop/evaluation-seed-record@1',
        digest,
        seal: '',
        request,
        license: 'MIT',
        category: scenario.category,
        surfaces: scenario.surfaces,
        definition: scenario,
        requirements: {
          ref: `${relative}/requirements.md`,
          sha256: requirements.sha256,
          bytes: requirements.bytes,
        },
        oracle: { ref: `${relative}/oracle.json`, sha256: oracle.sha256, bytes: oracle.bytes },
        repositories,
        execution: 'git-seed-only',
        authority: 'not-granted',
        nativeAcceptance: 'not-established',
      }
      record.seal = contractDigest({ ...record, seal: undefined })
      acceptanceShape(record, recordSchema)
      safeSourceText(JSON.stringify(record), 2 * 1024 * 1024)
      this.files.atomic(`${relative}/record.json`, `${JSON.stringify(record)}\n`)
      return this.inspect(digest)
    })
  }
  get(digest: string): EvaluationSeedRecord {
    const record = JSON.parse(
      readSourceFile(this.files.root, `${this.relative(digest)}/record.json`, 2 * 1024 * 1024),
    ) as EvaluationSeedRecord
    acceptanceShape(record, recordSchema)
    if (record.seal !== contractDigest({ ...record, seal: undefined }))
      throw new EvaluationFixtureError('changed-seed-record')
    const snapshot = JSON.parse(
      readSourceFile(
        this.files.root,
        `delivery/evaluation-catalogs/${record.request.catalog}.json`,
        2 * 1024 * 1024,
      ),
    ) as {
      catalog: ReturnType<typeof loadEvaluationCatalog>['catalog']
      files: { ref: string; sha256: string; bytes: number }[]
    }
    if (
      contractDigest(snapshot) !== record.request.catalog ||
      contractDigest(snapshot.catalog.scenarios.find((s) => s.id === record.request.scenario)) !==
        contractDigest(record.definition) ||
      record.oracle.sha256 !== record.definition.oracle.sha256 ||
      record.requirements.sha256 !== record.definition.requirements.sha256 ||
      record.oracle.ref !== `${this.relative(digest)}/oracle.json` ||
      record.requirements.ref !== `${this.relative(digest)}/requirements.md`
    )
      throw new EvaluationFixtureError('changed-catalog-binding')
    if (
      record.digest !== digest ||
      contractDigest(record.request) !== digest ||
      this.files.read(`delivery/evaluation-keys/${record.request.key}.json`) !== `${digest}\n`
    )
      throw new EvaluationFixtureError('changed-seed-record')
    if (
      contractDigest(record.repositories.map((r) => r.id)) !==
      contractDigest(record.definition.repositories.map((r) => r.id))
    )
      throw new EvaluationFixtureError('changed-seed-repositories')
    for (const repo of record.repositories) {
      const definition = record.definition.repositories.find((r) => r.id === repo.id)
      if (
        !definition ||
        repo.root !==
          canonicalPath(join(this.files.path('delivery/evaluation-workspaces'), digest, repo.id)) ||
        !inside(this.files.root, repo.root)
      )
        throw new EvaluationFixtureError('changed-seed-repositories')
      const expected = [
        ...definition[record.request.variant].map((file) => ({
          target: file.target,
          sha256: file.sha256,
          bytes: snapshot.files.find((f) => f.ref === file.ref)?.bytes,
        })),
        {
          target: 'REQUEST.md',
          sha256: record.requirements.sha256,
          bytes: record.requirements.bytes,
        },
      ]
      if (contractDigest(expected) !== contractDigest(repo.files))
        throw new EvaluationFixtureError('changed-seed-file-manifest')
    }
    for (const file of [record.requirements, record.oracle])
      if (sourceHash(readSourceFile(this.files.root, file.ref, 65536)) !== file.sha256)
        throw new EvaluationFixtureError('changed-pinned-evaluation-input')
    evaluationOracle(
      JSON.parse(readSourceFile(this.files.root, record.oracle.ref, 65536)),
      record.definition,
    )
    return record
  }
  oracle(digest: string) {
    const record = this.get(digest)
    return evaluationOracle(
      JSON.parse(readSourceFile(this.files.root, record.oracle.ref, 65536)),
      record.definition,
    )
  }
  inspect(digest: string) {
    const record = this.get(digest)
    const repositories = record.repositories.map((repo) => {
      let seedFiles: 'matching' | 'changed' | 'unavailable' = 'matching'
      // Inspection never executes helpers from builder-owned Git metadata or reads worker-selected oracles.
      try {
        if (canonicalPath(repo.root) !== repo.root || !inside(this.files.root, repo.root))
          throw new Error('Changed seed root')
        for (const file of repo.files)
          if (
            sourceHash(readSourceBytes(repo.root, file.target, 65536).toString('utf8')) !==
            file.sha256
          )
            seedFiles = 'changed'
      } catch {
        seedFiles = 'unavailable'
      }
      return { id: repo.id, root: repo.root, head: repo.head, seedFiles }
    })
    return {
      schema: 'wholeloop/evaluation-seed@1' as const,
      digest,
      status: 'ready' as const,
      reason: 'immutable-controller-standard-verified',
      catalog: record.request.catalog,
      scenario: record.request.scenario,
      variant: record.request.variant,
      repositories,
      expected: 'pinned' as const,
      execution: record.execution,
      authority: record.authority,
      nativeAcceptance: record.nativeAcceptance,
    }
  }
}
