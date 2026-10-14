import { describe, expect, it } from 'vitest'
import { extractLinks, headingAnchors, isExternal, stripCode } from '../../../src/docs/markdown.js'

describe('stripCode', () => {
  it('blanks fenced blocks and inline code but keeps line numbers', () => {
    const lines = stripCode('a `[x](y)` b\n```\n[z](w)\n```\nc')
    expect(lines).toEqual(['a  b', '', '', '', 'c'])
  })
})

describe('extractLinks', () => {
  it('finds links outside code with their line', () => {
    const md = 'intro [one](a.md)\n```md\n[skip](no.md)\n```\nsee [two](b.md#part) and `[x](y)`'
    expect(extractLinks(md)).toEqual([
      { target: 'a.md', line: 1 },
      { target: 'b.md#part', line: 5 },
    ])
  })
})

describe('headingAnchors', () => {
  it('matches GitHub slugs, including code spans, symbols and duplicates', () => {
    const md = [
      '# Title',
      '## P3-04 · `build-slice` and the `builder`',
      '## Rounds — "until green", with a budget you control',
      '## FAQ',
      '## FAQ',
      '## See [the flow](flow.md)',
      '```',
      '## not a heading',
      '```',
    ].join('\n')
    expect([...headingAnchors(md)]).toEqual([
      'title',
      'p3-04--build-slice-and-the-builder',
      'rounds--until-green-with-a-budget-you-control',
      'faq',
      'faq-1',
      'see-the-flow',
    ])
  })
})

describe('isExternal', () => {
  it.each([
    ['https://x.dev', true],
    ['mailto:a@b.c', true],
    ['./a.md', false],
    ['#local', false],
  ])('%s → %s', (target, expected) => {
    expect(isExternal(target)).toBe(expected)
  })
})
