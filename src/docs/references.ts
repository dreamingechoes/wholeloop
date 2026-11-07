// Generates the command, configuration, provider and platform reference sections.
import type { Adapter } from '../adapters/contracts.js'
import { ADAPTERS } from '../adapters/generate.js'
import type { Command } from '../cli/commands.js'
import { COMMANDS } from '../cli/commands.js'
import { configKeys, type Schema } from '../config/schema.js'
import { BUILTINS } from '../providers/builtins.js'
import type { Provider } from '../providers/manifest.js'
import type { Problem, Tree } from './check.js'
import { replaceSection } from './sections.js'

export const REFERENCE_KINDS = ['commands', 'config', 'providers', 'platforms'] as const
export type ReferenceKind = (typeof REFERENCE_KINDS)[number]
export interface ReferenceSection {
  kind: ReferenceKind
  file: string
  body: string
}
const cell = (text: string) => text.replaceAll('|', '\\|').replace(/[\r\n]+/g, ' ')
const code = (text: string) => {
  const fence = '`'.repeat(
    Math.max(0, ...[...text.matchAll(/`+/g)].map((match) => match[0].length)) + 1,
  )
  return `${fence}${text.startsWith('`') || text.endsWith('`') ? ' ' : ''}${cell(text)}${text.startsWith('`') || text.endsWith('`') ? ' ' : ''}${fence}`
}

export function commandReference(commands: readonly Command[]) {
  return [
    '| Command | Output schema | Purpose |',
    '| --- | --- | --- |',
    ...commands.map(
      (command) =>
        `| ${code(`wl ${command.path}${command.arguments ? ` ${command.arguments}` : ''}`)} | ${code(command.schema)} | ${cell(command.summary)} |`,
    ),
  ].join('\n')
}
export function configReference(schema?: Schema) {
  return [
    '| Key | Kind | Values | Default |',
    '| --- | --- | --- | --- |',
    ...configKeys(schema).map(({ path, kind, rule }) => {
      const type = rule.enum
        ? rule.enum.map(String).join(' · ')
        : rule.type === 'object'
          ? 'map of strings'
          : rule.type === 'array'
            ? 'array of strings'
            : rule.type
      const value = Object.hasOwn(rule, 'default') ? code(JSON.stringify(rule.default)) : 'unset'
      return `| ${code(path.join('.'))} | ${kind} | ${cell(type)} | ${value} |`
    }),
  ].join('\n')
}
export function providerReference(providers: readonly Provider[]) {
  return [
    '| ID | Capabilities | Declared operations | Access |',
    '| --- | --- | --- | --- |',
    ...[...providers]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((provider) => {
        const access = [
          ...(provider.access.local ? ['local'] : []),
          ...(provider.access.native ? ['native host'] : []),
          ...(provider.access.cli ? [`CLI: ${provider.access.cli.binary}`] : []),
          ...(provider.access.mcp ? [`MCP: ${provider.access.mcp.server}`] : []),
        ]
        return `| ${code(provider.id)} | ${[...provider.capabilities].sort().map(code).join(' · ')} | ${Object.keys(provider.operations).sort().map(code).join(' · ')} | ${access.map(cell).join(' · ')} |`
      }),
  ].join('\n')
}
/** Local declarations cannot attest to actual native loading, permissions or model execution. */
export function platformReference(adapters: readonly Adapter[] = ADAPTERS) {
  return [
    '| Adapter | Skills | Agents | Hooks | Read-only boundary | Local engines | Native conformance |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...adapters.map((adapter) => {
      const capabilities = adapter.capabilities()
      return `| ${code(adapter.id)} | ${capabilities.skills} | ${capabilities.agents} | ${code(capabilities.hooks)} | ${code(capabilities.readOnly)} | ${capabilities.engines.map(code).join(' · ')} | ${capabilities.conformance} |`
    }),
  ].join('\n')
}
export function referenceSections(): ReferenceSection[] {
  return [
    { kind: 'commands', file: 'docs/architecture/core-cli.md', body: commandReference(COMMANDS) },
    { kind: 'config', file: 'docs/configuration/README.md', body: configReference() },
    {
      kind: 'providers',
      file: 'docs/configuration/providers.md',
      body: providerReference(BUILTINS),
    },
    { kind: 'platforms', file: 'docs/platforms/README.md', body: platformReference() },
  ]
}

/** Missing/duplicate markers used to pass string.replace-based checks without comparing any table. */
export function replaceReference(content: string, section: ReferenceSection): string {
  return replaceSection(content, section.kind, section.body)
}
export function checkReferences(tree: Tree, sections = referenceSections()): Problem[] {
  return sections.flatMap((section) => {
    const content = tree.files.get(section.file)
    let message: string | undefined
    if (content === undefined) message = `Missing generated reference page (${section.kind})`
    else
      try {
        if (replaceReference(content, section) !== content)
          message = `Generated ${section.kind} reference is stale; run wl docs reference --kind ${section.kind} --write`
      } catch {
        message = `Expected one ordered ${section.kind} marker pair; preserve the page and restore its markers`
      }
    return message ? [{ file: section.file, rule: 'generated' as const, message }] : []
  })
}
