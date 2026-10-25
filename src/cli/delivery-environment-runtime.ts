import { resolve } from 'node:path'
import { readSourceFile } from '../delivery/input.js'
import { DockerCli } from '../environment/docker-command.js'
import { DOCKER_REFERENCE_HELPER, dockerPreflight } from '../environment/docker-policy.js'
import { inspectEnvironment } from '../environment/inspect.js'
import { DeliveryEnvironments, type EnvironmentProvisionRequest } from '../environment/provision.js'
import { EnvironmentRecipes } from '../environment/recipe-store.js'
import { EnvironmentResources } from '../environment/runtime.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'

export async function deliveryEnvironmentRuntimeCommand(
  command: string,
  { options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
): Promise<number> {
  try {
    const recipes = new EnvironmentRecipes(
      typeof options['--store'] === 'string' ? resolve(root, options['--store']) : undefined,
    )
    const driver = new DockerCli()
    let receipt: unknown
    let code: number = EXIT.ok
    if (command === 'delivery environment-backend') {
      const digest = options['--digest']
      if (typeof digest !== 'string')
        throw new CliError('Provide --digest <recipe-sha256>', EXIT.input)
      const preflight = await dockerPreflight(
        driver,
        recipes.get(digest).recipe,
        DOCKER_REFERENCE_HELPER,
      )
      receipt = preflight
      if (!preflight.available) code = EXIT.precondition
    } else if (command === 'delivery environment-status') {
      const id = options['--environment']
      if (typeof id !== 'string')
        throw new CliError('Provide --environment <environment-id>', EXIT.input)
      receipt = await inspectEnvironment(new EnvironmentResources(recipes.files), id, driver)
    } else {
      if (typeof options['--file'] !== 'string')
        throw new CliError('Provide --file <provision.json>', EXIT.input)
      const boundary =
        typeof options['--root'] === 'string' ? resolve(root, options['--root']) : root
      const request = JSON.parse(
        readSourceFile(boundary, options['--file'], 8 * 1024 * 1024),
      ) as EnvironmentProvisionRequest
      const result = await new DeliveryEnvironments(recipes.files.root, driver).provision(request)
      receipt = result
      if (result.status !== 'ready') code = EXIT.precondition
    }
    io.out(JSON.stringify(receipt, null, json ? undefined : 2))
    return code
  } catch (error) {
    if (error instanceof CliError) throw error
    throw new CliError(
      'Environment execution unavailable; inspect retained owned resources and the current grant; diagnostics omitted',
      EXIT.precondition,
    )
  }
}
