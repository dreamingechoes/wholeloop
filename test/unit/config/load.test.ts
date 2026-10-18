import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadConfig, readConfig, userConfigPath } from '../../../src/config/load.js'

describe('configuration files', () => {
  it('loads user, project, initiative and run files with provenance', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wholeloop-config-'))
    try {
      mkdirSync(join(dir, '.wholeloop'))
      const userFile = join(dir, 'user.yml')
      const initiativeFile = join(dir, 'initiative.yml')
      const runFile = join(dir, 'run.yml')
      writeFileSync(userFile, 'version: 1\nprofile: {language: es}\nproviders: {docs: local}\n')
      writeFileSync(
        join(dir, '.wholeloop/config.yml'),
        'version: 1\nprofile: {language: en}\nproviders: {docs: notion}\n',
      )
      writeFileSync(initiativeFile, 'version: 1\nproviders: {docs: confluence}\n')
      writeFileSync(runFile, 'version: 1\nprofile: {language: fr}\n')
      const result = loadConfig({ root: dir, userFile, initiativeFile, runFile })
      expect(result.values.profile).toMatchObject({ language: 'fr' })
      expect(result.values.providers).toMatchObject({ docs: 'confluence' })
      expect(result.sources['profile.language']).toEqual({
        value: 'fr',
        scope: 'run',
        file: runFile,
      })
      writeFileSync(runFile, 'version: 1\nprofile: {pace: invalid}\n')
      expect(() => loadConfig({ root: dir, userFile, initiativeFile, runFile })).toThrow('invalid')
      writeFileSync(runFile, 'profile: {}\n')
      expect(() => readConfig(runFile)).toThrow('expected 1')
      writeFileSync(runFile, 'version: 1\nversion: 2\n')
      expect(() => readConfig(runFile)).toThrow()
      expect(() => readConfig(join(dir, 'missing'), false)).toThrow()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
  it('honors absolute XDG paths and ignores relative paths', () => {
    expect(userConfigPath({ XDG_CONFIG_HOME: '/config' }, '/home/test')).toBe(
      '/config/wholeloop/config.yml',
    )
    expect(userConfigPath({ XDG_CONFIG_HOME: 'relative' }, '/home/test')).toBe(
      '/home/test/.config/wholeloop/config.yml',
    )
  })
})
