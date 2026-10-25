import { realpathSync } from 'node:fs'
import { dirname, isAbsolute } from 'node:path'
import { acceptanceShape } from '../acceptance/contracts.js'
import { contractDigest } from '../contracts/compatibility.js'
import { readSourceBytes, safeSourceText, sourceHash } from '../delivery/input.js'
import catalogSchema from './schemas/catalog-v1.json' with { type: 'json' }
import oracleSchema from './schemas/oracle-v1.json' with { type: 'json' }

export const EVALUATION_CATALOG_SCHEMA = catalogSchema
export const EVALUATION_ORACLE_SCHEMA = oracleSchema
export interface EvaluationFile {
  ref: string
  sha256: string
}
export interface EvaluationTarget extends EvaluationFile {
  target: string
}
export interface EvaluationScenario {
  id: string
  category: 'regression' | 'persistence' | 'integration' | 'adversarial'
  surfaces: ('cli' | 'api' | 'browser' | 'broker')[]
  requirements: EvaluationFile
  oracle: EvaluationFile
  repositories: { id: string; baseline: EvaluationTarget[]; reference: EvaluationTarget[] }[]
  timeoutMs: number
}
export interface EvaluationCatalog {
  schema: 'wholeloop/evaluation-applications@1'
  id: string
  license: 'MIT'
  scenarios: EvaluationScenario[]
}
export type EvaluationCase =
  | {
      id: string
      kind: 'cli'
      repository: string
      argv: string[]
      exit: number
      json?: string
      stdout?: string
      stderr?: string
    }
  | {
      id: string
      kind: 'http'
      service: string
      method: 'GET' | 'POST'
      path: string
      body?: string
      httpStatus: number
      json: string
    }
  | { id: string; kind: 'restart'; service: string }
  | { id: string; kind: 'broker'; method: string; data: Record<string, string>; status: 'denied' }
