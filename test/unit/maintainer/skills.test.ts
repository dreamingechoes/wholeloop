import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error The repository script is plain JavaScript without declarations.
import { roadmapCounts, roadmapTasks, statedCounts } from '../../../scripts/roadmap-status.mjs'
import { readSources } from '../../../src/maintainer/render.js'

const root = resolve('.')
const skills = [...readSources(root)].filter(([path]) => path.endsWith('/SKILL.md'))
const scripts = Object.keys(
  (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { scripts: object }).scripts,
)
// Lines that state what a skill must never do are allowed to name the command.
const forbidding = /\b(?:never|not|neither|nor|no)\b/i
const effects = [
  /\bgit (?:commit|push|tag)\b/,
  /\bnpm publish\b/,
  /\bgh (?:release create|repo edit|api [^`]*-X)/,
  /\bgh pr (?:create|merge)\b/,
]

describe('maintainer workflow skills', () => {
  it('ships the workflows the working agreement needs', () => {
    expect(skills.map(([path]) => path.split('/')[2]).sort()).toEqual([
      'maint-amend-adr',
      'maint-check',
      'maint-close-task',
      'maint-extend',
      'maint-investigate-performance',
      'maint-prepare-release',
      'maint-start-task',
      'maint-triage-issue',
    ])
  })

  it.each(skills)('%s names checks that exist instead of restating them', (_path, content) => {
    const named = [...content.matchAll(/npm run ([a-z][a-z0-9:-]*)/g)].map((match) => match[1])
    expect(named.length, 'a skill names the checks it relies on').toBeGreaterThan(0)
    for (const script of named) expect(scripts, `npm run ${script}`).toContain(script)
    for (const [, path] of content.matchAll(
      /`((?:docs|roadmap|scripts|src|test|harness|maintainer)\/[A-Za-z0-9_./-]+|AGENTS\.md|SECURITY\.md|enforcement\.yml)`/g,
    ))
      if (path && !path.includes('<') && !path.includes('*'))
        expect(existsSync(join(root, path)), path).toBe(true)
  })

  it.each(skills)(
    '%s never commits, pushes, publishes or changes settings itself',
    (_path, content) => {
      for (const line of content.split('\n'))
        if (effects.some((pattern) => pattern.test(line)))
          expect(forbidding.test(line), line).toBe(true)
      expect(content).toMatch(/never (?:commits|tags)|does neither|never commit/i)
    },
  )
})

describe('roadmap status', () => {
  it('counts tasks from phase files and finds a stale README total', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wl-roadmap-'))
    try {
      mkdirSync(join(dir, 'roadmap'))
      writeFileSync(
        join(dir, 'roadmap/phase-1-fixture.md'),
        '# Phase\n\n## P1-01 · Done\n\n**Status:** ✅ · **Size:** S\n\n## P1-02 · Open\n\n**Status:** ⬜ · **Size:** S\n\n## P1-03 · Moved\n\nMoved to P2-01.\n\n## P1-04 · Parked\n\n**Status:** ⏸️ · **Size:** M\n',
      )
      const counts = roadmapCounts(roadmapTasks(join(dir, 'roadmap')))
      expect(counts).toEqual({ total: 3, complete: 1, open: 2 })
      expect(statedCounts('The roadmap now contains 3 tasks: 1 completed tasks')).toEqual({
        total: 3,
        complete: 1,
      })
      expect(statedCounts('No totals here')).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('agrees with the committed README', () => {
    const counts = roadmapCounts(roadmapTasks(join(root, 'roadmap')))
    const stated = statedCounts(readFileSync(join(root, 'roadmap/README.md'), 'utf8'))
    expect(stated).toEqual({ total: counts.total, complete: counts.complete })
  })
})
