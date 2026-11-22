// Maps canonical worker tiers to a model per client from explicitly remembered answers.
// Absent answers keep each client's built-in rendering, so nothing changes until a person chooses.
import { isObject } from '../config/schema.js'
import { guidanceClient } from '../discovery/clients.js'

export const MODEL_TIERS = ['fast', 'standard', 'deep'] as const
export const MODEL_CLIENTS = [
  'claude',
  'codex',
  'opencode',
  'copilot',
  'gemini',
  'antigravity',
  'cursor',
] as const
export type ModelTier = (typeof MODEL_TIERS)[number]
export type ModelMap = Partial<Record<ModelTier, string>>

/**
 * `inherit` uses the client's selected session model. Other values are passed to the client
 * unchanged, so only a bounded identifier alphabet is accepted: no spaces, quotes or control
 * characters can reach a rendered YAML or TOML header even before the serializer escapes it.
 */
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,127}$/
export const modelAnswer = (client: string, tier: ModelTier) => `model:${client}:${tier}`

export function checkModel(value: string): string {
  if (!MODEL.test(value))
    throw new Error(
      `Model '${value}' is not a client model identifier; use inherit or a name such as claude-sonnet-4-5`,
    )
  return value
}

/** Claude Code's native aliases, rendered for unmapped tiers since ADR-0048. */
export const CLAUDE_ALIASES: Record<ModelTier, string> = {
  fast: 'haiku',
  standard: 'sonnet',
  deep: 'opus',
}
/** What an unmapped tier renders: Claude's native aliases, the session model elsewhere. */
export const builtInModel = (client: string, tier: ModelTier) =>
  client === 'claude' ? CLAUDE_ALIASES[tier] : 'the session model'

/** Parses `client:tier=model[,…]`; every pair must be valid before anything is remembered. */
export function parseModelChoices(text: string): Record<string, string> {
  const choices: Record<string, string> = {}
  for (const pair of text.split(',')) {
    const match = /^([a-z]+):([a-z]+)=(.+)$/.exec(pair.trim())
    const [, client = '', tier = '', model = ''] = match ?? []
    if (!match || !MODEL_CLIENTS.includes(client as (typeof MODEL_CLIENTS)[number]))
      throw new Error(
        `Use --models <client>:<tier>=<model>[,…] with a client among ${MODEL_CLIENTS.join(', ')}`,
      )
    if (!MODEL_TIERS.includes(tier as ModelTier))
      throw new Error(`Unknown model tier '${tier}'; use ${MODEL_TIERS.join(', ')}`)
    const key = modelAnswer(client, tier as ModelTier)
    if (Object.hasOwn(choices, key)) throw new Error(`Duplicate model choice: ${client}:${tier}`)
    choices[key] = checkModel(model)
  }
  return choices
}

/**
 * The tiers a person mapped for one client. A malformed remembered value is refused rather than
 * skipped: dropping it would render or preview the client's default while the person believes
 * their choice applies.
 */
export function configuredModels(answers: unknown, client: string | undefined): ModelMap {
  const mapped: ModelMap = {}
  if (!client || !isObject(answers)) return mapped
  for (const tier of MODEL_TIERS) {
    const value = answers[modelAnswer(client, tier)]
    if (value === undefined) continue
    if (typeof value !== 'string')
      throw new Error(`answers.${modelAnswer(client, tier)} must be a model identifier`)
    mapped[tier] = checkModel(value)
  }
  return mapped
}

export interface WorkerModels {
  client: string
  tiers: ModelMap
}
/**
 * Mappings for the executing client, for cost previews. Configuration is read only when a
 * packaged client launched the command: a terminal call has no client whose agents could carry
 * a mapping, so it keeps the unmapped preview without an extra read.
 */
export function clientModels(
  answers: () => unknown,
  client = guidanceClient(),
): WorkerModels | undefined {
  if (!client) return undefined
  const tiers = configuredModels(answers(), client)
  return Object.keys(tiers).length ? { client, tiers } : undefined
}

/** The same preview mapping read through an engine's layered configuration. */
export const workerModels = (engine: { configuration(): { values: Record<string, unknown> } }) =>
  clientModels(() => engine.configuration().values.answers)