export interface EvaluationOracle {
  schema: 'wholeloop/evaluation-oracle@1'
  scenario: string
  relevant: string[]
  cases: EvaluationCase[]
}
export class EvaluationFixtureError extends Error {
  constructor(readonly problem: string) {
    super(
      `Evaluation fixture unavailable: ${problem}; preserve pinned standards and source workspaces`,
    )
  }
}
function unique(values: string[], reason: string) {
  if (new Set(values).size !== values.length) throw new EvaluationFixtureError(reason)
}
export function evaluationRelativeFile(ref: string) {
  return (
    !!ref &&
    !isAbsolute(ref) &&
    !ref.includes('\\') &&
    !ref
      .split('/')
      .some(
        (part) =>
          !part || part === '.' || part === '..' || part === '.git' || part === 'node_modules',
      ) &&
    !/^(?:\.env(?:\.|$)|\.npmrc$|auth\.json$|credentials(?:\.|$))/i.test(
      ref.split('/').at(-1) ?? '',
    )
  )
}
export function evaluationOracle(value: unknown, scenario: EvaluationScenario): EvaluationOracle {
  acceptanceShape(value, oracleSchema)
  const oracle = structuredClone(value) as EvaluationOracle
  if (oracle.scenario !== scenario.id) throw new EvaluationFixtureError('oracle-scenario-binding')
  unique(
    oracle.cases.map((c) => c.id),
    'duplicate-oracle-case',
  )
  unique(oracle.relevant, 'duplicate-sensitive-case')
  if (oracle.relevant.some((id) => !oracle.cases.some((c) => c.id === id && c.kind !== 'restart')))
    throw new EvaluationFixtureError('unknown-sensitive-case')
  if (
    scenario.category !== 'adversarial' &&
    !oracle.cases.some((c) => c.kind !== 'restart' && !oracle.relevant.includes(c.id))
  )
    throw new EvaluationFixtureError('normal-controls-required')
  for (const test of oracle.cases) {
    const fields = Object.keys(test),
      allowed =
        test.kind === 'cli'
          ? ['id', 'kind', 'repository', 'argv', 'exit', 'json', 'stdout', 'stderr']
          : test.kind === 'http'
            ? ['id', 'kind', 'service', 'method', 'path', 'body', 'httpStatus', 'json']
            : test.kind === 'restart'
              ? ['id', 'kind', 'service']
              : ['id', 'kind', 'method', 'data', 'status']
    if (fields.some((k) => !allowed.includes(k)))
      throw new EvaluationFixtureError('ambiguous-oracle-case')
    if (
      test.kind === 'cli' &&
      (!scenario.repositories.some((r) => r.id === test.repository) ||
        !Array.isArray(test.argv) ||
        !Number.isInteger(test.exit))
    )
      throw new EvaluationFixtureError('invalid-cli-oracle')
    if (
      (test.kind === 'http' || test.kind === 'restart') &&
      !scenario.repositories.some((r) => r.id === test.service)
    )
      throw new EvaluationFixtureError('invalid-oracle-service')
    if (
      test.kind === 'http' &&
      (!['GET', 'POST'].includes(test.method) ||
        typeof test.path !== 'string' ||
        !test.path.startsWith('/') ||
        test.path.startsWith('//') ||
        /[\r\n]/.test(test.path) ||
        !Number.isInteger(test.httpStatus) ||
        typeof test.json !== 'string')
    )
      throw new EvaluationFixtureError('invalid-http-oracle')
    if (
      test.kind === 'broker' &&
      (typeof test.method !== 'string' || !test.data || test.status !== 'denied')
    )
      throw new EvaluationFixtureError('invalid-broker-oracle')
    for (const key of ['json', 'body'] as const)
      if (key in test) {
        const literal = (test as unknown as Record<string, unknown>)[key]
        if (typeof literal !== 'string') throw new EvaluationFixtureError('invalid-json-oracle')
        try {
          JSON.parse(literal)
        } catch {
          throw new EvaluationFixtureError('invalid-json-oracle')
        }
      }
  }
  return oracle
}
/** Snapshot exact standards before materialization; no seed executes code or grants runtime authority. */
export function loadEvaluationCatalog(file: string) {
  const path = realpathSync(file),
    root = realpathSync(dirname(path)),
    raw = readSourceBytes(root, path, 1024 * 1024),
    value: unknown = JSON.parse(raw.toString('utf8'))
  acceptanceShape(value, catalogSchema)
  const catalog = structuredClone(value) as EvaluationCatalog
  unique(
    catalog.scenarios.map((s) => s.id),
    'duplicate-scenario',
  )
  const files = new Map<string, { ref: string; sha256: string; bytes: number; body: string }>()
  let bytes = raw.length
  const load = (file: EvaluationFile) => {
    if (!evaluationRelativeFile(file.ref))
      throw new EvaluationFixtureError('unsafe-fixture-reference')
    const body = readSourceBytes(root, file.ref, 65536)
    safeSourceText(body.toString('utf8'), 65536)
    if (sourceHash(body.toString('utf8')) !== file.sha256)
      throw new EvaluationFixtureError('changed-fixture-bytes')
    const old = files.get(file.ref)
    if (old && old.sha256 !== file.sha256)
      throw new EvaluationFixtureError('conflicting-fixture-pins')
    if (!old) {
      bytes += body.length
      if (bytes > 8 * 1024 * 1024) throw new EvaluationFixtureError('fixture-byte-limit')
      files.set(file.ref, {
        ref: file.ref,
        sha256: file.sha256,
        bytes: body.length,
        body: body.toString('utf8'),
      })
    }
    return body.toString('utf8')
  }
  for (const scenario of catalog.scenarios) {
    unique(scenario.surfaces, 'duplicate-surface')
    unique(
      scenario.repositories.map((r) => r.id),
      'duplicate-fixture-repository',
    )
    load(scenario.requirements)
    for (const repo of scenario.repositories)
      for (const variant of ['baseline', 'reference'] as const) {
        unique(
          repo[variant].map((f) => f.target),
          'duplicate-fixture-target',
        )
        if (
          repo[variant].some((a) =>
            repo[variant].some((b) => a !== b && b.target.startsWith(`${a.target}/`)),
          )
        )
          throw new EvaluationFixtureError('overlapping-fixture-targets')
        for (const file of repo[variant]) {
          if (!evaluationRelativeFile(file.target) || file.target.toLowerCase() === 'request.md')
            throw new EvaluationFixtureError('unsafe-fixture-target')
          load(file)
        }
      }
    evaluationOracle(JSON.parse(load(scenario.oracle)), scenario)
  }
  const identities = [...files.values()]
      .map(({ body: _body, ...file }) => file)
      .sort((a, b) => (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0)),
    digest = contractDigest({ catalog, files: identities })
  return { catalog, digest, root, files }
}
export function evaluationCatalogSummary(loaded: ReturnType<typeof loadEvaluationCatalog>) {
  return {
    schema: 'wholeloop/evaluation-catalog@1',
    digest: loaded.digest,
    id: loaded.catalog.id,
    license: loaded.catalog.license,
    scenarios: loaded.catalog.scenarios.map((s) => ({
      id: s.id,
      category: s.category,
      surfaces: s.surfaces,
      requirements: s.requirements.sha256,
      oracle: s.oracle.sha256,
      repositories: s.repositories.map((r) => r.id),
      timeoutMs: s.timeoutMs,
    })),
    executed: false,
    authority: 'not-granted',
  }
}
