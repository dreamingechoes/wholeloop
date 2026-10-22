import type { Rule } from 'markdownlint'
import { applyFixes } from 'markdownlint'
import { lint } from 'markdownlint/sync'
import { describe, expect, it } from 'vitest'

const { default: rule } = (await import(
  new URL('../../../scripts/markdown-paragraphs.mjs', import.meta.url).href
)) as { default: Rule }

function errors(source: string, name = 'source', config = {}) {
  return (
    lint({
      strings: { [name]: source },
      config: { default: false, WL001: config },
      customRules: [rule],
    })[name] ?? []
  )
}

describe('one-line Markdown paragraphs', () => {
  it.each([
    [
      'plain',
      'One paragraph\nwith *emphasis*\nand a [link](https://example.com).\n',
      'One paragraph with *emphasis* and a [link](https://example.com).\n',
    ],
    [
      'list',
      '- First item\n  continues.\n- Second item.\n',
      '- First item continues.\n- Second item.\n',
    ],
    ['nested list', '- Parent.\n  - Child\n    continues.\n', '- Parent.\n  - Child continues.\n'],
    ['quote', '> One paragraph\n> continues.\n', '> One paragraph continues.\n'],
    ['nested quote', '> > One paragraph\n> > continues.\n', '> > One paragraph continues.\n'],
    ['lazy quote', '> One paragraph\ncontinues.\n', '> One paragraph continues.\n'],
    ['quoted list', '> - One item\n>   continues.\n', '> - One item continues.\n'],
    [
      'separate paragraphs',
      'One\nparagraph.\n\nAnother\nparagraph.\n',
      'One paragraph.\n\nAnother paragraph.\n',
    ],
    [
      'front matter',
      '---\nname: example\n---\n\nOne\nparagraph.\n',
      '---\nname: example\n---\n\nOne paragraph.\n',
    ],
    [
      'alert body',
      '> [!NOTE]\n> One paragraph\n> continues.\n',
      '> [!NOTE]\n> One paragraph continues.\n',
    ],
    [
      'hard break mixed with wrapping',
      'First  \nsecond\ncontinues.\n',
      'First  \nsecond continues.\n',
    ],
    ['wrapped emphasis', 'One **bold\nphrase** here.\n', 'One **bold phrase** here.\n'],
    ['CRLF', 'One\r\nparagraph.\r\n', 'One paragraph.\r\n'],
  ])('normalizes %s without changing structure and is idempotent', (_, source, expected) => {
    const problems = errors(source)
    expect(problems.length).toBeGreaterThan(0)
    const fixed = applyFixes(source, problems)
    expect(fixed).toBe(expected)
    expect(errors(fixed)).toEqual([])
  })

  it.each([
    '# Heading\n\nOne paragraph.\n',
    `A ${'long paragraph '.repeat(20).trim()}.\n`,
    '```markdown\nOne\nparagraph.\n```\n',
    '    Literal\n    code.\n',
    '| A | B |\n| --- | --- |\n| Long cell | Value |\n',
    '> [!NOTE]\n> One paragraph.\n',
    'First  \nsecond.\n',
    'First\\\nsecond.\n',
    '`inline\ncode` stays literal.\n',
    '[link](https://example.com "multiline\n title") stays literal.\n',
    '<span\nclass="example">Literal HTML</span>.\n',
    '<div>\nLiteral\nHTML.\n</div>\n',
    '[reference]: https://example.com\n  "Multiline title"\n',
  ])('preserves literal and structural lines: %j', (source) => {
    expect(errors(source)).toEqual([])
  })

  it.each([
    'test/fixtures/framing/frame.md',
    '/work/test/evals/definition/artifacts/frame-unexplained-unknown.md',
    'C:\\work\\test\\fixtures\\framing\\frame.md',
  ])('preserves configured byte-bound test data at %s', (name) => {
    expect(
      errors('unknown\nHypothesis: deliberately literal input.\n', name, {
        ignored_paths: ['test/fixtures/', 'test/evals/definition/artifacts/'],
      }),
    ).toEqual([])
  })

  it('continues checking authored documentation when literal test paths are excluded', () => {
    expect(
      errors('One\nparagraph.\n', 'test/evals/definition/README.md', {
        ignored_paths: ['test/fixtures/', 'test/evals/definition/artifacts/'],
      }).length,
    ).toBeGreaterThan(0)
  })
})
