import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { isObject } from '../config/schema.js'

export const MANIFEST_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function mergeManifest(
  base: Record<string, unknown>,
  extension: Record<string, unknown>,
): Record<string, unknown> {
  const result = structuredClone(base)
  for (const [key, value] of Object.entries(extension)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key))
      throw new Error('Forbidden manifest key')
    result[key] =
      isObject(result[key]) && isObject(value)
        ? mergeManifest(result[key], value)
        : structuredClone(value)
  }
  return result
}

/** npm chooses versions; the harness only reads already-installed manifests. */
export function installedPackageRoot(root: string, spec: string): string {
  const name =
    /^(@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)(?:@[^\s]+)?$/.exec(
      spec,
    )?.[1]
  if (!name)
    throw new Error('Expected an installed npm package name with an optional version range')
  const require = createRequire(join(resolve(root), 'package.json'))
  try {
    return dirname(require.resolve(`${name}/package.json`))
  } catch {
    throw new Error(`Install ${name} with npm first; package code is never executed`)
  }
}
