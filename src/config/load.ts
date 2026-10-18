import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { parse } from 'yaml'
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

export function loadConfig(options: LoadOptions): Configuration {
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
  return resolveConfig(layers)
}
