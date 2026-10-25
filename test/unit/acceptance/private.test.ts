import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { mutationCounters } from '../../../src/acceptance/mutation.js'
import { privateCaseReference, privateDefinition } from '../../../src/acceptance/private-input.js'
import { PrivateAcceptance } from '../../../src/acceptance/private-plan.js'
import { privateSeedInput } from '../../../src/acceptance/private-seed.js'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { DeliveryQueue } from '../../../src/delivery/queue.js'
import { acceptanceFixture } from '../../support/acceptance.js'
import { entry } from '../../support/delivery.js'
import { privatePlan } from '../../support/private.js'

it('pins private bytes separately and exposes only an unchanged digest through the public case', () =>
  acceptanceFixture(async ({ acceptance, plan, root }) => {
    const store = new PrivateAcceptance(acceptance),
      input = privatePlan(plan),
      pinned = store.prepare(input),
      test = entry(plan.cases, 0)
    test.runner = {
      kind: 'api',
      capability: 'evaluator.private-http',
      input: JSON.stringify({ schema: 'wholeloop/private-case-input@1', manifest: pinned.digest }),
    }
    test.assertions = [
      {
        id: 'private-outcome',
        subject: 'state',
        operator: 'equals',
        path: '/passed',
        expected: 'true',
        description: 'Every private objective assertion passes.',
      },
    ]
    test.fixture.sha256 = pinned.digest
    const publicPlan = acceptance.prepare(plan)
    expect(store.forCase(publicPlan.digest, test).digest).toBe(pinned.digest)
    expect(privateCaseReference(test)).toBe(pinned.digest)
    expect(JSON.stringify(publicPlan)).not.toContain('"title"')
    expect(store.prepare(input)).toEqual(pinned)
    const changed = structuredClone(input)
    entry(changed.assertions, 0).expected = '201'
    expect(() => store.prepare(changed)).toThrow('pinned-private-definitions')
    expect(existsSync(join(root, 'delivery/private-acceptance'))).toBe(false)
    const foreign = { ...test, id: 'another-case' }
    expect(() => store.forCase(publicPlan.digest, foreign)).toThrow('private-case-binding')
  }))
it.each([true, false])(
  'pins before builder admission and preserves existing historical definitions (first=%s)',
  (first) =>
    acceptanceFixture(async ({ acceptance, plan }) => {
      const store = new PrivateAcceptance(acceptance),
        input = privatePlan(plan),
        pinned = first ? store.prepare(input) : undefined
      const queue = new DeliveryQueue(acceptance.planning.sources.files.root)
      queue.enqueue(plan.run, { unit: 'contract' })
      expect(
        queue.claim('controller-0123456789abcdef0123456789abcdef', () => ({
          ready: true,
          provenance: 'fixture',
          evidence: 'a'.repeat(64),
        })).assignment,
      ).toBeDefined()
      if (pinned) expect(store.prepare(input)).toEqual(pinned)
      else expect(() => store.prepare(input)).toThrow('private-defined-after-builder-admission')
    }),
)
it('rejects changed index bytes and a replaced immutable private pin', () =>
  acceptanceFixture(async ({ acceptance, plan }) => {
    const store = new PrivateAcceptance(acceptance),
      pinned = store.prepare(privatePlan(plan))
    const file = acceptance.planning.sources.files.path(
        `delivery/private-acceptance/${pinned.digest}.json`,
      ),
      original = readFileSync(file, 'utf8')
    const changed = JSON.parse(original)
    changed.plan.assertions[0].expected = '200'
    writeFileSync(file, JSON.stringify(changed))
    expect(() => store.get(pinned.digest)).toThrow('changed-private-bytes')
    writeFileSync(file, original)
    const pin = acceptance.planning.sources.files.path(
      `delivery/private-acceptance-pins/${plan.run}/${plan.revision}/${pinned.plan.case}.json`,
    )
    changed.digest = contractDigest(changed.plan)
    writeFileSync(pin, JSON.stringify(changed))
    expect(() => store.get(pinned.digest)).toThrow('changed-private-plan')
  }))
it('refuses unsupported runners, restarts, ambiguous assertions and unowned request paths before dispatch', () =>
  acceptanceFixture(async ({ plan }) => {
    const input = privatePlan(plan)
    for (const changed of [
      { ...input, behavior: { ...input.behavior, kind: 'cli' } },
      { ...input, behavior: { ...input.behavior, steps: [{ id: 'restart', kind: 'restart' }] } },
      { ...input, sensitivity: { mode: 'regression', relevant: ['missing'] } },
      { ...input, assertions: [...input.assertions, ...input.assertions] },
      {
        ...input,
        behavior: {
          ...input.behavior,
          steps: [{ id: 'foreign', kind: 'request', method: 'GET', path: '//foreign/path' }],
        },
      },
    ])
      expect(() => privateDefinition(changed)).toThrow()
  }))
