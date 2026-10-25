import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { acceptanceShape } from '../../../src/acceptance/contracts.js'
import { observeHttp } from '../../../src/acceptance/http.js'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import type { EvaluationCase, loadEvaluationCatalog } from '../../../src/evaluation/catalog.js'
import { EvaluationFixtureError } from '../../../src/evaluation/catalog.js'
import checkSchema from '../../../src/evaluation/schemas/fixture-check-v1.json' with {
  type: 'json',
}
import type { EvaluationSeeds } from '../../../src/evaluation/store.js'
import { workerProcess } from '../../../src/fanout/process.js'
import { observeMaliciousBroker } from './broker.js'

interface LiveService {
  origin: string
  stop(): Promise<void>
}
export async function checkOriginalFixture(
  loaded: ReturnType<typeof loadEvaluationCatalog>,
  seeds: EvaluationSeeds,
  scenarioId: string,
  variant: 'baseline' | 'reference',
) {
  const scenario = loaded.catalog.scenarios.find((s) => s.id === scenarioId)
  if (!scenario) throw new EvaluationFixtureError('unknown-control-scenario')
  const invocation = randomUUID(),
    seed = seeds.seed(loaded, {
      schema: 'wholeloop/evaluation-seed-request@1',
      catalog: loaded.digest,
      scenario: scenarioId,
      variant,
      key: `control-${invocation}`,
    })
  if (seed.status !== 'ready') throw new EvaluationFixtureError('control-seed-not-ready')
  if (seed.repositories.some((repo) => repo.seedFiles !== 'matching'))
    throw new EvaluationFixtureError('control-source-changed')
  const record = seeds.get(seed.digest),
    oracle = seeds.oracle(seed.digest),
    deadline = Date.now() + scenario.timeoutMs,
    abort = new AbortController(),
    timer = setTimeout(() => abort.abort(), scenario.timeoutMs),
    services = new Map<string, LiveService>(),
    control = seeds.files.path(`delivery/evaluation-controls/${invocation}`),
    home = join(control, 'home'),
    data = join(control, 'data')
  mkdirSync(home, { recursive: true, mode: 0o700 })
  mkdirSync(data, { recursive: true, mode: 0o700 })
  const env = { PATH: process.env.PATH, HOME: home, LANG: 'C' }
  const cases: { id: string; status: 'passed' | 'failed' | 'unavailable'; evidence: string }[] = []
  const remaining = () => {
    const time = deadline - Date.now()
    if (time <= 0 || abort.signal.aborted) throw new EvaluationFixtureError('control-deadline')
    return time
  }
  const repository = (id: string) => {
    const repo = record.repositories.find((r) => r.id === id)
    if (!repo) throw new EvaluationFixtureError('unknown-control-repository')
    const file = repo.files.find((f) => f.target === 'app.cjs')
    if (
      !file ||
      contractDigest(readFileSync(join(repo.root, 'app.cjs')).toString('utf8')) !==
        contractDigest(
          loaded.files.get(
            scenario.repositories
              .find((r) => r.id === id)
              ?.[variant].find((f) => f.target === 'app.cjs')?.ref ?? '',
          )?.body,
        )
    )
      throw new EvaluationFixtureError('control-source-changed')
    return repo
  }
  const start = async (id: string): Promise<LiveService> => {
    const repo = repository(id),
      args = [join(repo.root, 'app.cjs'), '--port', '0', '--host', '127.0.0.1']
    if (scenario.category === 'persistence') args.push('--data-dir', data)
    if (id === 'frontend') {
      const backend = services.get('backend')
      if (!backend) throw new EvaluationFixtureError('missing-control-backend')
      args.push('--backend', backend.origin)
    }
    const stop = new AbortController(),
      stopAll = () => stop.abort()
    abort.signal.addEventListener('abort', stopAll, { once: true })
    let ready: (origin: string) => void = () => {},
      observed = false
    const origin = new Promise<string>((resolve) => {
      ready = resolve
    })
    const running = workerProcess(process.execPath, args, {
      cwd: repo.root,
      env,
      input: '',
      timeoutMs: remaining(),
      signal: stop.signal,
      readyLine: (line) => {
        const value = JSON.parse(line) as { port: number }
        if (!Number.isInteger(value.port) || value.port < 1 || value.port > 65535)
          throw new EvaluationFixtureError('invalid-control-listener')
        observed = true
        ready(`http://127.0.0.1:${value.port}`)
        return true
      },
    })
    const closed = running.then(() => {
      if (!observed) throw new EvaluationFixtureError('control-process-exited-before-readiness')
      return new Promise<string>(() => {})
    })
    try {
      return {
        origin: await Promise.race([origin, closed]),
        stop: async () => {
          stop.abort()
          await running
          abort.signal.removeEventListener('abort', stopAll)
        },
      }
    } catch (error) {
      stop.abort()
      await running
      abort.signal.removeEventListener('abort', stopAll)
      throw error
    }
  }
  try {
    // Only reviewed control literals run here. Changed implementations are evaluated through isolated hosts, never this controller helper.
    if (scenario.category !== 'adversarial')
      for (const repo of record.repositories) services.set(repo.id, await start(repo.id))
    else
      cases.push(
        ...(await observeMaliciousBroker(
          oracle.cases.filter(
            (c): c is Extract<EvaluationCase, { kind: 'broker' }> => c.kind === 'broker',
          ),
        )),
      )
    for (const test of oracle.cases) {
      remaining()
      if (test.kind === 'broker') continue
      if (test.kind === 'restart') {
        const service = services.get(test.service)
        if (!service) throw new EvaluationFixtureError('missing-control-service')
        await service.stop()
        services.delete(test.service)
        services.set(test.service, await start(test.service))
        cases.push({
          id: test.id,
          status: 'passed',
          evidence: contractDigest({ restarted: test.service, observedClosed: true }),
        })
        continue
      }
      if (test.kind === 'cli') {
        let diagnosticBytes = 0
        const stderr: Buffer[] = []
        const repo = repository(test.repository),
          result = await workerProcess(
            process.execPath,
            [join(repo.root, 'app.cjs'), ...test.argv],
            {
              cwd: repo.root,
              env,
              input: '',
              timeoutMs: remaining(),
              signal: abort.signal,
              observe: (stream, bytes) => {
                diagnosticBytes += bytes.length
                if (diagnosticBytes > 65536)
                  throw new EvaluationFixtureError('control-output-limit')
                if (stream === 'stderr') stderr.push(bytes)
              },
            },
          )
        const complete =
          result.code !== null &&
          result.signal === null &&
          ['succeeded', 'crashed'].includes(result.status)
        let passed = complete && result.code === test.exit
        if (test.stdout !== undefined) passed &&= result.stdout === test.stdout
        if (test.json !== undefined)
          try {
            passed &&= isDeepStrictEqual(JSON.parse(result.stdout), JSON.parse(test.json))
          } catch {
            passed = false
          }
        if (test.stderr !== undefined)
          passed &&= Buffer.concat(stderr).toString('utf8') === test.stderr
        cases.push({
          id: test.id,
          status: !complete ? 'unavailable' : passed ? 'passed' : 'failed',
          evidence: contractDigest({ result, stderr: Buffer.concat(stderr).toString('base64') }),
        })
      } else {
        const service = services.get(test.service)
        if (!service) throw new EvaluationFixtureError('missing-control-service')
        const response = await observeHttp(
          service.origin,
          {
            id: test.id,
            kind: 'request',
            method: test.method,
            path: test.path,
            ...(test.body !== undefined
              ? { body: test.body, headers: { 'content-type': 'application/json' } }
              : {}),
          },
          abort.signal,
          65536,
        )
        cases.push({
          id: test.id,
          status:
            response.status === test.httpStatus &&
            isDeepStrictEqual(response.json, JSON.parse(test.json))
              ? 'passed'
              : 'failed',
          evidence: contractDigest(response),
        })
      }
    }
  } finally {
    clearTimeout(timer)
    for (const service of [...services.values()].reverse()) await service.stop()
  }
  const relevantFailed = cases
      .filter((c) => oracle.relevant.includes(c.id) && c.status === 'failed')
      .map((c) => c.id),
    controlsPass = cases
      .filter((c) => !oracle.relevant.includes(c.id))
      .every((c) => c.status === 'passed'),
    allPass = cases.every((c) => c.status === 'passed'),
    expected =
      variant === 'baseline' && scenario.category !== 'adversarial'
        ? 'relevant-failure'
        : 'all-pass',
    passed =
      expected === 'relevant-failure'
        ? relevantFailed.length > 0 &&
          controlsPass &&
          !cases.some((c) => c.status === 'unavailable')
        : allPass
  const report = {
    schema: 'wholeloop/evaluation-fixture-check@1',
    catalog: loaded.digest,
    seed: seed.digest,
    scenario: scenarioId,
    variant,
    status: passed ? 'passed' : 'failed',
    expected,
    relevantFailed,
    cases,
    browser: scenario.surfaces.includes('browser') ? 'not-executed' : 'not-applicable',
    provenance: 'trusted-fixture-control',
    authority: 'not-granted',
    nativeAcceptance: 'not-established',
  }
  acceptanceShape(report, checkSchema)
  return report
}
