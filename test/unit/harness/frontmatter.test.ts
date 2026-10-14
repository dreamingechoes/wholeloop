import { describe, expect, it } from 'vitest'
import { checkAgent, checkFrontmatter, checkSkill } from '../../../src/harness/frontmatter.js'
import { skill, tree } from './fixtures.js'

const FILE = 'harness/skills/build-slice/SKILL.md'

describe('checkSkill', () => {
  it('accepts portable front matter with string metadata', () => {
    const content = skill(
      'build-slice',
      'Builds a slice.',
      'metadata:\n  wholeloop.step: build-slice\n',
    )
    expect(checkSkill(FILE, content)).toEqual([])
  })

  it.each([
    ['# no front matter\n', 'missing YAML front matter'],
    [skill('Build_Slice'), 'name must be kebab-case'],
    [skill('other-name'), "name 'other-name' must match 'build-slice'"],
    [skill('build-slice', 'x'.repeat(401)), 'description has 401 characters; the budget is 400'],
    [skill('build-slice', 'ok', 'context: fork\n'), 'non-portable keys (context)'],
    [skill('build-slice', 'ok', 'metadata:\n  a: [1]\n'), 'metadata must map strings to strings'],
  ])('reports %#', (content, message) => {
    expect(checkSkill(FILE, content).join(' | ')).toContain(message)
  })
})

describe('checkAgent', () => {
  const agent = (meta: string) =>
    `---\nname: reviewer\ndescription: Reviews through one lens.\nmetadata:\n${meta}---\n`
  const file = 'harness/agents/reviewer.md'

  it('accepts known capabilities and tier', () => {
    expect(
      checkAgent(file, agent('  wholeloop.capabilities: read shell\n  wholeloop.tier: standard\n')),
    ).toEqual([])
  })

  it('requires capabilities and rejects unknown ones', () => {
    expect(checkAgent(file, agent('  wholeloop.tier: deep\n'))).toContain(
      'metadata wholeloop.capabilities is required',
    )
    expect(
      checkAgent(file, agent('  wholeloop.capabilities: read fly\n  wholeloop.tier: huge\n')),
    ).toEqual(['unknown capabilities: fly', "unknown tier 'huge'"])
  })
})

describe('checkFrontmatter', () => {
  it('only checks skill and agent files', () => {
    const findings = checkFrontmatter(
      tree({
        'harness/protocols/ask.md': '# no front matter',
        'harness/skills/x/SKILL.md': '# none',
      }),
    )
    expect(findings.map((f) => f.file)).toEqual(['harness/skills/x/SKILL.md'])
  })
})
