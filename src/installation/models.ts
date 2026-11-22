// Reads tier-to-model mappings for one installation scope from that scope's own configuration file.
import { join } from 'node:path'
import { readConfig, userConfigPath } from '../config/load.js'
import { isObject, validate } from '../config/schema.js'
import { configuredModels, MODEL_CLIENTS, type ModelMap } from '../workers/models.js'

/**
 * A user-scope install reads only the user file and a project-scope install only the project
 * file. Merging layers would write a personal choice into files a repository commits, or let a
 * repository change the models of every personal installation.
 */
export function scopeModels(
  scope: 'user' | 'project',
  root: string,
  home: string,
  env: NodeJS.ProcessEnv = process.env,
  userFile = userConfigPath(env, home),
): Record<string, ModelMap> {
  const file = scope === 'user' ? userFile : join(root, '.wholeloop/config.yml')
  const values = readConfig(file, true)
  if (values === undefined) return {}
  const problems = validate(values, undefined, file)
  if (problems.length) throw new Error(problems.join('\n'))
  const answers = isObject(values) ? values.answers : undefined
  return Object.fromEntries(
    MODEL_CLIENTS.flatMap((client) => {
      const mapped = configuredModels(answers, client)
      return Object.keys(mapped).length ? [[client, mapped]] : []
    }),
  )
}
