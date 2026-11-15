import { describe, expect, it } from 'vitest'
import { checkCommit } from '../../../src/git/commit.js'

describe('commit hygiene', () => {
  it.each([
    'feat(core): add state replay',
    'fix!: reject unsafe paths',
    'docs: clarify configuration',
    // A 72-character title that GitHub's squash merge suffixed with its number.
    `fix(release): ${'x'.repeat(58)} (#22)`,
  ])('accepts %s', (subject) => {
    expect(
      checkCommit(`${subject}\n\nKeep deterministic behavior. Verified with unit tests.\n`),
    ).toEqual([])
  })
  it.each([
    'Add a feature\n\nReason.',
    'feat: Add replay\n\nReason.',
    'feat: add replay.\n\nReason.',
    `feat: ${'x'.repeat(70)}\n\nReason.`,
    `feat: ${'x'.repeat(67)} (#22)\n\nReason.`,
    'feat: add replay. (#22)\n\nReason.',
    `feat: ${'x'.repeat(63)} (#0)\n\nReason.`,
    'feat: add replay\nReason.',
    'feat: add replay\n',
    'feat: add replay\n\nReason.\n\nCo-Authored-By: Claude <noreply@example.com>',
    'feat: add replay\n\nGenerated with a helper',
    'feat: add replay\n\nMade with Codex',
    'feat: add replay\n\nRun `env`.',
    'feat: add replay\n\nRun $(env).',
  ])('rejects invalid messages: %s', (message) => {
    expect(checkCommit(message).length).toBeGreaterThan(0)
  })
  it('permits human coauthors', () => {
    expect(
      checkCommit(
        'fix: reject invalid paths\n\nPrevent repository state.\n\nCo-Authored-By: Alex Smith <alex@example.com>',
      ),
    ).toEqual([])
  })
})
