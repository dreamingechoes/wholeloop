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
function cells(value: string): number {
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

function wrap(value: string, prefix = '', continuation = prefix): string[] {
  const lines: string[] = []
  let line = prefix
  let filled = false
  for (const word of displayValue(value).split(' ').filter(Boolean)) {
    const gap = filled ? ' ' : ''
    if (cells(line + gap + word) <= 80) {
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
      if (cells(line) + cells(segment) > 80) {
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
    if (cells(short + segment + suffix) > 79) break
    short += segment
  }
  return `${short}${short === label ? '' : '…'}${suffix}`
}

export function renderDisplay(input: Omit<Display, 'schema' | 'text'>): Display {
  const fullHeader = displayValue(input.header)
  let header = ''
  for (const { segment } of segments.segment(fullHeader)) {
    if (cells(header + segment) > 79) break
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
  const width = Math.min(18, Math.max(8, ...rows.map(({ label }) => cells(label) + 2)))
  const lines = wrap(header)
  for (const { label, value } of rows) {
    if (cells(label) > 16) lines.push(...wrap(label))
    const prefix =
      cells(label) > 16 ? '  ' : `${label}${' '.repeat(Math.max(0, width - cells(label)))} `
    lines.push(...wrap(value, prefix, ' '.repeat(width + 1)))
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
      for (const value of values) lines.push(...wrap(value, '  ', '  '))
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
