import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'
import { parse } from 'yaml'
import { loadCatalog } from '../extensions/catalog.js'
import { profileAdapter } from '../extensions/kinds.js'
import { type Configuration, type Layer, resolveConfig } from './resolve.js'
import { isObject } from './schema.js'

export function readConfig(file: string, optional = false): unknown {
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch (error) {
    if (optional && (error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
  const values: unknown = parse(text)
  if (!isObject(values) || values.version !== 1) throw new Error(`${file}.version: expected 1`)
  return values
}

export function userConfigPath(env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  const base = env.XDG_CONFIG_HOME
  return join(base && isAbsolute(base) ? base : join(home, '.config'), 'wholeloop', 'config.yml')
}

export interface LoadOptions {
  root: string
  userFile?: string
  initiativeFile?: string
  runFile?: string
}

function configLayers(options: LoadOptions): Layer[] {
  const files = [
    { scope: 'user', file: options.userFile ?? userConfigPath(), optional: true },
    { scope: 'project', file: join(options.root, '.wholeloop/config.yml'), optional: true },
    ...(options.initiativeFile
      ? [{ scope: 'initiative' as const, file: options.initiativeFile, optional: false }]
      : []),
    ...(options.runFile ? [{ scope: 'run' as const, file: options.runFile, optional: false }] : []),
  ] as const
  const layers: Layer[] = []
  for (const entry of files) {
    const values = readConfig(entry.file, entry.optional)
    if (values !== undefined) layers.push({ scope: entry.scope, file: entry.file, values })
  }
  return layers
}

function extensionOptions(options: LoadOptions, layers: readonly Layer[]) {
  // Resolve package selection without requiring profiles that those packages supply.
  const bootstrap = resolveConfig(
    layers.map((layer) => ({
      ...layer,
      values: isObject(layer.values)
        ? Object.fromEntries(Object.entries(layer.values).filter(([key]) => key !== 'profile'))
        : layer.values,
    })),
  )
  return {
    root: options.root,
    user: dirname(options.userFile ?? userConfigPath()),
    packages: bootstrap.values.extensions as string[],
  }
}

export function loadExtensionOptions(options: LoadOptions) {
  return extensionOptions(options, configLayers(options))
}

export function loadConfig(
  options: LoadOptions,
): Configuration & { presets: Record<string, Record<string, string>> } {
  const layers = configLayers(options)
  const catalog = loadCatalog(profileAdapter, extensionOptions(options, layers))
  if (catalog.problems.length)
    throw new Error(catalog.problems.map(({ file, message }) => `${file}: ${message}`).join('\n'))
  const presets = Object.fromEntries(
    catalog.entries.map(({ manifest }) => [manifest.id, manifest.dials]),
  )
  return { ...resolveConfig(layers, presets), presets }
}
