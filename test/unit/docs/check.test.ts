import { describe, expect, it } from 'vitest'
import { checkLinks, checkNav, type Tree } from '../../../src/docs/check.js'
import { parseNav, renderFooter } from '../../../src/docs/nav.js'

const NAV = parseNav(`
home: README.md
concepts: concepts.md
pages:
  - { path: README.md, title: Docs index }
  - { path: concepts.md, title: Concepts }
`)

const BANNER = '# T\n\n> [!NOTE]\n> **Status: 📐 design.**\n\n'

function tree(files: Record<string, string>, extra: string[] = []): Tree {
  const map = new Map(Object.entries(files))
  return { files: map, exists: (path) => map.has(path) || extra.includes(path) }
}

function page(index: number, body = ''): string {
  return `${BANNER}${body}\n${renderFooter(NAV, index)}`
}

describe('checkNav', () => {
  it('passes a consistent tree', () => {
    expect(checkNav(NAV, tree({ 'docs/README.md': page(0), 'docs/concepts.md': page(1) }))).toEqual(
      [],
    )
  })

  it('reports drift, missing banner, missing page and unlisted page', () => {
    const problems = checkNav(
      NAV,
      tree({
        'docs/README.md': `${BANNER}\n<!-- docnav -->\nstale\n`,
        'docs/orphan.md': page(0),
        'docs/decisions/0001-x.md': 'adr',
      }),
    )
    expect(problems.map((p) => `${p.rule}:${p.file}`)).toEqual([
      'docnav:docs/README.md',
      'nav:docs/nav.yml',
      'nav:docs/orphan.md',
    ])
    const noBanner = checkNav(
      NAV,
      tree({
        'docs/README.md': page(0).replace('**Status', 'Status'),
        'docs/concepts.md': page(1),
      }),
    )
    expect(noBanner.map((p) => p.rule)).toEqual(['banner'])
  })
})

describe('checkLinks', () => {
  it('resolves relative paths, anchors, directories and ignores external links', () => {
    const files = {
      'README.md':
        '[ok](docs/a.md#section-one) [dir](src/) [web](https://x.dev) [self](#top)\n# Top',
      'docs/a.md': '## Section one\n[up](../README.md)',
    }
    expect(checkLinks(tree(files, ['src']))).toEqual([])
  })

  it('reports broken files and missing anchors with line numbers', () => {
    const files = { 'docs/a.md': 'x\n[gone](b.md)\n[bad](a.md#nope)' }
    expect(checkLinks(tree(files))).toEqual([
      { file: 'docs/a.md', line: 2, rule: 'link', message: 'broken link: b.md' },
      { file: 'docs/a.md', line: 3, rule: 'anchor', message: 'missing anchor: a.md#nope' },
    ])
  })
})

describe('referenced architecture decisions', () => {
  it.each(['Accepted', 'Superseded', 'Superseded by [ADR-0002](./0002-next.md)'])(
    'accepts an explicit %s decision status',
    (status) => {
      const files = {
        'docs/a.md': '[decision](decisions/0001-record.md)',
        'docs/decisions/0001-record.md': `# Decision\n\n- **Status:** ${status}\n`,
        'docs/decisions/0002-next.md': '# Next\n\n- **Status:** Accepted\n',
      }
      expect(checkLinks(tree(files))).toEqual([])
    },
  )
  it.each(['Proposed', 'accepted', 'Accepted eventually', 'Rejected', '', 'Superseded eventually'])(
    'refuses a referenced decision with status %s',
    (status) => {
      const files = {
        'docs/a.md': '[decision](decisions/0001-record.md)',
        'docs/decisions/0001-record.md': `# Decision\n\n- **Status:** ${status}\n`,
      }
      const problems = checkLinks(tree(files))
      expect(problems).toHaveLength(1)
      expect(problems[0]).toMatchObject({
        file: 'docs/decisions/0001-record.md',
        rule: 'adr-status',
      })
    },
  )
  it('refuses duplicate/late status declarations, checks repeated references once and leaves unreferenced drafts alone', () => {
    const duplicate = '# Decision\n- **Status:** Accepted\n- **Status:** Superseded\n'
    for (const content of [duplicate, `${'\n'.repeat(15)}- **Status:** Accepted\n`]) {
      expect(
        checkLinks(
          tree({
            'docs/a.md': '[one](decisions/0001-record.md) [two](decisions/0001-record.md)',
            'docs/decisions/0001-record.md': content,
          }),
        ).map((problem) => problem.rule),
      ).toEqual(['adr-status'])
    }
    expect(
      checkLinks(tree({ 'docs/decisions/0001-record.md': '# Decision\n- **Status:** Proposed\n' })),
    ).toEqual([])
  })
  it('retains missing-decision and superseding-link failures', () => {
    expect(
      checkLinks(tree({ 'docs/a.md': '[decision](decisions/0001-missing.md)' })).map((p) => p.rule),
    ).toEqual(['link'])
    expect(
      checkLinks(
        tree({
          'docs/a.md': '[decision](decisions/0001-record.md)',
          'docs/decisions/0001-record.md':
            '# Decision\n- **Status:** Superseded by [ADR-0002](./0002-missing.md)\n',
        }),
      ).map((p) => p.rule),
    ).toEqual(['link'])
  })
})

