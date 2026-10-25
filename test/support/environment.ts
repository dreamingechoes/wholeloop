import { sourceHash } from '../../src/delivery/input.js'
import { DOCKER_REFERENCE_HELPER } from '../../src/environment/docker-policy.js'
import type { EnvironmentRecipe } from '../../src/environment/recipe.js'

export function environmentRecipe(
  root: string,
  app: string,
  architecture: 'arm64' | 'amd64' = 'arm64',
): EnvironmentRecipe {
  return {
    schema: 'wholeloop/environment-recipe@1',
    backend: { id: 'docker', os: 'linux', architecture, emulation: 'forbid' },
    repositories: [{ id: 'app', root }],
    files: [
      { id: 'server', repository: 'app', ref: 'app.cjs', sha256: sourceHash(app), kind: 'script' },
    ],
    data: ['db'],
    services: [
      {
        id: 'web',
        image: DOCKER_REFERENCE_HELPER,
        acquisition: 'cache-only',
        after: [],
        mounts: [
          { kind: 'workspace', source: 'app', target: '/workspace/app', access: 'read' },
          { kind: 'data', source: 'db', target: '/data/db', access: 'write' },
        ],
        start: {
          argv: ['node', '/workspace/app/app.cjs'],
          cwd: '/workspace/app',
          origin: { kind: 'file', file: 'server' },
        },
        readiness: { kind: 'tcp', port: 3000, timeoutMs: 10000 },
        ports: [{ container: 3000, publish: 'loopback' }],
        memoryMiB: 128,
        cpus: 1,
        secrets: [],
      },
    ],
    commands: [],
    network: { setup: 'none', runtime: 'internal', destinations: [] },
    limits: {
      setupMs: 60000,
      readinessMs: 30000,
      services: 8,
      memoryMiB: 512,
      cpus: 2,
      outputBytes: 1048576,
    },
    retention: { failure: 'keep', success: 'keep', reviewAfterMs: 60000, expiryAction: 'retain' },
  }
}
