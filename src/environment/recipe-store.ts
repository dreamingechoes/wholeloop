// Discovers and stores environment recipes; a filename is a candidate, never permission to run.
import { existsSync, realpathSync } from 'node:fs'
import { basename, join } from 'node:path'
import { isObject } from '../config/schema.js'
import { contractDigest } from '../contracts/compatibility.js'
import { readSourceFile, sourceHash } from '../delivery/input.js'
import { validateDeliveryShape } from '../delivery/plan.js'
import { StoreFiles } from '../state/files.js'
import { storePath } from '../state/paths.js'
import {
  DEFAULT_ENVIRONMENT_LIMITS,
  type EnvironmentFile,
  EnvironmentRecipeError,
  environmentPackage,
  environmentRelativeFile,
  observeEnvironmentFiles,
  validateEnvironmentRecipe,
} from './recipe.js'
import recordSchema from './schemas/recipe-record-v1.json' with { type: 'json' }

export const ENVIRONMENT_RECORD_SCHEMA = recordSchema
/** Discovery reads only a bounded named set; filenames are candidates, never permission to execute. */
export function discoverEnvironment(
  root: string,
  selected = ['package.json', 'Dockerfile', 'compose.yml', 'compose.yaml', 'AGENTS.md'],
) {
  if (
    selected.length > 64 ||
    new Set(selected).size !== selected.length ||
    selected.some((ref) => !environmentRelativeFile(ref))
  )
    throw new EnvironmentRecipeError('invalid-discovery-selection')
  const boundary = realpathSync(root)
  const candidates = selected.flatMap((ref) => {
    if (!existsSync(join(boundary, ref))) return []
    const text = readSourceFile(boundary, ref)
    const kind: EnvironmentFile['kind'] =
      basename(ref) === 'package.json'
        ? 'package'
        : /\.(?:[cm]?js|ts|sh|py)$/.test(ref)
          ? 'script'
          : 'guidance'
    const scripts = kind === 'package' ? environmentPackage(text).scripts : undefined
    if (
      scripts !== undefined &&
      (!isObject(scripts) ||
        Object.values(scripts).some((value) => typeof value !== 'string' || !value.trim()))
    )
      throw new EnvironmentRecipeError('invalid-package-scripts')
    return [
      {
        ref,
        kind,
        sha256: sourceHash(text),
        bytes: Buffer.byteLength(text),
        scripts: isObject(scripts) ? Object.keys(scripts).sort() : [],
      },
    ]
  })
  if (candidates.reduce((sum, file) => sum + file.bytes, 0) > 8 * 1024 * 1024)
    throw new EnvironmentRecipeError('discovery-byte-limit')
  return {
    schema: 'wholeloop/environment-discovery@1',
    root: boundary,
    candidates,
    defaults: { ...DEFAULT_ENVIRONMENT_LIMITS },
    executed: false,
    authority: 'not-granted',
  }
}

export class EnvironmentRecipes {
  readonly files: StoreFiles
  constructor(store = storePath()) {
    this.files = new StoreFiles(store)
  }
  prepare(value: unknown) {
    const recipe = validateEnvironmentRecipe(value)
    const files = observeEnvironmentFiles(recipe)
    if (files.reduce((sum, file) => sum + file.bytes, 0) > 8 * 1024 * 1024)
      throw new EnvironmentRecipeError('selected-byte-limit')
    const digest = contractDigest(recipe)
    const record = { schema: 'wholeloop/environment-recipe-record@1', digest, recipe, files }
    validateDeliveryShape(record, recordSchema)
    return this.files.locked(() => {
      for (const file of files) {
        const repository = recipe.repositories.find((repo) => repo.id === file.repository)
        if (!repository) throw new EnvironmentRecipeError('missing-source-repository')
        const text = readSourceFile(repository.root, file.ref)
        if (sourceHash(text) !== file.sha256)
          throw new EnvironmentRecipeError('changed-source-file')
        const blob = `delivery/environment-inputs/${file.sha256}.txt`
        if (!existsSync(this.files.path(blob))) this.files.atomic(blob, text)
        else if (sourceHash(readSourceFile(this.files.root, blob)) !== file.sha256)
          throw new EnvironmentRecipeError('damaged-selected-input')
      }
      const path = this.path(digest)
      if (!existsSync(this.files.path(path))) this.files.atomic(path, `${JSON.stringify(record)}\n`)
      return this.get(digest)
    })
  }
  get(digest: string) {
    let value: unknown
    try {
      value = JSON.parse(readSourceFile(this.files.root, this.path(digest), 8 * 1024 * 1024))
      validateDeliveryShape(value, recordSchema)
    } catch {
      throw new EnvironmentRecipeError('missing-or-damaged-recipe')
    }
    const record = value as {
      schema: string
      digest: string
      recipe: ReturnType<typeof validateEnvironmentRecipe>
      files: (EnvironmentFile & { bytes: number })[]
    }
    const recipe = validateEnvironmentRecipe(record.recipe)
    if (
      record.digest !== digest ||
      contractDigest(recipe) !== digest ||
      contractDigest(record.files.map(({ bytes: _bytes, ...file }) => file)) !==
        contractDigest(recipe.files)
    )
      throw new EnvironmentRecipeError('damaged-recipe-identity')
    for (const file of record.files) {
      const text = readSourceFile(this.files.root, `delivery/environment-inputs/${file.sha256}.txt`)
      if (sourceHash(text) !== file.sha256 || Buffer.byteLength(text) !== file.bytes)
        throw new EnvironmentRecipeError('damaged-selected-input')
    }
    return {
      schema: 'wholeloop/environment-recipe-prepared@1',
      digest,
      recipe,
      files: record.files,
      executed: false,
      readiness: 'not-observed',
      authority: 'not-granted',
    }
  }
  inspect(digest: string) {
    const receipt = this.get(digest)
    let inputs: 'current' | 'changed-or-unavailable' = 'current'
    try {
      observeEnvironmentFiles(receipt.recipe)
    } catch {
      inputs = 'changed-or-unavailable'
    }
    return { ...receipt, schema: 'wholeloop/environment-recipe-inspection@1', inputs }
  }
  private path(digest: string) {
    if (!/^[a-f0-9]{64}$/.test(digest)) throw new EnvironmentRecipeError('invalid-recipe-id')
    return `delivery/environment-recipes/${digest}.json`
  }
}
