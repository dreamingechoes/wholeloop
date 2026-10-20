import { lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { replaceSection } from '../docs/sections.js'
import { type conformanceMatrix, conformanceMatrixMarkdown } from './matrix.js'

/** Publish only a documentation projection, never the imported raw reports or runtime store. */
export function conformancePage(
  repository: string,
  matrix: ReturnType<typeof conformanceMatrix>,
  write = false,
) {
  const root = realpathSync(repository)
  for (const relative of ['docs', 'docs/platforms', 'docs/platforms/README.md']) {
    const stat = lstatSync(join(root, relative))
    if (
      stat.isSymbolicLink() ||
      (relative.endsWith('.md') ? !stat.isFile() || stat.size > 1024 * 1024 : !stat.isDirectory())
    )
      throw new Error(
        'Conformance documentation needs a regular bounded page without linked parents',
      )
  }
  const file = 'docs/platforms/README.md'
  const path = join(root, file)
  const before = readFileSync(path, 'utf8')
  if (Buffer.byteLength(before) > 1024 * 1024)
    throw new Error('Conformance documentation exceeds 1 MiB')
  const body = [
    conformanceMatrixMarkdown(matrix),
    '',
    'Supplied observations are not independently authenticated or re-executed.',
    'This snapshot covers standalone framing only; native permissions, hooks, MCP',
    'and semantic quality remain separate verification.',
  ].join('\n')
  const after = replaceSection(before, 'conformance', body)
  if (Buffer.byteLength(after) > 1024 * 1024)
    throw new Error('Generated conformance documentation exceeds 1 MiB; preserve the page')
  const changed = before !== after
  // Only the owned section changes; an interrupted write still needs inspection and regeneration.
  if (write && changed) writeFileSync(path, after)
  return {
    schema: 'wholeloop/conformance-page@1',
    file,
    status: changed ? (write ? 'updated' : 'stale') : 'current',
    written: write && changed,
  }
}
