import { describe, expect, it } from 'vitest'
import { bundledCanonical } from '../../../src/adapters/canonical.js'
import { conformanceScenario } from '../../../src/conformance/scenario.js'
import { frameDigest, renderFrameDecision } from '../../../src/framing/finalize.js'

const declaration = 'harness/conformance/frame-approval.json'
const source = 'harness/conformance/standalone-frame.json'

describe('scripted fictional framing approval', () => {
  it('binds the final exact rendered bytes and explicitly fictional go without inventing a reviewer', () => {
    const canonical = bundledCanonical()
    const { scenario } = conformanceScenario(canonical)
    expect(scenario.approval).toMatchObject({
      schema: 'wholeloop/conformance-frame-approval@1',
      scripted: true,
      decision: { by: scenario.owner, outcome: 'go' },
      sha256: frameDigest(scenario.artifact),
    })
    expect(renderFrameDecision(scenario.artifact, scenario.approval.decision)).toBe(
      scenario.artifact,
    )
    expect(scenario.artifact).toContain('not product validation')
    expect(scenario.artifact).toContain('TBD: support evidence; who: support lead')
    expect(scenario.approval).not.toHaveProperty('reviewer')
    expect(canonical.get(source)).not.toContain('Approved stop conditions')
  })

  it.each([
    'absent',
    'invalid-json',
    'oversized',
    'not-scripted',
    'other-scenario',
    'other-owner',
    'non-go',
    'missing-reason',
    'unknown-decision-field',
    'unknown-declaration-field',
    'stale-digest',
    'changed-final-bytes',
  ])('refuses %s declarations without copying their contents into errors', (kind) => {
    const canonical = new Map(bundledCanonical())
    const approval = JSON.parse(canonical.get(declaration) ?? '')
    if (kind === 'absent') canonical.delete(declaration)
    else if (kind === 'invalid-json') canonical.set(declaration, 'private-fixture-detail')
    else if (kind === 'oversized') canonical.set(declaration, ' '.repeat(65537))
    else {
      if (kind === 'not-scripted') approval.scripted = false
      if (kind === 'other-scenario') approval.scenario = 'real-work'
      if (kind === 'other-owner') approval.decision.by = 'Real Person'
      if (kind === 'non-go') approval.decision.outcome = 'dropped'
      if (kind === 'missing-reason') delete approval.decision.reason
      if (kind === 'unknown-decision-field') approval.decision.private = 'private-fixture-detail'
      if (kind === 'unknown-declaration-field') approval.private = 'private-fixture-detail'
      if (kind === 'stale-digest') approval.sha256 = 'f'.repeat(64)
      if (kind === 'changed-final-bytes') {
        const scenario = JSON.parse(canonical.get(source) ?? '')
        scenario.artifact += '\nChanged after scripted approval.\n'
        canonical.set(source, JSON.stringify(scenario))
      }
      canonical.set(declaration, JSON.stringify(approval))
    }
    expect(() => conformanceScenario(canonical)).toThrow(/scripted framing approval/)
    try {
      conformanceScenario(canonical)
    } catch (error) {
      expect(String(error)).not.toContain('private-fixture-detail')
    }
  })

  it('binds both source inputs so a changed declaration cannot reuse an old prepared run', () => {
    const canonical = new Map(bundledCanonical())
    const before = conformanceScenario(canonical)
    canonical.set(declaration, `${canonical.get(declaration)}\n`)
    const changedApproval = conformanceScenario(canonical)
    expect(changedApproval.scenario).toEqual(before.scenario)
    expect(changedApproval.digest).not.toBe(before.digest)
    canonical.set(source, `${canonical.get(source)}\n`)
    expect(conformanceScenario(canonical).digest).not.toBe(changedApproval.digest)
  })
})
