// Finds tests with constant assertions without evaluating the source.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { GateFinding, GatePlan, GateResult } from '../gates/contracts.js'
import { changedPaths } from '../gates/snapshot.js'

export const testPath = (path: string) =>
  /(?:^|\/)(?:test|tests|__tests__)\/|\.(?:test|spec)\.[cm]?[jt]sx?$|(?:^|\/)test_[^/]+\.py$|_test\.go$/.test(
    path,
  )
const literal =
  '(?:true|false|null|-?\\d+(?:\\.\\d+)?|"(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\')'
const assertion = new RegExp(
  `expect\\(\\s*(${literal})\\s*\\)\\.(toBe|toEqual|toStrictEqual)\\(\\s*(${literal})\\s*\\)`,
  'g',
)
function value(text: string): unknown {
  if (text.startsWith("'")) return text.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, '\\')
  return JSON.parse(text)
}
/** Mark code starts while ignoring quoted fixtures and comments, without evaluating source. */
function codePositions(content: string): Set<number> {
  const positions = new Set<number>()
  let quote = ''
  let lineComment = false
  let blockComment = false
  for (let index = 0; index < content.length; index++) {
    const char = content[index]
    const next = content[index + 1]
    if (lineComment) {
      if (char === '\n') lineComment = false
      else continue
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false
        index++
      }
      continue
    }
    if (quote) {
      if (char === '\\') index++
      else if (char === quote) quote = ''
      continue
    }
    if (char === '/' && next === '/') {
      lineComment = true
      index++
      continue
    }
    if (char === '/' && next === '*') {
      blockComment = true
      index++
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char
      continue
    }
    positions.add(index)
  }
  return positions
}
/** Flag only known constant passing assertions; broader mutation checks remain semantic work. */
export function constantAssertions(path: string, content: string): GateFinding[] {
  const findings: GateFinding[] = []
  const positions = codePositions(content)
  let offset = 0
  for (const [index, raw] of content.split('\n').entries()) {
    const line = raw
    const start = offset
    offset += raw.length + 1
    for (const match of line.matchAll(assertion)) {
      if (!positions.has(start + (match.index ?? 0)) || !match[1] || !match[3]) continue
      try {
        if (Object.is(value(match[1]), value(match[3])))
          findings.push({
            id: `constant-${index + 1}-${findings.length + 1}`,
            location: `${path}:${index + 1}`,
            text: 'This passing constant assertion cannot observe a regression in the feature',
            evidence: [match[0]],
          })
      } catch {
        /* Unrecognized literals are left to the semantic verifier. */
      }
    }
    for (const match of line.matchAll(/\bassert\.ok\(\s*true\s*\)/g)) {
      if (!positions.has(start + (match.index ?? 0))) continue
      findings.push({
        id: `constant-${index + 1}-${findings.length + 1}`,
        location: `${path}:${index + 1}`,
        text: 'This unconditional assertion cannot observe the feature',
        evidence: ['assert.ok(true)'],
      })
    }
  }
  return findings
}
export function testabilityResult(plan: GatePlan): GateResult {
  const files = changedPaths(plan.repository, plan.base.sha).filter(testPath)
  const findings = files.flatMap((path, index) => {
    try {
      return constantAssertions(path, readFileSync(join(plan.repository, path), 'utf8')).map(
        (finding) => ({ ...finding, id: `file-${index + 1}-${finding.id}` }),
      )
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
  })
  return {
    unit: 'testability',
    status: 'ok',
    evidence: [
      `Checked ${files.length} changed test file(s) for known constant assertions; absence of findings does not prove mutation sensitivity`,
    ],
    findings,
  }
}
