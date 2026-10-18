import { checkLinks, checkNav, type Problem } from '../docs/check.js'
import { parseNav, renderFooter, withFooter } from '../docs/nav.js'
import { readNavYaml, readTree, writeFile } from '../docs/tree.js'
import { EXIT, type Io } from './io.js'

function format(problem: Problem): string {
  const where = problem.line ? `${problem.file}:${problem.line}` : problem.file
  return `${where}  ${problem.rule}  ${problem.message}`
}

export function docsNav(root: string, json: boolean, io: Io): number {
  const nav = parseNav(readNavYaml(root))
  const tree = readTree(root)
  let changed = 0
  const problems: string[] = []
  nav.pages.forEach((page, index) => {
    const file = `docs/${page.path}`
    const content = tree.files.get(file)
    const updated =
      content === undefined ? undefined : withFooter(content, renderFooter(nav, index))
    if (updated === undefined) {
      problems.push(`skip ${file}: missing file or <!-- docnav --> marker`)
    } else if (updated !== content) {
      writeFile(root, file, updated)
      changed++
    }
  })
  if (json)
    io.out(
      JSON.stringify({
        schema: 'wholeloop/docs-nav@1',
        pages: nav.pages.length,
        changed,
        problems,
      }),
    )
  else {
    problems.forEach(io.err)
    io.out(`docnav: ${nav.pages.length} pages, ${changed} updated`)
  }
  return problems.length ? EXIT.shape : EXIT.ok
}

export function docsCheck(root: string, json: boolean, io: Io): number {
  const tree = readTree(root)
  const problems = [...checkNav(parseNav(readNavYaml(root)), tree), ...checkLinks(tree)]
  if (json) {
    io.out(JSON.stringify({ schema: 'wholeloop/docs-check@1', files: tree.files.size, problems }))
  } else {
    for (const problem of problems) io.err(format(problem))
    io.out(`docs: ${tree.files.size} files checked, ${problems.length} problem(s)`)
  }
  return problems.length === 0 ? EXIT.ok : EXIT.shape
}
