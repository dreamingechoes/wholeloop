import { spawnSync } from 'node:child_process'
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { conformanceMatrix } from '../../../src/conformance/matrix.js'
import { conformancePage } from '../../../src/conformance/page.js'

const at = '2026-10-20T12:00:00.000Z'
const empty = { schema: 'wholeloop/conformance-results@1', runs: [] }
const prose = '# Platforms\n\nPreserve this introduction.\n\n'
const suffix = '\n\nPreserve this conclusion.\n'
const page = `${prose}<!-- conformance:start -->\nPrevious snapshot\n<!-- conformance:end -->${suffix}`
function fixture(run: (root: string, file: string) => void) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-conformance-page-')))
  const file = join(root, 'docs/platforms/README.md')
  mkdirSync(join(root, 'docs/platforms'), { recursive: true })
  writeFileSync(file, page)
  try {
    run(root, file)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('explicit conformance documentation projections', () => {
  it('refuses a replacement that would exceed its own page read budget', () =>
    fixture((root, file) => {
      const before = `${'x'.repeat(1024 * 1024 - Buffer.byteLength(page) - 1)}${page}`
      writeFileSync(file, before)
      expect(() => conformancePage(root, conformanceMatrix(empty, at), true)).toThrow(
        /exceeds 1 MiB/,
      )
      expect(readFileSync(file, 'utf8')).toBe(before)
    }))
  it('checks without writing, updates only its section and leaves matching output untouched', () =>
    fixture((root, file) => {
      const matrix = conformanceMatrix(empty, at)
      expect(conformancePage(root, matrix)).toMatchObject({ status: 'stale', written: false })
      expect(readFileSync(file, 'utf8')).toBe(page)
      expect(conformancePage(root, matrix, true)).toMatchObject({
        status: 'updated',
        written: true,
      })
      const after = readFileSync(file, 'utf8')
      expect(after.startsWith(prose)).toBe(true)
      expect(after.endsWith(suffix)).toBe(true)
      expect(after).toContain('| cursor | latest | — | — | unrun | UNRUN | — |')
      expect(after).not.toContain('| PASS |')
      expect(after).toContain('not independently authenticated')
      const modified = lstatSync(file).mtimeMs
      expect(conformancePage(root, matrix, true)).toMatchObject({
        status: 'current',
        written: false,
      })
      expect(lstatSync(file).mtimeMs).toBe(modified)
    }))
  it('retains observation dates and simulation/stale evidence without publishing raw reports', () =>
    fixture((root, file) => {
      const matrix = conformanceMatrix(
        {
          ...empty,
          runs: [
            {
              channel: 'pinned',
              observedAt: '2026-10-17T11:00:00.000Z',
              report: {
                schema: 'wholeloop/conformance-report@1',
                id: `cf-${'a'.repeat(24)}`,
                cli: 'gemini',
                pin: '0.27.0',
                step: 'frame-problem',
                scenario: 'standalone-frame-v1',
                core: 'b'.repeat(64),
                source: 'c'.repeat(64),
                scenarioDigest: 'd'.repeat(64),
                status: 'FIXTURE_PASS',
                evidence: 'simulation',
                missing: [],
                problems: [],
                subject: 'init-01234567',
                process: { status: 'succeeded', code: 0, signal: null },
                journal: '/external/private-fixture-path',
                ignored: 'private-fixture-detail',
              },
            },
          ],
        },
        at,
      )
      conformancePage(root, matrix, true)
      const after = readFileSync(file, 'utf8')
      expect(after).toContain(`As of ${at}`)
      expect(after).toContain('| simulation | STALE / FIXTURE_PASS | 2026-10-17T11:00:00.000Z |')
      expect(after).not.toContain('private-fixture')
      expect(after).not.toContain('| PASS |')
    }))
  it.each([
    'No owned section',
    '<!-- conformance:end -->\n<!-- conformance:start -->',
    '<!-- conformance:start -->',
    `${page}\n<!-- conformance:start -->`,
    `${page}\n<!-- conformance:end -->`,
  ])('preserves malformed or missing marker ownership %#', (before) =>
    fixture((root, file) => {
      writeFileSync(file, before)
      expect(() => conformancePage(root, conformanceMatrix(empty, at), true)).toThrow(/marker pair/)
      expect(readFileSync(file, 'utf8')).toBe(before)
    }),
  )
  it.each(['page', 'platforms', 'docs', 'oversized'])('refuses unsafe %s before writing', (kind) =>
    fixture((root, file) => {
      if (kind === 'oversized') writeFileSync(file, 'x'.repeat(1024 * 1024 + 1))
      else {
        const source =
          kind === 'page' ? file : join(root, kind === 'docs' ? 'docs' : 'docs/platforms')
        const moved = join(root, 'preserved')
        renameSync(source, moved)
        symlinkSync(moved, source, kind === 'page' ? 'file' : 'dir')
      }
      const before = readFileSync(file, 'utf8')
      expect(() => conformancePage(root, conformanceMatrix(empty, at), true)).toThrow(
        /bounded page/,
      )
      expect(readFileSync(file, 'utf8')).toBe(before)
    }),
  )
  it('checks and writes through the compiled CLI with exact time and preserved source input', () =>
    fixture((root, file) => {
      const input = join(root, 'results.json')
      const before = JSON.stringify(empty)
      writeFileSync(input, before)
      const cli = (...args: string[]) =>
        spawnSync(
          process.execPath,
          [resolve('dist/wl.mjs'), 'conformance', 'matrix', input, ...args],
          { cwd: root, encoding: 'utf8' },
        )
      expect(cli('--write', '--at', at, '--json').status).toBe(4)
      expect(cli('--docs', root, '--json').status).toBe(4)
      expect(cli('--docs', root, '--at', at, '--markdown').status).toBe(4)
      const checked = cli('--docs', root, '--at', at, '--json')
      expect(checked.status, checked.stderr).toBe(4)
      expect(JSON.parse(checked.stdout).documentation).toMatchObject({
        status: 'stale',
        written: false,
      })
      expect(readFileSync(file, 'utf8')).toBe(page)
      const written = cli('--docs', root, '--at', at, '--write', '--json')
      expect(written.status, written.stderr).toBe(0)
      expect(JSON.parse(written.stdout).documentation).toMatchObject({
        status: 'updated',
        written: true,
      })
      const current = cli('--docs', root, '--at', at, '--json')
      expect(current.status, current.stderr).toBe(0)
      expect(JSON.parse(current.stdout).documentation.status).toBe('current')
      const after = readFileSync(file, 'utf8')
      writeFileSync(input, JSON.stringify({ ...empty, schema: 'invalid' }))
      expect(cli('--docs', root, '--at', at, '--write', '--json').status).not.toBe(0)
      expect(readFileSync(file, 'utf8')).toBe(after)
      writeFileSync(input, before)
      expect(readFileSync(input, 'utf8')).toBe(before)
    }))
})
