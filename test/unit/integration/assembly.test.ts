import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { acceptanceShape } from '../../../src/acceptance/contracts.js'
import output from '../../../src/cli/schemas/output-v1.json' with { type: 'json' }
import type { Schema } from '../../../src/config/schema.js'
import { IntegrationAssembly } from '../../../src/integration/assembly.js'
import { authorization, git } from '../../support/delivery.js'
import { integrationFixture } from '../../support/integration.js'

async function assemblyFixture(
  run: (context: {
    assembly: IntegrationAssembly
    record: ReturnType<IntegrationAssembly['prepare']>
    root: string
    dir: string
    paths: { contract: string; search: string; assembly: string }
  }) => Promise<void>,
  options: { secondRepository?: boolean; withConflict?: boolean; integrationRepairs?: number } = {},
) {
  await integrationFixture(async ({ store, request, root, dir, paths }) => {
    const assembly = new IntegrationAssembly(store.planning.sources.files.root),
      plan = store.planning.getPlan(request.run, request.revision).plan
    const grant = assembly.effects.lifecycle.authority.authorize(authorization(plan, request.plan))
    assembly.effects.lifecycle.track({
      run: request.run,
      revision: request.revision,
      grant: grant.grant.id,
    })
    assembly.effects.lifecycle.transition(request.run, {
      to: 'queued',
      reason: 'Exercise actual owned integration assembly.',
    })
    const record = assembly.prepare({
      schema: 'wholeloop/integration-assembly-request@1',
      run: request.run,
      revision: request.revision,
      plan: request.plan,
      milestone: request.milestone,
      key: 'first',
      parts: request.parts,
    })
    await run({ assembly, record, root, dir, paths })
  }, options)
}
it('creates and commits the complete ordered assembly without changing personal or worker files', () =>
  assemblyFixture(async ({ assembly, record, root, paths }) => {
    const main = git(root, ['rev-parse', 'HEAD']),
      worker = readFileSync(join(paths.search, 'search.txt'), 'utf8')
    const result = await assembly.execute(record.digest)
    expect(result.status).toBe('assembled')
    expect(result.repositories[0]?.effects).toHaveLength(3)
    expect(result.acceptance).toBe('not-established')
    expect(git(root, ['rev-parse', 'HEAD'])).toBe(main)
    expect(readFileSync(join(paths.search, 'search.txt'), 'utf8')).toBe(worker)
    expect((await assembly.execute(record.digest)).status).toBe('assembled')
    expect(assembly.effects.inspect(record.assembly.request.run)).toHaveLength(3)
  }))
it('keeps two repository assembly separate from whole-feature acceptance and publication', () =>
  assemblyFixture(
    async ({ assembly, record }) => {
      const result = await assembly.execute(record.digest)
      expect(result.status).toBe('assembled')
      expect(assembly.prepare(record.assembly.request).digest).toBe(record.digest)
      expect(result.repositories).toHaveLength(2)
      expect(result).toMatchObject({
        acceptance: 'not-established',
        publication: 'not-performed',
        rollback: 'not-performed',
      })
    },
    { secondRepository: true },
  ))
it('refuses a revoked grant before any Git mutation', () =>
  assemblyFixture(async ({ assembly, record }) => {
    assembly.effects.lifecycle.authority.revoke({
      schema: 'wholeloop/delivery-revocation-request@1',
      grant: record.assembly.grant,
      operator: 'Fixture Operator',
      reason: 'Stop this disposable trial.',
    })
    await expect(assembly.execute(record.digest)).rejects.toThrow('inactive-assembly-authority')
    expect(assembly.effects.inspect(record.assembly.request.run)).toHaveLength(0)
  }))

it('retains actual conflicts and repairs in a new owned worktree under the original counter', () =>
  assemblyFixture(
    async ({ assembly, record, paths }) => {
      const failed = await assembly.execute(record.digest)
      expect(failed.status).toBe('conflict')
      const conflicted = failed.repositories[0]
      if (!conflicted) throw new Error('Missing conflict')
      expect(readFileSync(join(conflicted.path, 'app.txt'), 'utf8')).toContain('<<<<<<<')
      const originalConflict = readFileSync(join(conflicted.path, 'app.txt'), 'utf8')
      writeFileSync(join(paths.search, 'app.txt'), 'Left-hand interface.\n')
      git(paths.search, ['add', '.'])
      git(paths.search, [
        'commit',
        '-m',
        'fix: align the committed implementation with its interface',
        '-m',
        'Repair the declared source branch while preserving the failed assembly.',
      ])
      const request = structuredClone(record.assembly.request)
      request.key = 'repair'
      request.repairOf = record.digest
      const part = request.parts.find((p) => p.work === 'search')
      if (!part) throw new Error('Missing repair part')
      part.head = git(paths.search, ['rev-parse', 'HEAD'])
      const next = assembly.prepare(request),
        passed = await assembly.execute(next.digest)
      expect(passed.status).toBe('assembled')
      expect(passed.repositories[0]?.path).not.toBe(conflicted.path)
      expect(readFileSync(join(conflicted.path, 'app.txt'), 'utf8')).toBe(originalConflict)
      expect(assembly.inspect(record.digest).status).toBe('stale')
      expect(
        new (await import('../../../src/delivery/budgets.js')).DeliveryBudgets(
          assembly.files.root,
        ).inspect(request.run).counters.integrationRepairs,
      ).toBe(1)
    },
    { withConflict: true },
  ))
