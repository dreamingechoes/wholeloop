// Decides where project code runs for a supervised step: Docker unless a person chose the host.
import { join } from 'node:path'
import { readConfig } from '../config/load.js'
import { isObject } from '../config/schema.js'

export const EXECUTION_ANSWER = 'execution:project-code'
export const IMAGE_ANSWER = 'execution:image'
export interface ExecutionChoice {
  isolation: 'docker' | 'host'
  /** `default` is Docker; host is only ever an explicit run flag or a repository answer. */
  source: 'default' | 'run' | 'repository'
}

/**
 * Only the committed project file can choose host execution for a repository. A user-level
 * answer would turn off isolation in every repository at once, which ADR-0257 rules out by
 * requiring the choice per run or per repository.
 */
export function repositoryExecution(root: string): 'docker' | 'host' | undefined {
  const values = readConfig(join(root, '.wholeloop/config.yml'), true)
  const answers = isObject(values) && isObject(values.answers) ? values.answers : {}
  const value = answers[EXECUTION_ANSWER]
  if (value === undefined) return undefined
  if (value !== 'docker' && value !== 'host')
    throw new Error(`answers.${EXECUTION_ANSWER} must be docker or host`)
  return value
}

export function executionChoice(root: string, run?: string): ExecutionChoice {
  if (run !== undefined) {
    if (run !== 'docker' && run !== 'host') throw new Error('Use --execution docker or host')
    return { isolation: run, source: 'run' }
  }
  const repository = repositoryExecution(root)
  return repository
    ? { isolation: repository, source: 'repository' }
    : { isolation: 'docker', source: 'default' }
}

/** Image references are passed to the Docker CLI as one argument; options never start with -. */
const IMAGE = /^[A-Za-z0-9][A-Za-z0-9._/:@+-]{0,254}$/
export function checkImage(value: string): string {
  if (!IMAGE.test(value))
    throw new Error(`Image '${value}' is not a container image reference such as node:22-bookworm`)
  return value
}

/** The image named for this run, else the remembered one; layered answers let a team share it. */
export function chosenImage(answers: unknown, run?: string): string | undefined {
  if (run !== undefined) return checkImage(run)
  const value = isObject(answers) ? answers[IMAGE_ANSWER] : undefined
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new Error(`answers.${IMAGE_ANSWER} must be an image`)
  return checkImage(value)
}

/** The person-facing phrase every display and refusal uses for host execution. */
export const NOT_ISOLATED = 'ran on this machine, not isolated'

export const SETUP_ANSWER = 'execution:setup'
/**
 * Installers whose whole output lands in one known folder, which is kept out of the worktree
 * (ADR-0260). Others write elsewhere in the repository or the home directory, so they are refused
 * rather than guessed; a prepared image or host execution covers them.
 */
export const SETUP_INSTALLERS: Readonly<Record<string, string>> = {
  npm: 'node_modules',
  pnpm: 'node_modules',
  bun: 'node_modules',
  uv: '.venv',
  composer: 'vendor',
}
export interface ProjectSetup {
  argv: string[]
  /** The workspace folder the installer writes, mounted from outside the worktree. */
  dependencies: string
}

/** One plain command, run without a shell, so nothing can chain or redirect around the rule. */
export function checkSetup(value: string): ProjectSetup {
  const argv = value.trim().split(/\s+/).filter(Boolean)
  const installer = argv[0] ?? ''
  const dependencies = SETUP_INSTALLERS[installer]
  if (
    !dependencies ||
    argv.length > 16 ||
    value.length > 256 ||
    argv.some((token) => !/^[A-Za-z0-9_@%+=:,./-]+$/.test(token))
  )
    throw new Error(
      `Setup '${value}' must be one ${Object.keys(SETUP_INSTALLERS).join(', ')} command without shell syntax, such as npm ci`,
    )
  return { argv, dependencies }
}

/** Like host execution, setup with network is a per-repository choice in the committed file. */
export function repositorySetup(root: string): ProjectSetup | undefined {
  const values = readConfig(join(root, '.wholeloop/config.yml'), true)
  const answers = isObject(values) && isObject(values.answers) ? values.answers : {}
  const value = answers[SETUP_ANSWER]
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new Error(`answers.${SETUP_ANSWER} must be a command`)
  return checkSetup(value)
}

/** Detection only proposes a setup; it is never applied without the person choosing it. */
export function proposedSetup(files: readonly string[]): string | undefined {
  if (files.includes('package-lock.json')) return 'npm ci'
  if (files.includes('pnpm-lock.yaml')) return 'pnpm install --frozen-lockfile'
  if (files.includes('bun.lock') || files.includes('bun.lockb'))
    return 'bun install --frozen-lockfile'
  if (files.includes('uv.lock')) return 'uv sync --frozen'
  if (files.includes('composer.lock')) return 'composer install'
  return undefined
}
