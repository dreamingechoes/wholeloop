import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { candidateFiles, candidateIndex } from '../../../src/delivery/candidate-files.js'
import { workspaceSnapshot } from '../../../src/gates/snapshot.js'
import { fixture, git } from '../../support/delivery.js'

describe('candidate files independent of controlled Git metadata', () => {
  it('hashes code metadata references as bytes without treating variable names as credentials', async () => {
    await fixture(({ root }) => {
      writeFileSync(
        join(root, 'types.ts'),
        'export interface Request { authorization: Readonly<Scope> }\n',
      )
      const before = candidateFiles(root)
      git(root, ['add', '--all'])
      expect(candidateIndex(root)).toBe(before.index)
      expect(candidateFiles(root)).toEqual(before)
    })
  })
  it('hashes the actual SHA-256 Git object format without assuming SHA-1', async () => {
    await fixture(({ dir }) => {
      const root = join(dir, 'sha256')
      mkdirSync(root)
      git(root, ['init', '--object-format=sha256', '-b', 'main'])
      writeFileSync(join(root, 'source.txt'), 'Exact SHA-256 fixture bytes.\n')
      const before = candidateFiles(root)
      expect(before.objectFormat).toBe('sha256')
      git(root, ['add', '--all'])
      expect(candidateIndex(root)).toBe(before.index)
      expect(candidateFiles(root)).toEqual(before)
    })
  })
  it('refuses invalid UTF-8 Git index names before path decoding can hide them', async () => {
    await fixture(({ root }) => {
      const blob = git(root, ['rev-parse', 'HEAD:app.txt'])
      const result = spawnSync('git', ['update-index', '-z', '--index-info'], {
        cwd: root,
        env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
        input: Buffer.concat([Buffer.from(`100644 ${blob} 0\tinvalid-`), Buffer.from([255, 0])]),
      })
      expect(result.status).toBe(0)
      expect(() => candidateFiles(root)).toThrow('path-encoding')
    })
  })
  it('pins the same actual bytes across staging and commit while the gate snapshot changes', async () => {
    await fixture(({ root }) => {
      writeFileSync(join(root, 'app.txt'), 'Updated source with exact Unicode Δ.\n')
      writeFileSync(join(root, 'new.txt'), 'New source.\n')
      const before = candidateFiles(root),
        gateBefore = workspaceSnapshot(root)
      expect(candidateIndex(root)).not.toBe(before.index)
      git(root, ['add', '--all'])
      expect(candidateFiles(root)).toEqual(before)
      expect(candidateIndex(root)).toBe(before.index)
      expect(workspaceSnapshot(root).digest).not.toBe(gateBefore.digest)
      git(root, [
        'commit',
        '-m',
        'feat: pin a disposable candidate',
        '-m',
        'Observe unchanged actual files across the controlled topic commit.',
      ])
      expect(candidateFiles(root)).toEqual(before)
      expect(candidateIndex(root)).toBe(before.index)
    })
  })
  it('preserves deletions, binary and empty files rather than manufacturing absent content', async () => {
    await fixture(({ root }) => {
      rmSync(join(root, 'app.txt'))
      writeFileSync(join(root, 'empty.txt'), '')
      writeFileSync(join(root, 'binary.bin'), Buffer.from([0, 255, 1, 128]))
      const before = candidateFiles(root)
      expect(before.files).toBe(2)
      expect(before.bytes).toBe(4)
      git(root, ['add', '--all'])
      expect(candidateFiles(root)).toEqual(before)
      expect(candidateIndex(root)).toBe(before.index)
    })
  })
  it('binds executable modes and exact path bytes without interpreting punctuation as shell', async () => {
    await fixture(({ root }) => {
      const path = join(root, 'a " quote\tΔ\nfile.txt')
      writeFileSync(path, 'Executable fixture.\n')
      chmodSync(path, 0o755)
      const before = candidateFiles(root)
      git(root, ['add', '--all'])
      expect(candidateIndex(root)).toBe(before.index)
      chmodSync(path, 0o644)
      expect(candidateFiles(root).digest).not.toBe(before.digest)
    })
  })
  it('refuses symlinks instead of reading a referenced file', async () => {
    await fixture(({ root, dir }) => {
      writeFileSync(join(dir, 'outside.txt'), 'Outside fixture.')
      symlinkSync(join(dir, 'outside.txt'), join(root, 'linked.txt'))
      expect(() => candidateFiles(root)).toThrow('non-regular-file')
    })
  })
  it('exposes built-in line-ending transformation instead of claiming the index has exact raw bytes', async () => {
    await fixture(({ root }) => {
      git(root, ['config', 'core.autocrlf', 'true'])
      writeFileSync(join(root, 'crlf.txt'), 'A\r\nB\r\n')
      const before = candidateFiles(root)
      git(root, ['add', '--all'])
      expect(candidateFiles(root)).toEqual(before)
      expect(candidateIndex(root)).not.toBe(before.index)
      expect(readFileSync(join(root, 'crlf.txt'), 'utf8')).toBe('A\r\nB\r\n')
    })
  })
})
