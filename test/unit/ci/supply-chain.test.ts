import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import {
  advisoryProblems,
  BUNDLED_LICENSES,
  bundledSbom,
  DEVELOPMENT_LICENSES,
  licenseAllowed,
  licenseProblems,
  owningPackage,
  // @ts-expect-error The repository script is plain JavaScript without declarations.
} from '../../../scripts/check-dependencies.mjs'

const root = resolve('.')
const workflows = readdirSync(join(root, '.github/workflows'))
  .filter((name) => name.endsWith('.yml'))
  .map((name) => [name, readFileSync(join(root, '.github/workflows', name), 'utf8')] as const)

type Job = { permissions?: Record<string, string> | string; steps?: { uses?: string }[] }

describe('GitHub workflows', () => {
  it.each(workflows)('%s keeps least privilege and pinned actions', (_name, text) => {
    const workflow = parse(text) as {
      on: unknown
      permissions?: unknown
      jobs: Record<string, Job>
    }
    // Write access is granted per job, never to the whole workflow.
    expect(workflow.permissions).toEqual({ contents: 'read' })
    expect(JSON.stringify(workflow.on)).not.toContain('pull_request_target')
    for (const job of Object.values(workflow.jobs)) {
      if (typeof job.permissions === 'string') expect(job.permissions).not.toMatch(/write-all/)
      for (const step of job.steps ?? [])
        if (step.uses && !step.uses.startsWith('./'))
          expect(step.uses, step.uses).toMatch(/^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/)
    }
    // Every pinned action names its version next to the SHA for reviewers and Dependabot.
    for (const line of text.split('\n'))
      if (/uses: [\w.-]+\/[\w./-]+@[0-9a-f]{40}/.test(line))
        expect(line, line).toMatch(/# v\d+\.\d+\.\d+$/)
  })

  it('covers npm and the pinned actions with Dependabot, plus review, CodeQL and Scorecard', () => {
    const dependabot = parse(readFileSync(join(root, '.github/dependabot.yml'), 'utf8')) as {
      updates: { 'package-ecosystem': string }[]
    }
    expect(dependabot.updates.map((entry) => entry['package-ecosystem']).sort()).toEqual([
      'github-actions',
      'npm',
    ])
    expect(workflows.map(([name]) => name)).toEqual(
      expect.arrayContaining(['codeql.yml', 'dependency-review.yml', 'scorecard.yml']),
    )
    // Code scanning needs Advanced Security on a private repository: these jobs skip
    // until the repository is public rather than fail on every push.
    for (const name of ['codeql.yml', 'dependency-review.yml', 'scorecard.yml']) {
      const workflow = parse(workflows.find(([file]) => file === name)?.[1] ?? '') as {
        jobs: Record<string, { if?: string }>
      }
      for (const job of Object.values(workflow.jobs))
        expect(job.if).toBe(['$', '{{ !github.event.repository.private }}'].join(''))
    }
    const ci = workflows.find(([name]) => name === 'ci.yml')?.[1] ?? ''
    expect(ci).toContain('node scripts/check-dependencies.mjs --audit')
    // Registry signatures run in their own reported workflow, not as a required
    // check: hosted runners failed them on an external key condition (P7-05).
    expect(ci).not.toContain('npm audit signatures')
    const signatures = parse(workflows.find(([name]) => name === 'signatures.yml')?.[1] ?? '') as {
        on: Record<string, unknown>
        jobs: Record<
          string,
          { name: string; 'continue-on-error'?: unknown; steps: { run?: string }[] }
        >
      },
      jobs = Object.values(signatures.jobs),
      run =
        jobs.flatMap((job) => job.steps).find((step) => step.run?.includes('npm audit signatures'))
          ?.run ?? ''
    expect(Object.keys(signatures.on)).toEqual(expect.arrayContaining(['push', 'pull_request']))
    expect(jobs.every((job) => job['continue-on-error'] === undefined)).toBe(true)
    // The job still fails with the audit's own status; the log lines only explain it.
    expect(run.split('\n')[0]).toBe(
      'npm audit signatures --cache "$RUNNER_TEMP/npm-audit-cache" && exit 0',
    )
    expect(run).toContain('status=$?')
    expect(run.trim().split('\n').at(-1)).toBe('exit "$status"')
    const required = (
      JSON.parse(readFileSync(join(root, '.github/rulesets/main.json'), 'utf8')).rules as {
        type: string
        parameters?: { required_status_checks?: { context: string }[] }
      }[]
    )
      .flatMap((rule) => rule.parameters?.required_status_checks ?? [])
      .map((check) => check.context)
    expect(required).not.toContain(jobs[0]?.name)
  })
})

describe('dependency licence and advisory policy', () => {
  it.each([
    ['MIT', true, true],
    ['(MIT OR Apache-2.0)', true, true],
    ['MIT AND GPL-3.0-only', false, false],
    ['MPL-2.0', false, true],
    ['(MPL-2.0 OR Apache-2.0)', true, true],
    ['GPL-3.0-only', false, false],
    ['AGPL-3.0-only', false, false],
    [undefined, false, false],
  ])('%s is bundled=%s development=%s', (license, bundled, development) => {
    expect(licenseAllowed(license, BUNDLED_LICENSES)).toBe(bundled)
    expect(licenseAllowed(license, DEVELOPMENT_LICENSES)).toBe(development)
  })

  it('applies the strict list only to bundled packages and refuses unknown licences', () => {
    const lock = {
      packages: {
        '': {},
        'node_modules/yaml': { license: 'ISC' },
        'node_modules/copyleft-tool': { license: 'MPL-2.0', dev: true },
        'node_modules/copyleft-bundled': { license: 'MPL-2.0', dev: true },
        'node_modules/unlicensed': { dev: true },
        'node_modules/khroma': { dev: true },
      },
    }
    expect(
      licenseProblems(lock, new Set(['node_modules/yaml', 'node_modules/copyleft-bundled'])),
    ).toEqual([
      'node_modules/copyleft-bundled: MPL-2.0 is not allowed for bundled dependencies',
      'node_modules/unlicensed: no licence is not allowed for development dependencies',
    ])
    expect(licenseProblems(lock, new Set(['node_modules/missing']))).toContain(
      'node_modules/missing: bundled but absent from package-lock.json',
    )
  })

  it('fails only on high or critical advisories that reach the bundle', () => {
    const audit = {
      vulnerabilities: {
        yaml: { name: 'yaml', severity: 'high' },
        vitest: { name: 'vitest', severity: 'critical' },
        zod: { name: 'zod', severity: 'moderate' },
      },
    }
    expect(advisoryProblems(audit, new Set(['node_modules/yaml', 'node_modules/zod']))).toEqual([
      'yaml: high advisory in a bundled dependency',
    ])
  })

  it('maps bundled inputs to their owning package, scoped and nested', () => {
    expect(owningPackage('node_modules/yaml/dist/index.js')).toBe('node_modules/yaml')
    expect(owningPackage('node_modules/@scope/pkg/lib/a.js')).toBe('node_modules/@scope/pkg')
    // A node_modules symlinked from outside the checkout keeps the lockfile path.
    expect(owningPackage('../../dependencies/node_modules/yaml/dist/index.js')).toBe(
      'node_modules/yaml',
    )
    expect(owningPackage('src/cli/main.ts')).toBeUndefined()
    expect(owningPackage('node_modules/a/node_modules/b/x.js')).toBe(
      'node_modules/a/node_modules/b',
    )
    expect(owningPackage('src/cli/bin.ts')).toBeUndefined()
  })

  it('describes the bundled packages, not the empty dependencies field, in the SBOM', () => {
    const lock = {
      packages: {
        'node_modules/yaml': {
          version: '2.8.1',
          license: 'ISC',
          integrity: `sha512-${Buffer.from('fixture').toString('base64')}`,
        },
        'node_modules/@modelcontextprotocol/sdk': { version: '1.0.0', license: 'MIT' },
        'node_modules/vitest': { version: '5.0.2', license: 'MIT', dev: true },
      },
    }
    const sbom = bundledSbom(
      lock,
      new Set(['node_modules/yaml', 'node_modules/@modelcontextprotocol/sdk']),
      '1.0.0',
    )
    expect(sbom).toMatchObject({ bomFormat: 'CycloneDX', specVersion: '1.5' })
    expect(sbom.metadata.component).toMatchObject({ name: 'wholeloop', version: '1.0.0' })
    expect(sbom.components.map((entry: { purl: string }) => entry.purl)).toEqual([
      'pkg:npm/%40modelcontextprotocol/sdk@1.0.0',
      'pkg:npm/yaml@2.8.1',
    ])
    expect(sbom.components[1]).toMatchObject({
      licenses: [{ expression: 'ISC' }],
      hashes: [{ alg: 'SHA-512', content: Buffer.from('fixture').toString('hex') }],
    })
  })
})
