import { describe, expect, it } from 'vitest'
import { doctorSummary, installationSummary, statusSummary } from '../../src/cli/summary.js'

describe('doctor summary', () => {
  it('names each check, explains the others and quotes the repair command', () => {
    expect(
      doctorSummary({
        status: 'needs-attention',
        checks: [
          { id: 'node', status: 'pass', summary: 'Node 20 or newer.', version: '22.12.0' },
          {
            id: 'installation.user',
            status: 'fail',
            summary: 'Owned installation was written by wholeloop 0.9.0.',
            version: '0.9.0',
            repair: {
              instruction: 'Run this command to update the installation.',
              command: [
                'wl',
                'install',
                '--target',
                'claude',
                '--store',
                "/tmp/my store's",
                '--json',
              ],
            },
          },
          { id: 'cli.codex', status: 'skip', summary: 'Not selected.' },
        ],
      }),
    ).toMatchSnapshot()
  })

  it('keeps passing and optional details out of the failure report', () => {
    const summary = doctorSummary({
      status: 'observed',
      checks: [
        { id: 'git', status: 'pass', summary: 'PRIVATE_PASS_DETAIL' },
        {
          id: 'cli.codex',
          status: 'skip',
          summary: 'PRIVATE_OPTIONAL_DETAIL',
          repair: { instruction: 'PRIVATE_OPTIONAL_REPAIR', command: ['do-not-run'] },
        },
        { id: 'artifacts', status: 'unknown', summary: 'PRIVATE_UNKNOWN_DETAIL' },
      ],
    })
    expect(summary).toContain('Optional checks: 0 observed, 1 unknown, 1 skipped.')
    expect(summary).not.toContain('PRIVATE_')
    expect(summary).not.toContain('every required check passed')
  })

  it('reports no failures without certifying unknown checks', () => {
    expect(
      doctorSummary({ status: 'observed', checks: [{ id: 'git', status: 'pass', summary: '' }] }),
    ).toMatch(/^Doctor: no failed checks\.\nObserved: 1 passing check\./)
  })
})

describe('status summary', () => {
  it('lists each item with its next step and pending decisions', () => {
    expect(
      statusSummary({
        unreadCount: 1,
        items: [
          {
            id: 'init-1a2b3c4d',
            kind: 'initiative',
            title: 'Find tasks by title',
            owner: 'Ada',
            status: 'open',
            updatedAt: '2026-11-16T10:00:00.000Z',
            flow: {
              next: 'write-spec',
              available: true,
              pending: [{ id: 'approve-spec', state: 'actionable' }],
            },
          },
          {
            id: 'init-5e6f7a8b',
            kind: 'initiative',
            title: 'Old idea',
            status: 'closed',
            updatedAt: '2026-10-01T10:00:00.000Z',
            flow: { next: null, available: false, pending: [] },
          },
        ],
      }),
    ).toBe(`Waiting on you
init-1a2b3c4d Find tasks by title · specify · 1 decision

1 unread message. Add --json for the full status.`)
  })

  it('tells an empty store how to begin', () => {
    expect(statusSummary({ items: [], unreadCount: 0 })).toContain('No stored work yet.')
  })
})

describe('installation summary', () => {
  const base = {
    schema: 'wholeloop/install@1',
    scope: 'user',
    targets: ['claude'],
    receipt: '/store/installations/1/receipt.json',
  }
  it.each([
    {
      result: { ...base, status: 'planned', files: ['a', 'b'], remove: ['c'] },
      lines: [
        'Dry run for claude at user scope: nothing was written.',
        '  2 files to write',
        '  1 file to remove',
      ],
    },
    {
      result: {
        ...base,
        status: 'installed',
        backup: '/store/installations/1/backups/x',
        activation: {
          command: [
            'node',
            '/store/bin/wl.mjs',
            'guard',
            'hooks',
            'install',
            '--repo',
            '<repository>',
          ],
        },
      },
      lines: [
        'Installed claude at user scope.',
        'Backups: /store/installations/1/backups/x',
        "Git guards are installed per repository: node /store/bin/wl.mjs guard hooks install --repo '<repository>'",
      ],
    },
    {
      result: { ...base, status: 'already-correct' },
      lines: ['Already installed: claude at user scope matches this version.'],
    },
    {
      result: {
        ...base,
        schema: 'wholeloop/uninstall@1',
        status: 'planned',
        files: ['a'],
        remove: ['a'],
      },
      lines: ['  1 file to remove'],
    },
  ])('summarizes $result.status', ({ result, lines }) => {
    const summary = installationSummary(result)
    for (const line of lines)
      expect(summary.replace(/\s+/g, ' ')).toContain(line.trim().replace(/\s+/g, ' '))
    if (result.status === 'planned') expect(summary).not.toContain(base.receipt)
    else expect(summary).toContain('Installation record: /store/installations/1/receipt.json')
    expect(summary.endsWith('Add --json for the full result.')).toBe(true)
  })

  it('reports no backup line when the result has none', () => {
    expect(installationSummary({ ...base, status: 'installed' })).not.toContain('Backups:')
  })
})
