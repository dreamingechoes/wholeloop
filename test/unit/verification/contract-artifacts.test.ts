import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sourceHash } from '../../../src/delivery/input.js'
import { observeContractArtifacts } from '../../../src/verification/contract-artifacts.js'
import { fixture, git } from '../../support/delivery.js'

async function setup(run: Parameters<typeof fixture>[0]) {
  await fixture(async (f) => {
    writeFileSync(join(f.root, 'search-contract.txt'), 'Title query returns matching task IDs.\n')
    git(f.root, ['add', 'search-contract.txt'])
    git(f.root, [
      'commit',
      '-m',
      'test: pin the declared contract',
      '-m',
      'Provide actual committed bytes for mechanical identity checks.',
    ])
    const contract = f.plan.work.find((w) => w.id === 'contract')?.produces[0]
    if (!contract) throw new Error('Fixture contract missing')
    contract.sha256 = sourceHash('Title query returns matching task IDs.\n')
    for (const repo of f.plan.repositories) repo.base = git(f.root, ['rev-parse', 'HEAD'])
    f.planning.preparePlan(f.plan)
    await run(f)
  })
}
const refs = { 'search-api': 'search-contract.txt' }
describe('mechanical identity of committed contract deliverables', () => {
  it('observes exact declared bytes and revision without inventing criteria, QA or approval', async () => {
    await setup(({ plan, root }) => {
      const result = observeContractArtifacts(plan, 'contract', root, refs)
      expect(result).toMatchObject({
        status: 'matched',
        provenance: 'host-observed',
        unit: 'contract',
        repository: 'app',
        qa: 'not-established',
        humanApproval: 'not-recorded',
        contracts: [
          {
            id: 'search-api',
            revision: 'v1',
            sha256: sourceHash('Title query returns matching task IDs.\n'),
            ref: 'search-contract.txt',
            bytes: 39,
          },
        ],
      })
      expect(plan.work.find((w) => w.id === 'contract')?.criteria).toEqual([])
      expect(observeContractArtifacts(plan, 'contract', root, refs)).toEqual(result)
    })
  })
  it.each([{}, { ...refs, extra: 'app.txt' }])(
    'requires exact declared contract selection: %j',
    async (selected) => {
      await setup(({ plan, root }) => {
        expect(() => observeContractArtifacts(plan, 'contract', root, selected)).toThrow(
          'exact-contract-selection-required',
        )
      })
    },
  )
  it('cannot substitute a product implementation unit or invent a contract requirement', async () => {
    await setup(({ plan, root }) => {
      expect(() => observeContractArtifacts(plan, 'search', root, refs)).toThrow(
        'contract-only-unit-required',
      )
    })
  })
  it('refuses a clean committed file with the wrong declared checksum', async () => {
    await setup(({ plan, root }) => {
      const contract = plan.work.find((w) => w.id === 'contract')?.produces[0]
      if (!contract) throw new Error('Fixture contract missing')
      contract.sha256 = 'a'.repeat(64)
      expect(() => observeContractArtifacts(plan, 'contract', root, refs)).toThrow(
        'contract-checksum-mismatch',
      )
    })
  })
  it('refuses candidate edits even when a different selected file still matches', async () => {
    await setup(({ plan, root }) => {
      writeFileSync(join(root, 'app.txt'), 'Uncommitted candidate changes.\n')
      expect(() => observeContractArtifacts(plan, 'contract', root, refs)).toThrow(
        'committed-clean-candidate-required',
      )
    })
  })
  it('refuses an ignored untracked file with matching bytes', async () => {
    await setup(({ plan, root }) => {
      writeFileSync(join(root, '.gitignore'), 'ignored-contract.txt\n')
      git(root, ['add', '.gitignore'])
      git(root, [
        'commit',
        '-m',
        'test: ignore a matching decoy',
        '-m',
        'Ensure an ignored duplicate cannot supply a committed deliverable.',
      ])
      writeFileSync(join(root, 'ignored-contract.txt'), 'Title query returns matching task IDs.\n')
      expect(() =>
        observeContractArtifacts(plan, 'contract', root, { 'search-api': 'ignored-contract.txt' }),
      ).toThrow('tracked-regular-contract-required')
    })
  })
  it('refuses a committed symbolic link to matching bytes', async () => {
    await setup(({ plan, root }) => {
      symlinkSync('search-contract.txt', join(root, 'linked-contract.txt'))
      git(root, ['add', 'linked-contract.txt'])
      git(root, [
        'commit',
        '-m',
        'test: pin a symbolic decoy',
        '-m',
        'Keep symbolic links distinct from regular committed deliverables.',
      ])
      expect(() =>
        observeContractArtifacts(plan, 'contract', root, { 'search-api': 'linked-contract.txt' }),
      ).toThrow('tracked-regular-contract-required')
    })
  })
  it('refuses a repository subdirectory rather than hashing an incomplete candidate', async () => {
    await setup(({ plan, root }) => {
      mkdirSync(join(root, 'nested'))
      expect(() => observeContractArtifacts(plan, 'contract', join(root, 'nested'), refs)).toThrow(
        'contract-repository-binding',
      )
    })
  })
  it('refuses a different Git database even when its contract bytes match', async () => {
    await setup(async ({ plan }) => {
      await setup(({ root }) => {
        expect(() => observeContractArtifacts(plan, 'contract', root, refs)).toThrow(
          'contract-repository-binding',
        )
      })
    })
  })
  it('bounds an individual contract before hashing it', async () => {
    await setup(({ plan, root }) => {
      writeFileSync(join(root, 'search-contract.txt'), 'x'.repeat(256 * 1024 + 1))
      git(root, ['add', 'search-contract.txt'])
      git(root, [
        'commit',
        '-m',
        'test: pin an oversized contract',
        '-m',
        'Retain the original bound on each contract observation.',
      ])
      expect(() => observeContractArtifacts(plan, 'contract', root, refs)).toThrow('oversized')
    })
  })
  it('permits distinct declared interfaces to share the same exact committed file', async () => {
    await setup(({ plan, root }) => {
      const work = plan.work.find((w) => w.id === 'contract'),
        first = work?.produces[0]
      if (!work || !first) throw new Error('Fixture contract missing')
      work.produces.push({
        ...first,
        id: 'search-client',
        description: 'The client consumes the same declared title-query format.',
      })
      const result = observeContractArtifacts(plan, 'contract', root, {
        ...refs,
        'search-client': 'search-contract.txt',
      })
      expect(result.contracts.map((c) => c.id)).toEqual(['search-api', 'search-client'])
      expect(result.qa).toBe('not-established')
    })
  })
  it('bounds aggregate unique contract bytes rather than trusting each file limit alone', async () => {
    await setup(({ plan, root }) => {
      const work = plan.work.find((w) => w.id === 'contract'),
        first = work?.produces[0]
      if (!work || !first) throw new Error('Fixture contract missing')
      const body = 'x'.repeat(256 * 1024),
        selected: Record<string, string> = {}
      work.produces = Array.from({ length: 17 }, (_, i) => {
        const id = i === 0 ? 'search-api' : `interface-${i}`,
          ref = `${id}.txt`
        writeFileSync(join(root, ref), body)
        selected[id] = ref
        return { ...first, id, sha256: sourceHash(body) }
      })
      git(root, ['add', '.'])
      git(root, [
        'commit',
        '-m',
        'test: pin aggregate contract inputs',
        '-m',
        'Require a finite total observation budget across distinct artifacts.',
      ])
      expect(() => observeContractArtifacts(plan, 'contract', root, selected)).toThrow(
        'contract-byte-limit',
      )
    })
  })
  it('accepts an actual external topic worktree sharing the declared Git database', async () => {
    await setup(({ plan, root, dir }) => {
      const workspace = join(dir, 'contract-topic')
      git(root, ['worktree', 'add', '-b', 'wl/contract-check', workspace, 'HEAD'])
      expect(observeContractArtifacts(plan, 'contract', workspace, refs)).toMatchObject({
        status: 'matched',
        snapshot: { branch: 'wl/contract-check' },
      })
    })
  })
  it('refuses an unrelated history in the same Git database', async () => {
    await setup(({ plan, root }) => {
      git(root, ['checkout', '--orphan', 'orphan-contract'])
      git(root, [
        'commit',
        '-m',
        'test: create unrelated contract history',
        '-m',
        'Matching files cannot replace ancestry of the declared base.',
      ])
      expect(() => observeContractArtifacts(plan, 'contract', root, refs)).toThrow(
        'contract-base-ancestry',
      )
    })
  })
})
