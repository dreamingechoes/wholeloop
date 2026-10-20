import { isObject } from '../config/schema.js'
import { measurementDigest } from '../launch/measurement.js'

/** An unrestricted strategy has one scalar configured rollout; dependent/targeted flags do not. */
export function unleashFlag(value: unknown, flag: string, environment: string, project: string) {
  const fail = (): never => {
    throw new Error('Incomplete or complex Unleash configuration; exposure remains unknown')
  }
  if (
    !isObject(value) ||
    value.name !== flag ||
    value.project !== project ||
    value.archived !== false ||
    !Array.isArray(value.dependencies) ||
    value.dependencies.length ||
    !Array.isArray(value.environments)
  )
    return fail()
  const matches = value.environments.filter(
    (entry) => isObject(entry) && entry.name === environment,
  )
  const selected = matches[0]
  if (
    matches.length !== 1 ||
    !isObject(selected) ||
    typeof selected.enabled !== 'boolean' ||
    (selected.featureName !== undefined && selected.featureName !== flag) ||
    !Array.isArray(selected.variants) ||
    selected.variants.length ||
    !Array.isArray(selected.strategies) ||
    selected.strategies.length !== 1 ||
    ['releasePlans', 'safeguards'].some(
      (key) =>
        selected[key] !== undefined && (!Array.isArray(selected[key]) || selected[key].length),
    )
  )
    return fail()
  const strategy = selected.strategies[0]
  if (
    !isObject(strategy) ||
    strategy.disabled === true ||
    (strategy.disabled !== undefined && typeof strategy.disabled !== 'boolean') ||
    (strategy.featureName !== undefined && strategy.featureName !== flag) ||
    !['constraints', 'segments', 'variants'].every(
      (key) => Array.isArray(strategy[key]) && strategy[key].length === 0,
    ) ||
    !isObject(strategy.parameters)
  )
    return fail()
  let exposure: number
  if (strategy.name === 'default' && Object.keys(strategy.parameters).length === 0) exposure = 100
  else if (
    strategy.name === 'flexibleRollout' &&
    Object.keys(strategy.parameters).every((key) =>
      ['rollout', 'stickiness', 'groupId'].includes(key),
    ) &&
    typeof strategy.parameters.rollout === 'string' &&
    /^(?:100|[1-9]?[0-9])$/.test(strategy.parameters.rollout) &&
    strategy.parameters.stickiness === 'default' &&
    typeof strategy.parameters.groupId === 'string' &&
    strategy.parameters.groupId.length > 0 &&
    strategy.parameters.groupId.length <= 128
  )
    exposure = Number(strategy.parameters.rollout)
  else return fail()
  const observation = {
    flag,
    environment,
    enabled: selected.enabled,
    exposure: selected.enabled ? exposure : 0,
    audience: 'all',
  }
  return { observation, revision: measurementDigest({ observation, strategy }) }
}
