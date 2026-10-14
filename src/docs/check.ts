import { posix } from 'node:path'
import { extractLinks, headingAnchors, isExternal } from './markdown.js'
import { type Nav, renderFooter, withFooter } from './nav.js'

export interface Problem {
  file: string
  line?: number
  rule: 'docnav' | 'nav' | 'link' | 'anchor' | 'banner'
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
  for (const [file, content] of tree.files) {
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
      if (anchor && linked !== undefined && !headingAnchors(linked).has(anchor)) {
        problems.push({ file, line, rule: 'anchor', message: `missing anchor: ${target}` })
      }
    }
  }
  return problems
}
