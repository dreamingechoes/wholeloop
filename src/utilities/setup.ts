// `wl setup`: records the chosen profile and document or tracker providers at an explicit scope.
import { dirname, join } from 'node:path'
import { CliError } from '../cli/errors.js'
import { EXIT } from '../cli/io.js'
import { loadConfig, userConfigPath } from '../config/load.js'
import { resolveConfig } from '../config/resolve.js'
import { writeSettings } from '../config/write.js'
import { loadProviders, resolveProvider } from '../providers/load.js'

export function setup(
  root: string,
  options: { scope?: string; profile?: string; docs?: string; tracker?: string },
  userFile = userConfigPath(),
) {
  const loaded = loadConfig({ root, userFile })
  const registry = loadProviders({
    root,
    user: dirname(userFile),
    packages: loaded.values.extensions as string[],
  })
  if (registry.problems.length)
    throw new CliError(
      registry.problems.map((entry) => `${entry.file}: ${entry.message}`).join('\n'),
    )
  if (options.scope && !['user', 'project', 'run'].includes(options.scope))
    throw new CliError('--scope must be user, project or run')
  if (options.profile && !Object.hasOwn(loaded.presets, options.profile))
    throw new CliError(`Unknown profile: ${options.profile}`)
  if (options.docs) resolveProvider(registry, 'docs.create', options.docs)
  if (options.tracker) resolveProvider(registry, 'tracker.create-item', options.tracker)
  const requested = Boolean(options.profile || options.docs || options.tracker)
  if (!requested || !options.scope) {
    const question = (id: string, prompt: string, choices: string[]) => ({
      id,
      prompt,
      multi: false,
      options: choices.map((value) => ({ value, label: value })),
    })
    return {
      code: EXIT.input,
      payload: {
        schema: 'wholeloop/setup@1',
        applied: false,
        questions: [
          ...(!requested
            ? [
                question('profile', 'Which interaction profile?', Object.keys(loaded.presets)),
                question(
                  'docs',
                  'Which docs provider?',
                  registry.providers
                    .filter(({ manifest }) => manifest.operations['docs.create'])
                    .map(({ manifest }) => manifest.id),
                ),
                question(
                  'tracker',
                  'Which tracker provider?',
                  registry.providers
                    .filter(({ manifest }) => manifest.operations['tracker.create-item'])
                    .map(({ manifest }) => manifest.id),
                ),
              ]
            : []),
          ...(!options.scope
            ? [
                question('scope', 'Where should these choices be remembered?', [
                  'user',
                  'project',
                  'run',
                ]),
              ]
            : []),
        ],
      },
    }
  }
  const previous = loaded.values.profile as Record<string, unknown>
  const override = {
    ...(options.profile
      ? {
          profile: {
            preset: options.profile,
            ...loaded.presets[options.profile],
            language: previous.language,
            artifact_language: previous.artifact_language,
          },
        }
      : {}),
    ...(options.docs || options.tracker
      ? {
          providers: {
            ...(options.docs ? { docs: options.docs } : {}),
            ...(options.tracker ? { tracker: options.tracker } : {}),
          },
        }
      : {}),
  }
  const effective = resolveConfig(
    [
      { scope: 'user', values: loaded.values },
      { scope: 'run', values: override },
    ],
    loaded.presets,
  )
  const file = options.scope === 'project' ? join(root, '.wholeloop/config.yml') : userFile
  if (options.scope !== 'run') {
    writeSettings(file, [
      ...(override.profile ? [{ path: ['profile'], value: override.profile }] : []),
      ...(options.docs ? [{ path: ['providers', 'docs'], value: options.docs }] : []),
      ...(options.tracker ? [{ path: ['providers', 'tracker'], value: options.tracker }] : []),
    ])
  }
  return {
    code: EXIT.ok,
    payload: {
      schema: 'wholeloop/setup@1',
      scope: options.scope,
      applied: options.scope !== 'run',
      file: options.scope === 'run' ? null : file,
      override,
      values: options.scope === 'run' ? effective.values : loadConfig({ root, userFile }).values,
      questions: [],
    },
  }
}
