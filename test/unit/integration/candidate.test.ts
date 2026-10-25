import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { validateDeliveryPlan } from '../../../src/delivery/plan.js'
import { integrationScope } from '../../../src/integration/contracts.js'
import { entry, git } from '../../support/delivery.js'
import { integrationFixture } from '../../support/integration.js'

it('pins every committed predecessor, assembly and input without mutating personal or worker files', () =>
  integrationFixture(async ({ store, request, root, paths }) => {
    const original = git(root, ['rev-parse', 'HEAD']),
      part = git(paths.search, ['rev-parse', 'HEAD'])
    const prepared = store.prepare(request)
    expect(prepared.candidate.parts.map((item) => item.work)).toEqual(['contract', 'search'])
    expect(prepared.candidate.dependencies.waves).toEqual([['contract'], ['search']])
    expect(prepared.candidate.acceptance).toBe('not-established')
    expect(prepared.candidate.execution).toBe('not-performed')
    expect(store.inspect(prepared.digest).status).toBe('current')
    expect(
      store.prepare({
        ...request,
        parts: [...request.parts].reverse(),
        inputs: [...request.inputs].reverse(),
      }).digest,
    ).toBe(prepared.digest)
    expect(store.compare(prepared.digest, prepared.digest)).toMatchObject({
      sameInputs: true,
      executionReuse: 'not-authorized',
    })
    expect(git(root, ['rev-parse', 'HEAD'])).toBe(original)
    expect(git(paths.search, ['rev-parse', 'HEAD'])).toBe(part)
    expect(git(root, ['status', '--porcelain'])).toBe('')
  }))
it.each([
  'missing',
  'dirty',
  'unknown-repository',
  'contract-version',
  'gate',
  'input-cycle',
  'input-bytes',
  'repair-owner',
  'assembly',
  'personal',
] as const)('refuses %s without silently omitting required work', (mode) =>
  integrationFixture(async ({ store, request, root, paths }) => {
    const changed = structuredClone(request)
    if (mode === 'missing') changed.parts.pop()
    if (mode === 'dirty')
      writeFileSync(join(paths.contract, 'contract.json'), 'uncommitted change\n')
    if (mode === 'unknown-repository') entry(changed.parts, 0).repository = 'unknown'
    if (mode === 'contract-version') entry(changed.contracts, 0).revision = 'v2'
    if (mode === 'gate') changed.inputs = changed.inputs.filter((item) => item.id !== 'review')
    if (mode === 'input-cycle') entry(changed.inputs, 0).after = ['acceptance']
    if (mode === 'input-bytes') {
      const data = changed.inputs.find((item) => item.id === 'db')
      if (!data) throw new Error('Missing data')
      store.planning.sources.files.atomic(data.ref, 'changed seed\n')
    }
    if (mode === 'repair-owner') entry(changed.repairOwners, 0).id = 'contract'
    if (mode === 'assembly') entry(changed.assemblies, 0).head = entry(changed.parts, 0).head
    if (mode === 'personal') {
      entry(changed.parts, 0).path = root
      entry(changed.parts, 0).ref = 'refs/heads/main'
    }
    expect(() => store.prepare(changed)).toThrow()
  }),
)
it('invalidates a retained candidate when the target base advances and never refreshes its authority', () =>
  integrationFixture(async ({ store, request, root }) => {
    const pinned = store.prepare(request)
    writeFileSync(join(root, 'base-change.txt'), 'New target behavior.\n')
    git(root, ['add', '.'])
    git(root, [
      'commit',
      '-m',
      'feat: advance the disposable target',
      '-m',
      'Exercise an explicitly stale integration basis.',
    ])
    expect(store.inspect(pinned.digest)).toMatchObject({
      status: 'stale',
      reason: 'target-base-advanced',
      authority: 'not-granted',
    })
    expect(() => store.prepare(request)).toThrow('target-base-advanced')
    expect(store.get(pinned.digest).digest).toBe(pinned.digest)
  }))
