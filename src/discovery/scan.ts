import { posix } from 'node:path'
import { parse } from 'yaml'
import { isObject } from '../config/schema.js'
import { isEntrypoint } from '../harness/entrypoints.js'
import { frontmatter } from '../harness/frontmatter.js'
import { knownSlot } from './rules.js'
import type { Asset, CapabilityMap } from './types.js'

const TOOL_DIR = '\\.(?:agents|claude|codex|opencode|gemini|cursor|github)'
const SKILL = new RegExp(`(?:^|/)${TOOL_DIR}/skills/.+/SKILL\\.md$`)
const AGENT = new RegExp(`(?:^|/)${TOOL_DIR}/agents/.+\\.(?:md|toml)$`)
export const isGeneratedDistribution = (path: string) =>
  /(?:^|\/)\.wholeloop\/distribution(?:\/|$)/.test(path)
const PRIORITY: Record<string, number> = {
  check: 190,
  verify: 190,
  test: 180,
  typecheck: 160,
  lint: 150,
}

function packageManager(path: string, files: ReadonlyMap<string, string>): string {
  let directory = posix.dirname(path)
  while (true) {
    const content = files.get(posix.join(directory, 'package.json'))
    if (content) {
      const pkg: unknown = JSON.parse(content)
      if (isObject(pkg) && typeof pkg.packageManager === 'string')
        return pkg.packageManager.split('@')[0] ?? 'npm'
    }
    const parent = posix.dirname(directory)
    if (directory === '.' || parent === directory) return 'npm'
    directory = parent
  }
}

export function fileKind(path: string): Asset['kind'] | 'runner' | undefined {
  // A bundled adapter may contain native-looking paths; scanning it duplicates the installed overlay.
  if (isGeneratedDistribution(path)) return undefined
  if (SKILL.test(path)) return 'skill'
  if (AGENT.test(path)) return 'agent'
  if (
    /(?:^|\/)(?:AGENTS|CLAUDE|GEMINI)\.md$/.test(path) ||
    /(?:^|\/)\.(?:cursor|agents)\/rules\//.test(path) ||
    path.endsWith('.github/copilot-instructions.md')
  )
    return 'instruction'
  if (
    /(?:^|\/)(?:CONTRIBUTING\.md|CODEOWNERS|\.commitlintrc[^/]*|commitlint\.config\.[^/]+)$/.test(
      path,
    ) ||
    /(?:^|\/)\.github\/(?:PULL_REQUEST_TEMPLATE|pull_request_template|ISSUE_TEMPLATE)/i.test(
      path,
    ) ||
    /(?:^|\/)\.gitlab\/merge_request_templates\/[^/]+\.md$/.test(path) ||
    /(?:^|\/)docs\/adr\/[^/]+\.md$/.test(path)
  )
    return 'convention'
  if (
    /(?:^|\/)(?:package\.json|Makefile|[Jj]ustfile|Taskfile\.ya?ml|pyproject\.toml|pytest\.ini|go\.mod|Gemfile|Cargo\.toml)$/.test(
      path,
    ) ||
    /(?:^|\/)bin\/(?:check|verify|test|lint)$/.test(path)
  )
    return 'runner'
  if (
    /(?:^|\/)(?:biome\.jsonc?|eslint\.config\.[^/]+|\.eslintrc[^/]*|\.prettierrc[^/]*|tsconfig[^/]*\.json|ruff\.toml|\.rubocop\.yml|\.golangci\.ya?ml)$/.test(
      path,
    )
  )
    return 'quality'
  if (
    /(?:^|\/)\.storybook\/[^/]+$/.test(path) ||
    /(?:^|\/)(?:tokens|design-tokens)\.(?:json|css)$/.test(path)
  )
    return 'design'
  return undefined
}

