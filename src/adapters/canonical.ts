// The canonical harness bundled into the CLI, with its digest and validation.
import { createHash } from 'node:crypto'
import { checkBudgets } from '../harness/budgets.js'
import { checkCommunication, SPEAKING_PROTOCOL } from '../harness/communication.js'
import { checkFrontmatter } from '../harness/frontmatter.js'

declare const __WL_HARNESS__: Record<string, string>
export function bundledCanonical() {
  return new Map(Object.entries(__WL_HARNESS__))
}
export function canonicalDigest(files: ReadonlyMap<string, string>) {
  return createHash('sha256')
    .update(JSON.stringify([...files].sort(([a], [b]) => a.localeCompare(b))))
    .digest('hex')
}
export function validateCanonical(files: ReadonlyMap<string, string>) {
  for (const [file, content] of files)
    if (
      !/^harness\/(?:[a-zA-Z0-9_.-]+\/)*[a-zA-Z0-9_.-]+$/.test(file) ||
      file.split('/').some((part) => part === '..' || part === '.') ||
      Buffer.byteLength(content) > 1024 * 1024
    )
      throw new Error('Canonical resource needs a contained bounded harness path')
  const tree = { files, read: (path: string) => files.get(path) }
  const problems = [
    ...checkBudgets(tree),
    ...checkFrontmatter(tree),
    ...(files.has(`harness/protocols/${SPEAKING_PROTOCOL}.md`) ? checkCommunication(tree) : []),
  ]
  if (problems.length)
    throw new Error(
      `Canonical harness validation failed: ${problems.map((problem) => `${problem.file}: ${problem.message}`).join('; ')}`,
    )
  if (
    ![...files.keys()].some((file) => /^harness\/skills\/[^/]+\/SKILL.md$/.test(file)) ||
    ![...files.keys()].some((file) => /^harness\/agents\/[^/]+\.md$/.test(file))
  )
    throw new Error('Canonical harness needs skills and agents')
}
