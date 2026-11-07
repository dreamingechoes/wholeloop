// Conformance targets, scenarios and report contracts.
import type { ProcessResult } from '../fanout/process.js'
import type { FrameDecision } from '../framing/finalize.js'

export const CONFORMANCE_TARGETS = [
  'claude',
  'codex',
  'opencode',
  'copilot',
  'gemini',
  'antigravity',
  'cursor',
] as const
export const CONFORMANCE_ID = /^cf-[a-f0-9]{24}$/
export interface Scenario {
  schema: 'wholeloop/conformance-scenario@1'
  id: string
  step: 'frame-problem'
  input: string
  owner: string
  facts: string[]
  readme: string
  artifact: string
  /** A fictional fixture actor's declaration, never a real person's product approval. */
  approval: {
    schema: 'wholeloop/conformance-frame-approval@1'
    scenario: 'standalone-frame-v1'
    scripted: true
    sha256: string
    decision: FrameDecision
  }
}
export interface PreparedConformance {
  schema: 'wholeloop/conformance-run@1'
  id: string
  target: string
  pin: string
  scenario: string
  scenarioDigest: string
  source: string
  core: string
  version: string
  root: string
  state: string
  home: string
  marker: string
  baseline: string
  launcher: string
  skill: string
  artifact: string
  phase: 'prepared' | 'running' | 'finished'
  mode?: 'fixture' | 'live'
  process?: ConformanceProcess
  problem?: string
}
export interface ConformanceContext {
  store: string
  canonical: ReadonlyMap<string, string>
  core: string
  version: string
}
export interface ConformanceProcess {
  status: ProcessResult['status']
  code: number | null
  signal: NodeJS.Signals | null
  version?: string
}
export interface ConformanceReport {
  schema: 'wholeloop/conformance-report@1'
  id: string
  cli: string
  pin: string
  step: 'frame-problem'
  evidence: 'unrun' | 'simulation' | 'live-process-and-journal'
  status: 'UNRUN' | 'FIXTURE_PASS' | 'PASS' | 'FAIL'
  missing: string[]
  problems: string[]
  subject?: string
  process?: ConformanceProcess
  scenario: string
  core: string
  limitations: string[]
  scenarioDigest: string
  source: string
}
