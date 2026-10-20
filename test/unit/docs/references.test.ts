import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { adapterFor } from '../../../src/adapters/generate.js'
import { COMMANDS } from '../../../src/cli/commands.js'
import { parseNav, renderFooter } from '../../../src/docs/nav.js'
import {
  checkReferences,
  commandReference,
  configReference,
  platformReference,
  providerReference,
  referenceSections,
  replaceReference,
} from '../../../src/docs/references.js'
import { BUILTINS } from '../../../src/providers/builtins.js'

describe('generated reference ownership', () => {
  it('separates local format/engine declarations from native execution evidence', () => {
    const table = platformReference()
    expect(table.split('\n')).toHaveLength(9)
    expect(table).toContain(
      '| `cursor` | rendered | rendered | `native-and-git-fallback` | `native-readonly` | `headless` · `sequential` | unverified |',
    )
    expect(table).toContain('| `codex` | rendered | rendered | `git-fallback` |')
    expect(table).not.toContain('PASS')
    expect(table).not.toContain('✅')
    const adapter = adapterFor('gemini')
    const oldTable = platformReference([adapter])
    const changedTable = platformReference([
      {
        ...adapter,
        capabilities: () => ({ ...adapter.capabilities(), engines: ['headless', 'sequential'] }),
      },
    ])
    expect(changedTable).not.toBe(oldTable)
    expect(changedTable).toContain('| unverified |')
    const section = {
      kind: 'platforms' as const,
      file: 'docs/platforms/README.md',
      body: changedTable,
    }
    const files = new Map([
      [section.file, `<!-- platforms:start -->\n${oldTable}\n<!-- platforms:end -->`],
    ])
    expect(checkReferences({ files, exists: (path) => files.has(path) }, [section])).toMatchObject([
      { rule: 'generated', message: expect.stringContaining('stale') },
    ])
  })
  it.each([
    '',
    '<!-- commands:end -->\n<!-- commands:start -->',
    '<!-- commands:start -->\nmissing end',
    '<!-- commands:start --><!-- commands:start --><!-- commands:end -->',
    '<!-- commands:start --><!-- commands:end --><!-- commands:end -->',
  ])('rejects absent, reversed or duplicate markers: %s', (content) => {
    const section = referenceSections()[0]
    if (!section) throw new Error('Missing command section')
    expect(() => replaceReference(content, section)).toThrow('one ordered commands marker pair')
  })
  it('reports missing pages and stale source contracts while preserving surrounding prose', () => {
    const sections = referenceSections()
    const files = new Map(
      sections.map((section) => [
        section.file,
        `Owner-written introduction\n<!-- ${section.kind}:start -->\nstale table\n<!-- ${section.kind}:end -->\nOwner-written conclusion\n`,
      ]),
    )
    const tree = { files, exists: (path: string) => files.has(path) }
    expect(checkReferences(tree).map((problem) => problem.file)).toEqual(
      sections.map((section) => section.file),
    )
    for (const section of sections) {
      const updated = replaceReference(files.get(section.file) ?? '', section)
      expect(updated.startsWith('Owner-written introduction\n')).toBe(true)
      expect(updated.endsWith('\nOwner-written conclusion\n')).toBe(true)
      files.set(section.file, updated)
    }
    expect(checkReferences(tree)).toEqual([])
    const command = sections[0]
    if (!command) throw new Error('Missing command section')
    const changed = {
      ...command,
      body: commandReference([
        ...COMMANDS,
        {
          path: 'new command',
          arguments: '',
          options: [],
          schema: 'wholeloop/new-command@1',
          summary: 'Document a new contract',
        },
      ]),
    }
    expect(checkReferences(tree, [changed])[0]).toMatchObject({
      file: command.file,
      rule: 'generated',
      message: expect.stringContaining('stale'),
    })
    files.delete(command.file)
    expect(checkReferences(tree, [command])[0]?.message).toContain(
      'Missing generated reference page',
    )
  })
  it('renders actual schema kinds, false/zero defaults, enums and escaped command cells', () => {
    const table = configReference({
      type: 'object',
      properties: {
        enabled: { type: 'boolean', default: false, 'x-kind': 'personal' },
        limit: { type: 'integer', default: 0 },
        choice: { type: 'string', enum: ['one', 'two'] },
        mapping: { type: 'object', additionalProperties: { type: 'string' } },
        items: { type: 'array', items: { type: 'string' } },
      },
    })
    expect(table).toContain('| `enabled` | personal | boolean | `false` |')
    expect(table).toContain('| `limit` | team | integer | `0` |')
    expect(table).toContain('| `choice` | team | one · two | unset |')
    expect(table).toContain('map of strings')
    expect(table).toContain('array of strings')
    const commands = commandReference([
      {
        path: 'example',
        arguments: '<one|two>',
        options: [],
        schema: 'wholeloop/example@1',
        summary: 'Read `a|b`\nwithout a second row',
      },
    ])
    expect(commands).toContain('`wl example <one\\|two>`')
    expect(commands.split('\n')).toHaveLength(3)
    expect(
      commandReference([
        {
          path: 'literal`name',
          arguments: '',
          options: [],
          schema: 'wholeloop/example@1',
          summary: 'Escaped',
        },
      ]),
    ).toContain('``wl literal`name``')
  })
  it('derives declared provider rows deterministically without implying authenticated operation support', () => {
    const table = providerReference(BUILTINS)
    expect(providerReference([...BUILTINS].reverse())).toBe(table)
    expect(table).toContain('| Declared operations |')
    for (const provider of BUILTINS) {
      expect(table).toContain(`| \`${provider.id}\` |`)
      for (const operation of Object.keys(provider.operations))
        expect(table).toContain(`\`${operation}\``)
    }
    expect(table).toContain('native host')
    expect(table).toContain('MCP:')
  })
  it('checks, explicitly regenerates and preflights the entire compiled batch without touching prose', () => {
    const root = mkdtempSync(join(tmpdir(), 'wl-reference-'))
    try {
      const yaml =
        'home: architecture/core-cli.md\nconcepts: configuration/README.md\npages:\n  - {path: architecture/core-cli.md, title: Commands}\n  - {path: configuration/README.md, title: Configuration}\n  - {path: configuration/providers.md, title: Providers}\n  - {path: platforms/README.md, title: Platforms}\n'
      const nav = parseNav(yaml)
      const sections = referenceSections()
      sections.forEach((section, index) => {
        const path = join(root, section.file)
        mkdirSync(dirname(path), { recursive: true })
        writeFileSync(
          path,
          `# Reference\n\n> **Status: 🚧 partial.**\n\nOwner prose.\n\n<!-- ${section.kind}:start -->\nstale\n<!-- ${section.kind}:end -->\n\n${renderFooter(nav, index)}`,
        )
      })
      writeFileSync(join(root, 'docs/nav.yml'), yaml)
      const cli = (args: string[]) =>
        spawnSync(process.execPath, [resolve('dist/wl.mjs'), 'docs', ...args, '--json'], {
          cwd: root,
          encoding: 'utf8',
          timeout: 15000,
          maxBuffer: 1048576,
        })
      const initial = sections.map((section) => readFileSync(join(root, section.file), 'utf8'))
      expect(cli(['check']).status).toBe(4)
      const stale = cli(['reference'])
      expect(stale.status).toBe(4)
      expect(JSON.parse(stale.stdout)).toMatchObject({
        schema: 'wholeloop/docs-reference@1',
        written: 0,
        status: 'stale',
      })
      expect(sections.map((section) => readFileSync(join(root, section.file), 'utf8'))).toEqual(
        initial,
      )
      const selected = cli(['reference', '--kind', 'commands', '--write'])
      expect(selected.status, selected.stderr).toBe(0)
      expect(JSON.parse(selected.stdout).written).toBe(1)
      const written = cli(['reference', '--write'])
      expect(JSON.parse(written.stdout)).toMatchObject({ status: 'updated', written: 3 })
      const checked = cli(['check'])
      expect(checked.status, checked.stdout + checked.stderr).toBe(0)
      expect(JSON.parse(checked.stdout).problems).toEqual([])
      expect(JSON.parse(cli(['reference', '--write']).stdout)).toMatchObject({
        status: 'current',
        written: 0,
      })
      expect(cli(['reference', '--kind', 'unknown']).status).toBe(4)
      const commands = sections[0]
      const providers = sections[2]
      if (!commands || !providers) throw new Error('Missing references')
      const commandPath = join(root, commands.file)
      const commandText = readFileSync(commandPath, 'utf8').replace(
        'Prepare a disposable native',
        'Changed prose inside the table',
      )
      writeFileSync(commandPath, commandText)
      writeFileSync(join(root, providers.file), 'Keep this malformed owner page.\n')
      expect(cli(['reference', '--write']).status).toBe(4)
      expect(readFileSync(commandPath, 'utf8')).toBe(commandText)
      expect(readFileSync(join(root, providers.file), 'utf8')).toBe(
        'Keep this malformed owner page.\n',
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 30000)
})
