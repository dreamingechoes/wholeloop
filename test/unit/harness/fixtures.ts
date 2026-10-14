import type { HarnessTree } from '../../../src/harness/files.js'

export function tree(
  files: Record<string, string>,
  others: Record<string, string> = {},
): HarnessTree {
  const map = new Map(Object.entries(files))
  const all = { ...others, ...files }
  return { files: map, read: (path) => all[path] }
}

export function lines(count: number): string {
  return `${Array.from({ length: count }, (_, i) => `line ${i + 1}`).join('\n')}\n`
}

export function skill(name: string, description = 'Does one thing well.', extra = ''): string {
  return `---\nname: ${name}\ndescription: ${description}\n${extra}---\n\n# ${name}\n`
}
