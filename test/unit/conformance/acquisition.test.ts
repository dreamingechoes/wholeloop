import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  archiveInventory,
  assertExternalDestination,
  installDownloads,
  resolveDownloads,
} from '../../../scripts/conformance-provision.mjs'
import { conformanceAcquisition, NATIVE_PACKAGES } from '../../../src/conformance/acquisition.js'
import pins from '../../conformance/pins.json' with { type: 'json' }

const sri = `sha512-${Buffer.alloc(64).toString('base64')}`
const entry = (cli = 'codex', channel = 'pinned') => ({
  cli,
  channel,
  version: '1.2.3',
  url: `https://registry.npmjs.org/${NATIVE_PACKAGES[cli]}/-/${NATIVE_PACKAGES[cli]?.split('/').at(-1)}-1.2.3.tgz`,
  integrity: sri,
})
const metadata = () => ({
  schema: 'wholeloop/conformance-downloads@1',
  platform: process.platform,
  arch: process.arch,
  entries: [entry()] as [ReturnType<typeof entry>, ...ReturnType<typeof entry>[]],
})
const command = (
  executable: string,
  args: string[],
  options: { cwd: string; env: Record<string, string> },
) => {
  const result = spawnSync(executable, args, { ...options, encoding: 'utf8', timeout: 10000 })
  if (result.status !== 0) throw new Error('Synthetic command failed')
  return result.stdout.trim()
}
function temporary() {
  return realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-acquisition-test-')))
}
function archive(root: string, cursor = false) {
  const folder = join(root, 'source'),
    tree = cursor ? join(folder, 'dist-package') : folder
  mkdirSync(tree, { recursive: true })
  writeFileSync(join(tree, cursor ? 'cursor-agent' : 'antigravity'), '#!/bin/sh\nexit 0\n', {
    mode: 0o755,
  })
  const target = join(root, 'fixture.tgz')
  command(
    'tar',
    ['--format=ustar', '-czf', target, '-C', folder, cursor ? 'dist-package' : 'antigravity'],
    { cwd: root, env: { PATH: '/usr/bin:/bin' } },
  )
  return readFileSync(target)
}

