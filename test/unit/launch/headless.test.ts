// P4-01: on clients whose custom agents inherit user MCP servers (Codex), the launcher drafts in
// one isolated headless worker. A fake client stands in for the native one.
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { HeadlessAdapter } from '../../../src/fanout/adapters.js'
import { FlowEngine } from '../../../src/flow/engine.js'
import type { LaunchDraft } from '../../../src/launch/contracts.js'
import { draftHeadless, parseDraft } from '../../../src/launch/headless.js'
import type { MeasurementPlan } from '../../../src/launch/measurement.js'
import { LaunchWorkflow } from '../../../src/launch/workflow.js'
import { parseSpec } from '../../../src/spec/contract.js'
import { StateStore } from '../../../src/state/store.js'

const spec = readFileSync(new URL('../../fixtures/spec/spec.md', import.meta.url), 'utf8')
const measurement = (): MeasurementPlan => {
  const parsed = parseSpec(spec)
  return {
    schema: 'wholeloop/measurement-plan@1',
    impact: parsed.impact,
    metrics: parsed.metrics,
    rollout: parsed.rollout,
  }
}
const kit = (digest: string): LaunchDraft => ({
  schema: 'wholeloop/launch-kit@1',
  sourceDigest: digest,
  rolloutPlan: 'Pilot first; expand after the recorded exit criteria and human review.',
  comms: [
    { key: 'pilot-note', audience: 'Internal reviewers', stage: 'pilot', body: 'Draft: try it.' },
    { key: 'general-note', audience: 'Customers', stage: 'general', body: 'Draft: find orders.' },
  ],
  dashboards: [{ key: 'retrieval-chart', title: 'Order retrieval time', metric: 'retrieval-time' }],
  enablement: {
    supportGuide: 'Check the account identity.',
    onePager: 'Order search reduces paging.',
    runbook: 'A person owns rollback and flag changes.',
  },
})
// The fake client reads the assignment from stdin, records it, and answers like a model would.
const fake = (reply: 'fenced' | 'invalid', record: string): HeadlessAdapter => ({
  id: 'fake',
  invocation: () => ({
    command: process.execPath,
    args: [
      '-e',
      `let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{require('fs').writeFileSync(${JSON.stringify(record)},s);const a=JSON.parse(s);const k=${JSON.stringify(kit('DIGEST'))};k.sourceDigest=a.plan.source.digest;process.stdout.write(${JSON.stringify(reply)}==='fenced'?'\`\`\`json\\n'+JSON.stringify(k)+'\\n\`\`\`':'not json')})`,
    ],
  }),
  response: (stdout) => stdout,
})

async function fixture(run: (dir: string, workflow: LaunchWorkflow, subject: string) => unknown) {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-launch-headless-'))
  const root = join(dir, 'repo')
  mkdirSync(root)
  const engine = new FlowEngine(
    new StateStore(join(dir, 'state')),
    root,
    join(dir, 'user/config.yml'),
    join(dir, 'home'),
  )
  const workflow = new LaunchWorkflow(engine)
  const begun = workflow.begin({
    input: 'Order search launch',
    owner: 'Alex',
    measurement: measurement(),
  })
  if (begun.status !== 'planned') throw new Error('Expected launch plan')
  try {
    await run(dir, workflow, begun.subject)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('headless launch drafting', () => {
  it('drafts from the pinned context alone and stores it through the validated completion', () =>
    fixture(async (dir, workflow, subject) => {
      const record = join(dir, 'assignment.json')
      const result = await draftHeadless(workflow, subject, { adapter: fake('fenced', record) })
      expect(result).toMatchObject({ schema: 'wholeloop/launch-complete@1', subject })
      expect(result.workers).toEqual([
        expect.objectContaining({ adapter: 'fake', status: 'succeeded' }),
      ])
      const assignment = JSON.parse(readFileSync(record, 'utf8'))
      expect(assignment.schema).toBe('wholeloop/headless-launch-assignment@1')
      expect(assignment.instructions).toContain('Prepare a launch kit')
      expect(assignment.instructions).toContain('use network or MCP tools')
      expect(assignment.response.$id).toBe('wholeloop/launch-kit@1')
      // A second call reuses the immutable stored draft without another worker.
      expect(
        (await draftHeadless(workflow, subject, { adapter: fake('invalid', record) })).workers,
      ).toEqual([])
    }))

  it('records an invalid answer and stores no draft', () =>
    fixture(async (dir, workflow, subject) => {
      await expect(
        draftHeadless(workflow, subject, { adapter: fake('invalid', join(dir, 'a.json')) }),
      ).rejects.toThrow(/Headless launcher invalid; inspect launch\/.+\/worker\.json/)
      expect(workflow.context(subject).draft).toBeUndefined()
    }))

  it('accepts a bare object or one fenced block, nothing else', () => {
    const text = JSON.stringify(kit('a'.repeat(64)))
    expect(parseDraft(text).sourceDigest).toBe('a'.repeat(64))
    expect(parseDraft(`\`\`\`json\n${text}\n\`\`\``).schema).toBe('wholeloop/launch-kit@1')
    expect(() => parseDraft(`Here it is: ${text}`)).toThrow()
    expect(() => parseDraft('[]')).toThrow('not a launch kit object')
  })
})
