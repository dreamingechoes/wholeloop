import { isObject } from '../config/schema.js'
import { measurementDigest } from '../launch/measurement.js'

const fail = (): never => {
  throw new Error('Incomplete or complex PostHog configuration; exposure remains unknown')
}

/** The key filter is case-insensitive. Require one complete exact match, never follow next URLs. */
export function postHogFlagId(value: unknown, flag: string): number {
  if (
    !isObject(value) ||
    value.count !== 1 ||
    value.next !== null ||
    value.previous !== null ||
    !Array.isArray(value.results) ||
    value.results.length !== 1
  )
    return fail()
  const entry = value.results[0]
  if (
    !isObject(entry) ||
    entry.key !== flag ||
    !Number.isSafeInteger(entry.id) ||
    Number(entry.id) < 1
  )
    return fail()
  return Number(entry.id)
}

/** Project-to-environment scope is supplied by the owner, not observed from this API. */
export function postHogFlag(value: unknown, flag: string, environment: string, project: string) {
  if (
    !isObject(value) ||
    value.key !== flag ||
    !Number.isSafeInteger(value.id) ||
    Number(value.id) < 1 ||
    typeof value.active !== 'boolean' ||
    value.deleted !== false ||
    value.archived !== false ||
    !Number.isSafeInteger(value.version) ||
    Number(value.version) < 1 ||
    ![false, null].includes(value.ensure_experience_continuity as false | null) ||
    ![false, null].includes(value.is_remote_configuration as false | null) ||
    value.evaluation_runtime !== 'all' ||
    value.bucketing_identifier !== 'distinct_id' ||
    !Array.isArray(value.evaluation_contexts) ||
    value.evaluation_contexts.length ||
    !Array.isArray(value.experiment_set) ||
    value.experiment_set.length ||
    !isObject(value.filters)
  )
    return fail()
  const filters = value.filters
  if (
    Object.keys(filters).some(
      (key) =>
        ![
          'groups',
          'multivariate',
          'aggregation_group_type_index',
          'payloads',
          'feature_enrollment',
          'holdout',
          'early_exit',
        ].includes(key),
    ) ||
    !Array.isArray(filters.groups) ||
    filters.groups.length !== 1 ||
    (filters.multivariate !== undefined && filters.multivariate !== null) ||
    (filters.aggregation_group_type_index !== undefined &&
      filters.aggregation_group_type_index !== null) ||
    (filters.feature_enrollment !== undefined &&
      filters.feature_enrollment !== false &&
      filters.feature_enrollment !== null) ||
    (filters.holdout !== undefined && filters.holdout !== null) ||
    (filters.early_exit !== undefined &&
      filters.early_exit !== false &&
      filters.early_exit !== true &&
      filters.early_exit !== null)
  )
    return fail()
  const group = filters.groups[0]
  if (
    !isObject(group) ||
    Object.keys(group).some(
      (key) =>
        ![
          'properties',
          'rollout_percentage',
          'variant',
          'aggregation_group_type_index',
          'description',
          'sort_key',
        ].includes(key),
    ) ||
    !Array.isArray(group.properties) ||
    group.properties.length ||
    typeof group.rollout_percentage !== 'number' ||
    !Number.isFinite(group.rollout_percentage) ||
    group.rollout_percentage < 0 ||
    group.rollout_percentage > 100 ||
    (group.variant !== undefined && group.variant !== null && group.variant !== '') ||
    (group.aggregation_group_type_index !== undefined &&
      group.aggregation_group_type_index !== null)
  )
    return fail()
  const observation = {
    flag,
    environment,
    enabled: value.active,
    exposure: value.active ? group.rollout_percentage : 0,
    audience: 'persons with distinct_id',
    project,
    environmentBasis: 'configured-project-mapping',
  }
  return {
    observation,
    revision: measurementDigest({ observation, id: value.id, version: value.version, filters }),
  }
}
