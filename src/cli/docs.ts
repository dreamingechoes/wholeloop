import { checkLinks, checkNav, type Problem } from '../docs/check.js'
import { parseNav, renderFooter, withFooter } from '../docs/nav.js'
import {
  checkReferences,
  REFERENCE_KINDS,
  referenceSections,
  replaceReference,
} from '../docs/references.js'
import { readNavYaml, readTree, writeFile } from '../docs/tree.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
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
  const problems = [
    ...checkNav(parseNav(readNavYaml(root)), tree),
    ...checkLinks(tree),
    ...checkReferences(tree),
  ]
  if (json) {
    io.out(JSON.stringify({ schema: 'wholeloop/docs-check@1', files: tree.files.size, problems }))
  } else {
    for (const problem of problems) io.err(format(problem))
    io.out(`docs: ${tree.files.size} files checked, ${problems.length} problem(s)`)
  }
  return problems.length === 0 ? EXIT.ok : EXIT.shape
}

export function docsReference(
  { positional, options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
): number {
  const kind = options['--kind']
  if (
    positional.length ||
    (kind !== undefined &&
      (typeof kind !== 'string' ||
        !REFERENCE_KINDS.includes(kind as (typeof REFERENCE_KINDS)[number])))
  )
    throw new CliError('Use docs reference [--kind commands|config|providers|platforms] [--write]')
  const sections = referenceSections().filter(
    (section) => kind === undefined || section.kind === kind,
  )
  const tree = readTree(root)
  // Preflight every page/marker before the first write. Regeneration never manufactures a missing page.
  const planned = sections.map((section) => {
    const before = tree.files.get(section.file)
    if (before === undefined)
      throw new CliError(`Missing generated reference page: ${section.file}`)
    try {
      return { ...section, before, after: replaceReference(before, section) }
    } catch {
      throw new CliError(
        `Expected one ordered ${section.kind} marker pair in ${section.file}; preserve the page and restore its markers`,
      )
    }
  })
  const stale = planned.filter((section) => section.before !== section.after)
  const write = options['--write'] === true
  if (write) for (const section of stale) writeFile(root, section.file, section.after)
  const result = {
    schema: 'wholeloop/docs-reference@1',
    status: stale.length ? (write ? 'updated' : 'stale') : 'current',
    written: write ? stale.length : 0,
    stale: write ? [] : stale.map((section) => section.file),
    updated: write ? stale.map((section) => section.file) : [],
    checked: sections.map((section) => section.kind),
  }
  if (json) io.out(JSON.stringify(result))
  else
    io.out(
      `references: ${result.status}, ${sections.length} checked, ${result.written} written${!write && stale.length ? ' — rerun with --write to regenerate' : ''}`,
    )
  return !write && stale.length ? EXIT.shape : EXIT.ok
}
