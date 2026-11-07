import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  MANIFEST,
  maintainerDrift,
  readSources,
  renderMaintainer,
  sourceProblems,
  writeMaintainer,
} from '../../../src/maintainer/render.js'

const SKILL =
  '---\nname: fixture-task\ndescription: Do the fixture task.\n---\n\n# Fixture\n\nRun the fixture.\n'
const AGENT =
  '---\nname: fixture-reviewer\ndescription: Review the fixture read-only.\nmetadata:\n  wholeloop.capabilities: read\n---\n\n# Reviewer\n\nCite the rule for every finding.\n'

function fixture(run: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'wl-maintainer-'))
  const put = (path: string, body: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), body)
  }
  try {
    put('maintainer/skills/fixture-task/SKILL.md', SKILL)
    put('maintainer/skills/fixture-task/reference.md', '# Reference\n')
    put('maintainer/agents/fixture-reviewer.md', AGENT)
    run(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('maintainer skills and agents', () => {
  it('renders one source into every supported client without the wholeloop runtime', () =>
    fixture((root) => {
      const { files, manifest } = renderMaintainer(root, readSources(root))
      expect([...files.keys()].sort()).toEqual([
        '.agents/agents/fixture-reviewer.md',
        '.agents/skills/fixture-task/SKILL.md',
        '.agents/skills/fixture-task/reference.md',
        '.claude/agents/fixture-reviewer.md',
        '.claude/skills/fixture-task/SKILL.md',
        '.claude/skills/fixture-task/reference.md',
        '.codex/agents/fixture-reviewer.toml',
        '.cursor/agents/fixture-reviewer.md',
        '.cursor/skills/fixture-task/SKILL.md',
        '.cursor/skills/fixture-task/reference.md',
        '.gemini/agents/fixture-reviewer.md',
        '.gemini/skills/fixture-task/SKILL.md',
        '.gemini/skills/fixture-task/reference.md',
        '.github/agents/fixture-reviewer.agent.md',
        '.github/skills/fixture-task/SKILL.md',
        '.github/skills/fixture-task/reference.md',
        '.opencode/agents/fixture-reviewer.md',
        '.opencode/skills/fixture-task/SKILL.md',
        '.opencode/skills/fixture-task/reference.md',
      ])
      for (const [path, content] of files) {
        expect(content, path).not.toContain('wholeloopRoot')
        expect(content, path).not.toContain('wl-fixture')
        expect(content, path).toContain('npm run maintainer:render')
      }
      // Skills keep their canonical front matter and body; only the notice is added.
      const skill = files.get('.claude/skills/fixture-task/SKILL.md') ?? ''
      expect(skill.startsWith('---\nname: fixture-task\n')).toBe(true)
      expect(skill).toContain('Run the fixture.')
      // Read-only roles keep each client's native read-only mapping.
      expect(files.get('.claude/agents/fixture-reviewer.md')).toMatch(/permissionMode: plan/)
      expect(files.get('.codex/agents/fixture-reviewer.toml')).toMatch(/shell_tool = false/)
      expect(files.get('.cursor/agents/fixture-reviewer.md')).toMatch(/readonly: true/)
      expect(JSON.parse(manifest).targets.codex.readOnly).toBe(
        'inherited-parent-and-checked-headless',
      )
    }))

  it('fails the check on a hand edit, an unrendered source edit or a stale file', () =>
    fixture((root) => {
      expect(maintainerDrift(root)).toContain(`${MANIFEST}: out of date`)
      expect(writeMaintainer(root)).toEqual({ written: 19, removed: 0 })
      expect(maintainerDrift(root)).toEqual([])
      expect(writeMaintainer(root)).toEqual({ written: 0, removed: 0 })

      const rendered = join(root, '.claude/agents/fixture-reviewer.md')
      writeFileSync(rendered, `${readFileSync(rendered, 'utf8')}Hand edit.\n`)
      expect(maintainerDrift(root)).toEqual(['.claude/agents/fixture-reviewer.md: edited or stale'])
      writeMaintainer(root)

      writeFileSync(join(root, 'maintainer/skills/fixture-task/SKILL.md'), `${SKILL}More.\n`)
      expect(maintainerDrift(root)).toContain(
        '.claude/skills/fixture-task/SKILL.md: edited or stale',
      )
      writeMaintainer(root)

      rmSync(join(root, 'maintainer/skills/fixture-task/reference.md'))
      expect(maintainerDrift(root)).toContain(
        '.claude/skills/fixture-task/reference.md: no longer rendered from any source',
      )
      expect(writeMaintainer(root).removed).toBe(6)
      expect(existsSync(join(root, '.claude/skills/fixture-task/reference.md'))).toBe(false)
      expect(maintainerDrift(root)).toEqual([])
    }))

  it('applies the harness budgets and front-matter rules to sources', () =>
    fixture((root) => {
      const sources = readSources(root)
      sources.set('maintainer/agents/fixture-reviewer.md', `${AGENT}${'line\n'.repeat(60)}`)
      sources.set('maintainer/notes.md', '# Not a source\n')
      sources.set('maintainer/skills/fixture-task/SKILL.md', '# No front matter\n')
      const problems = sourceProblems(sources)
      expect(problems.some((problem) => problem.includes('the budget is 60'))).toBe(true)
      expect(problems.some((problem) => problem.startsWith('maintainer/notes.md'))).toBe(true)
      expect(problems.some((problem) => problem.startsWith('maintainer/skills/fixture-task'))).toBe(
        true,
      )
    }))

  it('keeps the committed maintainer files in sync and out of the published bundle', () => {
    const root = resolve('.')
    expect(maintainerDrift(root)).toEqual([])
    const bundle = readFileSync(join(root, 'dist/wl.mjs'), 'utf8')
    expect(bundle).not.toContain('wholeloop/maintainer-rendered@1')
    expect(bundle).not.toContain('npm run maintainer:render')
  })
})
