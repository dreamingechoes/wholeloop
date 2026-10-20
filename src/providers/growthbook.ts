import { isObject } from '../config/schema.js'
import { measurementDigest } from '../launch/measurement.js'

const fail = (): never => {
  throw new Error('Incomplete or complex GrowthBook configuration; exposure remains unknown')
}
function booleanValue(value: unknown): boolean {
  if (typeof value !== 'string') return fail()
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    return fail()
  }
  return typeof parsed === 'boolean' ? parsed : fail()
}
const empty = (value: unknown) =>
  value === undefined || (Array.isArray(value) && value.length === 0)
function noCondition(value: unknown) {
  if (value === undefined || value === '') return true
  if (typeof value !== 'string') return false
  try {
    const parsed: unknown = JSON.parse(value)
    return isObject(parsed) && Object.keys(parsed).length === 0
  } catch {
    return false
  }
}
function includesProject(all: unknown, projects: unknown, project: string) {
  const unspecified = projects === undefined || (Array.isArray(projects) && projects.length === 0)
  const exact = Array.isArray(projects) && projects.length === 1 && projects[0] === project
  if (all === true) return unspecified
  if (all === false) return exact
  return all === undefined && (unspecified || exact)
}
/** Shift the canonical decimal rather than multiply binary floats: 0.29 must become 29, not 28.999... */
export function coveragePercentage(value: number, complement = false) {
  if (!Number.isFinite(value) || value < 0 || value > 1) return fail()
  const [mantissa = '', exponent = '0'] = String(value).split('e')
  const scale = (mantissa.split('.')[1]?.length ?? 0) - Number(exponent)
  const denominator = 10n ** BigInt(Math.max(0, scale))
  const numerator = BigInt(mantissa.replace('.', '')) * 10n ** BigInt(Math.max(0, -scale))
  const digits = complement ? denominator - numerator : numerator
  const result = Number(`${digits}e${2 - Math.max(0, scale)}`)
  if (value > 0 && value < 1 && (result === 0 || result === 100)) return fail()
  return result
}

