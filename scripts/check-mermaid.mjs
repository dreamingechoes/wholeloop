import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { JSDOM } from 'jsdom'
import { DIAGRAMS, sourceDigest, stamp } from './render-diagrams.mjs'

const { window } = new JSDOM('<!doctype html><html><body></body></html>')
Object.assign(globalThis, { window, document: window.document, DOMParser: window.DOMParser })
const { default: mermaid } = await import('mermaid')
mermaid.initialize({ startOnLoad: false })

const IGNORED = new Set(['.git', 'node_modules', 'dist', 'coverage', '.tmp'])
const root = process.cwd()
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (IGNORED.has(entry.name)) return []
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return walk(path)
    return entry.name.endsWith('.md') ? [path] : []
  })

let diagrams = 0
const failures = []
for (const file of walk(root)) {
  const text = readFileSync(file, 'utf8')
  for (const match of text.matchAll(/```mermaid\n([\s\S]*?)```/g)) {
    diagrams++
    try {
      await mermaid.parse(match[1])
    } catch (error) {
      const line = text.slice(0, match.index).split('\n').length
      failures.push(`${relative(root, file)}:${line}  ${String(error.message).split('\n')[0]}`)
    }
  }
}
// The README diagrams are rendered SVG, because npm does not run Mermaid. Their sources are parsed
// like any diagram, and each SVG must carry its source's digest, so an edited source whose SVG was
// not rendered again fails here without a browser in the gate.
for (const file of readdirSync(DIAGRAMS).filter((entry) => entry.endsWith('.mmd'))) {
  const source = join(DIAGRAMS, file)
  const text = readFileSync(source, 'utf8')
  diagrams++
  try {
    await mermaid.parse(text)
  } catch (error) {
    failures.push(`${source}  ${String(error.message).split('\n')[0]}`)
  }
  const name = file.slice(0, -4)
  const svg = join(DIAGRAMS, `${name}.svg`)
  if (!existsSync(svg) || !readFileSync(svg, 'utf8').startsWith(stamp(name, sourceDigest(text))))
    failures.push(`${svg}  missing or stale: run npm run docs:diagrams`)
}
for (const failure of failures) console.error(failure)
console.log(`mermaid: ${diagrams} diagrams parsed, ${failures.length} failure(s)`)
process.exitCode = failures.length === 0 ? 0 : 1
