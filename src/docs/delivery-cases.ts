// Checks that every delivery acceptance case maps to a control; it grants no acceptance.
import { posix } from 'node:path'
import type { EnforcementMap } from '../harness/enforcement.js'
import type { Problem, Tree } from './check.js'
import { extractLinks } from './markdown.js'

export const DELIVERY_CASE_MAP = 'docs/reference/delivery-acceptance.md'
const PREFIX = 'roadmap/specifications/autonomous-delivery/'
// Accepted expanded-V1 obligations cannot disappear merely by deleting both a
// definition and its row. New declared cases must also acquire concrete controls.
const FAMILIES = {
  AUTH: 8,
  DEC: 6,
  RUN: 9,
  ENV: 7,
  QA: 8,
  INT: 7,
  REL: 10,
  OPS: 7,
  LEARN: 6,
  RSR: 6,
  EVAL: 12,
}
const NATIVE = new Set(
  'AUTH-05 DEC-01 RUN-06 RUN-09 QA-04 REL-03 REL-08 RSR-01 RSR-05 EVAL-01 EVAL-02 EVAL-03 EVAL-06 EVAL-07 EVAL-08 EVAL-09 EVAL-10'.split(
    ' ',
  ),
)
const HOSTED = new Set(
  'DEC-01 RUN-09 REL-03 REL-04 REL-08 REL-10 EVAL-05 EVAL-07 EVAL-08 EVAL-09'.split(' '),
)
const BACKEND = new Set(
  'AUTH-05 ENV-01 ENV-02 ENV-03 ENV-04 ENV-05 ENV-06 ENV-07 QA-02 QA-03 QA-04 QA-05 QA-06 INT-01 EVAL-02 EVAL-03'.split(
    ' ',
  ),
)
const LEVELS = new Set([
  'Pure/unit',
  'Workflow/process',
  'Backend/application',
  'Native reference',
  'Hosted code host',
  'Human',
  'macOS host',
  'Linux host',
])
const RESULTS = new Set([
  'Local gate',
  'Local gate; backend records in manual matrix',
  'Local gate; native pending',
  'Local gate; hosted pending',
  'Local gate; native and hosted pending',
])

export function hasDeliveryCases(tree: Tree) {
  return [...tree.files.keys()].some((file) => file.startsWith(PREFIX))
}

/** Coverage and evidence labels only: this grants no native or release acceptance. */
export function checkDeliveryCases(tree: Tree, enforcement?: EnforcementMap): Problem[] {
  if (!hasDeliveryCases(tree)) return []
  const problems: Problem[] = [],
    definitions = new Map<string, string>(),
    rows = new Set<string>(),
    add = (message: string, line?: number, file = DELIVERY_CASE_MAP) =>
      problems.push({ file, rule: 'generated', message, ...(line ? { line } : {}) })
  for (const [file, text] of tree.files) {
    if (!file.startsWith(PREFIX)) continue
    text.split('\n').forEach((line, index) => {
      const id =
        /^(?:- \[[ x]\] \*\*|\| )((?:AUTH|DEC|RUN|ENV|QA|INT|REL|OPS|LEARN|RSR|EVAL)-\d{2})(?::\*\*| \|)/.exec(
          line,
        )?.[1]
      if (!id) return
      if (definitions.has(id)) add(`duplicate case definition: ${id}`, index + 1, file)
      else definitions.set(id, file)
    })
  }
  for (const [family, count] of Object.entries(FAMILIES))
    for (let number = 1; number <= count; number++) {
      const id = `${family}-${String(number).padStart(2, '0')}`
      if (!definitions.has(id)) add(`missing accepted case definition: ${id}`)
    }
  const text = tree.files.get(DELIVERY_CASE_MAP)
  if (text === undefined) {
    add('missing expanded delivery case map')
    return problems
  }
  if (!enforcement) add('case map needs the concrete enforcement registry')
  const rules = new Map(enforcement?.rules.map((rule) => [rule.id, rule]) ?? [])
  text.split('\n').forEach((line, index) => {
    const row =
      /^\| \[([A-Z]+-\d{2})\]\(([^)]+)\) \| ([^|]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|$/.exec(line)
    if (!row) return
    const [, id = '', target = '', evidence = '', tests = '', enforcers = '', result = ''] = row,
      at = index + 1
    if (!definitions.has(id)) add(`unknown case row: ${id}`, at)
    if (rows.has(id)) add(`duplicate case row: ${id}`, at)
    rows.add(id)
    const resolve = (path: string) =>
      posix.normalize(posix.join(posix.dirname(DELIVERY_CASE_MAP), path))
    if (resolve(target) !== definitions.get(id))
      add(`${id}: reference the exact case definition`, at)
    const levels = evidence
        .trim()
        .split(',')
        .map((value) => value.trim()),
      outcome = result.trim()
    if (!levels.length || levels.some((level) => !LEVELS.has(level)))
      add(`${id}: unknown evidence class`, at)
    for (const [required, group] of [
      ['Native reference', NATIVE],
      ['Hosted code host', HOSTED],
      ['Backend/application', BACKEND],
    ] as const)
      if (group.has(id) && !levels.includes(required))
        add(`${id}: retain required ${required} evidence`, at)
    if (id === 'ENV-07' && (!levels.includes('macOS host') || !levels.includes('Linux host')))
      add(`${id}: retain both actual host platforms`, at)
    if (
      !RESULTS.has(outcome) ||
      (levels.includes('Native reference') && !outcome.includes('native')) ||
      (levels.includes('Hosted code host') && !outcome.includes('hosted'))
    )
      add(`${id}: keep local controls distinct from pending external acceptance`, at)
    const links = extractLinks(tests)
    if (
      !links.length ||
      links.some(
        (link) =>
          !/^test\/(unit\/.+\.test\.ts|evals\/.+\.(ts|mjs))$/.test(resolve(link.target)) ||
          !tree.exists(resolve(link.target)),
      )
    )
      add(`${id}: reference concrete existing tests or evaluations`, at)
    const ids = [...enforcers.matchAll(/`([a-z][a-z0-9-]+)`/g)].map((match) => match[1] ?? '')
    if (
      !ids.length ||
      ids.some(
        (value) =>
          !rules
            .get(value)
            ?.enforcers.some(
              (ref) => !ref.split('#')[0]?.endsWith('.md') && tree.exists(ref.split('#')[0] ?? ''),
            ),
      )
    )
      add(`${id}: reference concrete mapped hard rules`, at)
  })
  for (const id of definitions.keys()) if (!rows.has(id)) add(`missing case row: ${id}`)
  return problems
}
