import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'

const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const printed = execFileSync(process.execPath, ['dist/wl.mjs', '--version'], {
  encoding: 'utf8',
}).trim()

if (printed !== version) {
  console.error(`smoke: expected '${version}', got '${printed}'`)
  process.exit(1)
}
console.log(`smoke: dist/wl.mjs --version → ${printed}`)