describe('exact native acquisition plans', () => {
  it.each(Object.keys(NATIVE_PACKAGES))('binds %s to its exact official package path', (cli) => {
    const input = { ...metadata(), entries: [entry(cli)] }
    const plan = conformanceAcquisition(input)
    expect(plan.effects).toBe('not-performed')
    expect(plan.downloads[0]).toMatchObject({
      package: NATIVE_PACKAGES[cli],
      directory: `${cli}/pinned`,
      kind: 'npm',
    })
    expect(plan.collection.entries).toEqual([{ cli, channel: 'pinned', pin: '1.2.3' }])
  })
  it.each(['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64'] as const)(
    'binds %s archive metadata without claiming native execution',
    (target) => {
      const [platform, arch] = target.split('-')
      const pin = pins.antigravity[target]
      const plan = conformanceAcquisition({
        ...metadata(),
        platform,
        arch,
        entries: [
          {
            cli: 'antigravity',
            channel: 'pinned',
            version: pin.version,
            url: pin.url,
            integrity: `sha512-${Buffer.from(pin.sha512, 'hex').toString('base64')}`,
          },
          {
            cli: 'cursor',
            channel: 'latest',
            version: pins.cursor,
            url: `https://downloads.cursor.com/lab/${pins.cursor}/${platform}/${arch}/agent-cli-package.tar.gz`,
            integrity: '',
          },
        ],
      })
      expect(plan.downloads.map((item) => [item.command, item.stripComponents])).toEqual([
        ['agy', 0],
        ['agent', 1],
      ])
      expect(plan.limitations.join(' ')).toContain('no expected archive digest')
    },
  )
  it.each([
    'foreign',
    'credentials',
    'fragment',
    'moving',
    'checksum',
    'duplicate',
    'unknown',
    'too-many',
    'version-budget',
  ])('refuses %s metadata before installation', (kind) => {
    const input = metadata()
    if (kind === 'foreign') input.entries[0].url = 'https://example.com/a.tgz'
    if (kind === 'credentials')
      input.entries[0].url = input.entries[0].url.replace('https://', 'https://user@')
    if (kind === 'fragment') input.entries[0].url += '#different'
    if (kind === 'moving') input.entries[0].version = 'latest'
    if (kind === 'checksum') input.entries[0].integrity = ''
    if (kind === 'duplicate') input.entries.push({ ...input.entries[0] })
    if (kind === 'unknown') input.entries[0].cli = 'other'
    if (kind === 'too-many') input.entries.push(...Array.from({ length: 14 }, () => entry()))
    if (kind === 'version-budget') input.entries[0].version = `1.2.3-${'a'.repeat(129)}`
    expect(() => conformanceAcquisition(input)).toThrow()
  })
  it('resolves both channels to exact observed metadata and never executes installer text', async () => {
    const calls: string[] = []
    const fake = async (url: string) => {
      calls.push(url)
      if (url === 'https://cursor.com/install')
        return Buffer.from(
          'https://downloads.cursor.com/lab/2026.10.19-6bbf2c4/linux/x64/agent-cli-package.tar.gz\nexit 99',
        )
      if (url.includes('/manifests/'))
        return Buffer.from(JSON.stringify(pins.antigravity['linux-x64']))
      const [, name, requested] = /^https:\/\/registry.npmjs.org\/(.+)\/([^/]+)$/.exec(url) ?? []
      const version = requested === 'latest' ? '9.9.9' : requested
      return Buffer.from(
        JSON.stringify({
          name,
          version,
          dist: {
            tarball: `https://registry.npmjs.org/${name}/-/${name?.split('/').at(-1)}-${version}.tgz`,
            integrity: sri,
          },
        }),
      )
    }
    const input = await resolveDownloads('linux', 'x64', pins, fake)
    const plan = conformanceAcquisition(input)
    expect(plan.downloads).toHaveLength(14)
    expect(calls).toHaveLength(12)
    expect(plan.downloads.find((d) => d.cli === 'cursor' && d.channel === 'latest')?.version).toBe(
      '2026.10.19-6bbf2c4',
    )
    await expect(resolveDownloads('win32', 'x64', pins, fake)).rejects.toThrow()
    await expect(
      resolveDownloads('linux', 'x64', pins, async () => Buffer.from('{}')),
    ).rejects.toThrow()
  })
  it('rejects ambiguous moving Cursor releases and mismatched pinned registry versions', async () => {
    let ambiguous = false
    const fake = async (url: string) => {
      if (url === 'https://cursor.com/install')
        return Buffer.from('/lab/2026.10.19-6bbf2c4/ /lab/2026.10.20-7bbf2c4/')
      const [, name, requested] = /^https:\/\/registry.npmjs.org\/(.+)\/([^/]+)$/.exec(url) ?? []
      return Buffer.from(
        JSON.stringify({
          name,
          version: ambiguous ? (requested === 'latest' ? '9.9.9' : requested) : '0.0.0',
          dist: {},
        }),
      )
    }
    await expect(resolveDownloads('linux', 'x64', pins, fake)).rejects.toThrow()
    ambiguous = true
    await expect(resolveDownloads('linux', 'x64', pins, fake)).rejects.toThrow()
  })
})

