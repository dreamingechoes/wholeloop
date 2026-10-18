import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { detectProvider } from '../../../src/providers/detect.js'
import { loadProviders } from '../../../src/providers/load.js'
import { validateProvider } from '../../../src/providers/manifest.js'
import { MCP_TARGETS, renderMcp } from '../../../src/providers/mcp.js'
import { type OperationResult, performOperation } from '../../../src/providers/operations.js'
import { PostgreSqlSource, readOnlyStatement } from '../../../src/providers/postgresql.js'
import { querySource, type SourceQuery } from '../../../src/providers/sources.js'
import { researchPlan } from '../../../src/research/plan.js'

const ids = [
  'posthog',
  'mixpanel',
  'amplitude',
  'metabase',
  'bigquery',
  'postgresql',
  'sentry',
  'zendesk',
  'intercom',
  'confluence',
  'notion',
]
function fixture(run: (dir: string) => void | Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-sources-'))
  return Promise.resolve()
    .then(() => run(dir))
    .finally(() => rmSync(dir, { recursive: true, force: true }))
}
function inputs(id: string, dir: string) {
  const registry = loadProviders({ root: dir, user: join(dir, 'user') })
  expect(registry.problems).toEqual([])
  const selected = registry.providers.find((entry) => entry.manifest.id === id)
  if (!selected) throw new Error(`Missing source ${id}`)
  const recorded = JSON.parse(
    readFileSync(new URL(`../../fixtures/providers/sources/${id}.json`, import.meta.url), 'utf8'),
  ) as {
    request: SourceQuery
    response: OperationResult
    tool: string
  }
  return { selected, recorded, registry }
}

describe('read-only source catalog', () => {
  it.each(ids)(
    '%s has bounded tool-specific guidance, open-question degradation and a query fixture',
    (id) =>
      fixture(async (dir) => {
        const { selected, recorded } = inputs(id, dir)
        expect(selected.manifest.degrade[recorded.request.operation]).toBe('open-question')
        const guidance = selected.guidanceText[recorded.request.operation] ?? ''
        expect(guidance.trimEnd().split('\n').length).toBeLessThanOrEqual(30)
        expect(guidance).toContain(selected.manifest.name)
        const result = await querySource(selected, recorded.request, {
          async invoke(call) {
            expect(call.tool).toBe(recorded.tool)
            expect(call.args.query).toBe(recorded.request.query)
            expect(call.guidance).toBe(guidance)
            if (id === 'postgresql') expect(call.args.readOnly).toBe(true)
            if (id === 'bigquery') expect(call.tool).toBe('execute_sql_readonly')
            if (id === 'zendesk') expect(call.args.method).toBe('GET')
            return recorded.response
          },
        })
        expect(result).toMatchObject({
          status: 'observed',
          evidence: { ref: recorded.response.ref, content: recorded.response.body },
          question: null,
        })
        expect(result.pinned).toMatchObject(recorded.request)
        expect(result.pinned.sha256).toHaveLength(64)
        const response = spawnSync(
          process.execPath,
          [resolve('dist/wl.mjs'), 'provider', 'test', id, '--json'],
          {
            cwd: dir,
            env: { ...process.env, XDG_CONFIG_HOME: join(dir, 'config') },
            encoding: 'utf8',
          },
        )
        expect(response.status).toBe(0)
        expect(JSON.parse(response.stdout).problems).toEqual([])
      }),
  )

  it('requires open questions for every source mapping and does not infer a service from curl', () =>
    fixture((dir) => {
      const { selected, recorded } = inputs('zendesk', dir)
      selected.manifest.degrade[recorded.request.operation] = 'skip-with-reason'
      expect(() => validateProvider(selected.manifest)).toThrow('open-question')
      expect(loadProviders({ root: dir, user: join(dir, 'user') }).problems).toEqual([])
      expect(detectProvider(selected.manifest, [], process.env.PATH)).toMatchObject({
        available: false,
        authenticated: false,
      })
    }))

  it('offers exactly configured or detected sources without requiring live authentication', () =>
    fixture((dir) => {
      const { registry } = inputs('posthog', dir)
      const plan = researchPlan({
        subject: 'brief-12345678',
        run: 'run-0000000000000000',
        question: 'How do people find orders?',
        owner: 'Alex',
        configuration: { providers: { sources: ids } },
        registry,
        declarations: [],
        path: '',
      })
      expect(new Set(plan.angles.map((angle) => angle.provider))).toEqual(
        new Set([...ids, 'native-code', 'native-web']),
      )
      expect(plan.angles.find((angle) => angle.provider === 'posthog')?.available).toBe(false)
      const detected = researchPlan({
        subject: plan.subject,
        run: plan.run,
        question: plan.question,
        owner: plan.owner,
        configuration: {},
        registry,
        declarations: [{ target: 'codex', server: 'posthog', enabled: true, file: 'fixture' }],
        path: '',
      })
      expect(detected.angles.map((angle) => angle.provider)).toEqual([
        'native-code',
        'native-web',
        'posthog',
      ])
    }))

  it('renders explicit PostHog tools mode without accepting credential query parameters', () =>
    fixture((dir) => {
      const { selected } = inputs('posthog', dir)
      for (const target of MCP_TARGETS)
        expect(renderMcp(selected.manifest, target).snippet).toContain('?mode=tools')
      for (const suffix of [
        '?token=redacted',
        '?mode=tools&secret=redacted',
        '?mode=tools&mode=cli',
        '?mode=secret',
      ]) {
        const changed = structuredClone(selected.manifest)
        if (changed.access.mcp)
          changed.access.mcp.install.url = `https://mcp.posthog.com/mcp${suffix}`
        expect(() => validateProvider(changed)).toThrow('without credentials')
      }
    }))
})

