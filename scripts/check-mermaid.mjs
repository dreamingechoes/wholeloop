import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { JSDOM } from 'jsdom'

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
for (const failure of failures) console.error(failure)
console.log(`mermaid: ${diagrams} diagrams parsed, ${failures.length} failure(s)`)
process.exitCode = failures.length === 0 ? 0 : 1