it('rejects unknown and cyclic scope dependencies before candidate observation', () =>
  integrationFixture(async ({ store, request }) => {
    const plan = store.planning.getPlan(request.run, request.revision).plan
    const cycle = structuredClone(plan)
    entry(cycle.work, 0).after = ['search']
    expect(() => integrationScope(cycle, 'feature')).toThrow('cycle')
    expect(() => integrationScope(plan, 'unknown')).toThrow('unknown-milestone')
    expect(contractDigest(plan)).toBe(request.plan)
  }))

it('binds an actual two-repository vector without pretending it is an atomic product transaction', () =>
  integrationFixture(
    async ({ store, request, root }) => {
      const primary = git(root, ['rev-parse', 'HEAD']),
        record = store.prepare(request)
      expect(record.candidate.assemblies.map((item) => item.repository)).toEqual(['app', 'web'])
      expect(record.candidate.parts.map((item) => item.repository)).toEqual(['app', 'web'])
      expect(record.candidate.inputs.filter((input) => input.kind === 'recipe')).toHaveLength(2)
      expect(store.inspect(record.digest).status).toBe('current')
      expect(record.candidate.publication).toBe('not-performed')
      expect(git(root, ['rev-parse', 'HEAD'])).toBe(primary)
    },
    { secondRepository: true },
  ))
it('refuses a changed configured push destination without invoking a remote', () =>
  integrationFixture(
    async ({ store, request, root }) => {
      const record = store.prepare(request)
      git(root, ['remote', 'set-url', 'origin', 'https://github.com/fixture/changed.git'])
      expect(store.inspect(record.digest)).toMatchObject({
        status: 'stale',
        reason: 'repository-remote-changed',
      })
      expect(() => store.prepare(request)).toThrow('repository-remote-changed')
    },
    { remote: true },
  ))
it('keeps old candidates immutable and invalidates dependent evidence after a newly committed repair', () =>
  integrationFixture(async ({ store, request, paths }) => {
    const old = store.prepare(request)
    writeFileSync(join(paths.search, 'search.txt'), 'Repaired committed search.\n')
    git(paths.search, ['add', '.'])
    git(paths.search, [
      'commit',
      '-m',
      'fix: repair the disposable search part',
      '-m',
      'Require a new exact integrated candidate after code changes.',
    ])
    const head = git(paths.search, ['rev-parse', 'HEAD'])
    git(paths.assembly, ['merge', '--ff-only', head])
    const next = structuredClone(request)
    entry(next.parts, 1).head = head
    entry(next.assemblies, 0).head = head
    const current = store.prepare(next)
    expect(current.digest).not.toBe(old.digest)
    expect(store.inspect(old.digest).status).toBe('stale')
    expect(store.inspect(current.digest).status).toBe('current')
    expect(store.get(old.digest)).toEqual(old)
    expect(store.compare(old.digest, current.digest)).toMatchObject({
      sameInputs: false,
      executionReuse: 'not-authorized',
    })
  }))
it('refuses a tampered retained index instead of trusting its digest label', () =>
  integrationFixture(async ({ store, request }) => {
    const record = store.prepare(request),
      path = store.planning.sources.files.path(
        `delivery/integration-candidates/${record.digest}.json`,
      )
    const changed = JSON.parse(readFileSync(path, 'utf8'))
    changed.candidate.parts.pop()
    writeFileSync(path, JSON.stringify(changed))
    expect(() => store.get(record.digest)).toThrow()
  }))
