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