it('retains a two-repository partial outcome without whole-feature success or rollback', () =>
  assemblyFixture(
    async ({ assembly, record }) => {
      const result = await assembly.execute(record.digest)
      expect(result.status).toBe('partial')
      expect(result.repositories.map((r) => r.status)).toEqual(['assembled', 'conflict'])
      expect(result).toMatchObject({
        acceptance: 'not-established',
        publication: 'not-performed',
        rollback: 'not-performed',
      })
    },
    { secondRepository: true, withConflict: true },
  ))
it('refuses a configured controller-side Git helper before preparing any owned worktree', () =>
  assemblyFixture(async ({ assembly, record, root }) => {
    git(root, ['config', 'merge.external.driver', 'sh -c false'])
    await expect(assembly.execute(record.digest)).rejects.toThrow(
      'controller-git-helper-unavailable',
    )
    expect(assembly.effects.inspect(record.assembly.request.run)).toHaveLength(0)
    expect(record.assembly.repositories.every((r) => !existsSync(r.path))).toBe(true)
  }))

it('orders cross-repository producers before consumers even when repository IDs sort oppositely', () =>
  assemblyFixture(
    async ({ assembly, record }) => {
      const original = assembly.effects.lifecycle.authority.planning.getPlan(
          record.assembly.request.run,
          1,
        ).plan,
        plan = structuredClone(original)
      plan.run = 'delivery-1123456789abcdef'
      const swap = (id: string) => (id === 'app' ? 'web' : 'app')
      for (const repo of plan.repositories) repo.id = swap(repo.id)
      for (const work of plan.work) if (work.repository) work.repository = swap(work.repository)
      const prepared = assembly.effects.lifecycle.authority.planning.preparePlan(plan),
        request = authorization(plan, prepared.digest)
      request.id = 'authorization-1123456789abcdef'
      const grant = assembly.effects.lifecycle.authority.authorize(request)
      assembly.effects.lifecycle.track({ run: plan.run, revision: 1, grant: grant.grant.id })
      assembly.effects.lifecycle.transition(plan.run, {
        to: 'queued',
        reason: 'Observe actual cross-repository dependency order.',
      })
      const candidate = assembly.prepare({
        ...record.assembly.request,
        run: plan.run,
        plan: prepared.digest,
        parts: record.assembly.request.parts.map((p) => ({ ...p, repository: swap(p.repository) })),
      })
      expect((await assembly.execute(candidate.digest)).status).toBe('assembled')
      expect(
        assembly.effects
          .inspect(plan.run)
          .filter((e) => e.intent.operation === 'git.commit')
          .map((e) => e.intent.repository),
      ).toEqual(['web', 'app'])
    },
    { secondRepository: true },
  ))
it('preserves a failed assembly and refuses further Git writes when the original repair budget is zero', () =>
  assemblyFixture(
    async ({ assembly, record }) => {
      expect((await assembly.execute(record.digest)).status).toBe('conflict')
      const before = assembly.effects.inspect(record.assembly.request.run).length
      const repair = assembly.prepare({
        ...record.assembly.request,
        key: 'repair',
        repairOf: record.digest,
      })
      await expect(assembly.execute(repair.digest)).rejects.toThrow('integration-repair-budget')
      expect(assembly.effects.inspect(record.assembly.request.run)).toHaveLength(before)
      expect(repair.assembly.repositories.every((r) => !existsSync(r.path))).toBe(true)
    },
    { withConflict: true, integrationRepairs: 0 },
  ))

it('executes compiled assembly, inspection and read-only reconciliation with closed public contracts', () =>
  assemblyFixture(async ({ assembly, record, dir, root }) => {
    const file = join(dir, 'assembly.json')
    writeFileSync(file, JSON.stringify(record.assembly.request))
    const cli = (args: string[]) => {
      const result = spawnSync(
        process.execPath,
        [resolve('dist/wl.mjs'), 'delivery', ...args, '--json'],
        { cwd: root, encoding: 'utf8' },
      )
      expect(result.status, result.stderr || result.stdout).toBe(0)
      const value = JSON.parse(result.stdout) as {
        schema: string
        digest?: string
        status?: string
        executed?: boolean
      }
      const schema = output.oneOf.find((v) => v.properties.schema.const === value.schema)
      if (!schema) throw new Error('Missing public assembly schema')
      acceptanceShape(value, schema as unknown as Schema)
      return value
    }
    expect(cli(['integration-assembly-schema']).executed).toBe(false)
    expect(
      cli(['integration-assemble', '--file', file, '--root', dir, '--store', assembly.files.root])
        .status,
    ).toBe('assembled')
    const count = assembly.effects.inspect(record.assembly.request.run).length
    expect(
      cli([
        'integration-assembly-status',
        '--digest',
        record.digest,
        '--store',
        assembly.files.root,
      ]).status,
    ).toBe('assembled')
    expect(
      cli([
        'integration-assembly-reconcile',
        '--digest',
        record.digest,
        '--store',
        assembly.files.root,
      ]).status,
    ).toBe('assembled')
    expect(assembly.effects.inspect(record.assembly.request.run)).toHaveLength(count)
  }))
