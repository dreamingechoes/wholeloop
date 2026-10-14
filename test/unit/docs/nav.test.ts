import { describe, expect, it } from 'vitest'
import { DOCNAV_MARKER, parseNav, renderFooter, withFooter } from '../../../src/docs/nav.js'

const NAV = parseNav(`
home: README.md
concepts: concepts.md
pages:
  - { path: README.md, title: Docs index }
  - { path: intro.md, title: Intro }
  - { path: concepts.md, title: Concepts }
  - { path: flow/step.md, title: step }
  - { path: faq.md, title: FAQ }
`)

describe('parseNav', () => {
  it('rejects a file without pages', () => {
    expect(() => parseNav('home: README.md\nconcepts: c.md\n')).toThrow(/pages/)
  })
  it('rejects an unquoted title that YAML splits on commas', () => {
    expect(() =>
      parseNav('home: a\nconcepts: b\npages:\n  - { path: a, title: One, two, three }\n'),
    ).toThrow(/unexpected keys \(two, three\)/)
  })
  it('rejects an entry without a title', () => {
    expect(() => parseNav('home: a\nconcepts: b\npages:\n  - { path: a }\n')).toThrow(/title/)
  })
})

describe('renderFooter', () => {
  it('omits the index link on the index and previous link on the first page', () => {
    expect(renderFooter(NAV, 0)).toBe(
      `${DOCNAV_MARKER}\n[🧭 Concepts](concepts.md)  ·  [Intro ▶](intro.md)\n`,
    )
  })
  it('does not repeat Concepts when it is a neighbour', () => {
    expect(renderFooter(NAV, 1)).toBe(
      `${DOCNAV_MARKER}\n[◀ Docs index](README.md)  ·  [📖 Docs index](README.md)  ·  [Concepts ▶](concepts.md)\n`,
    )
  })
  it('writes relative paths from nested pages', () => {
    expect(renderFooter(NAV, 3)).toBe(
      `${DOCNAV_MARKER}\n[◀ Concepts](../concepts.md)  ·  [📖 Docs index](../README.md)  ·  [FAQ ▶](../faq.md)\n`,
    )
  })
  it('has no next link on the last page', () => {
    expect(renderFooter(NAV, 4)).toBe(
      `${DOCNAV_MARKER}\n[◀ step](flow/step.md)  ·  [📖 Docs index](README.md)  ·  [🧭 Concepts](concepts.md)\n`,
    )
  })
})

describe('withFooter', () => {
  it('replaces everything after the marker', () => {
    expect(withFooter(`body\n${DOCNAV_MARKER}\nold\n`, `${DOCNAV_MARKER}\nnew\n`)).toBe(
      `body\n${DOCNAV_MARKER}\nnew\n`,
    )
  })
  it('returns undefined without a marker', () => {
    expect(withFooter('body', 'x')).toBeUndefined()
  })
})
