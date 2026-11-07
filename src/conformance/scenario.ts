// The bundled fictional conformance scenario.
import { artifactDigest } from '../adapters/generate.js'
import { isObject, validate } from '../config/schema.js'
import { checkShape } from '../flow/registry.js'
import { checkFrame, FRAME_SECTIONS } from '../framing/contract.js'
import { frameDecision, renderFrameDecision } from '../framing/finalize.js'
import type { Scenario } from './contracts.js'
import approvalSchema from './schemas/frame-approval-v1.json' with { type: 'json' }

/** This declaration belongs only to the bundled fictional scenario, not a runtime approval API. */
function scriptedApproval(canonical: ReadonlyMap<string, string>, scenario: Scenario) {
  const content = canonical.get('harness/conformance/frame-approval.json')
  if (!content || Buffer.byteLength(content) > 65536)
    throw new Error('A bounded scripted framing approval declaration is required')
  try {
    const value: unknown = JSON.parse(content)
    if (validate(value, approvalSchema).length) throw new Error()
    const approval = value as Scenario['approval']
    const decision = frameDecision(approval.decision)
    const artifact = renderFrameDecision(scenario.artifact, decision)
    if (
      decision.by !== scenario.owner ||
      decision.outcome !== 'go' ||
      approval.sha256 !== artifactDigest(artifact)
    )
      throw new Error()
    return { approval: { ...approval, decision }, artifact, content }
  } catch {
    throw new Error('Invalid scripted framing approval or exact artifact digest; contents omitted')
  }
}

export function conformanceScenario(canonical: ReadonlyMap<string, string>) {
  const content = canonical.get('harness/conformance/standalone-frame.json')
  if (!content || Buffer.byteLength(content) > 65536)
    throw new Error('A bounded bundled standalone framing scenario is required')
  let value: unknown
  try {
    value = JSON.parse(content)
  } catch {
    throw new Error('Invalid conformance scenario JSON; contents omitted')
  }
  if (
    !isObject(value) ||
    value.schema !== 'wholeloop/conformance-scenario@1' ||
    value.id !== 'standalone-frame-v1' ||
    value.step !== 'frame-problem' ||
    typeof value.input !== 'string' ||
    !value.input.trim() ||
    typeof value.owner !== 'string' ||
    !value.owner.trim() ||
    !Array.isArray(value.facts) ||
    value.facts.some((fact) => typeof fact !== 'string' || !fact.trim()) ||
    typeof value.readme !== 'string' ||
    typeof value.artifact !== 'string'
  )
    throw new Error('Invalid standalone conformance scenario')
  const scenario = value as unknown as Scenario
  if ([...checkShape(scenario.artifact, FRAME_SECTIONS), ...checkFrame(scenario.artifact)].length)
    throw new Error('The synthetic framing artifact must satisfy the real step shape')
  const scripted = scriptedApproval(canonical, scenario)
  return {
    scenario: { ...scenario, artifact: scripted.artifact, approval: scripted.approval },
    digest: artifactDigest(JSON.stringify([content, scripted.content])),
  }
}