it('keeps arbitrary native counters as reported data and rejects inconsistent or incomplete totals', () => {
  const report = {
    schema: 'wholeloop/mutation-counters@1',
    engine: 'fixture-native-mutator',
    version: '1',
    complete: true,
    total: 4,
    killed: 2,
    survived: 1,
    timedOut: 0,
    uncovered: 1,
    errors: 0,
  }
  expect(mutationCounters(report).survived).toBe(1)
  for (const changed of [
    { ...report, total: 5 },
    { ...report, complete: false },
    { ...report, killed: -1 },
    { ...report, proven: true },
  ])
    expect(() => mutationCounters(changed)).toThrow()
})
it('keeps private schema/inspection inert and omits hidden values from actual CLI output', () =>
  acceptanceFixture(async ({ acceptance, plan, dir }) => {
    const input = privatePlan(plan)
    entry(input.behavior.steps ?? [], 0).body = '{"title":"private fixture value"}'
    const file = join(dir, 'private-definition.json')
    writeFileSync(file, JSON.stringify(input))
    const cli = (args: string[]) => {
      const result = spawnSync(
        process.execPath,
        [resolve('dist/wl.mjs'), 'delivery', ...args, '--json'],
        { encoding: 'utf8' },
      )
      expect(result.status, result.stdout || result.stderr).toBe(0)
      expect(result.stdout).not.toContain('private fixture value')
      return JSON.parse(result.stdout)
    }
    expect(cli(['private-schema'])).toMatchObject({
      schema: 'wholeloop/private-acceptance-schema@1',
      executed: false,
    })
    const prepared = cli([
      'private-plan',
      '--file',
      file,
      '--root',
      dir,
      '--store',
      acceptance.planning.sources.files.root,
    ])
    expect(prepared).toMatchObject({
      schema: 'wholeloop/private-acceptance-prepared@1',
      privacy: 'controller-only',
      executed: false,
    })
    expect(
      cli([
        'private-inspect',
        '--digest',
        prepared.digest,
        '--store',
        acceptance.planning.sources.files.root,
      ]),
    ).toMatchObject({ digest: prepared.digest, requests: 1, assertions: 1 })
  }))

it('keeps a shared-filesystem fixture pass distinct from independently observed private acceptance', () =>
  acceptanceFixture(async ({ acceptance, plan, boundary }) => {
    const store = new PrivateAcceptance(acceptance),
      definition = store.prepare(privatePlan(plan)),
      test = entry(plan.cases, 0)
    test.runner = {
      kind: 'api',
      capability: 'evaluator.private-http',
      input: JSON.stringify({
        schema: 'wholeloop/private-case-input@1',
        manifest: definition.digest,
      }),
    }
    test.assertions = [
      {
        id: 'private-outcome',
        subject: 'state',
        operator: 'equals',
        path: '/passed',
        expected: 'true',
        description: 'All private objectives pass.',
      },
    ]
    test.fixture.sha256 = definition.digest
    const pinned = acceptance.prepare(plan)
    const result = await acceptance.executeCase(pinned.digest, test.id, 'fixture', boundary, {
      id: 'fixture-private',
      version: '1',
      capability: 'evaluator.private-http',
      provenance: 'fixture',
      async execute(_test, context) {
        const evidence = context.capture(Buffer.from('{}'), 'application/json')
        return {
          status: 'passed',
          origin: 'controller-observation',
          invocationState: 'stopped',
          assertions: [{ id: 'private-outcome', status: 'passed', evidence }],
          artifacts: [evidence],
          reason: 'Protocol fixture; no native private boundary.',
        }
      },
    })
    expect(result.status).toBe('passed')
    const report = await acceptance.report(pinned.digest, boundary)
    expect(report.status).toBe('unavailable')
    expect(report.acceptance).toBe('not-established')
    expect(acceptance.observedResults(pinned.digest, test.id)).toHaveLength(1)
    expect(acceptance.observedCase(pinned.digest, test.id, 'fixture')).toEqual(result)
  }))

it('preserves exact Unicode and escaped bytes within the real two-MiB private pipe bound', () => {
  const body = JSON.stringify({ note: '\u{1d11e}'.repeat(100000), escaped: '\\'.repeat(1000) }),
    script = '// reviewed fixture program\n'
  const encoded = JSON.parse(privateSeedInput(body, script)) as Record<string, string>
  expect(Buffer.from(encoded['cases.json'] ?? '', 'base64').equals(Buffer.from(body))).toBe(true)
  expect(Buffer.from(encoded['runner.mjs'] ?? '', 'base64').toString('utf8')).toBe(script)
  const maximum = privateSeedInput('\\'.repeat(1024 * 1024), 'y'.repeat(256 * 1024))
  expect(Buffer.byteLength(maximum)).toBeLessThan(2 * 1024 * 1024)
  expect(() => privateSeedInput('x'.repeat(1024 * 1024 + 1), script)).toThrow('private-seed-size')
  expect(() => privateSeedInput(body, 'y'.repeat(256 * 1024 + 1))).toThrow('private-seed-size')
})
