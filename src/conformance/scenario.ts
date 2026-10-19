import { artifactDigest } from '../adapters/generate.js'
import { isObject } from '../config/schema.js'
import { checkShape } from '../flow/registry.js'
import { checkFrame, FRAME_SECTIONS } from '../framing/contract.js'
import type { Scenario } from './contracts.js'

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
  return { scenario, digest: artifactDigest(content) }
}
