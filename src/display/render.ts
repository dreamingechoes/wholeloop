// Keeps terminal and client presentation identical without consulting state or changing authority.
import { stripVTControlCharacters } from 'node:util'

export interface DisplayProgress {
  label: string
  status: 'running' | 'finished' | 'failed' | 'unavailable'
  elapsedMs: number
}
export interface Display {
  schema: 'wholeloop/display@1'
  header: string
  rows: { label: string; value: string }[]
  progress?: DisplayProgress[]
  produced: string[]
  open: string[]
  next: string[]
  text: string
}

/** Values remain literal prose, never terminal instructions or additional layout lines. */
export function displayValue(value: string): string {
  return stripVTControlCharacters(value)
    .replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

// Treat a grapheme as a unit so wrapping cannot split a combining mark or an emoji sequence.
const segments = new Intl.Segmenter('en', { granularity: 'grapheme' })
export function terminalCells(value: string): number {
  return [...segments.segment(value)].reduce(
    (width, { segment }) =>
      width +
      (/\p{Extended_Pictographic}|[\u1100-\u115f\u2329\u232a\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe6f\uff01-\uff60\uffe0-\uffe6]/u.test(
        segment,
      )
        ? 2
        : /^\p{Mark}+$/u.test(segment)
          ? 0
          : 1),
    0,
  )
}

/** Clip one literal row without splitting a grapheme or exceeding its terminal-cell budget. */
export function clipText(value: string, width: number): string {
  // Emoji joiners belong to a grapheme; direction and terminal controls do not.
  const text = stripVTControlCharacters(value).replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu, (character) =>
      character === '\u200d' ? character : ' ',
    ),
    limit = Math.max(1, Math.floor(width))
  if (terminalCells(text) <= limit) return text
  let result = ''
  for (const { segment } of segments.segment(text)) {
    if (terminalCells(result + segment) > limit - 1) break
    result += segment
  }
  return `${result}…`
}

export function wrapText(value: string, prefix = '', continuation = prefix): string[] {
  const lines: string[] = []
  let line = prefix
  let filled = false
  for (const word of displayValue(value).split(' ').filter(Boolean)) {
    const gap = filled ? ' ' : ''
    if (terminalCells(line + gap + word) <= 80) {
      line += gap + word
      filled = true
      continue
    }
    if (filled) {
      lines.push(line.trimEnd())
      line = continuation
      filled = false
    }
    // Prefer word boundaries; split only a path or other token that cannot fit on its own.
    for (const { segment } of segments.segment(word)) {
      if (terminalCells(line) + terminalCells(segment) > 80) {
        lines.push(line.trimEnd())
        line = continuation
      }
      line += segment
      filled = true
    }
  }
  if (line.trim()) lines.push(line.trimEnd())
  return lines
}

/** Preserve authored line boundaries while applying the same terminal-cell limit. */
export function humanLines(value: string): string {
  return value
    .split('\n')
    .flatMap((line) => {
      if (!line.trim()) return ['']
      // Authored indentation cannot consume the full content width or emit terminal tabs.
      const prefix = ' '.repeat(
        Math.min(16, (/^\s*/.exec(line)?.[0] ?? '').replaceAll('\t', '  ').length),
      )
      const literal = stripVTControlCharacters(line.trimStart())
        .replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu, ' ')
        .trimEnd()
      return terminalCells(prefix + literal) <= 80
        ? [prefix + literal]
        : wrapText(literal, prefix, prefix)
    })
    .join('\n')
}

export function progressText(progress: DisplayProgress): string {
  if (!Number.isSafeInteger(progress.elapsedMs) || progress.elapsedMs < 0)
    throw new Error('Progress needs a nonnegative elapsed millisecond count')
  if (!['running', 'finished', 'failed', 'unavailable'].includes(progress.status))
    throw new Error('Unknown progress status')
  const seconds = Math.floor(progress.elapsedMs / 1000)
  const elapsed = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  const label = displayValue(progress.label)
  if (!label) throw new Error('Progress needs a label')
  // A completion remains one short line even when a remote label is unusually long.
  const suffix = ` — ${progress.status} · ${elapsed}`
  let short = ''
  for (const { segment } of segments.segment(label)) {
    if (terminalCells(short + segment + suffix) > 79) break
    short += segment
  }
  return `${short}${short === label ? '' : '…'}${suffix}`
}

export function renderDisplay(input: Omit<Display, 'schema' | 'text'>): Display {
  const fullHeader = displayValue(input.header)
  let header = ''
  for (const { segment } of segments.segment(fullHeader)) {
    if (terminalCells(header + segment) > 79) break
    header += segment
  }
  if (header !== fullHeader) header += '…'
  const rows = input.rows.map(({ label, value }) => ({
    label: displayValue(label),
    value: displayValue(value),
  }))
  const produced = input.produced.map(displayValue).filter(Boolean)
  const open = input.open.map(displayValue).filter(Boolean)
  const next = input.next.map(displayValue).filter(Boolean)
  const progress = input.progress?.map((entry) => ({
    ...entry,
    label: displayValue(entry.label),
  }))
  const width = Math.min(18, Math.max(8, ...rows.map(({ label }) => terminalCells(label) + 2)))
  const lines = wrapText(header)
  for (const { label, value } of rows) {
    if (terminalCells(label) > 16) lines.push(...wrapText(label))
    const prefix =
      terminalCells(label) > 16
        ? '  '
        : `${label}${' '.repeat(Math.max(0, width - terminalCells(label)))} `
    lines.push(...wrapText(value, prefix, ' '.repeat(width + 1)))
  }
  if (progress?.length) {
    if (lines.length) lines.push('')
    lines.push(...progress.map(progressText))
  }
  for (const [label, values] of [
    ['Produced', produced],
    ['Open questions', open],
    ['Next', next],
  ] as const)
    if (values.length) {
      lines.push('', label)
      for (const value of values) lines.push(...wrapText(value, '  ', '  '))
    }
  return {
    schema: 'wholeloop/display@1',
    header,
    rows,
    ...(progress ? { progress } : {}),
    produced,
    open,
    next,
    text: lines.join('\n'),
  }
}
