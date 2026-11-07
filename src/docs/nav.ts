// Parses docs/nav.yml and renders the generated docnav footers.
import { posix } from 'node:path'
import { parse } from 'yaml'

export const DOCNAV_MARKER = '<!-- docnav -->'

export interface NavPage {
  path: string
  title: string
}

export interface Nav {
  home: string
  concepts: string
  pages: NavPage[]
}

export function parseNav(yamlText: string): Nav {
  const raw = parse(yamlText) as Partial<Nav> | null
  if (!raw?.home || !raw.concepts || !Array.isArray(raw.pages)) {
    throw new Error('docs/nav.yml must define home, concepts and a pages list')
  }
  for (const page of raw.pages) {
    if (typeof page?.path !== 'string' || typeof page?.title !== 'string') {
      throw new Error('every entry in docs/nav.yml needs a path and a title')
    }
    const extra = Object.keys(page).filter((key) => key !== 'path' && key !== 'title')
    if (extra.length > 0) {
      throw new Error(
        `docs/nav.yml entry ${page.path} has unexpected keys (${extra.join(', ')}) — quote titles containing commas`,
      )
    }
  }
  return { home: raw.home, concepts: raw.concepts, pages: raw.pages }
}

function relative(from: string, to: string): string {
  return posix.relative(posix.dirname(from), to) || posix.basename(to)
}

export function renderFooter(nav: Nav, index: number): string {
  const page = nav.pages[index]
  if (!page) throw new Error(`no page at index ${index}`)
  const previous = nav.pages[index - 1]
  const next = nav.pages[index + 1]
  const neighbours = [previous?.path, next?.path]
  const parts: string[] = []
  if (previous) parts.push(`[◀ ${previous.title}](${relative(page.path, previous.path)})`)
  if (page.path !== nav.home) parts.push(`[📖 Docs index](${relative(page.path, nav.home)})`)
  if (page.path !== nav.concepts && !neighbours.includes(nav.concepts)) {
    parts.push(`[🧭 Concepts](${relative(page.path, nav.concepts)})`)
  }
  if (next) parts.push(`[${next.title} ▶](${relative(page.path, next.path)})`)
  return `${DOCNAV_MARKER}\n${parts.join('  ·  ')}\n`
}

export function withFooter(content: string, footer: string): string | undefined {
  const at = content.indexOf(DOCNAV_MARKER)
  return at === -1 ? undefined : content.slice(0, at) + footer
}
