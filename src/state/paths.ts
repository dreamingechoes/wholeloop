import { existsSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { inReadObservation, observedRead } from './read-observation.js'

/** Resolve even a not-yet-created destination through its existing symlink ancestors. */
export function canonicalPath(path: string): string {
  if (!inReadObservation()) return canonicalPhysicalPath(path)
  const selected = resolve(path)
  return observedRead(`canonical-path:${selected}`, () => {
    const value = canonicalPhysicalPath(selected)
    // Absence is an input too: a newly created revocation or private marker
    // must invalidate the observation even if its canonical name is unchanged.
    return { bytes: Buffer.from(JSON.stringify([value, existsSync(selected)])), value }
  })
}

function canonicalPhysicalPath(path: string): string {
  const selected = resolve(path)
  for (let attempt = 0; ; attempt++) {
    const suffix: string[] = []
    let ancestor = selected
    while (!existsSync(ancestor)) {
      const parent = dirname(ancestor)
      if (parent === ancestor) throw new Error(`Cannot resolve store path: ${path}`)
      suffix.unshift(basename(ancestor))
      ancestor = parent
    }
    try {
      return join(realpathSync(ancestor), ...suffix)
    } catch (error) {
      // Another writer can release .lock between exists and realpath. Resolve
      // the entire path again so a replacement alias cannot escape containment.
      if (attempt >= 2 || (error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error
    }
  }
}

export function assertExternal(path: string): void {
  if (!inReadObservation()) {
    assertPhysicalExternal(path)
    return
  }
  const selected = resolve(path)
  observedRead(`external-path:${selected}`, () => {
    assertPhysicalExternal(selected)
    return { bytes: Buffer.from('external'), value: undefined }
  })
}

/** A store selection has one identity; do not register canonical and external halves separately. */
export function externalStorePath(path: string, boundary?: string, label = path): string {
  const selected = resolve(path)
  if (!inReadObservation()) return physicalStorePath(selected, boundary, label)
  return observedRead(JSON.stringify(['store-path', boundary ?? null, selected]), () => {
    const value = physicalStorePath(selected, boundary, label)
    return { bytes: Buffer.from(JSON.stringify([value, existsSync(selected)])), value }
  })
}

function physicalStorePath(selected: string, boundary: string | undefined, label: string) {
  const value = canonicalPhysicalPath(selected)
  if (boundary && !inside(boundary, value)) throw new Error(`Store path escapes its root: ${label}`)
  assertPhysicalExternal(value)
  return value
}

function assertPhysicalExternal(path: string): void {
  let ancestor = canonicalPhysicalPath(path)
  while (true) {
    if (
      existsSync(join(ancestor, '.git')) ||
      (existsSync(join(ancestor, 'HEAD')) &&
        existsSync(join(ancestor, 'objects')) &&
        existsSync(join(ancestor, 'refs')))
    ) {
      throw new Error(`Runtime state must stay outside git repositories: ${path}`)
    }
    const parent = dirname(ancestor)
    if (parent === ancestor) return
    ancestor = parent
  }
}

export function inside(root: string, path: string): boolean {
  const rel = relative(root, path)
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`))
}

export function storePath(env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  const base = env.XDG_STATE_HOME
  const root = join(base && isAbsolute(base) ? base : join(home, '.local/state'), 'wholeloop')
  if (!env.WL_WORKSPACE) return root
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(env.WL_WORKSPACE))
    throw new Error('WL_WORKSPACE must be a simple lowercase name (1–64 characters)')
  return join(root, 'workspaces', env.WL_WORKSPACE)
}
