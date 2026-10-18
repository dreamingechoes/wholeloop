import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { stringify } from 'yaml'
import { loadExtensionOptions } from '../config/load.js'
import { type CatalogAdapter, loadCatalog, type Manifest } from '../extensions/catalog.js'
import { MANIFEST_ID } from '../extensions/common.js'
import { lensAdapter, profileAdapter, templateAdapter } from '../extensions/kinds.js'
import { FRAME_SECTIONS } from '../framing/contract.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'

function scaffold(kind: string, id: string): Record<string, string> {
  if (kind === 'template')
    return {
      'template.md': `---\n${stringify({ schema: 1, id, extends: 'builtin:frame', sections: { required: FRAME_SECTIONS.map((name) => name.toLowerCase()), optional: [] } })}---\n# {{title}}\n\n${FRAME_SECTIONS.map((name) => `## ${name}\n\nTBD: supply evidence; who: initiative owner`).join('\n\n')}\n`,
    }
  if (kind === 'profile')
    return {
      'profile.yml': stringify({
        schema: 1,
        id,
        extends: 'builtin:pair',
        dials: { depth: 'technical' },
      }),
    }
  return {
    'lens.yml': stringify({
      schema: 1,
      id,
      gate: 'review',
      asks: 'Does the change satisfy the team requirement?',
      'fail-safe': false,
      prompt: 'prompt.md',
    }),
    'prompt.md':
      '# Review dimension\n\nInspect the changed behavior and report findings with concrete evidence.\nState uncertainty when the available evidence cannot answer the question.\n',
  }
}

function execute<T extends Manifest>(
  adapter: CatalogAdapter<T>,
  command: string,
  { positional, options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
): number {
  const [kind, action] = command.split(' ')
  if (positional.length !== (action === 'list' ? 0 : 1))
    throw new CliError(
      `Expected ${action === 'list' ? 'no argument' : 'one id'} for ${command}`,
      EXIT.input,
    )
  if (action === 'scaffold') {
    const id = positional[0] ?? ''
    if (!MANIFEST_ID.test(id)) throw new CliError('Manifest id must be kebab-case')
    const files = scaffold(kind ?? '', id)
    const output = options['--output']
    if (typeof output === 'string') {
      // A new directory is the transaction boundary; never overwrite a partial kit.
      if (existsSync(output)) throw new CliError(`Output already exists: ${output}`)
      mkdirSync(dirname(output), { recursive: true })
      mkdirSync(output)
      for (const [name, content] of Object.entries(files))
        writeFileSync(join(output, name), content, { flag: 'wx', mode: 0o600 })
    }
    io.out(
      JSON.stringify(
        { schema: `wholeloop/${kind}-scaffold@1`, id, files, directory: output ?? null },
        null,
        json ? undefined : 2,
      ),
    )
    return EXIT.ok
  }
  const catalog = loadCatalog(adapter, loadExtensionOptions({ root }))
  const entries =
    action === 'list'
      ? catalog.entries
      : catalog.entries.filter(({ manifest }) => manifest.id === positional[0])
  if (action !== 'list' && !entries.length && !catalog.problems.length)
    throw new CliError(`Unknown ${kind}: ${positional[0]}`, EXIT.precondition)
  io.out(
    JSON.stringify(
      { schema: `wholeloop/${kind}-${action}@1`, entries, problems: catalog.problems },
      null,
      json ? undefined : 2,
    ),
  )
  return catalog.problems.length ? EXIT.shape : EXIT.ok
}

export function extensionCommand(
  command: string,
  parsed: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
): number {
  try {
    if (command.startsWith('template '))
      return execute(templateAdapter, command, parsed, root, json, io)
    if (command.startsWith('lens ')) return execute(lensAdapter, command, parsed, root, json, io)
    return execute(profileAdapter, command, parsed, root, json, io)
  } catch (error) {
    if (error instanceof CliError) throw error
    throw new CliError(error instanceof Error ? error.message : 'Extension command failed')
  }
}
