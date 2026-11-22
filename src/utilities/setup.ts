// `wl setup`: records the chosen profile, providers and worker models at an explicit scope.
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { CliError } from '../cli/errors.js'
import { EXIT } from '../cli/io.js'
import { loadConfig, userConfigPath } from '../config/load.js'
import { resolveConfig } from '../config/resolve.js'
import { writeSettings } from '../config/write.js'
import { checkImage, EXECUTION_ANSWER, IMAGE_ANSWER } from '../execution/choice.js'
import { profileDescription } from '../profile/presets.js'
import { detectMcpByClient } from '../providers/detect.js'
import { loadProviders, resolveProvider } from '../providers/load.js'
import { providerAccess } from '../providers/source-access.js'
import {
  builtInModel,
  configuredModels,
  MODEL_TIERS,
  modelAnswer,
  parseModelChoices,
} from '../workers/models.js'

const ACCESS_WORDS: Record<string, string> = {
  native: 'built in',
  'available in this client': 'set up in this client',
  'configured in another client': 'set up in another client',
  unavailable: 'not set up',
}

export function setup(
  root: string,
  options: {
    scope?: string
    profile?: string
    docs?: string
    tracker?: string
    codehost?: string
    models?: string
    execution?: string
    image?: string
    client?: string
    home?: string
    env?: NodeJS.ProcessEnv
  },
  userFile = userConfigPath(),
) {
  const loaded = loadConfig({ root, userFile })
  let answers: Record<string, string> = {}
  try {
    if (options.models) answers = parseModelChoices(options.models)
    if (options.image) answers[IMAGE_ANSWER] = checkImage(options.image)
    if (options.execution) {
      if (!['docker', 'host'].includes(options.execution))
        throw new Error('Use --execution docker or host')
      // Host execution is a per-repository choice (ADR-0257); a user file would cover every one.
      if (options.scope !== 'project')
        throw new Error('Remember --execution for this repository with --scope project')
      answers[EXECUTION_ANSWER] = options.execution
    }
  } catch (error) {
    throw new CliError((error as Error).message)
  }
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
  if (options.codehost) resolveProvider(registry, 'codehost.open-draft-pr', options.codehost)
  const requested = Boolean(
    options.profile ||
      options.docs ||
      options.tracker ||
      options.codehost ||
      Object.keys(answers).length,
  )
  if (!requested || !options.scope) {
    type Choice = { value: string; label: string; description?: string; evidence?: string }
    const question = (id: string, prompt: string, choices: Choice[], freeText = false) => ({
      id,
      prompt,
      multi: false,
      options: choices,
      ...(freeText ? { freeText: true } : {}),
    })
    const plain = (values: string[]) => values.map((value) => ({ value, label: value }))
    // Detection only labels choices: it reads MCP declarations, never values, and proves no
    // connection. A client whose configuration cannot be read is labelled, not guessed.
    const detection = requested
      ? undefined
      : detectMcpByClient(root, options.home ?? homedir(), options.env ?? process.env)
    const unreadable = detection?.problems.some(({ target }) => target === options.client)
    const providerChoices = (operation: string) =>
      registry.providers
        .filter(({ manifest }) => manifest.operations[operation])
        .map(({ manifest }) => {
          const { access, evidence } = providerAccess(
            manifest,
            detection?.declarations ?? [],
            options.client,
            options.env?.PATH,
          )
          const label =
            unreadable && manifest.access.mcp && access !== 'available in this client'
              ? 'unknown: MCP settings unreadable'
              : access === 'executable only'
                ? `${manifest.access.cli?.binary} found; sign-in not checked`
                : (ACCESS_WORDS[access] ?? access)
          // Evidence stays in the machine payload; the label is what a person compares.
          return { value: manifest.id, label: `${manifest.name} · ${label}`, evidence }
        })
    const current = configuredModels(loaded.values.answers, options.client)
    return {
      code: EXIT.input,
      payload: {
        schema: 'wholeloop/setup@1',
        applied: false,
        questions: [
          ...(!requested
            ? [
                question(
                  'profile',
                  'Which interaction profile?',
                  Object.entries(loaded.presets).map(([value, dials]) => ({
                    value,
                    label: value,
                    description: profileDescription(dials),
                  })),
                ),
                question('docs', 'Which docs provider?', providerChoices('docs.create')),
                question(
                  'tracker',
                  'Which tracker provider?',
                  providerChoices('tracker.create-item'),
                ),
                question(
                  'codehost',
                  'Which code host should open draft pull requests?',
                  providerChoices('codehost.open-draft-pr'),
                ),
                // Only the executing client: model names belong to one client and account.
                ...(options.client
                  ? MODEL_TIERS.map((tier) =>
                      question(
                        modelAnswer(options.client as string, tier),
                        `Which model should ${options.client} use for ${tier} workers? Skip to keep ${current[tier] ?? builtInModel(options.client as string, tier)}.`,
                        plain(
                          options.client === 'claude'
                            ? ['inherit', 'haiku', 'sonnet', 'opus']
                            : ['inherit'],
                        ),
                        true,
                      ),
                    )
                  : []),
              ]
            : []),
          ...(!options.scope
            ? [
                question(
                  'scope',
                  'Where should these choices be remembered?',
                  plain(['user', 'project', 'run']),
                ),
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
    ...(options.docs || options.tracker || options.codehost
      ? {
          providers: {
            ...(options.docs ? { docs: options.docs } : {}),
            ...(options.tracker ? { tracker: options.tracker } : {}),
            ...(options.codehost ? { codehost: options.codehost } : {}),
          },
        }
      : {}),
    ...(Object.keys(answers).length ? { answers } : {}),
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
      ...(options.codehost ? [{ path: ['providers', 'codehost'], value: options.codehost }] : []),
      ...Object.entries(answers).map(([key, value]) => ({ path: ['answers', key], value })),
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
