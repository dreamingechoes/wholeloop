import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** Build-time resources only; the installed core never needs the source checkout. */
export function harnessAssets(root) {
  const files = {}
  function walk(relative) {
    for (const entry of readdirSync(join(root, relative), { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const path = `${relative}/${entry.name}`
      if (entry.isSymbolicLink())
        throw new Error(`Canonical harness assets cannot be symlinks: ${path}`)
      if (entry.isDirectory()) walk(path)
      else if (entry.isFile() && /\.(md|json|ya?ml)$/.test(path)) {
        if (statSync(join(root, path)).size > 1024 * 1024)
          throw new Error(`Canonical harness asset exceeds 1 MiB: ${path}`)
        files[path] = readFileSync(join(root, path), 'utf8')
      }
    }
  }
  walk('harness')
  return files
}
