// `wl profile`: shows, sets and selects interaction profiles.
import { join } from 'node:path'
import { loadConfig, userConfigPath } from '../config/load.js'
import { type Configuration, resolveConfig } from '../config/resolve.js'
import { validate } from '../config/schema.js'
import { writeSetting } from '../config/write.js'
import type { Profile } from '../profile/presets.js'
import { renderProfile } from '../profile/render.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'
import { emitCommand } from './presentation.js'

export function profileCommand(
  command: string,
  { positional, options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
): number {
  const scope = options['--scope'] ?? 'user'
  if (!['user', 'project', 'run'].includes(String(scope)))
    throw new CliError('--scope must be user, project or run')
  if (positional.length !== (command === 'profile show' ? 0 : 1))
    throw new CliError(
      `Expected ${command === 'profile show' ? 'no argument' : 'one argument'} for ${command}`,
      EXIT.input,
    )
  try {
    let override: Record<string, unknown> | undefined
    if (command !== 'profile show') {
      if (command === 'profile preset') {
        const name = positional[0] ?? ''
        const loaded = loadConfig({ root })
        if (!Object.hasOwn(loaded.presets, name)) throw new CliError(`Unknown preset: ${name}`)
        const file = scope === 'project' ? join(root, '.wholeloop/config.yml') : userConfigPath()
        const existing = loadConfig({ root }).values.profile as Profile
        override = {
          preset: name,
          ...loaded.presets[name],
          language: existing.language,
          artifact_language: existing.artifact_language,
        }
        if (scope !== 'run') writeSetting(file, ['profile'], override)
      } else {
        const input = positional[0] ?? ''
        const equals = input.indexOf('=')
        if (equals < 1) throw new CliError('Expected dial=value')
        const name = input.slice(0, equals)
        if (name === 'preset') throw new CliError('Use profile preset <name> to select a preset')
        const value = input.slice(equals + 1)
        override = { [name]: value }
        const problems = validate({ profile: override })
        if (problems.length) throw new CliError(problems.join('\n'))
        if (scope !== 'run')
          writeSetting(
            scope === 'project' ? join(root, '.wholeloop/config.yml') : userConfigPath(),
            ['profile', name],
            value,
          )
      }
    }
    const loaded = loadConfig({ root })
    let config: Configuration = loaded
    if (scope === 'run' && override)
      config = resolveConfig(
        [
          { scope: 'user', values: config.values },
          { scope: 'run', values: { profile: override } },
        ],
        loaded.presets,
      )
    const profile = config.values.profile as Profile
    const payload = {
      schema: `wholeloop/${command.replaceAll(' ', '-')}@1`,
      profile,
      style: renderProfile(profile),
      ...(options['--explain']
        ? {
            sources: Object.fromEntries(
              Object.entries(config.sources).filter(([key]) => key.startsWith('profile.')),
            ),
          }
        : {}),
      ...(scope === 'run' && override ? { override: { profile: override } } : {}),
    }
    emitCommand(command, payload, io, json)
    return EXIT.ok
  } catch (error) {
    if (error instanceof CliError) throw error
    throw new CliError(error instanceof Error ? error.message : String(error))
  }
}
