import { parse } from 'yaml'
import type { Finding, HarnessTree } from './files.js'

const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/
const SKILL_KEYS = new Set([
  'name',
  'description',
  'license',
  'compatibility',
  'metadata',
  'allowed-tools',
])
const CAPABILITIES = new Set(['read', 'write', 'shell', 'web'])
const TIERS = new Set(['fast', 'standard', 'deep'])
export const DESCRIPTION_MAX = 400

export function frontmatter(content: string): Record<string, unknown> | undefined {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(content)
  if (!match) return undefined
  const data = parse(match[1] ?? '') as unknown
  return data && typeof data === 'object' && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : undefined
}

function common(data: Record<string, unknown>, expectedName: string): string[] {
  const problems: string[] = []
  const { name, description, metadata } = data
  if (typeof name !== 'string' || !NAME.test(name) || name.length > 64) {
    problems.push('name must be kebab-case, at most 64 characters')
  } else if (name !== expectedName) {
    problems.push(`name '${name}' must match '${expectedName}'`)
  }
  if (typeof description !== 'string' || description.trim() === '') {
    problems.push('description is required')
  } else if (description.length > DESCRIPTION_MAX) {
    problems.push(
      `description has ${description.length} characters; the budget is ${DESCRIPTION_MAX}`,
    )
  }
  if (metadata !== undefined) {
    const valid =
      typeof metadata === 'object' &&
      metadata !== null &&
      Object.values(metadata).every((value) => typeof value === 'string')
    if (!valid) problems.push('metadata must map strings to strings')
  }
  return problems
}

export function checkSkill(file: string, content: string): string[] {
  const data = frontmatter(content)
  if (!data) return ['missing YAML front matter']
  const expected = file.split('/').at(-2) ?? ''
  const unknown = Object.keys(data).filter((key) => !SKILL_KEYS.has(key))
  const problems = common(data, expected)
  if (unknown.length > 0) {
    problems.push(
      `non-portable keys (${unknown.join(', ')}) — move them into metadata or a sidecar`,
    )
  }
  return problems
}

export function checkAgent(file: string, content: string): string[] {
  const data = frontmatter(content)
  if (!data) return ['missing YAML front matter']
  const expected = (file.split('/').at(-1) ?? '').replace(/\.md$/, '')
  const problems = common(data, expected)
  const metadata = (data.metadata ?? {}) as Record<string, string>
  const capabilities = (metadata['wholeloop.capabilities'] ?? '').split(/\s+/).filter(Boolean)
  const unknown = capabilities.filter((capability) => !CAPABILITIES.has(capability))
  if (capabilities.length === 0) problems.push('metadata wholeloop.capabilities is required')
  if (unknown.length > 0) problems.push(`unknown capabilities: ${unknown.join(', ')}`)
  const tier = metadata['wholeloop.tier']
  if (tier !== undefined && !TIERS.has(tier)) problems.push(`unknown tier '${tier}'`)
  return problems
}

export function checkFrontmatter(tree: HarnessTree): Finding[] {
  const findings: Finding[] = []
  for (const [file, content] of tree.files) {
    const check = /^harness\/skills\/[^/]+\/SKILL\.md$/.test(file)
      ? checkSkill
      : /^harness\/agents\/[^/]+\.md$/.test(file)
        ? checkAgent
        : undefined
    for (const message of check?.(file, content) ?? []) {
      findings.push({ file, rule: 'frontmatter', message })
    }
  }
  return findings
}
