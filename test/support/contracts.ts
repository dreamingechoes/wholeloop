import { readdirSync, readFileSync } from 'node:fs'

/** Include malformed declarations too: filtering on existing metadata would hide missing identities. */
export function sourceSchemas(directory = 'src'): { file: string; schema: unknown }[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const file = `${directory}/${entry.name}`
      if (entry.isDirectory()) return sourceSchemas(file)
      return entry.isFile() && /\/(?:schemas\/[^/]+|schema)\.json$/.test(file)
        ? [{ file, schema: JSON.parse(readFileSync(file, 'utf8')) as unknown }]
        : []
    })
    .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
}
