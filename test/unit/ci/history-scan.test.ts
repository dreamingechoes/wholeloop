import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error The repository script is plain JavaScript without declarations.
import { GITLEAKS_IMAGE, summarize } from '../../../scripts/scan-history.mjs'

describe('pre-publication history scan', () => {
  it('runs a digest-pinned gitleaks image', () => {
    expect(GITLEAKS_IMAGE).toMatch(/^ghcr\.io\/gitleaks\/gitleaks@sha256:[0-9a-f]{64}$/)
  })

  it('reports where a finding is, never what it matched', () => {
    const [entry] = summarize([
      {
        RuleID: 'generic-api-key',
        File: 'src/example.ts',
        Commit: 'a'.repeat(40),
        StartLine: 3,
        Secret: 'fixture-secret-value',
        Match: 'token = fixture-secret-value',
        Fingerprint: 'x',
      },
    ])
    expect(entry).toEqual({
      rule: 'generic-api-key',
      file: 'src/example.ts',
      commit: 'a'.repeat(40),
      line: 3,
    })
    expect(JSON.stringify(entry)).not.toContain('fixture-secret-value')
  })

  it('gives every ignored fingerprint a reviewed reason', () => {
    const lines = readFileSync(resolve('.gitleaksignore'), 'utf8').split('\n')
    const entries = lines.filter((line) => line && !line.startsWith('#'))
    expect(entries.length).toBeGreaterThan(0)
    for (const entry of entries) {
      expect(entry).toMatch(/^[0-9a-f]{40}:[^:]+:[a-z0-9-]+:\d+$/)
      // The nearest preceding line that is not another fingerprint is a reason.
      const before = lines.slice(0, lines.indexOf(entry)).reverse()
      expect(before.find((line) => !/^[0-9a-f]{40}:/.test(line))).toMatch(/^# \S/)
    }
  })
})
