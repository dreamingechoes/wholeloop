// Documented wl command lines name real commands and options (P9-19).
import { describe, expect, it } from 'vitest'
import { COMMANDS } from '../../../src/cli/commands.js'
import {
  checkCommands,
  checkedCommandFile,
  documentedCommands,
} from '../../../src/docs/commands.js'

const shapes = [
  { path: 'open', options: ['--raw'] },
  { path: 'share mode', options: ['--for <id>', '--mode <local|shared>'] },
  { path: 'exec', options: ['--for <id>'] },
]
const check = (file: string, text: string) =>
  checkCommands(new Map([[file, text]]), shapes).map(({ line, message }) => `${line}: ${message}`)

describe('documented command extraction', () => {
  it('reads code blocks, sessions and inline code, never mermaid or prose', () => {
    const page = [
      'Run `wl open init-1` to read it, or wl open in prose.',
      '```console',
      '$ wl open init-1 --raw | head',
      '```',
      '```mermaid',
      'A["wl core"] --> B',
      '```',
      '```bash',
      'wl share mode --for init-1 \\',
      '  --mode shared',
      '```',
    ].join('\n')
    expect(documentedCommands('docs/page.md', page)).toEqual([
      { line: 1, command: 'open init-1' },
      { line: 3, command: 'open init-1 --raw | head' },
      { line: 9, command: 'share mode --for init-1    --mode shared' },
    ])
    expect(documentedCommands('docs/assets/terminal/sessions/a.txt', 'Next  wl open x')).toEqual([
      { line: 1, command: 'open x' },
    ])
  })

  it('checks pages, the README and sessions, but not decisions or the roadmap', () => {
    expect(
      [
        'README.md',
        'docs/flow/utilities.md',
        'docs/assets/terminal/sessions/next.txt',
        'docs/decisions/0001-x.md',
        'roadmap/journal.md',
        'docs/assets/terminal/next.tape',
      ].map(checkedCommandFile),
    ).toEqual([true, true, true, false, false, false])
  })
})

describe('documented command check', () => {
  it.each([
    ['`wl open init-1 --raw`', []],
    ['`wl open init-1 --spec`', ['1: wl open has no --spec option']],
    ['`wl open init-1 [--json]`', []],
    ['`wl share mode --for x --mode=shared`', []],
    ['`wl share`', []],
    ['`wl shared mode`', ['1: unknown command: wl shared mode']],
    ['`wl exec --for s -- npm test --watch`', []],
    ['`wl open "a --spec" --help`', []],
    ['`wl <command> --anything`', []],
  ] as const)('%s', (line, expected) => {
    expect(check('docs/page.md', line)).toEqual(expected)
  })

  it('ignores redirections and pipes after the command', () => {
    expect(check('docs/page.md', '```sh\nwl open x 2>/dev/null | grep --count y\n```')).toEqual([])
  })

  it('accepts every option of every registered command when documented as registered', () => {
    const text = COMMANDS.map(
      (command) =>
        `\`wl ${command.path} ${command.options.map((o) => o.split(' ')[0]).join(' ')}\``,
    ).join('\n')
    expect(checkCommands(new Map([['docs/all.md', text]]), COMMANDS)).toEqual([])
  })
})
