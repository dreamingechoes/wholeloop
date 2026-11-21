import { describe, expect, it } from 'vitest'
import { checkBudgets } from '../../../src/harness/budgets.js'
import { lines, tree } from './fixtures.js'

describe('checkBudgets', () => {
  it('accepts a skill at its budget and flags one line over', () => {
    expect(checkBudgets(tree({ 'harness/skills/a/SKILL.md': lines(120) }))).toEqual([])
    expect(checkBudgets(tree({ 'harness/skills/a/SKILL.md': lines(121) }))).toEqual([
      {
        file: 'harness/skills/a/SKILL.md',
        rule: 'budget',
        message: 'skill has 121 lines; the budget is 120',
      },
    ])
  })

  it.each([
    ['harness/agents/builder.md', 61, 'agent'],
    ['harness/protocols/ask.md', 81, 'protocol'],
    ['harness/policies/core.md', 81, 'policy'],
    ['harness/workflows/gate.ts', 151, 'workflow'],
    ['harness/providers/x/guidance/query.md', 31, 'provider guidance'],
    ['harness/lenses/a11y/prompt.md', 41, 'lens prompt'],
  ])('%s over budget is a %s finding', (file, count, kind) => {
    const [finding] = checkBudgets(tree({ [file]: lines(count) }))
    expect(finding?.message).toMatch(new RegExp(`^${kind} has ${count} lines`))
  })

  it('ignores files without a budget', () => {
    expect(checkBudgets(tree({ 'harness/providers/x/provider.yml': lines(500) }))).toEqual([])
  })
})
