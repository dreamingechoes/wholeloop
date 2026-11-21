// Keeps editable artifacts outside both repositories and the core-owned private store.
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, sep } from 'node:path'
import { assertExternal, canonicalPath } from '../state/paths.js'

export function scratchDirectory(store: string, run: string, temporary = tmpdir()): string {
  if (!/^run-[a-f0-9]{16}$/.test(run)) throw new Error('Scratch needs a valid step run')
  const key = createHash('sha256').update(store).digest('hex').slice(0, 16),
    directory = canonicalPath(join(temporary, 'wholeloop-artifacts', key, run)),
    path = relative(store, directory)
  if (!path || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path)))
    throw new Error('Scratch must stay outside the private store')
  assertExternal(directory)
  return directory
}
