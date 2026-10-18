import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { stringify } from 'yaml'
import { draftSpec } from '../../../harness/workflows/spec.js'
import { FlowEngine } from '../../../src/flow/engine.js'
import { checkSpec, parseSpec, SPEC_SECTIONS, type Spec } from '../../../src/spec/contract.js'
import { StateStore } from '../../../src/state/store.js'
import { next } from '../../../src/utilities/next.js'

const artifact = readFileSync(new URL('../../fixtures/spec/spec.md', import.meta.url), 'utf8')
const frame = readFileSync(new URL('../../fixtures/framing/frame.md', import.meta.url), 'utf8')
const body = artifact.replace(/^---\n[\s\S]*?\n---\n/, '')
const modified = (change: (spec: Spec) => unknown) =>
  `---\n${stringify(change(parseSpec(artifact)))}---\n${body}`
function first<T>(values: readonly T[]): T {
  const value = values[0]
  if (!value) throw new Error('Fixture needs an entry')
  return value
}
function fixture(run: (dir: string, engine: FlowEngine) => void | Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-spec-'))
  const engine = new FlowEngine(
    new StateStore(join(dir, 'state')),
    dir,
    join(dir, 'user/config.yml'),
    join(dir, 'home'),
  )
  return Promise.resolve()
    .then(() => run(dir, engine))
    .finally(() => rmSync(dir, { recursive: true, force: true }))
}

describe('testable spec and measurement metadata', () => {
  it('accepts a complete spec and preserves the pinned query baseline target and window', () => {
    expect(checkSpec(artifact)).toEqual([])
    const metric = first(parseSpec(artifact).metrics)
    expect(metric).toMatchObject({
      source: { provider: 'analytics', operation: 'source.product-analytics.query' },
      baseline: { status: 'known', value: 48 },
      target: { operator: 'lte', value: 20 },
      window: { days: 30, timezone: 'UTC' },
    })
    expect(metric.source.query).toContain('order_found_at')
  })

  it.each([
    {
      name: 'source',
      change: (spec: Spec) => ({
        ...spec,
        metrics: [{ ...first(spec.metrics), source: undefined }],
      }),
      expected: 'source',
    },
    {
      name: 'window',
      change: (spec: Spec) => ({
        ...spec,
        metrics: [{ ...first(spec.metrics), window: undefined }],
      }),
      expected: 'window',
    },
    {
      name: 'query',
      change: (spec: Spec) => ({
        ...spec,
        metrics: [{ ...first(spec.metrics), source: { ...first(spec.metrics).source, query: '' } }],
      }),
      expected: 'query',
    },
    {
      name: 'criteria',
      change: (spec: Spec) => ({ ...spec, stories: [{ ...first(spec.stories), criteria: [] }] }),
      expected: 'at least 1',
    },
    {
      name: 'vague wording',
      change: (spec: Spec) => ({
        ...spec,
        stories: [
          {
            ...first(spec.stories),
            criteria: [
              {
                ...first(first(spec.stories).criteria),
                text: 'The results feel fast and intuitive.',
              },
            ],
          },
        ],
      }),
      expected: 'untestable wording',
    },
    {
      name: 'unknown query operation',
      change: (spec: Spec) => ({
        ...spec,
        metrics: [
          {
            ...first(spec.metrics),
            source: { ...first(spec.metrics).source, operation: 'docs.create' },
          },
        ],
      }),
      expected: 'taxonomy query',
    },
    {
      name: 'baseline evidence',
      change: (spec: Spec) => ({
        ...spec,
        metrics: [{ ...first(spec.metrics), baseline: { status: 'known', value: 48 } }],
      }),
      expected: 'value and evidence',
    },
    {
      name: 'invalid window',
      change: (spec: Spec) => ({
        ...spec,
        metrics: [{ ...first(spec.metrics), window: { days: 0, timezone: 'Nowhere/Invalid' } }],
      }),
      expected: 'days',
    },
    {
      name: 'rollout exposure',
      change: (spec: Spec) => ({
        ...spec,
        rollout: { ...spec.rollout, stages: [{ ...first(spec.rollout.stages), exposure: 101 }] },
      }),
      expected: 'exposure',
    },
  ])('rejects missing or invalid $name', ({ change, expected }) => {
    expect(checkSpec(modified(change)).join('\n')).toContain(expected)
  })

  it('requires an explicit tracking story for an unknown baseline and an explicit measurement exception', () => {
    const unknown = modified((spec) => ({
      ...spec,
      metrics: [
        {
          ...first(spec.metrics),
          baseline: {
            status: 'unknown',
            missing: 'No retrieval event yet',
            who: 'Product analyst',
          },
          trackingStory: 'find-order',
        },
      ],
    }))
    expect(checkSpec(unknown)).toEqual([])
    const missing = modified((spec) => ({
      ...spec,
      metrics: [
        {
          ...first(spec.metrics),
          baseline: {
            status: 'unknown',
            missing: 'No retrieval event yet',
            who: 'Product analyst',
          },
        },
      ],
    }))
    expect(checkSpec(missing).join('\n')).toContain('trackingStory')
    expect(checkSpec(modified((spec) => ({ ...spec, metrics: [] }))).join('\n')).toContain(
      'measurementException',
    )
    expect(
      checkSpec(
        modified((spec) => ({
          ...spec,
          metrics: [],
          measurementException: {
            reason: 'Mandatory contractual behavior, independently verified by acceptance tests',
            who: 'Product owner',
          },
        })),
      ),
    ).toEqual([])
  })
})

