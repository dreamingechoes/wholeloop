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