it.each([2, 4, 8, 16])(
  'preserves committed dependency-wave requirements in a generated %i-part DAG',
  (size) =>
    integrationFixture(async ({ store, request }) => {
      const plan = structuredClone(store.planning.getPlan(request.run, request.revision).plan)
      plan.work = Array.from({ length: size }, (_, i) => ({
        id: `unit-${i}`,
        repository: 'app',
        role: i === size - 1 ? 'implementation' : 'contract',
        criteria: i === size - 1 ? ['search'] : [],
        after: i ? [`unit-${i - 1}`] : [],
        consumes: i ? [`contract-${i - 1}`] : [],
        produces:
          i === size - 1
            ? []
            : [
                {
                  id: `contract-${i}`,
                  revision: 'v1',
                  sha256: i.toString(16).padStart(64, '0'),
                  description: 'Generated explicit interface.',
                },
              ],
      }))
      entry(plan.milestones, 0).work = plan.work.map((unit) => unit.id)
      const validated = validateDeliveryPlan(plan, store.planning.sources.get(plan.source)),
        scope = integrationScope(validated, 'feature')
      expect(scope.waves).toEqual(plan.work.map((unit) => [unit.id]))
      expect(scope.units).toHaveLength(size)
      expect(scope.contracts).toHaveLength(size - 1)
    }),
)
it('executes the actual inert CLI and emits an explicit blocked result for a moving base', () =>
  integrationFixture(async ({ store, request, dir, root }) => {
    const file = join(dir, 'integration-request.json')
    writeFileSync(file, JSON.stringify(request))
    const cli = (args: string[], status = 0) => {
      const result = spawnSync(
        process.execPath,
        [resolve('dist/wl.mjs'), 'delivery', ...args, '--json'],
        { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 },
      )
      expect(result.status, result.stdout || result.stderr).toBe(status)
      return JSON.parse(result.stdout)
    }
    expect(cli(['integration-schema'])).toMatchObject({
      schema: 'wholeloop/integration-schema@1',
      executed: false,
    })
    const result = cli([
      'integration-candidate',
      '--file',
      file,
      '--root',
      dir,
      '--store',
      store.planning.sources.files.root,
    ])
    expect(result).toMatchObject({ status: 'prepared', authority: 'not-granted', executed: false })
    expect(
      cli([
        'integration-inspect',
        '--digest',
        result.record.digest,
        '--store',
        store.planning.sources.files.root,
      ]).status,
    ).toBe('current')
    expect(
      cli([
        'integration-compare',
        '--before',
        result.record.digest,
        '--after',
        result.record.digest,
        '--store',
        store.planning.sources.files.root,
      ]),
    ).toMatchObject({ sameInputs: true, executionReuse: 'not-authorized' })
    writeFileSync(join(root, 'base-change.txt'), 'Advance target.\n')
    git(root, ['add', '.'])
    git(root, [
      'commit',
      '-m',
      'feat: advance a candidate cli fixture',
      '-m',
      'Verify a typed blocked outcome without modifying worker files.',
    ])
    expect(
      cli(
        [
          'integration-candidate',
          '--file',
          file,
          '--root',
          dir,
          '--store',
          store.planning.sources.files.root,
        ],
        3,
      ),
    ).toMatchObject({ status: 'blocked', reason: 'target-base-advanced', executed: false })
  }))

it('refuses a clean committed implementation that never incorporated its same-repository predecessor', () =>
  integrationFixture(async ({ store, request, root, dir }) => {
    const plan = store.planning.getPlan(request.run, request.revision).plan,
      base = entry(plan.repositories, 0).base,
      path = join(dir, 'unrelated-part')
    git(root, ['worktree', 'add', '-b', 'wl/unrelated', path, base])
    writeFileSync(join(path, 'unrelated.txt'), 'Committed without the required interface.\n')
    git(path, ['add', '.'])
    git(path, [
      'commit',
      '-m',
      'test: seed a part without its predecessor',
      '-m',
      'Distinguish a clean commit from the required dependency basis.',
    ])
    const changed = structuredClone(request),
      part = entry(changed.parts, 1)
    part.path = path
    part.ref = 'refs/heads/wl/unrelated'
    part.head = git(path, ['rev-parse', 'HEAD'])
    expect(() => store.prepare(changed)).toThrow('uncommitted-predecessor-basis')
  }))