describe('spec entry templates and human approval', () => {
  it('asks for standalone input owner and impact before creating work, then stops for revision-bound approval', () =>
    fixture((_dir, engine) => {
      expect(engine.begin('write-spec', {}).payload.missing).toEqual(['input', 'owner', 'impact'])
      expect(engine.store.list()).toEqual([])
      const begun = engine.begin('write-spec', {
        input: 'Order search',
        owner: 'Alex',
        impact: 'Reduce order retrieval time',
      })
      expect(begun.code).toBe(0)
      const id = begun.payload.subject?.id ?? ''
      expect(engine.begin('write-spec', { subject: id }).payload.missing).toEqual([])
      const completed = engine.complete('write-spec', id, artifact)
      expect(completed.next.pending.map((decision) => decision.id)).toEqual(['approve-spec'])
      expect(completed.next.next).toBe('cut-scopes')
      expect(next(engine, id).code).toBe(2)
      engine.answer('decision.approve-spec', 'rejected', { scope: 'run', subject: id, by: 'Alex' })
      expect(engine.begin('write-spec', { subject: id }).code).toBe(0)
      expect(next(engine, id).code).toBe(0)
      expect(() =>
        engine.answer('decision.approve-spec', 'approved', {
          scope: 'run',
          subject: id,
          by: 'Alex',
        }),
      ).toThrow('Complete write-spec')
      engine.complete('write-spec', id, artifact)
      engine.answer('decision.approve-spec', 'approved', { scope: 'run', subject: id, by: 'Alex' })
      expect(engine.plan(id).next).toBe('cut-scopes')
      engine.begin('write-spec', { subject: id })
      expect(engine.plan(id).pending.map((decision) => decision.id)).toEqual(['approve-spec'])
      expect(() =>
        engine.answer('decision.approve-spec', 'approved', {
          scope: 'run',
          subject: id,
          by: 'Alex',
        }),
      ).toThrow('Complete write-spec')
      engine.complete('write-spec', id, artifact)
      expect(engine.plan(id).pending.map((decision) => decision.id)).toEqual(['approve-spec'])
      const saved = engine.store.files.read(completed.artifact)
      engine.store.rebuild()
      expect(engine.store.files.read(completed.artifact)).toBe(saved)
    }))

  it('uses framed expected impact and validates a custom manifest template additively', () =>
    fixture((dir, engine) => {
      const id =
        engine.begin('frame-problem', { input: 'Order search', owner: 'Alex' }).payload.subject
          ?.id ?? ''
      engine.complete('frame-problem', id, frame)
      const templateDir = join(dir, '.wholeloop/templates')
      mkdirSync(templateDir, { recursive: true })
      writeFileSync(
        join(templateDir, 'spec.md'),
        `---\n${stringify({ schema: 1, id: 'spec', extends: 'builtin:spec', sections: { required: SPEC_SECTIONS.map((name) => name.toLowerCase()).concat('operational constraints') } })}---\n${artifact}\n## Operational constraints\n\nPreserve the current authorization filter.\n`,
      )
      const begun = engine.begin('write-spec', { subject: id })
      expect(begun.code).toBe(0)
      expect(begun.payload.expectedImpact).toContain('baseline and target')
      expect(begun.payload.template).toContain('operational constraints')
      expect(() => engine.complete('write-spec', id, artifact)).toThrow('operational constraints')
      expect(
        engine.complete(
          'write-spec',
          id,
          `${artifact}\n## Operational constraints\n\nPreserve authorization.\n`,
        ).next.pending,
      ).toHaveLength(1)
    }))

  it('loads the bound repository spec guide before drafting instead of using a manifest template', () =>
    fixture(async (dir, engine) => {
      const guide = '.agents/skills/product-spec/SKILL.md'
      mkdirSync(dirname(join(dir, guide)), { recursive: true })
      writeFileSync(
        join(dir, guide),
        '---\nname: product-spec\ndescription: Follow the product spec format.\nmetadata:\n  wholeloop.slot: spec.template\n---\n\nPreserve archived-order access and record its acceptance check.\n',
      )
      mkdirSync(join(dir, '.wholeloop'), { recursive: true })
      writeFileSync(join(dir, '.wholeloop/config.yml'), 'version: 1\ntemplates: {spec: missing}\n')
      const begun = engine.begin('write-spec', {
        input: 'Order search',
        owner: 'Alex',
        impact: 'Reduce retrieval time',
      })
      const template = begun.payload.templateSource
      if (!template) throw new Error('Expected selected spec guidance')
      expect(template).toMatchObject({ kind: 'repository', ref: guide })
      const calls: string[] = []
      const drafted = await draftSpec(template, begun.payload.profile, {
        async readGuidance(ref) {
          calls.push('read')
          return readFileSync(join(dir, ref), 'utf8')
        },
        async draft(input) {
          calls.push('draft')
          expect(input.guidance).toContain('Preserve archived-order access')
          return artifact
        },
      })
      expect(calls).toEqual(['read', 'draft'])
      expect(
        engine.complete('write-spec', begun.payload.subject?.id ?? '', drafted).next.pending,
      ).toHaveLength(1)
    }))

  it('runs schema checks and spec approval through the compiled CLI', () =>
    fixture((dir) => {
      const env = {
        ...process.env,
        XDG_CONFIG_HOME: join(dir, 'config'),
        XDG_STATE_HOME: join(dir, 'cli-state'),
        WL_WORKSPACE: '',
      }
      const cli = (...args: string[]) => {
        const response = spawnSync(process.execPath, [resolve('dist/wl.mjs'), ...args, '--json'], {
          cwd: dir,
          env,
          encoding: 'utf8',
        })
        return { code: response.status, value: JSON.parse(response.stdout) }
      }
      const file = join(dir, 'spec.md')
      writeFileSync(file, artifact)
      expect(cli('spec', 'check', file)).toMatchObject({ code: 0, value: { problems: [] } })
      expect(cli('spec', 'schema').value.specSchema.$id).toBe('wholeloop/spec@1')
      const begun = cli(
        'step',
        'begin',
        'write-spec',
        '--input',
        'Order search',
        '--owner',
        'Alex',
        '--impact',
        'Reduce retrieval time',
      )
      expect(begun.code).toBe(0)
      const id = begun.value.subject.id
      expect(cli('step', 'complete', 'write-spec', '--for', id, '--artifact', file).code).toBe(0)
      expect(cli('next', id).value.questions[0].id).toBe('decision.approve-spec')
      expect(
        cli('answer', 'decision.approve-spec=approved', '--for', id, '--by', 'Alex').code,
      ).toBe(0)
      expect(cli('step', 'plan', '--for', id).value.pending).toEqual([])
    }))
})
