import { checkBudgets } from '../harness/budgets.js'
import { checkEnforcement, parseEnforcement } from '../harness/enforcement.js'
import type { Finding } from '../harness/files.js'
import { checkFrontmatter } from '../harness/frontmatter.js'
import { readHarnessTree } from '../harness/tree.js'
import { EXIT, type Io } from './io.js'

function format(finding: Finding): string {
  const where = finding.line ? `${finding.file}:${finding.line}` : finding.file
  return `${where}  ${finding.rule}  ${finding.message}`
}

export function harnessCheck(root: string, json: boolean, io: Io): number {
  const tree = readHarnessTree(root)
  const map = parseEnforcement(tree.read('enforcement.yml') ?? '')
  const findings = [
    ...checkBudgets(tree),
    ...checkFrontmatter(tree),
    ...checkEnforcement(map, tree),
  ]
  if (json) {
    io.out(
      JSON.stringify({ schema: 'wholeloop/harness-check@1', files: tree.files.size, findings }),
    )
  } else {
    for (const finding of findings) io.err(format(finding))
    io.out(`harness: ${tree.files.size} files checked, ${findings.length} finding(s)`)
  }
  return findings.length === 0 ? EXIT.ok : EXIT.shape
}
