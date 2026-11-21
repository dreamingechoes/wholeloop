import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  type GuidancePin,
  guidanceContextProblem,
  guidanceForRole,
  guidanceManifest,
  guidanceShapeProblem,
  INSTRUCTIONS_SLOT,
  sha256,
} from '../../../src/delivery/guidance.js'
import { proposeGuidance, readPinnedGuidance } from '../../../src/delivery/guidance-tree.js'
import { resolveSlot } from '../../../src/discovery/resolve.js'
import { SLOT_RULES } from '../../../src/discovery/rules.js'
import { discover } from '../../../src/discovery/tree.js'
import { guidanceContext } from '../../../src/runner/public-composition.js'
import { RunnerStore } from '../../../src/runner/store.js'
import { StoreFiles } from '../../../src/state/files.js'

const git = (root: string, ...args: string[]) => {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Fixture',
      GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
      GIT_COMMITTER_NAME: 'Fixture',
      GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
    },
  })
  if (result.status !== 0) throw new Error(result.stderr)
  return result.stdout.trim()
}
const write = (root: string, path: string, body: string) => {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), body)
}
const skill = (name: string, description: string, extra = '') =>
  `---\nname: ${name}\ndescription: ${description}\n${extra}---\n# ${name}\n\nFollow the fixture rule.\n`

