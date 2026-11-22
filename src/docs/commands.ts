// Documented `wl` command lines must name commands and options that exist (P9-19).
// Decision records and the roadmap are history and keep the spelling of their time.
import type { Problem } from './check.js'

export interface CommandShape {
  path: string
  options: readonly string[]
}

/** Accepted by every command through the shared entry point. */
export const GLOBAL_OPTIONS: readonly string[] = ['--json', '--help', '-h']

export function checkedCommandFile(file: string) {
  return (
    file === 'README.md' ||
    (file.startsWith('docs/') && file.endsWith('.md') && !file.startsWith('docs/decisions/')) ||
    /^docs\/assets\/terminal\/sessions\/[^/]+\.txt$/.test(file)
  )
}

/** Every `wl …` invocation a reader could copy, with the line it starts on. */
export function documentedCommands(file: string, text: string) {
  const session = file.endsWith('.txt')
  const lines = text.split('\n')
  const found: { line: number; command: string }[] = []
  let fence: string | undefined
  for (let index = 0; index < lines.length; index++) {
    const start = index
    let line = lines[index] ?? ''
    const opening = line.match(/^\s*(```|~~~)\s*([\w-]*)/)
    if (opening) {
      fence = fence === undefined ? (opening[2] ?? '') : undefined
      continue
    }
    if (fence === 'mermaid') continue
    const code = session || fence !== undefined
    while (code && line.endsWith('\\') && index + 1 < lines.length)
      line = `${line.slice(0, -1)} ${lines[++index] ?? ''}`
    const pattern = code ? /(?:^|[\s$>(])wl\s+([a-z][^`\n]*)/g : /`wl\s+([a-z][^`]*)`/g
    for (const match of line.matchAll(pattern))
      found.push({ line: start + 1, command: (match[1] ?? '').trim() })
  }
  return found
}

function tokens(command: string) {
  const unquoted = command.replace(/"[^"]*"|'[^']*'/g, 'value')
  const end = unquoted.search(/\s(?:\||;|&&|#|\d?>)/)
  return (end < 0 ? unquoted : unquoted.slice(0, end)).split(/\s+/).filter(Boolean)
}

export function checkCommands(
  files: ReadonlyMap<string, string>,
  commands: readonly CommandShape[],
): Problem[] {
  const shapes = commands.map((command) => ({
    words: command.path.split(' '),
    options: new Set([
      ...command.options.map((option) => option.split(' ')[0] ?? option),
      ...GLOBAL_OPTIONS,
    ]),
  }))
  const problems: Problem[] = []
  for (const [file, text] of files) {
    if (!checkedCommandFile(file)) continue
    for (const { line, command } of documentedCommands(file, text)) {
      const parts = tokens(command)
      const words: string[] = []
      for (const part of parts) {
        if (!/^[a-z][a-z0-9-]*$/.test(part)) break
        words.push(part)
      }
      let shape: (typeof shapes)[number] | undefined
      for (let size = words.length; size > 0 && !shape; size--) {
        const path = words.slice(0, size).join(' ')
        shape = shapes.find((entry) => entry.words.join(' ') === path)
      }
      if (!shape) {
        // A group name alone, such as `wl provider`, introduces its subcommands.
        const group = shapes.some(
          (entry) => entry.words.slice(0, words.length).join(' ') === words.join(' '),
        )
        if (!words.length || !group)
          problems.push({ file, line, rule: 'command', message: `unknown command: wl ${command}` })
        continue
      }
      const separator = parts.indexOf('--')
      for (const part of separator < 0 ? parts : parts.slice(0, separator)) {
        const option =
          part
            .replace(/^\[/, '')
            .replace(/[\])]+$/, '')
            .split('=')[0] ?? ''
        if (!/^--?[a-z]/.test(option) || shape.options.has(option)) continue
        problems.push({
          file,
          line,
          rule: 'command',
          message: `wl ${shape.words.join(' ')} has no ${option} option`,
        })
      }
    }
  }
  return problems
}
