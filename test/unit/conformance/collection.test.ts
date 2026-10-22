import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bundledCanonical } from '../../../src/adapters/canonical.js'
import { collectConformance, conformanceCollection } from '../../../src/conformance/collection.js'
import { CONFORMANCE_TARGETS, type ConformanceContext } from '../../../src/conformance/contracts.js'
import { conformanceMatrix } from '../../../src/conformance/matrix.js'
import { conformanceBinary } from '../../../src/conformance/recipes.js'

const pair = () => ({
  schema: 'wholeloop/conformance-collection@1',
  entries: [
    { cli: 'codex', channel: 'pinned', pin: '99.0.0' },
    { cli: 'codex', channel: 'latest', pin: '99.0.1' },
  ],
})
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-collection-')))
  const context: ConformanceContext = {
    store: join(root, 'store'),
    canonical: bundledCanonical(),
    core: readFileSync(resolve('dist/wl.mjs'), 'utf8'),
    version: '0.0.0',
  }
  return { root, context }
}

describe('bounded exact-version collection plans', () => {
  it('accepts all fourteen explicit channels without mutating source metadata', () => {
    const entries = CONFORMANCE_TARGETS.flatMap((cli) =>
      ['pinned', 'latest'].map((channel) => ({
        cli,
        channel,
        pin: cli === 'cursor' ? '2026.07.16-899851b' : '99.0.0',
      })),
    )
    const plan = { schema: 'wholeloop/conformance-collection@1', entries }
    const result = conformanceCollection(plan)
    expect(result).toEqual(entries)
    if (result[0]) result[0].pin = '98.0.0'
    expect(plan.entries[0]?.pin).toBe('99.0.0')
  })
  it.each([
    'duplicate',
    'empty',
    'oversized',
    'moving',
    'path',
    'unknown-field',
    'long-pin',
    'newline',
  ])('refuses %s plans before setup', async (kind) => {
    const { root, context } = fixture()
    try {
      const plan = pair()
      if (kind === 'duplicate')
        plan.entries.push({ ...(plan.entries[0] as (typeof plan.entries)[number]) })
      if (kind === 'empty') plan.entries = []
      if (kind === 'oversized') plan.entries = Array(15).fill(plan.entries[0])
      const first = plan.entries[0]
      if (first && kind === 'moving') first.pin = 'latest'
      if (first && kind === 'path') first.cli = '../shell'
      if (first && kind === 'unknown-field')
        Object.assign(first, { executable: 'private-fixture-detail' })
      if (first && kind === 'long-pin') first.pin = `1.0.0-${'a'.repeat(128)}`
      if (first && kind === 'newline') first.pin = '99.0.0\n'
      await expect(collectConformance(context, plan, 'fixture')).rejects.toThrow()
      expect(existsSync(context.store)).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('fresh multi-client conformance collection', () => {
  it('executes all seven targets and both channels as simulation with matrix-ready projections', async () => {
    const { root, context } = fixture()
    try {
      const entries = CONFORMANCE_TARGETS.flatMap((cli) =>
        ['pinned', 'latest'].map((channel) => ({
          cli,
          channel,
          pin: cli === 'opencode' ? (channel === 'pinned' ? '1.17.9' : '2.1.1') : '99.0.0',
        })),
      )
      const result = await collectConformance(
        context,
        { schema: 'wholeloop/conformance-collection@1', entries },
        'fixture',
      )
      expect(result).toMatchObject({
        schema: 'wholeloop/conformance-results@1',
        status: 'completed',
        mode: 'fixture',
        planned: 14,
      })
      expect(result.runs).toHaveLength(14)
      expect(new Set(result.runs.map((run) => run.report.id)).size).toBe(14)
      for (const run of result.runs) {
        expect(run.report).toMatchObject({ status: 'FIXTURE_PASS', evidence: 'simulation' })
        expect(run.report).not.toHaveProperty('journal')
        expect(run.report.subject).toMatch(/^init-[a-f0-9]{8}$/)
      }
      expect(JSON.stringify(result)).not.toContain(root)
      const matrix = conformanceMatrix(result, new Date().toISOString())
      expect(matrix.rows.every((row) => row.status === 'FIXTURE_PASS')).toBe(true)
      expect(matrix.regressionCandidates).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 60000)

  it('refuses an unsupported OpenCode dialect before writing any earlier entry', async () => {
    const { root, context } = fixture()
    try {
      await expect(
        collectConformance(
          context,
          {
            schema: 'wholeloop/conformance-collection@1',
            entries: [
              { cli: 'codex', channel: 'pinned', pin: '99.0.0' },
              { cli: 'opencode', channel: 'latest', pin: '3.0.0' },
            ],
          },
          'fixture',
        ),
      ).rejects.toThrow(/exact supported/)
      expect(existsSync(context.store)).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('requires every selected binary before writes and never substitutes the global channel', async () => {
    const { root, context } = fixture()
    try {
      const binRoot = join(root, 'clients'),
        bin = join(binRoot, 'codex/pinned/bin')
      mkdirSync(bin, { recursive: true })
      symlinkSync(process.execPath, join(bin, 'codex'))
      await expect(collectConformance(context, pair(), 'live', { binRoot })).rejects.toThrow()
      expect(existsSync(context.store)).toBe(false)
      await expect(collectConformance(context, pair(), 'live')).rejects.toThrow(/bin-root/)
      await expect(collectConformance(context, pair(), 'fixture', { binRoot })).rejects.toThrow()
      await expect(
        collectConformance(context, pair(), 'fixture', { timeoutMs: 99 }),
      ).rejects.toThrow()
      expect(existsSync(context.store)).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('continues after a synthetic native crash and records each exact observed version', async () => {
    const { root, context } = fixture()
    try {
      const binRoot = join(root, 'clients'),
        marker = join(root, 'latest-started')
      for (const entry of pair().entries) {
        const bin = join(binRoot, entry.cli, entry.channel, 'bin')
        mkdirSync(bin, { recursive: true })
        const body =
          entry.channel === 'pinned'
            ? 'process.exit(7)'
            : `require('node:fs').writeFileSync(${JSON.stringify(marker)},'fixture');process.exit(0)`
        writeFileSync(
          join(bin, conformanceBinary(entry.cli)),
          `#!${process.execPath}\nif(process.argv.includes('--version')){console.log(${JSON.stringify(entry.pin)});process.exit(0)}\n${body}\n`,
          { mode: 0o755 },
        )
      }
      const result = await collectConformance(context, pair(), 'live', { binRoot, timeoutMs: 5000 })
      expect(result.runs.map((run) => run.report.process?.version)).toEqual(['99.0.0', '99.0.1'])
      expect(result.runs[0]?.report.process).toMatchObject({ status: 'crashed', code: 7 })
      expect(result.runs[1]?.report.process).toMatchObject({ status: 'succeeded', code: 0 })
      expect(result.runs.every((run) => run.report.status === 'FAIL')).toBe(true)
      expect(existsSync(marker)).toBe(true)
      expect(conformanceMatrix(result, new Date().toISOString()).regressionCandidates).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('returns explicit cancellation without creating a fixture when already cancelled', async () => {
    const { root, context } = fixture()
    try {
      const controller = new AbortController()
      controller.abort()
      const result = await collectConformance(context, pair(), 'fixture', {
        signal: controller.signal,
      })
      expect(result).toMatchObject({ status: 'cancelled', planned: 2, runs: [] })
      expect(existsSync(context.store)).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('executes compiled collection without touching an empty HOME and refuses unsafe plan input', () => {
    const { root, context } = fixture()
    try {
      const home = join(root, 'home'),
        workspace = join(root, 'workspace'),
        input = join(root, 'plan.json')
      mkdirSync(home)
      mkdirSync(workspace)
      writeFileSync(input, JSON.stringify(pair()))
      const cli = (file = input, mode = '--fixture') =>
        spawnSync(
          process.execPath,
          [
            resolve('dist/wl.mjs'),
            'conformance',
            'collect',
            file,
            mode,
            '--store',
            context.store,
            '--json',
          ],
          {
            cwd: workspace,
            encoding: 'utf8',
            env: {
              ...process.env,
              HOME: home,
              PATH: [dirname(process.execPath), process.env.PATH].join(delimiter),
            },
            timeout: 60000,
          },
        )
      const result = cli()
      expect(result.status, result.stdout + result.stderr).toBe(0)
      expect(JSON.parse(result.stdout).runs).toHaveLength(2)
      expect(result.stdout).not.toContain(root)
      expect(readdirSync(home)).toEqual([])
      const linked = join(root, 'linked.json')
      symlinkSync(input, linked)
      expect(cli(linked).status).not.toBe(0)
      writeFileSync(input, 'private-fixture-detail')
      const invalid = cli()
      expect(invalid.status).not.toBe(0)
      expect(invalid.stdout + invalid.stderr).not.toContain('private-fixture-detail')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 60000)
})
