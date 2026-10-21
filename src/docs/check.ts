import { posix } from 'node:path'
import { extractLinks, headingAnchors, isExternal, stripCode } from './markdown.js'
import { type Nav, renderFooter, withFooter } from './nav.js'

export interface Problem {
  file: string
  line?: number
  rule: 'docnav' | 'nav' | 'link' | 'anchor' | 'banner' | 'generated' | 'adr-status'
  message: string
}

export interface Tree {
  files: ReadonlyMap<string, string>
  exists: (path: string) => boolean
}

const ADR = /^docs\/decisions\/\d{4}-/
const BANNER = /^>\s*\*\*Status:/

export function checkNav(nav: Nav, tree: Tree): Problem[] {
  const problems: Problem[] = []
  const listed = new Set(nav.pages.map((page) => `docs/${page.path}`))
  nav.pages.forEach((page, index) => {
    const file = `docs/${page.path}`
    const content = tree.files.get(file)
    if (content === undefined) {
      problems.push({
        file: 'docs/nav.yml',
        rule: 'nav',
        message: `lists ${file}, which does not exist`,
      })
      return
    }
    const expected = withFooter(content, renderFooter(nav, index))
    if (expected === undefined) {
      problems.push({ file, rule: 'docnav', message: 'missing <!-- docnav --> marker' })
    } else if (expected !== content) {
      problems.push({ file, rule: 'docnav', message: 'footer is out of date — run `wl docs nav`' })
    }
    if (
      !content
        .split('\n')
        .slice(0, 15)
        .some((line) => BANNER.test(line))
    ) {
      problems.push({ file, rule: 'banner', message: 'no status banner in the first 15 lines' })
    }
  })
  for (const file of tree.files.keys()) {
    if (file.startsWith('docs/') && !listed.has(file) && !ADR.test(file)) {
      problems.push({ file, rule: 'nav', message: 'page is not listed in docs/nav.yml' })
    }
  }
  return problems
}

export function checkLinks(tree: Tree): Problem[] {
  const problems: Problem[] = []
  const referencedDecisions = new Set<string>()
  const decisions = new Map<string, string[]>()
  for (const path of tree.files.keys()) {
    const number = /^docs\/decisions\/(\d{4})-[^/]+\.md$/.exec(path)?.[1]
    if (number) decisions.set(number, [...(decisions.get(number) ?? []), path])
  }
  for (const [file, content] of tree.files) {
    stripCode(content).forEach((text, index) => {
      // Markdown targets are checked below; plain ADR mentions must also resolve.
      const prose = text.replace(/\[[^\]]*\]\([^)]*\)/g, '')
      for (const reference of prose.matchAll(/\bADR-(\d{4})\b/g)) {
        const matches = decisions.get(reference[1] ?? '') ?? []
        const target = matches[0]
        if (matches.length !== 1 || !target)
          problems.push({
            file,
            line: index + 1,
            rule: 'adr-status',
            message: `${reference[0]} has no unique decision record`,
          })
        else referencedDecisions.add(target)
      }
    })
    for (const { target, line } of extractLinks(content)) {
      if (isExternal(target)) continue
      const [path = '', anchor] = target.split('#')
      const resolved = path
        ? posix.normalize(posix.join(posix.dirname(file), path)).replace(/\/$/, '')
        : file
      if (!tree.exists(resolved)) {
        problems.push({ file, line, rule: 'link', message: `broken link: ${target}` })
        continue
      }
      const linked = tree.files.get(resolved)
      if (/^docs\/decisions\/\d{4}-[^/]+\.md$/.test(resolved) && linked !== undefined)
        referencedDecisions.add(resolved)
      if (anchor && linked !== undefined && !headingAnchors(linked).has(anchor)) {
        problems.push({ file, line, rule: 'anchor', message: `missing anchor: ${target}` })
      }
    }
  }
  return [...problems, ...checkDecisionStatus(tree, referencedDecisions)]
}

function checkDecisionStatus(tree: Tree, referenced: ReadonlySet<string>): Problem[] {
  const problems: Problem[] = [],
    checked = new Set<string>(),
    queue = [...referenced],
    supersedes = new Map<string, string>()
  for (const file of queue) {
    if (checked.has(file)) continue
    checked.add(file)
    const content = tree.files.get(file)
    if (content === undefined) continue // Ordinary Markdown links already report missing targets.
    // A matching word in historical prose cannot settle a Proposed declaration.
    const statuses = stripCode(content).flatMap((text, index) => {
      const match = /^- \*\*Status:\*\*\s*(.*?)\s*$/.exec(text)
      return match ? [{ value: match[1] ?? '', line: index + 1 }] : []
    })
    const status = statuses[0],
      value = status?.value ?? ''
    const linked = /^Superseded by \[ADR-(\d{4})\]\(\.\/(\d{4}-[a-z0-9-]+\.md)\)$/.exec(value)
    const plain = /^Superseded by (\d{4})$/.exec(value)
    const successors = plain
      ? [...tree.files.keys()].filter(
          (path) =>
            path.startsWith(`docs/decisions/${plain[1]}-`) &&
            /^docs\/decisions\/\d{4}-[^/]+\.md$/.test(path),
        )
      : []
    const linkedValid = linked?.[2]?.startsWith(`${linked?.[1]}-`)
    const settled =
      value === 'Accepted' || value === 'Superseded' || linkedValid || successors.length === 1
    if (statuses.length !== 1 || !status || status.line > 15 || !settled) {
      problems.push({
        file,
        line: status?.line ?? 1,
        rule: 'adr-status',
        message:
          'Referenced ADR needs one Accepted or explicitly Superseded status in its first 15 lines',
      })
      continue
    }
    // The documented plain-number form must resolve uniquely, and successor declarations
    // are references too. Visit once so historical supersession chains stay bounded.
    const successor = linked && linkedValid ? `docs/decisions/${linked[2]}` : successors[0]
    if (successor) {
      queue.push(successor)
      supersedes.set(file, successor)
    }
  }
  const resolved = new Set<string>()
  for (const origin of supersedes.keys()) {
    const chain = new Set<string>()
    let next: string | undefined = origin
    while (next && !resolved.has(next)) {
      if (chain.has(next)) {
        problems.push({
          file: next,
          rule: 'adr-status',
          message: 'ADR supersession references form a cycle',
        })
        break
      }
      chain.add(next)
      next = supersedes.get(next)
    }
    for (const file of chain) resolved.add(file)
  }
  return problems
}
