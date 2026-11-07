import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * wholeloop never talks to a third-party service itself (ADR-0085): services
 * are reached only through the client's MCP connection or a command-line
 * client the user installed. This scan fails on any network primitive in
 * src/ outside the reviewed local uses below, so a new built-in service client
 * cannot land unnoticed. It reads source text, comments and inline programs
 * included, and is deliberately conservative: a false positive costs one
 * reviewed allowlist entry, a false negative an unreviewed service client.
 */
// A bare 'http' literal is also an MCP install transport name, so modules match only as imports.
const imported = (name: string) =>
  new RegExp(
    `(?:from\\s*|require\\(\\s*|import\\(\\s*)['"](?:node:)?(?:${name})['"]|node:(?:${name})\\b`,
  )
const PRIMITIVES: [name: string, pattern: RegExp][] = [
  ['fetch', /\bfetch\s*\(/],
  ['node:http', imported('https?')],
  ['node:http2', imported('http2')],
  ['node:net', imported('net')],
  ['node:tls', imported('tls')],
  ['node:dgram', imported('dgram')],
  ['web-socket', /\b(?:WebSocket|EventSource|XMLHttpRequest)\b/],
  ['undici', /['"]undici['"]/],
  [
    'network-cli',
    /\b(?:spawn|spawnSync|execFile|execFileSync|exec|execSync)\s*\(\s*['"](?:curl|wget|nc|ncat|telnet|psql)['"]/,
  ],
]

type Local = 'docker-application' | 'docker-engine-socket' | 'sandbox-probe'
/** Every entry names the exact primitives it may use, so a new kind of connection is reviewed too. */
const ALLOWED: Record<string, { local: Local; primitives: string[]; reason: string }> = {
  'src/acceptance/http.ts': {
    local: 'docker-application',
    primitives: ['fetch'],
    reason: 'behavioural probe of the user application at its owned Docker origin',
  },
  'src/acceptance/browser-reference.ts': {
    local: 'docker-application',
    primitives: ['node:net'],
    reason: 'loopback keep-alive program inside the pinned browser container',
  },
  'src/environment/docker-proxy.ts': {
    local: 'docker-application',
    primitives: ['node:net'],
    reason: 'loopback proxy to the published port of the user application container',
  },
  'src/environment/docker-readiness.ts': {
    local: 'docker-application',
    primitives: ['node:net'],
    reason: 'loopback readiness check of the application inside its container',
  },
  'src/environment/docker-engine.ts': {
    local: 'docker-engine-socket',
    primitives: ['node:http'],
    reason: 'read-only inspections over the local Docker Engine socket (ADR-0244)',
  },
  'src/delivery/native-boundary-program.ts': {
    local: 'sandbox-probe',
    primitives: ['node:net'],
    reason: 'loopback connection attempt proving the native sandbox denies network',
  },
  'src/delivery/native-codex-boundary.ts': {
    local: 'sandbox-probe',
    primitives: ['node:net'],
    reason: 'loopback listener that the sandbox network probe targets',
  },
}

function networkPrimitives(files: Map<string, string>) {
  const found = new Map<string, string[]>()
  for (const [file, text] of files) {
    const names = PRIMITIVES.filter(([, pattern]) => pattern.test(text)).map(([name]) => name)
    if (names.length) found.set(file, names)
  }
  return found
}

function networkViolations(files: Map<string, string>) {
  const violations: string[] = []
  const found = networkPrimitives(files)
  for (const [file, names] of found) {
    const allowed = ALLOWED[file]
    for (const name of names)
      if (!allowed?.primitives.includes(name)) violations.push(`${file}: ${name}`)
  }
  // A stale entry would silently pre-approve a future connection in that file.
  for (const [file, entry] of Object.entries(ALLOWED))
    if (files.has(file))
      for (const name of entry.primitives)
        if (!found.get(file)?.includes(name)) violations.push(`${file}: unused ${name} exception`)
  return violations
}

function sources(root: string, directory = join(root, 'src')): Map<string, string> {
  const files = new Map<string, string>()
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) for (const [file, text] of sources(root, path)) files.set(file, text)
    else if (/\.(?:ts|mts|js|mjs|cjs)$/.test(entry.name))
      files.set(relative(root, path).split('\\').join('/'), readFileSync(path, 'utf8'))
  }
  return files
}

describe('no built-in service clients', () => {
  const root = join(import.meta.dirname, '../../..')
  const files = sources(root)

  it('opens no network connection in src/ beyond the reviewed local uses', () => {
    expect(files.size).toBeGreaterThan(100)
    expect(networkViolations(files)).toEqual([])
    for (const file of Object.keys(ALLOWED)) expect(files.has(file), file).toBe(true)
  })

  it('keeps provider code free of any network primitive', () => {
    const providers = [...networkPrimitives(files).keys()].filter((file) =>
      file.startsWith('src/providers/'),
    )
    expect(providers).toEqual([])
  })

  it.each([
    ['src/providers/planted.ts', "const r = await fetch('https://api.example.invalid/flags')"],
    ['src/launch/planted.ts', "import { request } from 'node:https'"],
    ['src/ramp/planted.ts', "import https from 'https'"],
    ['src/impact/planted.ts', "const socket = require('node:tls').connect(443, 'example.invalid')"],
    ['src/sync/planted.ts', "spawnSync('curl', ['https://example.invalid'])"],
    ['src/research/planted.ts', "const ws = new WebSocket('wss://example.invalid')"],
    ['src/acceptance/http.ts', "import { request } from 'node:https'\nfetch(url)"],
  ])('fails on a planted connection in %s', (file, text) => {
    const planted = new Map(files)
    planted.set(file, text)
    expect(networkViolations(planted).some((entry) => entry.startsWith(`${file}:`))).toBe(true)
  })

  it('fails on an exception whose connection is gone', () => {
    const changed = new Map(files)
    changed.set('src/environment/docker-engine.ts', 'export const nothing = 0\n')
    expect(networkViolations(changed)).toEqual([
      'src/environment/docker-engine.ts: unused node:http exception',
    ])
  })
})
