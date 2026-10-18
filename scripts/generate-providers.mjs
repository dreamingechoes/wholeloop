import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'

// Bundle canonical resources so the published single-file CLI needs no source checkout.
const root = 'harness/providers'
const catalog = []
for (const name of (await readdir(root)).sort()) {
  const directory = join(root, name)
  const manifest = JSON.parse(await readFile(join(directory, 'provider.json'), 'utf8'))
  const guidance = {}
  for (const [operation, mapping] of Object.entries(manifest.operations))
    if (mapping.guidance)
      guidance[operation] = await readFile(join(directory, mapping.guidance), 'utf8')
  catalog.push({ manifest, guidance })
}
const output = `${JSON.stringify(catalog, null, 2)}\n`
const target = 'src/providers/catalog.json'
if (process.argv.includes('--check')) {
  if (!isDeepStrictEqual(JSON.parse(await readFile(target, 'utf8')), catalog)) {
    console.error('provider catalog drift; run node scripts/generate-providers.mjs')
    process.exitCode = 1
  }
} else await writeFile(target, output)
