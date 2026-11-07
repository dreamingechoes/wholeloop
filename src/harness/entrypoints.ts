// Marks harness entrypoints so discovery can route them; a routing hint, not provenance.
import { parse as toml } from 'smol-toml'
import { stripCode } from '../docs/markdown.js'

const MARKDOWN_MARKER = '<!-- wholeloop:entrypoint@1 -->'
const TOML_MARKER = '# wholeloop:entrypoint@1'
/** This is a routing hint, not executable provenance or an ownership/authentication claim. */
export function isEntrypoint(content: string, format: 'md' | 'toml' = 'md'): boolean {
  if (format === 'toml') {
    try {
      toml(content)
    } catch {
      return false
    }
    return content.trimEnd().split('\n').at(-1) === TOML_MARKER
  }
  return (
    stripCode(content)
      .filter((line) => line.trim().length > 0)
      .at(-1) === MARKDOWN_MARKER
  )
}
export function markEntrypoint(content: string, format: 'md' | 'toml' = 'md'): string {
  if (isEntrypoint(content, format)) return content
  return `${content}${content.endsWith('\n') ? '' : '\n'}${format === 'toml' ? TOML_MARKER : MARKDOWN_MARKER}\n`
}