function fixture(run: (context: { dir: string; root: string; commit(): string }) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'wl-guidance-'))
  const root = join(dir, 'app')
  try {
    mkdirSync(root)
    git(root, 'init', '-q', '-b', 'main')
    write(root, 'AGENTS.md', '# Agents\n\nUse the fixture conventions.\n')
    write(root, 'CLAUDE.md', '@AGENTS.md\n')
    write(
      root,
      '.claude/skills/backend-architecture/SKILL.md',
      skill('backend-architecture', 'Backend layering for this fixture.'),
    )
    write(root, '.claude/skills/backend-architecture/reference.md', '# Layers\n\nOne way in.\n')
    write(root, '.claude/agents/code-review.md', skill('code-review', 'Fixture review rubric.'))
    write(root, 'src/index.js', 'export const value = 1\n')
    const commit = () => {
      git(root, 'add', '-A')
      git(root, 'commit', '-q', '-m', 'fixture')
      return git(root, 'rev-parse', 'HEAD')
    }
    run({ dir, root: resolve(root), commit })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
const pin = (pins: readonly GuidancePin[], slot: string) => {
  const found = pins.find((entry) => entry.slot === slot)
  if (!found) throw new Error(`Missing ${slot}`)
  return found
}

describe('repository guidance for autonomous runs', () => {
  it('proposes what a supervised step resolves, read at the pinned base, deterministically', () =>
    fixture(({ dir, root, commit }) => {
      const base = commit()
      const proposal = proposeGuidance([{ id: 'app', root, base }])
      expect(proposal.status).toBe('proposed')
      expect(proposal.questions).toEqual([])
      expect(proposeGuidance([{ id: 'app', root, base }])).toEqual(proposal)
      const instructions = pin(proposal.pins, INSTRUCTIONS_SLOT)
      expect(instructions.files?.map((file) => file.path)).toEqual(['AGENTS.md', 'CLAUDE.md'])
      const backend = pin(proposal.pins, 'build.backend')
      expect(backend.ref).toBe('.claude/skills/backend-architecture')
      expect(backend.files?.map((file) => file.path)).toEqual([
        '.claude/skills/backend-architecture/SKILL.md',
        '.claude/skills/backend-architecture/reference.md',
      ])
      expect(backend.sha256).toBe(sha256(guidanceManifest(backend.ref, backend.files ?? [])))
      // The rubric is read as bytes by the review engine, so it stays a single-file pin.
      expect(pin(proposal.pins, 'review.rubric')).toMatchObject({
        ref: '.claude/agents/code-review.md',
        sha256: sha256(readFileSync(join(root, '.claude/agents/code-review.md'))),
      })
      expect(proposal.pins.every((entry) => guidanceShapeProblem(entry) === undefined)).toBe(true)

      // Equivalence with the supervised resolution of the same working tree.
      const home = join(dir, 'home')
      mkdirSync(home)
      const map = discover(root, new StoreFiles(join(dir, 'store')), home, { persist: false })
      for (const [slot] of SLOT_RULES) {
        const selected = resolveSlot(slot, map.repo).selected
        const proposed = proposal.pins.find((entry) => entry.slot === slot)
        if (!selected || selected.origin === 'harness' || selected.ref.includes('#'))
          expect(proposed, slot).toBeUndefined()
        else
          expect(proposed?.ref, slot).toBe(
            selected.ref.endsWith('/SKILL.md') && slot !== 'review.rubric'
              ? dirname(selected.ref)
              : selected.ref,
          )
      }

      // Working-tree edits after the base change nothing: pins read the commit.
      write(root, 'AGENTS.md', 'Changed after the base.\n')
      expect(proposeGuidance([{ id: 'app', root, base }])).toEqual(proposal)
    }))

  it('asks before authorization instead of guessing between tied candidates', () =>
    fixture(({ root, commit }) => {
      write(root, '.claude/skills/frontend-ui/SKILL.md', skill('frontend-ui', 'UI.'))
      write(root, '.claude/skills/frontend-app/SKILL.md', skill('frontend-app', 'App.'))
      const base = commit()
      const asked = proposeGuidance([{ id: 'app', root, base }])
      expect(asked.status).toBe('needs-answers')
      const question = asked.questions.find((entry) => entry.slot === 'build.frontend')
      expect(question?.id).toBe('app:slot:build.frontend')
      expect(question?.options.map((option) => option.value)).toEqual([
        'default',
        '.claude/skills/frontend-app/SKILL.md',
        '.claude/skills/frontend-ui/SKILL.md',
      ])
      const answered = proposeGuidance([{ id: 'app', root, base }], {
        answers: { 'app:slot:build.frontend': '.claude/skills/frontend-ui/SKILL.md' },
      })
      expect(answered.status).toBe('proposed')
      expect(pin(answered.pins, 'build.frontend').ref).toBe('.claude/skills/frontend-ui')
      const declined = proposeGuidance([{ id: 'app', root, base }], {
        answers: { 'app:slot:build.frontend': 'default' },
      })
      expect(declined.pins.some((entry) => entry.slot === 'build.frontend')).toBe(false)
      const configuredDefault = proposeGuidance([{ id: 'app', root, base }], {
        bindings: () => ({ 'build.frontend': 'default' }),
      })
      expect(configuredDefault.status).toBe('proposed')
      expect(configuredDefault.pins.some((entry) => entry.slot === 'build.frontend')).toBe(false)
      expect(configuredDefault.skipped.some((entry) => entry.slot === 'build.frontend')).toBe(false)
      // An answer outside the offered options is not accepted.
      expect(
        proposeGuidance([{ id: 'app', root, base }], {
          answers: { 'app:slot:build.frontend': 'src/index.js' },
        }).status,
      ).toBe('needs-answers')
    }))

  it('honours a configured binding and blocks oversized guidance', () =>
    fixture(({ root, commit }) => {
      write(root, 'docs/backend.md', '# Backend\n')
      write(root, '.claude/skills/backend-architecture/big.txt', 'x'.repeat(300 * 1024))
      const base = commit()
      const blocked = proposeGuidance([{ id: 'app', root, base }])
      expect(blocked.status).toBe('blocked')
      expect(blocked.problems[0]?.message).toContain('bind a smaller skill')
      const bound = proposeGuidance([{ id: 'app', root, base }], {
        bindings: () => ({ 'build.backend': 'docs/backend.md' }),
      })
      expect(bound.status).toBe('proposed')
      expect(pin(bound.pins, 'build.backend')).toMatchObject({ ref: 'docs/backend.md' })
    }))

  it('refuses pins whose bytes, directory or instruction set changed at the base', () =>
    fixture(({ root, commit }) => {
      const base = commit()
      const repositories = [{ id: 'app', root, base }]
      const { pins } = proposeGuidance(repositories)
      const read = readPinnedGuidance(repositories, pins)
      expect(read?.map((entry) => entry.pin.slot)).toEqual(pins.map((entry) => entry.slot))
      const backend = read?.find((entry) => entry.pin.slot === 'build.backend')
      expect(sha256(backend?.manifest ?? '')).toBe(pin(pins, 'build.backend').sha256)

      write(root, '.claude/skills/backend-architecture/extra.md', 'Added later.\n')
      const added = commit()
      expect(readPinnedGuidance([{ id: 'app', root, base: added }], pins)).toBeUndefined()
      write(root, 'GEMINI.md', 'New instructions.\n')
      rmSync(join(root, '.claude/skills/backend-architecture/extra.md'))
      const instructions = commit()
      expect(readPinnedGuidance([{ id: 'app', root, base: instructions }], pins)).toBeUndefined()
      expect(
        readPinnedGuidance(repositories, [
          { ...pin(pins, 'review.rubric'), sha256: 'f'.repeat(64) },
        ]),
      ).toBeUndefined()
      expect(
        readPinnedGuidance(repositories, [{ ...pin(pins, 'review.rubric'), repository: 'other' }]),
      ).toBeUndefined()
    }))

  it('reads every pin of a repository with two Git processes', () =>
    fixture(({ dir, root, commit }) => {
      const base = commit()
      const repositories = [{ id: 'app', root, base }]
      const { pins } = proposeGuidance(repositories)
      expect(pins.length).toBeGreaterThanOrEqual(3)
      const bin = join(dir, 'bin'),
        log = join(dir, 'git.log'),
        real = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim()
      mkdirSync(bin)
      writeFileSync(join(bin, 'git'), `#!/bin/sh\necho "$1" >> "${log}"\nexec "${real}" "$@"\n`)
      chmodSync(join(bin, 'git'), 0o755)
      const path = process.env.PATH
      process.env.PATH = `${bin}:${path}`
      try {
        expect(readPinnedGuidance(repositories, pins)).toBeDefined()
        expect(readFileSync(log, 'utf8').trim().split('\n')).toEqual(['ls-tree', 'cat-file'])
        rmSync(log)
        proposeGuidance(repositories)
        expect(readFileSync(log, 'utf8').trim().split('\n')).toEqual([
          'ls-tree',
          'cat-file',
          'cat-file',
        ])
      } finally {
        process.env.PATH = path
      }
    }))

  it('gives each role only its slots and requires all of them', () =>
    fixture(({ dir, root, commit }) => {
      const base = commit()
      const plan = {
        repositories: [{ id: 'app', root, base, target: 'refs/heads/main' }],
        ...proposeGuidance([{ id: 'app', root, base }]),
      }
      const context = guidanceContext(new RunnerStore(join(dir, 'store')), {
        repositories: plan.repositories,
        guidance: plan.pins,
      })
      if (!context) throw new Error('Expected guidance context')
      const slots = (role: Parameters<typeof context.forRole>[0]) => {
        const digests = new Set(context.forRole(role).context.map((entry) => entry.artifact.sha256))
        return plan.pins.filter((entry) => digests.has(entry.sha256)).map((entry) => entry.slot)
      }
      expect(slots('builder')).toEqual(['build.backend', INSTRUCTIONS_SLOT])
      expect(slots('reviewer')).toEqual([INSTRUCTIONS_SLOT, 'review.rubric'])
      expect(slots('verifier')).toEqual([INSTRUCTIONS_SLOT])
      // A manifest pin arrives whole: its manifest plus every file.
      const builder = context.forRole('builder').context
      expect(builder).toHaveLength(1 + 2 + 1 + 2)
      for (const role of ['builder', 'reviewer', 'planner'] as const) {
        expect(
          guidanceContextProblem(plan.pins, role, context.forRole(role).context),
        ).toBeUndefined()
        expect(guidanceContextProblem(plan.pins, role, [])).toBe('missing-guidance')
      }
      expect(guidanceContextProblem(plan.pins, 'builder', builder.slice(0, -1))).toBe(
        'missing-guidance',
      )
      expect(
        guidanceForRole(plan.pins, 'reviewer').some((entry) => entry.slot.startsWith('build.')),
      ).toBe(false)
      expect(
        guidanceContext(new RunnerStore(join(dir, 'store')), {
          repositories: plan.repositories,
          guidance: [{ ...pin(plan.pins, 'build.backend'), sha256: 'f'.repeat(64) }],
        }),
      ).toBeUndefined()
    }))

  it.each([
    [{ slot: 'unknown.slot', ref: 'a', sha256: 'a'.repeat(64) }, 'unknown-guidance-slot'],
    [{ slot: INSTRUCTIONS_SLOT, ref: '.', sha256: 'a'.repeat(64) }, 'guidance-manifest'],
    [
      {
        slot: 'build.backend',
        ref: 'skills/x',
        sha256: 'a'.repeat(64),
        files: [{ path: 'skills/x/a.md', sha256: 'b'.repeat(64), bytes: 1 }],
      },
      'guidance-manifest',
    ],
    [
      {
        slot: 'build.backend',
        ref: 'skills/x',
        files: [
          { path: 'skills/x/b.md', sha256: 'b'.repeat(64), bytes: 1 },
          { path: 'skills/x/a.md', sha256: 'b'.repeat(64), bytes: 1 },
        ],
      },
      'guidance-manifest',
    ],
    [
      {
        slot: 'build.backend',
        ref: 'skills/x',
        files: [{ path: 'other/a.md', sha256: 'b'.repeat(64), bytes: 1 }],
      },
      'guidance-manifest',
    ],
    [
      {
        slot: 'build.backend',
        ref: 'skills/x',
        files: [{ path: 'skills/x/../../a.md', sha256: 'b'.repeat(64), bytes: 1 }],
      },
      'guidance-manifest',
    ],
  ])('refuses a malformed pin shape before any repository is read (%#)', (value, problem) => {
    const entry = value as GuidancePin
    if (entry.files && entry.sha256 === undefined)
      entry.sha256 = sha256(guidanceManifest(entry.ref, entry.files))
    expect(guidanceShapeProblem(entry)).toBe(problem)
  })
})

describe('wl delivery guidance', () => {
  it('prints the proposal, takes answers and writes nothing', () =>
    fixture(({ dir, root, commit }) => {
      write(root, '.claude/skills/frontend-ui/SKILL.md', skill('frontend-ui', 'UI.'))
      write(root, '.claude/skills/frontend-app/SKILL.md', skill('frontend-app', 'App.'))
      const base = commit()
      writeFileSync(
        join(dir, 'proposal.json'),
        JSON.stringify({ repositories: [{ id: 'app', root, base, target: 'refs/heads/main' }] }),
      )
      writeFileSync(
        join(dir, 'answers.json'),
        JSON.stringify({
          schema: 'wholeloop/delivery-guidance-answers@1',
          answers: { 'app:slot:build.frontend': '.claude/skills/frontend-app/SKILL.md' },
        }),
      )
      const env = {
        ...process.env,
        XDG_STATE_HOME: join(dir, 'state'),
        XDG_CONFIG_HOME: join(dir, 'config'),
      }
      const cli = (...args: string[]) =>
        spawnSync(
          process.execPath,
          [
            resolve('dist/wl.mjs'),
            'delivery',
            'guidance',
            '--file',
            'proposal.json',
            ...args,
            '--json',
          ],
          { cwd: dir, encoding: 'utf8', env },
        )
      const asked = cli()
      expect(asked.status).toBe(3)
      expect(JSON.parse(asked.stdout)).toMatchObject({
        schema: 'wholeloop/delivery-guidance@1',
        status: 'needs-answers',
      })
      const answered = cli('--answers', 'answers.json')
      expect(answered.status, answered.stderr).toBe(0)
      const result = JSON.parse(answered.stdout)
      expect(result.status).toBe('proposed')
      expect(pin(result.pins, 'build.frontend').ref).toBe('.claude/skills/frontend-app')
      writeFileSync(join(dir, 'bad.json'), JSON.stringify({ repositories: [{ id: 'app', root }] }))
      expect(
        spawnSync(
          process.execPath,
          [resolve('dist/wl.mjs'), 'delivery', 'guidance', '--file', 'bad.json', '--json'],
          { cwd: dir, encoding: 'utf8', env },
        ).status,
      ).toBe(3)
      expect(spawnSync('ls', [join(dir, 'state')]).status).not.toBe(0)
    }))
})
