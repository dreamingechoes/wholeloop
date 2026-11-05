import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { docsCheck } from '../../../src/cli/docs.js'
import type { Tree } from '../../../src/docs/check.js'
import { checkDeliveryCases, DELIVERY_CASE_MAP } from '../../../src/docs/delivery-cases.js'
import { readTree } from '../../../src/docs/tree.js'
import { parseEnforcement } from '../../../src/harness/enforcement.js'

const tree = readTree(process.cwd()),
  enforcement = parseEnforcement(readFileSync('enforcement.yml', 'utf8')),
  matrix = tree.files.get(DELIVERY_CASE_MAP)
if (!matrix) throw new Error('Actual expanded case map required')
function change(text: string): Tree {
  return { ...tree, files: new Map([...tree.files, [DELIVERY_CASE_MAP, text]]) }
}
const messages = (value: Tree) =>
  checkDeliveryCases(value, enforcement).map((problem) => problem.message)

describe('expanded delivery acceptance map', () => {
  it('maps every accepted and newly declared case to real local controls without certifying external acceptance', () => {
    expect(checkDeliveryCases(tree, enforcement)).toEqual([])
    expect(matrix.match(/^\| \[[A-Z]+-\d{2}\]/gm)).toHaveLength(86)
  })
  it('reports a removed map through the actual docs command without changing its JSON identity', () => {
    const root = mkdtempSync(join(tmpdir(), 'wholeloop-case-map-'))
    try {
      mkdirSync(join(root, 'docs'))
      mkdirSync(join(root, 'roadmap/specifications/autonomous-delivery'), { recursive: true })
      writeFileSync(
        join(root, 'docs/nav.yml'),
        'home: README.md\nconcepts: concepts.md\npages:\n  - { path: README.md, title: Index }\n',
      )
      writeFileSync(join(root, 'docs/README.md'), '# Index\n')
      writeFileSync(
        join(root, 'roadmap/specifications/autonomous-delivery/contract.md'),
        '- [ ] **AUTH-01:** Pinned input.\n',
      )
      const output: string[] = []
      expect(docsCheck(root, true, { out: (value) => output.push(value), err: () => {} })).toBe(4)
      const result = JSON.parse(output[0] ?? '')
      expect(result.schema).toBe('wholeloop/docs-check@1')
      expect(result.problems).toContainEqual({
        file: DELIVERY_CASE_MAP,
        rule: 'generated',
        message: 'missing expanded delivery case map',
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
  it('keeps unrelated documentation trees independent', () => {
    expect(
      checkDeliveryCases({ files: new Map([['docs/README.md', '# Notes']]), exists: () => false }),
    ).toEqual([])
  })
  it('refuses a removed map and a removed source definition', () => {
    const missing = new Map(tree.files)
    missing.delete(DELIVERY_CASE_MAP)
    expect(messages({ ...tree, files: missing })).toContain('missing expanded delivery case map')
    const file = 'roadmap/specifications/autonomous-delivery/01-contract-and-authorization.md',
      deleted = new Map(tree.files)
    deleted.set(file, (deleted.get(file) ?? '').replace(/^- \[[ x]\] \*\*AUTH-01:.*\n/m, ''))
    expect(messages({ ...tree, files: deleted })).toContain(
      'missing accepted case definition: AUTH-01',
    )
  })
  it('requires coverage for a newly declared case as well as the accepted baseline', () => {
    const file = 'roadmap/specifications/autonomous-delivery/01-contract-and-authorization.md',
      files = new Map(tree.files)
    files.set(file, `${files.get(file)}\n- [ ] **AUTH-09:** Additional explicit contract.\n`)
    expect(messages({ ...tree, files })).toContain('missing case row: AUTH-09')
  })
  it('rejects a missing row, duplicate row, unknown row and borrowed definition', () => {
    const row = matrix.split('\n').find((line) => line.startsWith('| [AUTH-01]'))
    if (!row) throw new Error('Actual AUTH-01 row required')
    expect(messages(change(matrix.replace(row, '')))).toContain('missing case row: AUTH-01')
    expect(messages(change(`${matrix}\n${row}`))).toContain('duplicate case row: AUTH-01')
    expect(messages(change(`${matrix}\n${row.replaceAll('AUTH-01', 'AUTH-99')}`))).toContain(
      'unknown case row: AUTH-99',
    )
    expect(
      messages(
        change(
          matrix.replace(
            row,
            row.replace('01-contract-and-authorization.md', '09-validation-and-acceptance.md'),
          ),
        ),
      ),
    ).toContain('AUTH-01: reference the exact case definition')
  })
  it('requires concrete tests and executable enforcers rather than prose or invented paths', () => {
    const row = matrix.split('\n').find((line) => line.startsWith('| [AUTH-01]'))
    if (!row) throw new Error('Actual AUTH-01 row required')
    for (const path of ['docs/README.md', 'test/unit/absent.test.ts'])
      expect(
        messages(
          change(matrix.replace(row, row.replace('test/unit/delivery/source.test.ts', path))),
        ),
      ).toContain('AUTH-01: reference concrete existing tests or evaluations')
    expect(
      messages(
        change(matrix.replace(row, row.replace('delivery-source-identity', 'invented-rule'))),
      ),
    ).toContain('AUTH-01: reference concrete mapped hard rules')
    expect(
      checkDeliveryCases(tree, {
        ...enforcement,
        rules: enforcement.rules.map((rule) =>
          rule.id === 'delivery-source-identity'
            ? { ...rule, enforcers: ['docs/README.md'] }
            : rule,
        ),
      }).some((problem) => problem.message === 'AUTH-01: reference concrete mapped hard rules'),
    ).toBe(true)
    expect(
      checkDeliveryCases(tree).some(
        (problem) => problem.message === 'case map needs the concrete enforcement registry',
      ),
    ).toBe(true)
  })
  it.each([
    ['RSR-01', 'Native reference'],
    ['REL-10', 'Hosted code host'],
    ['ENV-02', 'Backend/application'],
    ['ENV-07', 'Linux host'],
  ])('retains the required %s evidence class', (id, level) => {
    const row = matrix.split('\n').find((line) => line.startsWith(`| [${id}]`))
    if (!row) throw new Error('Actual case row required')
    const altered = row.replace(level, 'Workflow/process')
    expect(
      messages(change(matrix.replace(row, altered))).some((message) =>
        message.startsWith(`${id}: retain`),
      ),
    ).toBe(true)
  })
  it('does not let a fixture-only result claim native or hosted completion', () => {
    const row = matrix.split('\n').find((line) => line.startsWith('| [EVAL-09]'))
    if (!row) throw new Error('Actual native/hosted row required')
    expect(
      messages(
        change(
          matrix.replace(row, row.replace('Local gate; native and hosted pending', 'Local gate')),
        ),
      ),
    ).toContain('EVAL-09: keep local controls distinct from pending external acceptance')
    expect(
      messages(change(matrix.replace(row, row.replace('Native reference', 'Unverified shortcut')))),
    ).toContain('EVAL-09: unknown evidence class')
  })
})
