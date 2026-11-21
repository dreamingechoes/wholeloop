// Writes an explicitly requested setting; runtime state is never written here.
import { randomUUID } from 'node:crypto'
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname } from 'node:path'
import { stringify } from 'yaml'
import { readConfig } from './load.js'
import { isObject, validate } from './schema.js'

/** An explicit settings action may write configuration; it never writes runtime state. */
export function writeSettings(
  file: string,
  changes: readonly { path: readonly string[]; value: unknown }[],
): void {
  const loaded = readConfig(file, true)
  const existing = loaded ?? { version: 1 }
  if (!isObject(existing)) throw new Error(`Invalid configuration: ${file}`)
  const previous = JSON.stringify(existing)
  for (const { path, value } of changes) {
    if (!path.length) throw new Error('A configuration setting needs a key path')
    let target = existing
    for (const [index, key] of path.entries()) {
      if (['__proto__', 'constructor', 'prototype'].includes(key))
        throw new Error('Forbidden configuration key')
      if (index === path.length - 1) {
        target[key] = value
        break
      }
      if (!isObject(target[key])) target[key] = {}
      target = target[key] as Record<string, unknown>
    }
  }
  const problems = validate(existing, undefined, file)
  if (problems.length) throw new Error(problems.join('\n'))
  // Repeating an explicit choice must not rewrite unchanged configuration.
  if (loaded !== undefined && JSON.stringify(existing) === previous) return
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  const temporary = `${file}.${randomUUID()}.tmp`
  try {
    const fd = openSync(temporary, 'wx', 0o600)
    try {
      writeFileSync(fd, stringify(existing))
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    renameSync(temporary, file)
  } finally {
    rmSync(temporary, { force: true })
  }
}

export function writeSetting(file: string, path: readonly string[], value: unknown): void {
  writeSettings(file, [{ path, value }])
}