/** The scan reports declarations; it never executes repository commands or code. */
export function scan(files: ReadonlyMap<string, string>): CapabilityMap {
  const result: CapabilityMap = {
    schema: 'wholeloop/discover@1',
    assets: [],
    commands: [],
    problems: [],
  }
  for (const [path, raw] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    const kind = fileKind(path)
    if (!kind) continue
    const content = raw.replaceAll('\r\n', '\n')
    const name =
      kind === 'skill'
        ? posix.basename(posix.dirname(path))
        : posix.basename(path).replace(/\.[^.]+$/, '')
    const cwd = posix.dirname(path)
    const depth = cwd === '.' ? 0 : cwd.split('/').length
    const command = (argv: string[], target: string, reason: string) => {
      const priority = Object.hasOwn(PRIORITY, target) ? PRIORITY[target] : undefined
      if (priority !== undefined)
        result.commands.push({
          ref: `${path}#${target}`,
          cwd,
          argv,
          priority: priority - depth,
          reason,
        })
    }
    try {
      if (kind !== 'runner') {
        const metadata =
          kind === 'skill' || (kind === 'agent' && path.endsWith('.md'))
            ? frontmatter(content)
            : undefined
        const data = isObject(metadata?.metadata) ? metadata.metadata : {}
        const tagged =
          data['wholeloop.slot'] ?? (isObject(data.wholeloop) ? data.wholeloop.slot : undefined)
        const slots =
          typeof tagged === 'string'
            ? tagged.split(/\s+/).filter(Boolean)
            : Array.isArray(tagged) && tagged.every((value) => typeof value === 'string')
              ? tagged
              : []
        if (/^\.gitlab\/merge_request_templates\/[^/]+\.md$/.test(path))
          slots.push('open-pr.convention')
        if (slots.some((slot) => !knownSlot(slot)))
          throw new Error(`Unknown wholeloop slot: ${slots.find((slot) => !knownSlot(slot))}`)
        result.assets.push({
          path,
          kind,
          name: typeof metadata?.name === 'string' ? metadata.name : name,
          description: typeof metadata?.description === 'string' ? metadata.description : '',
          slots,
          ...(['skill', 'agent'].includes(kind) &&
          isEntrypoint(content, path.endsWith('.toml') ? 'toml' : 'md')
            ? { entrypoint: true as const }
            : {}),
        })
        continue
      }
      const base = posix.basename(path)
      if (base === 'package.json') {
        const pkg: unknown = JSON.parse(content)
        if (!isObject(pkg)) throw new Error('Expected a package object')
        const manager = packageManager(path, files)
        if (!['npm', 'pnpm', 'yarn', 'bun'].includes(manager ?? ''))
          throw new Error('Unknown package manager')
        if (isObject(pkg.scripts))
          for (const target of Object.keys(pkg.scripts).sort())
            if (typeof pkg.scripts[target] === 'string')
              command(
                [manager ?? 'npm', 'run', target],
                target,
                `Declared ${manager} script ${target}`,
              )
      } else if (base === 'Makefile' || base.toLowerCase() === 'justfile') {
        for (const match of content.matchAll(/^([a-z][a-z0-9_-]*):[^=]/gm))
          if (match[1])
            command(
              [base === 'Makefile' ? 'make' : 'just', match[1]],
              match[1],
              `Declared ${base} target ${match[1]}`,
            )
      } else if (/^Taskfile\.ya?ml$/.test(base)) {
        const data: unknown = parse(content)
        if (isObject(data) && isObject(data.tasks))
          for (const target of Object.keys(data.tasks).sort())
            command(['task', target], target, `Declared Taskfile task ${target}`)
      } else if (base === 'go.mod')
        command(['go', 'test', './...'], 'test', 'Go module test runner')
      else if (base === 'Cargo.toml') command(['cargo', 'test'], 'test', 'Rust package test runner')
      else if (
        base === 'pytest.ini' ||
        (base === 'pyproject.toml' && /\[tool\.pytest\.|\bpytest\b/.test(content))
      )
        command(['python', '-m', 'pytest'], 'test', 'Declared pytest configuration')
      else if (base === 'Gemfile' && /['"]rspec['"]/.test(content))
        command(['bundle', 'exec', 'rspec'], 'test', 'Declared RSpec dependency')
      else if (path.includes('bin/'))
        command([`./${base}`], base, 'Repository bin command (run in its bin directory)')
    } catch (error) {
      result.problems.push({
        file: path,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return result
}