describe('isolated native provisioning', () => {
  it('installs verified npm payloads with private empty configuration and no inherited credentials', async () => {
    const root = temporary(),
      destination = join(root, 'native'),
      payload = Buffer.from('synthetic npm archive')
    const input = metadata()
    input.entries[0].integrity = `sha512-${createHash('sha512').update(payload).digest('base64')}`
    const plan = conformanceAcquisition(input)
    try {
      let installs = 0
      const result = await installDownloads(plan, destination, {
        bytes: async () => payload,
        command: (exe, args, options) => {
          installs++
          expect(exe).toBe(process.execPath)
          expect(args).toContain('--ignore-scripts=false')
          expect(args).toContain('--globalconfig')
          expect(args).toContain('https://registry.npmjs.org/')
          expect(options.env).not.toHaveProperty('GH_TOKEN')
          expect(options.env).not.toHaveProperty('NODE_OPTIONS')
          expect(options.env).not.toHaveProperty('ANTHROPIC_API_KEY')
          expect(options.env.HOME).toBe(join(options.cwd, 'home'))
          expect(readFileSync(String(args[args.indexOf('--userconfig') + 1]), 'utf8')).toBe('')
          const pkg = join(options.cwd, 'lib/node_modules/@openai/codex')
          mkdirSync(pkg, { recursive: true })
          mkdirSync(join(options.cwd, 'bin'))
          writeFileSync(
            join(pkg, 'package.json'),
            JSON.stringify({ name: '@openai/codex', version: '1.2.3' }),
          )
          writeFileSync(join(pkg, 'codex'), '#!/bin/sh\nexit 0\n', { mode: 0o755 })
          symlinkSync(join(pkg, 'codex'), join(options.cwd, 'bin/codex'))
          return ''
        },
      })
      expect(installs).toBe(1)
      expect(result.status).toBe('installed')
      expect(result.records[0]?.expectedIntegrity).toBe(true)
      expect(JSON.parse(readFileSync(join(destination, 'collection.json'), 'utf8'))).toEqual(
        plan.collection,
      )
      await expect(installDownloads(plan, destination)).rejects.toThrow()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
  it('extracts regular Cursor/Antigravity archives without executing either client', async () => {
    const root = temporary()
    try {
      for (const cursor of [false, true]) {
        const fixture = join(root, cursor ? 'cursor-fixture' : 'agy-fixture')
        mkdirSync(fixture)
        const payload = archive(fixture, cursor),
          pin =
            pins.antigravity[`${process.platform}-${process.arch}` as keyof typeof pins.antigravity]
        const input = {
          ...metadata(),
          entries: [
            cursor
              ? {
                  cli: 'cursor',
                  channel: 'pinned',
                  version: pins.cursor,
                  url: `https://downloads.cursor.com/lab/${pins.cursor}/${process.platform}/${process.arch}/agent-cli-package.tar.gz`,
                  integrity: '',
                }
              : {
                  cli: 'antigravity',
                  channel: 'pinned',
                  version: pin.version,
                  url: pin.url,
                  integrity: `sha512-${createHash('sha512').update(payload).digest('base64')}`,
                },
          ],
        }
        const result = await installDownloads(
          conformanceAcquisition(input),
          join(root, cursor ? 'cursor' : 'agy'),
          { bytes: async () => payload, command },
        )
        expect(result.status).toBe('installed')
        expect(result.records[0]?.expectedIntegrity).toBe(!cursor)
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
  it('refuses repositories, aliases into repositories and relative destinations', () => {
    const root = temporary()
    try {
      expect(() => assertExternalDestination('relative')).toThrow()
      expect(() => assertExternalDestination(root)).toThrow()
      mkdirSync(join(root, 'repo'))
      mkdirSync(join(root, 'repo/.git'))
      symlinkSync(join(root, 'repo'), join(root, 'alias'))
      expect(() => assertExternalDestination(join(root, 'repo/native'))).toThrow()
      expect(() => assertExternalDestination(join(root, 'alias/native'))).toThrow()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
  it.each(['checksum', 'wrong-package', 'outside-binary', 'second-download'])(
    'retains failed/partial receipts for %s without fallback',
    async (kind) => {
      const root = temporary(),
        destination = join(root, 'native'),
        payload = Buffer.from('fixture')
      const input = metadata()
      input.entries[0].integrity = `sha512-${createHash('sha512').update(payload).digest('base64')}`
      if (kind === 'checksum') input.entries[0].integrity = sri
      if (kind === 'second-download') input.entries.push({ ...input.entries[0], channel: 'latest' })
      let downloads = 0,
        installs = 0
      try {
        await expect(
          installDownloads(conformanceAcquisition(input), destination, {
            bytes: async () => {
              if (++downloads === 2) throw new Error('Interrupted fixture download')
              return payload
            },
            command: (_exe, _args, options) => {
              installs++
              const pkg = join(options.cwd, 'lib/node_modules/@openai/codex')
              mkdirSync(pkg, { recursive: true })
              mkdirSync(join(options.cwd, 'bin'))
              writeFileSync(
                join(pkg, 'package.json'),
                JSON.stringify({
                  name: kind === 'wrong-package' ? 'other' : '@openai/codex',
                  version: '1.2.3',
                }),
              )
              const binary = kind === 'outside-binary' ? join(root, 'outside') : join(pkg, 'codex')
              writeFileSync(binary, 'fixture', { mode: 0o755 })
              symlinkSync(binary, join(options.cwd, 'bin/codex'))
              return ''
            },
          }),
        ).rejects.toThrow()
        const receipt = JSON.parse(readFileSync(join(destination, 'provisioned.json'), 'utf8'))
        expect(receipt.status).toBe('failed')
        expect(receipt.records).toHaveLength(kind === 'second-download' ? 1 : 0)
        expect(existsSync(join(destination, 'collection.json'))).toBe(false)
        if (kind === 'checksum') expect(installs).toBe(0)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    },
  )
  it.each(['link', 'traversal', 'sparse', 'pax', 'duplicate', 'wrong-prefix'])(
    'refuses %s archives before extraction',
    (kind) => {
      const root = temporary()
      try {
        const payload = archive(root),
          file = join(root, 'unsafe.tgz'),
          options = { cwd: root, env: { PATH: '/usr/bin:/bin' } }
        if (kind === 'link') {
          rmSync(join(root, 'source/antigravity'))
          symlinkSync('/tmp', join(root, 'source/antigravity'))
          command(
            'tar',
            ['--format=ustar', '-czf', file, '-C', join(root, 'source'), 'antigravity'],
            options,
          )
        } else if (kind === 'sparse' || kind === 'pax') {
          const unpacked = gunzipSync(payload)
          unpacked[156] = kind === 'sparse' ? 83 : 120
          writeFileSync(file, gzipSync(unpacked))
        } else writeFileSync(file, payload)
        const fake = (
          _exe: string,
          args: string[],
          opts: { cwd: string; env: Record<string, string> },
        ) => {
          if (kind === 'traversal') return args[0] === '-tzf' ? '../outside' : '-rw-r--r-- fixture'
          if (kind === 'duplicate')
            return args[0] === '-tzf'
              ? 'antigravity\nantigravity'
              : '-rw-r--r-- fixture\n-rw-r--r-- fixture'
          return command(_exe, args, opts)
        }
        expect(() =>
          archiveInventory(file, kind === 'wrong-prefix' ? 1 : 0, fake, options),
        ).toThrow()
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    },
  )
  it('runs the compiled read-only plan with bounded regular input and no HOME writes', () => {
    const root = temporary(),
      path = join(root, 'downloads.json'),
      home = join(root, 'home')
    mkdirSync(home)
    writeFileSync(path, JSON.stringify(metadata()))
    const run = (file: string) =>
      spawnSync(
        process.execPath,
        [resolve('dist/wl.mjs'), 'conformance', 'acquisition', file, '--json'],
        { cwd: root, env: { HOME: home }, encoding: 'utf8' },
      )
    try {
      const result = run(path)
      expect(result.status, result.stdout + result.stderr).toBe(0)
      expect(JSON.parse(result.stdout).effects).toBe('not-performed')
      symlinkSync(path, join(root, 'linked'))
      expect(run(join(root, 'linked')).status).not.toBe(0)
      const oversized = join(root, 'large')
      writeFileSync(oversized, ' '.repeat(65537))
      expect(run(oversized).status).not.toBe(0)
      expect(readdirSync(home)).toEqual([])
      copyFileSync(path, join(root, 'before'))
      expect(readFileSync(path)).toEqual(readFileSync(join(root, 'before')))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
