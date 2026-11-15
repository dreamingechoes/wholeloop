import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { generateDistribution } from '../../../src/adapters/distribution.js'
import { artifactDigest, generateAdapter } from '../../../src/adapters/generate.js'
import { writeOwnedArtifacts } from '../../../src/adapters/owned-output.js'
import { writeAdapter } from '../../../src/adapters/write.js'

const core = '#!/usr/bin/env node\nconsole.log("fixture core")\n'
const sources = new Map([
  [
    'harness/skills/next/SKILL.md',
    '---\nname: next\ndescription: Continue fixture work.\n---\n# Next\n\nCall wl next --json.\n',
  ],
  [
    'harness/agents/reviewer.md',
    '---\nname: reviewer\ndescription: Observe the assigned fixture.\nmetadata:\n  wholeloop.capabilities: read\n---\n# Review\n\nReturn observed evidence.\n',
  ],
  ['harness/protocols/core-invariants.md', '# Core invariants\n\nRetain evidence.\n'],
])
function fixture(run: (root: string) => void) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-distribution-')))
  try {
    run(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}
describe('local distribution delivery previews', () => {
  it('binds all seven independent native trees and the marketplace to one core and version', () => {
    const generated = generateDistribution(sources, core, '0.0.0')
    expect(generated.manifest).toMatchObject({
      schema: 'wholeloop/distribution-artifacts@1',
      version: '0.0.0',
      core: artifactDigest(core),
      publication: 'not-performed',
      conformance: 'unverified',
    })
    expect(generated.manifest.targets.map((target) => target.target)).toEqual([
      'claude',
      'codex',
      'opencode',
      'copilot',
      'gemini',
      'antigravity',
      'cursor',
    ])
    for (const target of generated.manifest.targets) {
      const nested = JSON.parse(generated.files.get(target.manifest)?.content ?? '')
      expect(nested).toMatchObject({
        schema: 'wholeloop/adapter-artifacts@1',
        target: target.target,
        version: '0.0.0',
        core: generated.manifest.core,
        source: generated.manifest.source,
      })
      expect(generated.files.has(target.nativeManifest)).toBe(true)
      expect(generated.files.get(`${target.path}/bin/wl.mjs`)).toEqual({
        content: core,
        mode: 0o755,
      })
    }
    const marketplace = JSON.parse(
      generated.files.get('.claude-plugin/marketplace.json')?.content ?? '',
    )
    expect(marketplace.description).toEqual(expect.any(String))
    expect(marketplace.description.trim()).not.toBe('')
    expect(marketplace.plugins).toMatchObject([
      { name: 'wholeloop', source: './claude', version: '0.0.0' },
    ])
    for (const file of generated.manifest.files)
      expect(artifactDigest(generated.files.get(file.path)?.content ?? '')).toBe(file.sha256)
    expect(generateDistribution(sources, core, '0.0.0')).toEqual(generated)
  })
  it('retains idempotency and owned upgrades with an inspectable previous preview', () =>
    fixture((root) => {
      const output = join(root, 'preview')
      const first = generateDistribution(sources, core, '0.0.0')
      expect(writeOwnedArtifacts(output, first).status).toBe('written')
      expect(writeOwnedArtifacts(output, first).status).toBe('already-correct')
      const next = generateDistribution(sources, `${core}// next core\n`, '0.0.1')
      const upgraded = writeOwnedArtifacts(output, next)
      expect(upgraded.backup).toBeTruthy()
      expect(readFileSync(join(upgraded.backup ?? '', 'claude/bin/wl.mjs'), 'utf8')).toBe(core)
      expect(
        JSON.parse(readFileSync(join(output, 'wholeloop-artifacts.json'), 'utf8')).version,
      ).toBe('0.0.1')
    }))
  it.each(['file', 'directory', 'symlink'])(
    'preserves an unknown %s before idempotency or replacement',
    (kind) =>
      fixture((root) => {
        const output = join(root, 'preview')
        const first = generateDistribution(sources, core, '0.0.0')
        writeOwnedArtifacts(output, first)
        const unknown = join(output, 'owner-entry')
        if (kind === 'file') writeFileSync(unknown, 'Owner content')
        else if (kind === 'directory') mkdirSync(unknown)
        else symlinkSync(join(root, 'missing'), unknown)
        const before = readFileSync(join(output, 'wholeloop-artifacts.json'), 'utf8')
        for (const generated of [
          first,
          generateDistribution(sources, `${core}// changed\n`, '0.0.1'),
        ])
          for (const dryRun of [true, false])
            expect(() => writeOwnedArtifacts(output, generated, dryRun)).toThrow(/unowned|unsafe/)
        expect(readFileSync(join(output, 'wholeloop-artifacts.json'), 'utf8')).toBe(before)
      }),
  )
  it('applies complete ownership checks to existing single-adapter builds too', () =>
    fixture((root) => {
      const generated = generateAdapter('claude', sources, core, '0.0.0')
      const output = join(root, 'adapter')
      writeAdapter(output, generated)
      writeFileSync(join(output, 'owner-note.md'), 'Preserve this note')
      expect(() => writeAdapter(output, generated)).toThrow(/unowned/)
      expect(readFileSync(join(output, 'owner-note.md'), 'utf8')).toBe('Preserve this note')
    }))
  it.each(['/absolute', 'nested/../file', '..', 'nested\\file'])(
    'rejects unsafe prior ownership path %s',
    (path) =>
      fixture((root) => {
        const generated = generateDistribution(sources, core, '0.0.0')
        const output = join(root, 'preview')
        writeOwnedArtifacts(output, generated)
        const manifest = {
          ...generated.manifest,
          files: [{ path, mode: 0o644, sha256: 'a'.repeat(64) }],
        }
        writeFileSync(join(output, 'wholeloop-artifacts.json'), JSON.stringify(manifest))
        expect(() => writeOwnedArtifacts(output, generated)).toThrow(/Invalid previous/)
      }),
  )
  it(
    'runs the compiled complete preview, exact dry run and moved bundled launchers without changing privacy',
    () =>
      fixture((root) => {
        // Compare with the value before the preview, not a fixed literal: the
        // package became publishable for 1.0.0, and the preview must not touch it.
        const privacy = JSON.parse(readFileSync('package.json', 'utf8')).private
        const output = join(root, 'preview with spaces')
        const cli = (args: string[]) =>
          spawnSync(
            process.execPath,
            [resolve('dist/wl.mjs'), 'release', 'artifacts', '--out', output, ...args, '--json'],
            { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, timeout: 30000 },
          )
        const dry = cli(['--dry-run'])
        expect(dry.status, dry.stdout + dry.stderr).toBe(0)
        expect(JSON.parse(dry.stdout).status).toBe('planned')
        expect(existsSync(output)).toBe(false)
        const built = cli([])
        expect(built.status, built.stdout + built.stderr).toBe(0)
        const payload = JSON.parse(built.stdout)
        expect(payload.manifest.targets).toHaveLength(7)
        expect(
          payload.manifest.targets.every(
            // Codex drafts launches headlessly, so it ships no native launcher agent.
            (target: { target: string; skills: number; agents: number }) =>
              target.skills === 17 && target.agents === (target.target === 'codex' ? 8 : 9),
          ),
        ).toBe(true)
        expect(JSON.parse(cli([]).stdout).status).toBe('already-correct')
        const moved = join(root, "moved ' # % preview")
        renameSync(output, moved)
        for (const target of payload.manifest.targets) {
          const copied = spawnSync(
            process.execPath,
            [join(moved, target.path, 'bin/wl.mjs'), '--version'],
            { encoding: 'utf8' },
          )
          expect(copied.status, copied.stderr).toBe(0)
          expect(copied.stdout.trim()).toBe(payload.manifest.version)
        }
        const launcher = spawnSync(
          process.execPath,
          [join(moved, 'codex/skills/wl-next/scripts/wl.mjs'), 'adapter', 'root', '--json'],
          { encoding: 'utf8' },
        )
        expect(launcher.status, launcher.stdout + launcher.stderr).toBe(0)
        expect(JSON.parse(launcher.stdout).root).toBe(join(moved, 'codex'))
        expect(JSON.parse(readFileSync('package.json', 'utf8')).private).toBe(privacy)
      }),
    60000,
  )
})
