// Minimal Markdown helpers for links, anchors and code spans.
import GithubSlugger from 'github-slugger'

export interface Link {
  target: string
  line: number
}

const FENCE = /^\s*(```|~~~)/

export function stripCode(markdown: string): string[] {
  let inFence = false
  return markdown.split('\n').map((line) => {
    if (FENCE.test(line)) {
      inFence = !inFence
      return ''
    }
    return inFence ? '' : line.replace(/`[^`\n]*`/g, '')
  })
}

export function extractLinks(markdown: string): Link[] {
  const links: Link[] = []
  stripCode(markdown).forEach((line, index) => {
    for (const match of line.matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = match[1]
      if (target) links.push({ target, line: index + 1 })
    }
  })
  return links
}

export function headingAnchors(markdown: string): Set<string> {
  const slugger = new GithubSlugger()
  const anchors = new Set<string>()
  let inFence = false
  for (const line of markdown.split('\n')) {
    if (FENCE.test(line)) inFence = !inFence
    if (inFence) continue
    const heading = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line)?.[1]
    if (heading) anchors.add(slugger.slug(heading.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')))
  }
  return anchors
}

export function isExternal(target: string): boolean {
  return /^(https?:|mailto:)/.test(target)
}
