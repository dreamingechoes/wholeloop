import { parse } from 'yaml'
import type { Finding, HarnessTree } from './files.js'

export interface EnforcementMap {
  rules: { id: string; enforcers: string[]; forbid?: string[] }[]
  documentationOnly: { id: string; reason: string }[]
}

export interface HardRule {
  id: string
  file: string
  line: number
}

const HARD_RULE = /⛔\s*`([a-z0-9]+(?:-[a-z0-9]+)*)`/g
const SOURCE = /^harness\/.+\.(md|ts|ya?ml)$/

export function parseEnforcement(yamlText: string): EnforcementMap {
  const raw = (parse(yamlText) ?? {}) as {
    rules?: EnforcementMap['rules']
    documentation_only?: EnforcementMap['documentationOnly']
  }
  return { rules: raw.rules ?? [], documentationOnly: raw.documentation_only ?? [] }
}

export function hardRules(tree: HarnessTree): HardRule[] {
  const rules: HardRule[] = []
  for (const [file, content] of tree.files) {
    if (!file.startsWith('harness/') || !file.endsWith('.md')) continue
    content.split('\n').forEach((text, index) => {
      for (const match of text.matchAll(HARD_RULE)) {
        if (match[1]) rules.push({ id: match[1], file, line: index + 1 })
      }
    })
  }
  return rules
}

function enforcerProblem(ref: string, tree: HarnessTree): string | undefined {
  const [path = '', symbol] = ref.split('#')
  if (path.endsWith('.md')) return `'${ref}' is prose — an enforcer must be code, a test or a lint`
  const content = tree.read(path)
  if (content === undefined) return `'${ref}' does not exist`
  if (symbol && !content.includes(symbol)) return `'${ref}': '${symbol}' not found in ${path}`
  return undefined
}

export function checkEnforcement(map: EnforcementMap, tree: HarnessTree): Finding[] {
  const findings: Finding[] = []
  const found = hardRules(tree)
  const mapped = new Set([...map.rules, ...map.documentationOnly].map((entry) => entry.id))
  const stated = new Set(found.map((rule) => rule.id))
  const add = (message: string, file = 'enforcement.yml', line?: number) =>
    findings.push({ file, rule: 'enforcement', message, ...(line ? { line } : {}) })

  for (const rule of found) {
    if (!mapped.has(rule.id)) add(`hard rule '${rule.id}' has no enforcer`, rule.file, rule.line)
  }
  for (const id of mapped) {
    if (!stated.has(id)) add(`'${id}' is mapped but no hard rule states it any more`)
  }
  for (const rule of map.rules) {
    if (rule.enforcers.length === 0) add(`'${rule.id}' lists no enforcers`)
    for (const ref of rule.enforcers) {
      const problem = enforcerProblem(ref, tree)
      if (problem) add(`'${rule.id}': ${problem}`)
    }
    for (const pattern of rule.forbid ?? []) {
      const regex = new RegExp(pattern)
      for (const [file, content] of tree.files) {
        if (!SOURCE.test(file)) continue
        content.split('\n').forEach((text, index) => {
          if (regex.test(text) && !text.includes(`\`${rule.id}\``)) {
            add(`contradicts '${rule.id}' (matches /${pattern}/)`, file, index + 1)
          }
        })
      }
    }
  }
  for (const entry of map.documentationOnly) {
    if (!entry.reason?.trim()) add(`'${entry.id}' is documentation-only without a reason`)
  }
  return findings
}
