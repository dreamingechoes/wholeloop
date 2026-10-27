import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bundledCanonical } from '../../../src/adapters/canonical.js'
import { generateAdapter } from '../../../src/adapters/generate.js'
import { writeAdapter } from '../../../src/adapters/write.js'
import {
  doctor,
  inspectArtifact,
  probeStore,
  type VersionProbe,
  versionProbe,
} from '../../../src/diagnostics/doctor.js'

const actualCore = () => readFileSync(resolve('dist/wl.mjs'), 'utf8')
function fixture(
  run: (context: {
    dir: string
    root: string
    home: string
    store: string
    env: NodeJS.ProcessEnv
  }) => void,
) {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-doctor-'))
  const root = join(dir, 'repo')
  const home = join(dir, 'home')
  mkdirSync(root)
  mkdirSync(home)
  const store = join(dir, 'external/store')
  const env = {
    ...process.env,
    HOME: home,
    PATH: process.env.PATH,
    XDG_CONFIG_HOME: join(home, '.config'),
    CODEX_HOME: join(home, '.codex'),
    COPILOT_HOME: join(home, '.copilot'),
  }
  try {
    run({ dir, root, home, store, env })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
const observed = (binary: string): VersionProbe => ({
  status: 'observed',
  version: binary === 'git' ? '2.49.0' : '1.2.3',
})
const input = (context: { root: string; home: string; store: string; env: NodeJS.ProcessEnv }) => ({
  ...context,
  userFile: join(context.home, '.config/wholeloop/config.yml'),
  probe: observed,
})
function executable(path: string, body: string) {
  writeFileSync(path, `#!/usr/bin/env node\n${body}\n`)
  chmodSync(path, 0o755)
}

describe('observed local diagnostics without activation or authentication', () => {
  it('observes selected versions and availability without claiming native conformance', () =>
    fixture((context) => {
      const report = doctor({ ...input(context), targets: ['claude', 'codex'] })
      expect(report).toMatchObject({
        schema: 'wholeloop/doctor@1',
        status: 'observed',
        authenticated: false,
        conformance: 'unverified',
      })
      expect(report.checks.find((check) => check.id === 'artifacts')?.status).toBe('unknown')
      expect(report.checks.find((check) => check.id === 'store')?.status).toBe('pass')
      expect(existsSync(context.store)).toBe(false)
      expect(
        report.providers.some((provider) => provider.id === 'local-docs' && provider.available),
      ).toBe(true)
      expect(report.providers.every((provider) => provider.authenticated === false)).toBe(true)
    }))
  it('skips absent optional clients, requires explicit targets and fails when none are observed', () =>
    fixture((context) => {
      const probe = (binary: string): VersionProbe =>
        binary === 'git' || binary === 'codex' ? observed(binary) : { status: 'unavailable' }
      const optional = doctor({ ...input(context), probe })
      expect(optional.status).toBe('observed')
      expect(optional.checks.find((check) => check.id === 'cli.claude')?.status).toBe('skip')
      expect(doctor({ ...input(context), probe, targets: ['claude'] }).status).toBe(
        'needs-attention',
      )
      expect(
        doctor({ ...input(context), probe, targets: ['claude'] }).checks.some(
          (check) => check.id === 'cli.any',
        ),
      ).toBe(false)
      expect(
        doctor({ ...input(context), probe: () => ({ status: 'unavailable' }) }).checks.find(
          (check) => check.id === 'cli.any',
        )?.status,
      ).toBe('fail')
      for (const targets of [[], ['unknown'], ['codex', 'codex']])
        expect(() => doctor({ ...input(context), targets })).toThrow('unique')
    }))
  it.each(['18.20.0', '19.9.0'])(
    'reports an old Node %s with a concrete diagnostic command',
    (node) =>
      fixture((context) => {
        const result = doctor({ ...input(context), node })
        expect(result.checks.find((check) => check.id === 'node')).toMatchObject({
          status: 'fail',
          repair: { command: ['node', '--version'] },
        })
      }),
  )
  it.each(['1.9.0', '2.29.9', '2.30.2', '2.35.9'])(
    'rejects old Git %s independently from available clients',
    (version) =>
      fixture((context) => {
        const result = doctor({
          ...input(context),
          probe: (binary) =>
            binary === 'git' ? { status: 'observed', version } : observed(binary),
        })
        expect(result.checks.find((check) => check.id === 'git')?.status).toBe('fail')
        expect(
          result.checks
            .filter((check) => check.id.startsWith('cli.'))
            .every((check) => check.status === 'pass'),
        ).toBe(true)
      }),
  )
  it.each(['2.36.0', '2.39.5', '3.0.0'])(
    'accepts the declared Git feature boundary %s without certifying a workflow',
    (version) =>
      fixture((context) => {
        const result = doctor({
          ...input(context),
          probe: (binary) =>
            binary === 'git' ? { status: 'observed', version } : observed(binary),
        })
        expect(result.checks.find((check) => check.id === 'git')).toMatchObject({
          status: 'pass',
          version,
        })
        expect(result.checks.find((check) => check.id === 'git')?.summary).toContain(
          'NUL-delimited',
        )
      }),
  )
  it('actually writes/renames and cleans only its own probe while preserving existing state', () =>
    fixture(({ store }) => {
      mkdirSync(join(store, 'journal'), { recursive: true })
      writeFileSync(join(store, 'journal/keep'), 'retained')
      probeStore(store)
      expect(readdirSync(store)).toEqual(['journal'])
      expect(readFileSync(join(store, 'journal/keep'), 'utf8')).toBe('retained')
    }))
  it('refuses Git/symlink stores before mutation and reports inaccessible destinations', () =>
    fixture((context) => {
      mkdirSync(join(context.root, '.git'))
      symlinkSync(context.root, join(context.dir, 'linked'))
      for (const store of [join(context.root, 'runtime'), join(context.dir, 'linked/runtime')]) {
        const result = doctor({ ...input(context), store })
        expect(result.checks.find((check) => check.id === 'store')?.status).toBe('fail')
        expect(existsSync(store)).toBe(false)
      }
      const file = join(context.dir, 'not-directory')
      writeFileSync(file, 'retain')
      expect(
        doctor({ ...input(context), store: file }).checks.find((check) => check.id === 'store')
          ?.status,
      ).toBe('fail')
    }))
  it.each(['claude', 'codex', 'opencode', 'copilot'])(
    'checks every expected %s file, executable mode and current source/core identity',
    (target) =>
      fixture((context) => {
        const artifact = join(context.dir, target)
        const expected = generateAdapter(target, bundledCanonical(), actualCore(), '0.0.0')
        writeAdapter(artifact, expected)
        expect(inspectArtifact(artifact, expected).target).toBe(target)
        const options = { ...input(context), artifact: { path: artifact, target, expected } }
        expect(doctor(options).checks.find((check) => check.id === 'artifacts')?.status).toBe(
          'pass',
        )
        chmodSync(join(artifact, 'bin/wl.mjs'), 0o644)
        const failed = doctor(options).checks.find((check) => check.id === 'artifacts')
        expect(failed).toMatchObject({
          status: 'fail',
          repair: {
            command: ['wl', 'build', '--target', target, '--out', `${artifact}-fresh`, '--json'],
          },
        })
        chmodSync(join(artifact, 'bin/wl.mjs'), 0o755)
        writeFileSync(join(artifact, 'bin/wl.mjs'), 'changed core')
        expect(() => inspectArtifact(artifact, expected)).toThrow('stale')
      }),
  )
  it('refuses stale manifests, missing files and contained/root symlinks', () =>
    fixture((context) => {
      const artifact = join(context.dir, 'artifact')
      const expected = generateAdapter('codex', bundledCanonical(), actualCore(), '0.0.0')
      writeAdapter(artifact, expected)
      symlinkSync(artifact, join(context.dir, 'linked-artifact'))
      expect(() => inspectArtifact(join(context.dir, 'linked-artifact'), expected)).toThrow(
        'symlink',
      )
      const manifest = join(artifact, 'wholeloop-artifacts.json')
      const original = readFileSync(manifest, 'utf8')
      writeFileSync(manifest, original.replace('"source":', '"previous-source":'))
      expect(() => inspectArtifact(artifact, expected)).toThrow('stale')
      writeFileSync(manifest, original)
      rmSync(join(artifact, 'bin/wl.mjs'))
      symlinkSync(resolve('dist/wl.mjs'), join(artifact, 'bin/wl.mjs'))
      expect(() => inspectArtifact(artifact, expected)).toThrow('stale')
    }))
  it('reports malformed configuration/MCP without echoing values and never probes authentication', () =>
    fixture((context) => {
      writeFileSync(join(context.root, '.mcp.json'), '{"secret-token":"private-input"')
      const report = doctor(input(context))
      expect(report.checks.find((check) => check.id === 'providers')?.status).toBe('fail')
      expect(JSON.stringify(report)).not.toMatch(/secret-token|private-input/)
      rmSync(join(context.root, '.mcp.json'))
      mkdirSync(join(context.root, '.wholeloop'))
      writeFileSync(
        join(context.root, '.wholeloop/config.yml'),
        'version: 999\nsecret: private-input\n',
      )
      const invalid = doctor(input(context))
      expect(invalid.checks.find((check) => check.id === 'providers')?.status).toBe('fail')
      expect(JSON.stringify(invalid)).not.toContain('private-input')
      expect(
        invalid.checks
          .filter((check) => check.status === 'fail')
          .every((check) => check.repair?.command.length),
      ).toBe(true)
    }))
  it(
    'bounds real version subprocesses and retains only a version token',
    () =>
      fixture(({ dir, env }) => {
        const binary = join(dir, 'version-fixture')
        expect(versionProbe(join(dir, 'missing-executable'), env)).toEqual({
          status: 'unavailable',
          reason: 'missing',
        })
        executable(
          binary,
          "process.stdout.write('fixture v1.2.3\\n');process.stderr.write('private-value')",
        )
        expect(versionProbe(binary, env)).toEqual({ status: 'observed', version: '1.2.3' })
        executable(binary, "process.stdout.write('private-value');process.exit(1)")
        expect(versionProbe(binary, env)).toEqual({ status: 'unavailable', reason: 'exit' })
        executable(binary, "process.stdout.write('not a version private-value')")
        expect(versionProbe(binary, env)).toEqual({ status: 'invalid', reason: 'invalid-version' })
        executable(binary, "process.stdout.write('x'.repeat(70000))")
        expect(versionProbe(binary, env)).toEqual({ status: 'unavailable', reason: 'output-limit' })
        executable(binary, "process.on('SIGTERM',()=>{});setInterval(()=>{},100)")
        expect(versionProbe(binary, env)).toEqual({ status: 'unavailable', reason: 'timeout' })
      }),
    10000,
  )
  it(
    'executes compiled doctor with synthetic PATH clients and fails changed generated artifacts',
    () =>
      fixture((context) => {
        const bin = join(context.dir, 'bin')
        mkdirSync(bin)
        for (const target of ['claude', 'codex', 'opencode', 'copilot'])
          executable(join(bin, target), "console.log('fixture 1.2.3')")
        const env = { ...context.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ''}` }
        const artifact = join(context.dir, 'compiled-output')
        const built = spawnSync(
          process.execPath,
          [resolve('dist/wl.mjs'), 'build', '--target', 'codex', '--out', artifact, '--json'],
          { cwd: context.root, encoding: 'utf8', env },
        )
        expect(built.status, built.stderr).toBe(0)
        const command = () =>
          spawnSync(
            process.execPath,
            [
              resolve('dist/wl.mjs'),
              'doctor',
              '--target',
              'codex',
              '--artifact',
              artifact,
              '--store',
              context.store,
              '--json',
            ],
            { cwd: context.root, encoding: 'utf8', env, timeout: 10000 },
          )
        const good = command()
        expect(good.status, good.stderr).toBe(0)
        expect(JSON.parse(good.stdout).conformance).toBe('unverified')
        expect(existsSync(context.store)).toBe(false)
        writeFileSync(join(artifact, 'bin/wl.mjs'), 'modified\n')
        const bad = command()
        expect(bad.status).toBe(3)
        expect(
          JSON.parse(bad.stdout).checks.find((check: { id: string }) => check.id === 'artifacts')
            .status,
        ).toBe('fail')
      }),
    10000,
  )
})
