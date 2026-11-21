// Adds explicit bounded stdin without changing legacy file readers or treating data as authority.
import { fstatSync, readFileSync, readSync } from 'node:fs'
import { CliError } from './errors.js'

export function hasJsonInput(options: Readonly<Record<string, unknown>>): boolean {
  return options['--stdin'] === true || typeof options['--file'] === 'string'
}

export function jsonInput(
  options: Readonly<Record<string, unknown>>,
  settings: { limit?: number; readFile?: (file: string) => string } = {},
): unknown {
  const piped = options['--stdin'] === true,
    file = options['--file']
  if (piped === (typeof file === 'string'))
    throw new CliError('Provide exactly one of --stdin or --file <non-secret-json>')
  let text: string
  if (!piped) text = (settings.readFile ?? ((path) => readFileSync(path, 'utf8')))(String(file))
  else {
    const limit = settings.limit ?? 1024 * 1024
    if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('Invalid standard-input limit')
    if (fstatSync(0).isCharacterDevice()) throw new CliError('Pipe non-secret JSON to --stdin')
    const chunks: Buffer[] = []
    let length = 0
    for (;;) {
      const chunk = Buffer.alloc(Math.min(65536, limit - length + 1)),
        count = readSync(0, chunk, 0, chunk.length, null)
      if (!count) break
      length += count
      if (length > limit)
        throw new CliError(`Standard input exceeds ${limit} bytes; contents omitted`)
      chunks.push(chunk.subarray(0, count))
    }
    text = Buffer.concat(chunks, length).toString('utf8')
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new CliError('Provide valid non-secret JSON; contents omitted')
  }
}