describe('source evidence and failure boundary', () => {
  it.each([{ status: 'pending' }, { complete: false }, { body: '' }])(
    'retains partial/pending results as explicit unknowns: %j',
    (change) =>
      fixture(async (dir) => {
        const { selected, recorded } = inputs('posthog', dir)
        const result = await querySource(selected, recorded.request, {
          async invoke() {
            return { ...recorded.response, ...change } as OperationResult
          },
        })
        expect(result).toMatchObject({
          status: 'open-question',
          evidence: null,
          question: { who: 'Alex' },
        })
        expect(result.pinned.query).toBe(recorded.request.query)
      }),
  )

  it('omits raw tool errors and rejects invalid windows before invoking a source', () =>
    fixture(async (dir) => {
      const { selected, recorded } = inputs('bigquery', dir)
      let calls = 0
      const host = {
        async invoke(): Promise<OperationResult> {
          calls++
          throw new Error('private tool payload')
        },
      }
      const result = await querySource(selected, recorded.request, host)
      expect(result.status).toBe('open-question')
      expect(JSON.stringify(result)).not.toContain('private tool payload')
      for (const change of [
        { owner: '' },
        { query: ' ' },
        { window: { ...recorded.request.window, start: 'yesterday' } },
        { window: { ...recorded.request.window, end: recorded.request.window.start } },
        { window: { ...recorded.request.window, timezone: 'Invalid/Timezone' } },
      ])
        await expect(
          querySource(selected, { ...recorded.request, ...change }, host),
        ).rejects.toThrow()
      expect(calls).toBe(1)
      await expect(
        querySource(selected, { ...recorded.request, operation: 'docs.create' }, host),
      ).rejects.toThrow('read-only source')
      expect(calls).toBe(1)
      await expect(performOperation(selected, 'source.support.query', {}, host)).rejects.toThrow(
        'does not support',
      )
    }))
})

describe('PostgreSQL read-only execution boundary', () => {
  it.each([
    'SELECT 1; COMMIT; DELETE FROM orders',
    'WITH changed AS (DELETE FROM orders RETURNING *) SELECT * FROM changed',
    'SELECT * INTO TEMP orders_copy FROM orders',
    'SELECT 1 \\gexec',
    'SELECT $$COMMIT$$',
    'SELECT 1; \\connect other',
    "SELECT 'unterminated",
    'SELECT 1 /* unterminated',
    'SET transaction_read_only = off',
  ])('rejects transaction escapes and unsupported statements: %s', (query) => {
    expect(() => readOnlyStatement(query)).toThrow()
  })

  it('preserves quoted values, nested comments and a single optional terminator', () => {
    for (const query of [
      "SELECT 'DELETE; COMMIT' AS message",
      '/* outer /* nested */ comment */ WITH x AS (SELECT 1) SELECT * FROM x;',
      'SELECT "update" FROM orders -- note',
      "SELECT 'can''t' AS message",
    ]) {
      expect(readOnlyStatement(query)).toBe(query)
    }
  })

  it('runs psql through stdin with server read-only mode and no credential arguments', () =>
    fixture(async (dir) => {
      const binary = join(dir, 'fixture-psql')
      const capture = join(dir, 'captured.json')
      writeFileSync(
        binary,
        `#!${process.execPath}\nconst fs = require('node:fs'); const input = fs.readFileSync(0, 'utf8'); fs.writeFileSync(${JSON.stringify(capture)}, JSON.stringify({argv: process.argv.slice(2), input})); process.stdout.write('count\\n12\\n');\n`,
      )
      chmodSync(binary, 0o755)
      const { selected, recorded } = inputs('postgresql', dir)
      const result = await querySource(
        selected,
        recorded.request,
        new PostgreSqlSource('analytics-readonly', binary),
      )
      expect(result.status).toBe('observed')
      const actual = JSON.parse(readFileSync(capture, 'utf8'))
      expect(actual.argv).toContain('service=analytics-readonly')
      expect(actual.argv).not.toContain(recorded.request.query)
      expect(actual.input).toContain('BEGIN READ ONLY;')
      expect(actual.input).toContain("SET LOCAL statement_timeout = '30s';")
      expect(actual.input).toContain(recorded.request.query)
      expect(actual.input).toMatch(/ROLLBACK;\n$/)
      expect(() => new PostgreSqlSource('postgres://user:credential@example/db')).toThrow(
        'never a credential URI',
      )
    }))
})
