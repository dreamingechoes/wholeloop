// Dependency licence and advisory policy (P7-05).
//
// wholeloop publishes no runtime dependencies: everything it needs is bundled
// into dist/ from devDependencies. So "runtime" means "bundled", and that set
// comes from esbuild's own metafile, not from the dependencies field. Bundled
// code is redistributed and must carry a permissive licence; development-only
// tools may also use reviewed weak-copyleft licences they never pass on.
//   node scripts/check-dependencies.mjs            licences, offline (npm run check)
//   node scripts/check-dependencies.mjs --audit    plus high/critical advisories in bundled packages (CI)
//   node scripts/check-dependencies.mjs --sbom <file>  also write a CycloneDX SBOM of the bundled packages
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const BUNDLED_LICENSES = new Set([
  'MIT',
  'MIT-0',
  'ISC',
  '0BSD',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  'BlueOak-1.0.0',
  'CC0-1.0',
  'Unlicense',
])
// Development tools only: never copied into the published package.
export const DEVELOPMENT_LICENSES = new Set([
  ...BUNDLED_LICENSES,
  'MPL-2.0',
  'EPL-2.0',
  'Python-2.0',
  'PSF-2.0',
  'CC-BY-4.0',
])
// Packages whose lockfile entry lacks a licence; each was read by hand.
export const REVIEWED = {
  'node_modules/khroma': {
    license: 'MIT',
    reason: 'license file in the package; lockfile omits it',
  },
}

/** A small SPDX evaluator: OR needs one allowed term, AND needs all of them. */
export function licenseAllowed(expression, allowed) {
  if (typeof expression !== 'string' || !expression.trim()) return false
  const text = expression.trim().replace(/^\((.*)\)$/, '$1')
  if (/\bOR\b/.test(text))
    return text.split(/\s+OR\s+/).some((term) => licenseAllowed(term, allowed))
  if (/\bAND\b/.test(text))
    return text.split(/\s+AND\s+/).every((term) => licenseAllowed(term, allowed))
  return allowed.has(text)
}

/** Lockfile path of the package that owns a bundled input file. */
export function owningPackage(input) {
  const match = /^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//.exec(input)
  return match?.[1]
}

export function licenseProblems(lock, bundled) {
  const problems = []
  for (const [path, entry] of Object.entries(lock.packages ?? {})) {
    if (!path) continue
    const license = entry.license ?? REVIEWED[path]?.license
    const shipped = bundled.has(path)
    if (!licenseAllowed(license, shipped ? BUNDLED_LICENSES : DEVELOPMENT_LICENSES))
      problems.push(
        `${path}: ${license ?? 'no licence'} is not allowed for ${shipped ? 'bundled' : 'development'} dependencies`,
      )
  }
  for (const path of bundled)
    if (!lock.packages?.[path]) problems.push(`${path}: bundled but absent from package-lock.json`)
  return problems
}

/** High and critical advisories that reach the published bundle. */
export function advisoryProblems(audit, bundled) {
  const names = new Set([...bundled].map((path) => path.replace(/^.*node_modules\//, '')))
  return Object.values(audit.vulnerabilities ?? {})
    .filter((entry) => ['high', 'critical'].includes(entry.severity) && names.has(entry.name))
    .map((entry) => `${entry.name}: ${entry.severity} advisory in a bundled dependency`)
}

/**
 * A CycloneDX 1.5 SBOM of what the published package actually contains: the
 * bundled packages, not the empty dependencies field npm sbom would read.
 */
export function bundledSbom(lock, bundled, version) {
  const components = [...bundled].sort().map((path) => {
    const entry = lock.packages?.[path] ?? {}
    const name = path.replace(/^.*node_modules\//, '')
    const license = entry.license ?? REVIEWED[path]?.license
    return {
      type: 'library',
      name,
      version: entry.version,
      purl: `pkg:npm/${name.replace('@', '%40')}@${entry.version}`,
      ...(license ? { licenses: [{ expression: license }] } : {}),
      ...(entry.integrity
        ? {
            hashes: [
              {
                alg: 'SHA-512',
                content: Buffer.from(entry.integrity.replace(/^sha512-/, ''), 'base64').toString(
                  'hex',
                ),
              },
            ],
          }
        : {}),
    }
  })
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    metadata: {
      component: {
        type: 'application',
        name: 'wholeloop',
        version,
        purl: `pkg:npm/wholeloop@${version}`,
      },
    },
    components,
  }
}

async function bundledPackages(root) {
  const { build } = await import('esbuild')
  const bundled = new Set()
  for (const entry of ['src/cli/bin.ts', 'src/runner/controller-bin.ts']) {
    const result = await build({
      absWorkingDir: root,
      entryPoints: [entry],
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node20',
      write: false,
      metafile: true,
      logLevel: 'silent',
      outfile: 'analysis.mjs',
    })
    for (const input of Object.keys(result.metafile.inputs)) {
      const owner = owningPackage(input)
      if (owner) bundled.add(owner)
    }
  }
  return bundled
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = dirname(dirname(fileURLToPath(import.meta.url)))
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'))
  const bundled = await bundledPackages(root)
  const problems = licenseProblems(lock, bundled)
  const sbom = process.argv.indexOf('--sbom')
  if (sbom > 0) {
    const file = process.argv[sbom + 1]
    if (!file) throw new Error('Use --sbom <file>')
    const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    writeFileSync(file, `${JSON.stringify(bundledSbom(lock, bundled, version), null, 2)}\n`)
  }
  if (process.argv.includes('--audit')) {
    // npm audit exits non-zero when it finds anything; the JSON is still complete.
    const audit = spawnSync('npm', ['audit', '--json'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
    try {
      problems.push(...advisoryProblems(JSON.parse(audit.stdout), bundled))
    } catch {
      problems.push('npm audit returned no readable report')
    }
  }
  for (const problem of problems) console.error(`dependencies: ${problem}`)
  console.log(
    `dependencies: ${bundled.size} bundled packages, ${Object.keys(lock.packages ?? {}).length - 1} locked; ${problems.length} problem(s)`,
  )
  process.exitCode = problems.length ? 1 : 0
}