it('refuses a superseding label that disagrees with its linked decision identity', () => {
  const problems = checkLinks(
    tree({
      'docs/a.md': '[decision](decisions/0001-record.md)',
      'docs/decisions/0001-record.md':
        '# Decision\n- **Status:** Superseded by [ADR-0002](./0003-next.md)\n',
      'docs/decisions/0003-next.md': '# Next\n- **Status:** Accepted\n',
    }),
  )
  expect(problems.map((problem) => problem.rule)).toEqual(['adr-status'])
})

it('accepts the documented plain-number supersession and checks the successor declaration', () => {
  const files = {
    'docs/a.md': '[decision](decisions/0001-record.md)',
    'docs/decisions/0001-record.md': '# Decision\n- **Status:** Superseded by 0002\n',
    'docs/decisions/0002-next.md': '# Next\n- **Status:** Accepted\n',
  }
  expect(checkLinks(tree(files))).toEqual([])
  files['docs/decisions/0002-next.md'] = '# Next\n- **Status:** Proposed\n'
  expect(checkLinks(tree(files))).toMatchObject([
    { file: 'docs/decisions/0002-next.md', rule: 'adr-status' },
  ])
  expect(
    checkLinks(
      tree({ ...files, 'docs/decisions/0002-other.md': '# Other\n- **Status:** Accepted\n' }),
    ),
  ).toMatchObject([{ file: 'docs/decisions/0001-record.md', rule: 'adr-status' }])
})

it('rejects unresolved plain supersession and bounds repeated historical references', () => {
  expect(
    checkLinks(
      tree({
        'docs/a.md': '[decision](decisions/0001-record.md)',
        'docs/decisions/0001-record.md': '# Decision\n- **Status:** Superseded by 0002\n',
      }),
    ),
  ).toMatchObject([{ file: 'docs/decisions/0001-record.md', rule: 'adr-status' }])
  expect(
    checkLinks(
      tree({
        'docs/a.md': '[decision](decisions/0001-record.md)',
        'docs/decisions/0001-record.md': '# Decision\n- **Status:** Superseded by 0002\n',
        'docs/decisions/0002-next.md': '# Next\n- **Status:** Superseded by 0001\n',
      }),
    ),
  ).toMatchObject([
    {
      file: 'docs/decisions/0001-record.md',
      rule: 'adr-status',
      message: 'ADR supersession references form a cycle',
    },
  ])
})

it('does not accept status examples inside fenced code as decision metadata', () => {
  expect(
    checkLinks(
      tree({
        'docs/a.md': '[decision](decisions/0001-record.md)',
        'docs/decisions/0001-record.md': '# Decision\n\n```markdown\n- **Status:** Accepted\n```\n',
      }),
    ),
  ).toMatchObject([{ file: 'docs/decisions/0001-record.md', rule: 'adr-status' }])
})

it('checks plain ADR mentions and ignores code examples', () => {
  const files = {
    'docs/a.md': 'Follow ADR-0001.\n`ADR-9999`\n```text\nADR-9998\n```\n',
    'docs/decisions/0001-record.md': '# Decision\n- **Status:** Accepted\n',
  }
  expect(checkLinks(tree(files))).toEqual([])
  files['docs/decisions/0001-record.md'] = '# Decision\n- **Status:** Proposed\n'
  expect(checkLinks(tree(files))).toMatchObject([
    { file: 'docs/decisions/0001-record.md', rule: 'adr-status' },
  ])
  expect(checkLinks(tree({ 'docs/a.md': 'Follow ADR-0001.' }))).toMatchObject([
    { file: 'docs/a.md', line: 1, rule: 'adr-status' },
  ])
  expect(
    checkLinks(
      tree({
        ...files,
        'docs/decisions/0001-duplicate.md': '# Duplicate\n- **Status:** Accepted\n',
      }),
    ),
  ).toMatchObject([{ file: 'docs/a.md', rule: 'adr-status' }])
})
