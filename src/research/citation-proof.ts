// Structural receipts bind exact submitted quotations; they never certify what a claim means.
import { createHash } from 'node:crypto'
import { validate } from '../config/schema.js'
import type { AngleResult } from './contracts.js'
import schema from './schemas/citations-v1.json' with { type: 'json' }

export const CITATION_LIMIT = 256
export interface CodeCitation {
  claim: string
  evidence: number
  ref: string
  path: string
  start: number
  end: number
  commit: string
  excerpt: string
}
export interface CitationCheck {
  claim: string
  evidence: number
  ref: string
  excerptSha256: string
  status: 'verified'
}
export interface CitationReceipt {
  run: string
  angle: string
  checks: CitationCheck[]
}
export const excerptHash = (excerpt: string) => createHash('sha256').update(excerpt).digest('hex')
export const validCitationReceipt = (value: Record<string, unknown>) =>
  !validate(value, schema).length

export function codeCitations(result: AngleResult) {
  const citations: CodeCitation[] = [],
    problems: string[] = []
  for (const claim of result.claims)
    for (const [index, evidence] of claim.evidence.entries()) {
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(evidence.ref)) continue
      const match = /^([\s\S]*):(\d+)(?:-(\d+))?@([\s\S]+)$/.exec(evidence.ref)
      if (!match) continue // Legacy unversioned references remain explicitly unchecked.
      const path = match[1] ?? '',
        start = Number(match[2]),
        end = Number(match[3] ?? match[2]),
        commit = match[4] ?? ''
      const fail = (reason: string) =>
        problems.push(`Claim ${claim.id}, citation ${index + 1}: ${reason}`)
      if (
        !path ||
        path.length > 4096 ||
        path.startsWith('/') ||
        /[\\\p{Cc}\p{Cf}]/u.test(path) ||
        path.split('/').some((part) => !part || part === '.' || part === '..')
      )
        fail('use a repository-relative file path without traversal or control characters')
      else if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(commit))
        fail('use a complete commit object ID')
      else if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 1 ||
        end < start
      )
        fail('invalid line range')
      else if (!evidence.excerpt.trim()) fail('a literal nonempty excerpt is required')
      else
        citations.push({
          claim: claim.id,
          evidence: index,
          ref: evidence.ref,
          path,
          start,
          end,
          commit: commit.toLowerCase(),
          excerpt: evidence.excerpt,
        })
    }
  if (citations.length > CITATION_LIMIT)
    problems.push(`Code citations exceed the ${CITATION_LIMIT} reference limit`)
  return { citations, problems }
}

/** Replay checks source linkage without opening Git or retroactively rechecking old artifacts. */
export function verifyCitationReceipt(result: AngleResult, receipt: CitationReceipt): void {
  const parsed = codeCitations(result)
  if (
    parsed.problems.length ||
    parsed.citations.length !== receipt.checks.length ||
    receipt.angle !== result.angle
  )
    throw new Error('Code citation receipt does not match its submitted result')
  const expected = new Map(
    parsed.citations.map((citation) => [
      JSON.stringify([citation.claim, citation.evidence]),
      citation,
    ]),
  )
  for (const check of receipt.checks) {
    const key = JSON.stringify([check.claim, check.evidence]),
      citation = expected.get(key)
    if (
      !citation ||
      check.status !== 'verified' ||
      citation.ref !== check.ref ||
      excerptHash(citation.excerpt) !== check.excerptSha256
    )
      throw new Error('Code citation receipt does not match its submitted quotation')
    expected.delete(key)
  }
}
