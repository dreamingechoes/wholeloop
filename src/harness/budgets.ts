// Line budgets for harness files (ADR-0011).
import { type Finding, type HarnessTree, lineCount } from './files.js'

export const BUDGETS: readonly { kind: string; pattern: RegExp; maxLines: number }[] = [
  { kind: 'skill', pattern: /^harness\/skills\/[^/]+\/SKILL\.md$/, maxLines: 120 },
  { kind: 'agent', pattern: /^harness\/agents\/[^/]+\.md$/, maxLines: 60 },
  { kind: 'protocol', pattern: /^harness\/protocols\/[^/]+\.md$/, maxLines: 80 },
  { kind: 'policy', pattern: /^harness\/policies\/[^/]+\.md$/, maxLines: 80 },
  { kind: 'workflow', pattern: /^harness\/workflows\/[^/]+\.ts$/, maxLines: 150 },
  {
    kind: 'provider guidance',
    pattern: /^harness\/providers\/[^/]+\/guidance\/[^/]+\.md$/,
    maxLines: 30,
  },
  { kind: 'lens prompt', pattern: /^harness\/lenses\/[^/]+\/prompt\.md$/, maxLines: 40 },
]

export function checkBudgets(tree: HarnessTree): Finding[] {
  const findings: Finding[] = []
  for (const [file, content] of tree.files) {
    const budget = BUDGETS.find(({ pattern }) => pattern.test(file))
    const lines = lineCount(content)
    if (budget && lines > budget.maxLines) {
      findings.push({
        file,
        rule: 'budget',
        message: `${budget.kind} has ${lines} lines; the budget is ${budget.maxLines}`,
      })
    }
  }
  return findings
}
