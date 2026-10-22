// Use markdownlint's parser so literal syntax never becomes a wrapping heuristic.
const literal = new Set([
  'codeFenced',
  'codeIndented',
  'codeText',
  'htmlFlow',
  'htmlText',
  'resource',
])
const alertHeader = /^\s*(?:>\s*)+\[![A-Z]+\]\s*$/

function* paragraphs(tokens) {
  for (const token of tokens) {
    if (literal.has(token.type)) continue
    if (token.type === 'paragraph') yield token
    else if (token.children) yield* paragraphs(token.children)
  }
}

function softWraps(tokens, lines, found = new Set()) {
  for (const [index, token] of tokens.entries()) {
    if (literal.has(token.type)) continue
    if (token.type === 'lineEnding') {
      // Hard breaks and GitHub alert headers carry meaning beyond prose layout.
      if (
        !tokens[index - 1]?.type.startsWith('hardBreak') &&
        !alertHeader.test(lines[token.startLine - 1])
      )
        found.add(token.startLine)
    } else if (token.children) softWraps(token.children, lines, found)
  }
  return found
}

/** @type {import('markdownlint').Rule} */
export default {
  names: ['WL001', 'one-line-paragraph'],
  description: 'Keep each prose paragraph on one source line',
  tags: ['line_length'],
  parser: 'micromark',
  function: (params, onError) => {
    // Literal test inputs bind exact bytes and deliberately exercise malformed prose.
    const name = params.name.replaceAll('\\', '/')
    if (
      (params.config.ignored_paths ?? []).some(
        (path) => name.startsWith(path) || name.includes(`/${path}`),
      )
    )
      return
    for (const paragraph of paragraphs(params.parsers.micromark.tokens)) {
      const wraps = softWraps(paragraph.children, params.lines)
      if (!wraps.size) continue
      const start = paragraph.startLine - 1
      const end = paragraph.endLine
      let replacement = params.lines[start]
      for (let index = start + 1; index < end; index++) {
        const line = params.lines[index]
        replacement = wraps.has(index)
          ? `${replacement.replace(/[\t ]+$/, '')} ${line.replace(/^(?:[\t ]*>[\t ]?)*[\t ]*/, '')}`
          : `${replacement}\n${line}`
      }
      onError({
        lineNumber: start + 1,
        fixInfo: { deleteCount: params.lines[start].length, insertText: replacement },
      })
      // Whole-paragraph replacement avoids overlapping edits on adjacent wraps.
      for (let index = start + 1; index < end; index++)
        onError({ lineNumber: index + 1, fixInfo: { deleteCount: -1 } })
    }
  },
}
