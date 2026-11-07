// Describes the acceptance inputs available to the public host, granting no execution.
import { BEHAVIOR_INPUT_SCHEMA, BEHAVIOR_RESPONSE_HEADERS } from '../acceptance/behavior-input.js'
import {
  REPOSITORY_DIFF_INPUT_SCHEMA,
  repositoryDiffFixture,
} from '../acceptance/repository-diff-input.js'
import { type NativeRuntime, nativeRuntimeRepository } from '../delivery/native-runtime.js'
import type { DeliveryPlan } from '../delivery/plan.js'
import { EnvironmentRecipes } from '../environment/recipe-store.js'
import type { RunnerStore } from './store.js'

/** Describe installed observation inputs; these declarations grant no execution or acceptance. */
export function publicAcceptanceContext(
  store: RunnerStore,
  plan: Readonly<DeliveryPlan>,
  runtime: Readonly<NativeRuntime>,
) {
  const fixtures = []
  for (const repository of plan.repositories) {
    const entry = nativeRuntimeRepository(runtime, repository.id)
    if (!entry) return undefined
    try {
      const recipe = new EnvironmentRecipes(store.files.root).get(entry.recipe).recipe
      fixtures.push({
        repository: repository.id,
        base: repository.base,
        repositoryDiffFixture: repositoryDiffFixture(repository.id, repository.base),
        fixture: { ref: `recipe:${entry.recipe}`, sha256: entry.recipe },
        services: recipe.services.map((service) => ({
          id: service.id,
          ports: service.ports
            .filter((port) => port.publish === 'loopback')
            .map((port) => port.container),
          commands: recipe.commands
            .filter((command) => command.service === service.id && command.phase === 'test')
            .map((command) => command.id),
        })),
      })
    } catch {
      return undefined
    }
  }
  return {
    inputSchema: structuredClone(BEHAVIOR_INPUT_SCHEMA),
    runners: [
      {
        kind: 'cli',
        capability: 'process.exec',
        assertionSubjects: ['exit', 'stdout', 'stderr', 'json'],
      },
      {
        kind: 'api',
        capability: 'http.request',
        assertionSubjects: ['status', 'header', 'json'],
      },
      {
        kind: 'cli',
        capability: 'repository.diff',
        inputSchema: structuredClone(REPOSITORY_DIFF_INPUT_SCHEMA),
        assertionSubjects: ['json'],
        observation: {
          fields: ['base', 'head', 'baseAncestor', 'changedPaths', 'changes'],
          changes:
            'Sorted complete committed-object changes: path, status, before/after mode and oid.',
        },
        fixture: 'Use the selected repositoryDiffFixture, not its recipe fixture.',
      },
    ],
    responseHeaders: [...BEHAVIOR_RESPONSE_HEADERS],
    fixtures,
    rule: 'runner.input is a JSON string. process.exec and http.request follow the top-level inputSchema; repository.diff follows its runner inputSchema and selects only a declared repository. The controller fixes its base and candidate head, rejects a dirty or moved candidate and observes complete committed changedPaths and mode/blob identities. CLI inputs select a declared test command; API inputs select a declared service/port and ordered request steps. Other capabilities are not installed by this controller. Missing observations never waive required criteria.',
  }
}
