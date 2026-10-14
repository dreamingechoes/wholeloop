import { describe, expect, it } from 'vitest'
import { checkEnforcement, hardRules, parseEnforcement } from '../../../src/harness/enforcement.js'
import { tree } from './fixtures.js'

const PROTOCOL = 'harness/protocols/comms.md'
const RULE = '# Comms\n\n- ⛔ `no-send-verb` — comms can only draft.\n'
const CODE = { 'src/providers/taxonomy.ts': 'export const VERBS = ["draft"]' }

function run(yaml: string, files: Record<string, string> = { [PROTOCOL]: RULE }) {
  return checkEnforcement(parseEnforcement(yaml), tree(files, CODE)).map((f) => f.message)
}

describe('hardRules', () => {
  it('finds rule ids with file and line', () => {
    expect(hardRules(tree({ [PROTOCOL]: RULE }))).toEqual([
      { id: 'no-send-verb', file: PROTOCOL, line: 3 },
    ])
  })
})

describe('checkEnforcement', () => {
  it('passes a rule with a real enforcer', () => {
    expect(
      run('rules:\n  - id: no-send-verb\n    enforcers: [src/providers/taxonomy.ts#VERBS]\n'),
    ).toEqual([])
  })

  it('reports a hard rule with no enforcer', () => {
    expect(run('rules: []\n')).toEqual(["hard rule 'no-send-verb' has no enforcer"])
  })

  it('rejects prose as an enforcer', () => {
    expect(run('rules:\n  - id: no-send-verb\n    enforcers: [docs/concepts.md]\n')).toEqual([
      "'no-send-verb': 'docs/concepts.md' is prose — an enforcer must be code, a test or a lint",
    ])
  })

  it('reports missing files and missing symbols', () => {
    expect(
      run(
        'rules:\n  - id: no-send-verb\n    enforcers: [src/nope.ts, src/providers/taxonomy.ts#SEND]\n',
      ),
    ).toEqual([
      "'no-send-verb': 'src/nope.ts' does not exist",
      "'no-send-verb': 'src/providers/taxonomy.ts#SEND': 'SEND' not found in src/providers/taxonomy.ts",
    ])
  })

  it('reports a stale mapping whose rule disappeared', () => {
    expect(run('documentation_only:\n  - { id: gone-rule, reason: history }\n', {})).toEqual([
      "'gone-rule' is mapped but no hard rule states it any more",
    ])
  })

  it('reports a skill that contradicts a rule', () => {
    const files = {
      [PROTOCOL]: RULE,
      'harness/skills/launch/SKILL.md': 'call comms.send when ready\n',
    }
    const yaml =
      'rules:\n  - id: no-send-verb\n    enforcers: [src/providers/taxonomy.ts]\n    forbid: ["comms\\\\.send"]\n'
    expect(run(yaml, files)).toEqual(["contradicts 'no-send-verb' (matches /comms\\.send/)"])
  })

  it('requires a reason for documentation-only rules', () => {
    expect(run('documentation_only:\n  - { id: no-send-verb, reason: "" }\n')).toEqual([
      "'no-send-verb' is documentation-only without a reason",
    ])
  })
})
