// Parses conformance observations for the compatibility matrix.
import { isObject } from '../config/schema.js'
import { CONFORMANCE_ID, CONFORMANCE_TARGETS } from './contracts.js'

export const MATRIX_CHANNELS = ['pinned', 'latest'] as const
const hash = /^[a-f0-9]{64}$/
const version = /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/
const token = /^[a-z0-9][a-z0-9:._/-]{0,127}$/
type Channel = (typeof MATRIX_CHANNELS)[number]
interface Observation {
  channel: Channel
  observedAt: string
  id: string
  cli: string
  pin: string
  version: string | null
  status: 'UNRUN' | 'FIXTURE_PASS' | 'PASS' | 'FAIL'
  evidence: 'unrun' | 'simulation' | 'live-process-and-journal'
  core: string
  source: string
  scenario: string
  scenarioDigest: string
  assertions: string[]
  processSucceeded: boolean
}
export function matrixTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  )
}
function codes(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 64 &&
    value.every((entry) => typeof entry === 'string' && token.test(entry))
  )
}
export function matrixObservation(value: unknown): Observation {
  const fail = () => {
    throw new Error('Invalid bounded conformance observation; contents omitted')
  }
  if (
    !isObject(value) ||
    !MATRIX_CHANNELS.includes(value.channel as Channel) ||
    !matrixTimestamp(value.observedAt) ||
    !isObject(value.report)
  )
    return fail()
  const report = value.report
  if (
    report.schema !== 'wholeloop/conformance-report@1' ||
    typeof report.id !== 'string' ||
    !CONFORMANCE_ID.test(report.id) ||
    !CONFORMANCE_TARGETS.includes(report.cli as (typeof CONFORMANCE_TARGETS)[number]) ||
    typeof report.pin !== 'string' ||
    report.pin.length > 128 ||
    !version.test(report.pin) ||
    report.step !== 'frame-problem' ||
    report.scenario !== 'standalone-frame-v1' ||
    !['core', 'source', 'scenarioDigest'].every(
      (key) => typeof report[key] === 'string' && hash.test(report[key] as string),
    ) ||
    !['UNRUN', 'FIXTURE_PASS', 'PASS', 'FAIL'].includes(String(report.status)) ||
    !['unrun', 'simulation', 'live-process-and-journal'].includes(String(report.evidence)) ||
    !codes(report.missing) ||
    !codes(report.problems)
  )
    return fail()
  const process = report.process
  if (
    process !== undefined &&
    (!isObject(process) ||
      !['succeeded', 'crashed', 'timeout', 'cancelled', 'overflow'].includes(
        String(process.status),
      ) ||
      !(
        process.code === null ||
        (Number.isInteger(process.code) && Number(process.code) >= 0 && Number(process.code) <= 255)
      ) ||
      !(
        process.signal === null ||
        (typeof process.signal === 'string' && /^SIG[A-Z0-9]{1,16}$/.test(process.signal))
      ) ||
      !(
        process.version === undefined ||
        (typeof process.version === 'string' &&
          process.version.length <= 128 &&
          version.test(process.version))
      ))
  )
    return fail()
  const processSucceeded =
    isObject(process) &&
    process.status === 'succeeded' &&
    process.code === 0 &&
    process.signal === null
  const assertions = [...new Set([...report.missing, ...report.problems])].sort()
  if (
    (report.status === 'UNRUN') !== (report.evidence === 'unrun') ||
    (report.status === 'FIXTURE_PASS' && report.evidence !== 'simulation') ||
    (report.status === 'PASS' && report.evidence !== 'live-process-and-journal') ||
    (['PASS', 'FIXTURE_PASS'].includes(String(report.status)) &&
      (!processSucceeded ||
        assertions.length ||
        typeof report.subject !== 'string' ||
        !/^init-[a-f0-9]{8}$/.test(report.subject))) ||
    (report.status === 'PASS' && (!isObject(process) || process.version !== report.pin)) ||
    (report.status === 'FAIL' && !assertions.length)
  )
    return fail()
  return {
    channel: value.channel as Channel,
    observedAt: value.observedAt,
    id: report.id,
    cli: String(report.cli),
    pin: report.pin,
    version: isObject(process) && typeof process.version === 'string' ? process.version : null,
    status: report.status as Observation['status'],
    evidence: report.evidence as Observation['evidence'],
    core: String(report.core),
    source: String(report.source),
    scenario: String(report.scenario),
    scenarioDigest: String(report.scenarioDigest),
    assertions,
    processSucceeded,
  }
}
