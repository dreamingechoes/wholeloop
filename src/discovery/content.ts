// Reads selected guidance only inside its repository or a declared personal skill location.
// A remembered personal choice must remain readable without admitting arbitrary home files.

import { homedir } from 'node:os'
import { basename, isAbsolute, join } from 'node:path'
import { readRegularText } from '../fs/regular-file.js'
import { canonicalPath, inside } from '../state/paths.js'
import { personalFolders } from './clients.js'

export function guidanceText(
  root: string,
  home: string,
  selected: { ref: string },
): string | undefined {
  const file = canonicalPath(isAbsolute(selected.ref) ? selected.ref : join(root, selected.ref))
  let allowed = inside(canonicalPath(root), file)
  if (!allowed && basename(file) === 'SKILL.md') {
    const roots = personalFolders(
      home,
      undefined,
      true,
      home === homedir() ? process.env : {},
    ).starts
    allowed = roots.some((folder) => inside(canonicalPath(folder), file))
  }
  // Resolve before reading, then use the descriptor guard so a replaced final symlink cannot escape.
  return allowed ? readRegularText(file, 1024 * 1024) : undefined
}
