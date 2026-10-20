import { lstatSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const names = [
  '.cursor/cli.json',
  '.cursor/hooks.json',
  '.gemini/worker-settings.json',
  '.agents/hooks.json',
] as const
export type WorkerPolicyFile =
  | (typeof names)[number]
  | `.agents/agents/wholeloop-observer-${string}.md`
const knownPolicy = (name: string) =>
  names.includes(name as (typeof names)[number]) ||
  (name.endsWith('.md') && /^\.agents\/agents\/wholeloop-observer-[a-f0-9]{16}\.md$/.test(name))
function entry(path: string) {
  try {
    return lstatSync(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
}

/** Only non-secret native policy belongs here; assignments and credentials remain off disk. */
export function stageWorkerPolicy(
  directory: string,
  files?: ReadonlyMap<WorkerPolicyFile, string>,
) {
  if (!files?.size) return
  if (files.size > names.length + 1) throw new Error('Too many native worker policy files')
  const directoryStat = lstatSync(directory)
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink())
    throw new Error('Unsafe native worker root')
  const root = realpathSync(directory)
  // Preflight the complete batch before writing the first file, preserving existing policy.
  const planned = [...files].map(([name, content]) => {
    if (!knownPolicy(name) || typeof content !== 'string' || Buffer.byteLength(content) > 65536)
      throw new Error('Unsupported or oversized native worker policy file')
    const path = join(root, name)
    if (entry(path)) throw new Error('Native worker policy already exists; preserve it')
    return { path, content }
  })
  const ancestorPaths = new Set<string>()
  for (const file of planned) {
    let parent = dirname(file.path)
    while (parent !== root) {
      ancestorPaths.add(parent)
      parent = dirname(parent)
    }
  }
  const parents = [...ancestorPaths]
    .sort((a, b) => a.length - b.length)
    .map((parent) => {
      const stat = entry(parent)
      if (stat && (!stat.isDirectory() || stat.isSymbolicLink()))
        throw new Error('Unsafe native worker policy directory')
      return { parent, exists: !!stat }
    })
  for (const { parent, exists } of parents) if (!exists) mkdirSync(parent, { mode: 0o700 })
  for (const file of planned) writeFileSync(file.path, file.content, { flag: 'wx', mode: 0o600 })
}