/** Use the live per-environment fields/revision; drafts never become observed exposure. */
export function growthBookFlag(value: unknown, flag: string, environment: string, project: string) {
  if (
    !isObject(value) ||
    (value.status !== undefined && value.status !== 200) ||
    !isObject(value.feature)
  )
    return fail()
  const feature = value.feature
  if (
    feature.id !== flag ||
    feature.project !== project ||
    feature.archived !== false ||
    feature.valueType !== 'boolean' ||
    !isObject(feature.revision) ||
    !Number.isSafeInteger(feature.revision.version) ||
    Number(feature.revision.version) < 0 ||
    typeof feature.revision.date !== 'string' ||
    !Number.isFinite(Date.parse(feature.revision.date)) ||
    !empty(feature.prerequisites) ||
    (feature.holdout !== undefined && feature.holdout !== null) ||
    (feature.baseConfig !== undefined && feature.baseConfig !== null) ||
    (feature.defaultValueConfig !== undefined && feature.defaultValueConfig !== null) ||
    !includesProject(feature.targetingAllProjects, feature.targetingProjects, project) ||
    !isObject(feature.environments) ||
    !Object.hasOwn(feature.environments, environment)
  )
    return fail()
  booleanValue(feature.defaultValue)
  const selected = feature.environments[environment]
  if (
    !isObject(selected) ||
    typeof selected.enabled !== 'boolean' ||
    !Array.isArray(selected.rules) ||
    selected.rules.length > 1
  )
    return fail()
  const fallback = booleanValue(selected.defaultValue)
  let exposure = fallback ? 100 : 0,
    audience = 'all'
  let expected:
    | {
        force: boolean
        coverage?: number
        hashAttribute?: string
        seed?: string
        hashVersion?: number
      }
    | undefined
  if (selected.rules.length) {
    const rule = selected.rules[0]
    if (
      !isObject(rule) ||
      rule.enabled !== true ||
      typeof rule.id !== 'string' ||
      !rule.id ||
      rule.id.length > 128 ||
      !noCondition(rule.condition) ||
      !empty(rule.savedGroupTargeting) ||
      !empty(rule.prerequisites) ||
      !empty(rule.scheduleRules) ||
      !includesProject(rule.allProjects, rule.projects, project) ||
      rule.sparse === true ||
      (rule.scheduleType !== undefined && rule.scheduleType !== '') ||
      (rule.rampScheduleId !== undefined && rule.rampScheduleId !== '')
    )
      return fail()
    const forced = booleanValue(rule.value)
    if (rule.type === 'force') {
      exposure = forced ? 100 : 0
      expected = { force: forced }
    } else if (
      rule.type === 'rollout' &&
      typeof rule.coverage === 'number' &&
      rule.hashAttribute === 'id' &&
      (rule.seed === undefined ||
        (typeof rule.seed === 'string' && rule.seed.length > 0 && rule.seed.length <= 128)) &&
      (rule.hashVersion === undefined || rule.hashVersion === 1 || rule.hashVersion === 2)
    ) {
      const percentage = coveragePercentage(rule.coverage, fallback && !forced)
      exposure = forced === fallback ? (forced ? 100 : 0) : percentage
      // Missing IDs skip hashed rollouts and retain fallback. Do not label that cohort all contexts.
      audience = forced !== fallback && rule.coverage > 0 ? 'contexts with id' : 'all'
      expected = {
        force: forced,
        coverage: rule.coverage,
        hashAttribute: 'id',
        ...(typeof rule.seed === 'string' ? { seed: rule.seed } : {}),
        ...(typeof rule.hashVersion === 'number' ? { hashVersion: rule.hashVersion } : {}),
      }
    } else return fail()
  }
  let compiledDefinition: unknown
  if (selected.definition !== undefined) {
    if (typeof selected.definition !== 'string') return fail()
    let compiled: unknown
    try {
      compiled = JSON.parse(selected.definition)
    } catch {
      return fail()
    }
    if (
      !isObject(compiled) ||
      compiled.defaultValue !== fallback ||
      Object.keys(compiled).some((key) => !['defaultValue', 'rules'].includes(key))
    )
      return fail()
    compiledDefinition = compiled
    const rules = compiled.rules ?? []
    if (!Array.isArray(rules) || rules.length !== (expected ? 1 : 0)) return fail()
    if (expected) {
      const actual = rules[0]
      if (
        !isObject(actual) ||
        actual.force !== expected.force ||
        Object.keys(actual).some(
          (key) =>
            ![
              'force',
              'coverage',
              'hashAttribute',
              'hashVersion',
              'seed',
              'condition',
              'id',
            ].includes(key),
        ) ||
        (actual.condition !== undefined &&
          (!isObject(actual.condition) || Object.keys(actual.condition).length)) ||
        (actual.hashVersion !== undefined &&
          actual.hashVersion !== 1 &&
          actual.hashVersion !== 2) ||
        (actual.seed !== undefined &&
          (typeof actual.seed !== 'string' || !actual.seed || actual.seed.length > 128)) ||
        (expected.coverage === undefined
          ? actual.coverage !== undefined && actual.coverage !== null
          : actual.coverage !== expected.coverage) ||
        (expected.coverage !== undefined && (actual.hashAttribute ?? 'id') !== 'id') ||
        (expected.hashVersion !== undefined &&
          (actual.hashVersion ?? 1) !== expected.hashVersion) ||
        (expected.seed !== undefined && actual.seed !== expected.seed)
      )
        return fail()
    }
  }
  const observation = {
    flag,
    environment,
    enabled: selected.enabled,
    exposure: selected.enabled ? exposure : 0,
    audience: selected.enabled ? audience : 'all',
  }
  return {
    observation,
    revision: measurementDigest({
      observation,
      version: feature.revision.version,
      date: feature.revision.date,
      defaultValue: selected.defaultValue,
      rules: selected.rules,
      ...(compiledDefinition ? { compiledDefinition } : {}),
    }),
  }
}
