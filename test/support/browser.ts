import type { EnvironmentRecipe } from '../../src/environment/recipe.js'
import { environmentRecipe } from './environment.js'

export { BROWSER_REFERENCE_IMAGES } from '../../src/acceptance/browser-reference.js'

import {
  BROWSER_KEEPALIVE,
  BROWSER_REFERENCE_IMAGES,
} from '../../src/acceptance/browser-reference.js'

/** The browser shares only this owned application's isolated network; it receives no workspace or credentials. */
export function browserRecipe(
  root: string,
  app: string,
  architecture: 'arm64' | 'amd64',
): EnvironmentRecipe {
  return withBrowserService(environmentRecipe(root, app, architecture))
}
/** Reuse the same fixed browser boundary for an assembled recipe. */
export function withBrowserService(recipe: EnvironmentRecipe): EnvironmentRecipe {
  recipe.services.push({
    id: 'browser',
    image: BROWSER_REFERENCE_IMAGES[recipe.backend.architecture],
    acquisition: 'cache-only',
    after: ['web'],
    mounts: [],
    start: {
      argv: ['node', '-e', BROWSER_KEEPALIVE],
      cwd: '/tmp',
      origin: { kind: 'recipe' },
    },
    readiness: { kind: 'tcp', port: 8931, timeoutMs: 15000 },
    ports: [{ container: 8931, publish: 'none' }],
    memoryMiB: 1024,
    cpus: 1,
    secrets: [],
  })
  recipe.limits.memoryMiB = 2304
  recipe.limits.cpus = 3
  return recipe
}
