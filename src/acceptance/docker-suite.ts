import { createHash } from 'node:crypto'
import { posix, resolve } from 'node:path'
import { contractDigest } from '../contracts/compatibility.js'
import { DockerCli, type DockerTransport } from '../environment/docker-command.js'
import { EnvironmentRecipes } from '../environment/recipe-store.js'
import { EnvironmentResources } from '../environment/runtime.js'
import { workspaceSnapshot } from '../gates/snapshot.js'
import type { SuiteExecutor } from '../verification/suite.js'
import type { BehaviorObservation } from './assertions.js'
import { behaviorInput } from './behavior-input.js'
import { DockerAcceptanceBoundary } from './boundary.js'
import { AcceptanceError } from './contracts.js'
import { DockerBehaviorHost } from './docker-behavior.js'
import type { DeliveryAcceptance } from './store.js'

/** Reuse the existing round journal and cache; only the reviewed executor changes. */
export function dockerSuiteExecutor(
  acceptance: DeliveryAcceptance,
  digest: string,
  environment: string,
  round: { run: string; round: number },
  mapping: Readonly<Record<string, string>>,
  driver: DockerTransport = new DockerCli(),
): SuiteExecutor {
  return async (root, command, timeoutMs) => {
    const { plan } = acceptance.assertCurrent(digest)
    const records = new EnvironmentResources(acceptance.planning.sources.files)
    const record = records.get(environment).record
    const candidate = record.candidates.find((c) => resolve(c.path) === resolve(root))
    const snapshot = workspaceSnapshot(root)
    const test = plan.cases.find((c) => c.id === mapping[command.ref])
    if (
      !candidate ||
      candidate.head !== snapshot.head ||
      candidate.snapshot !== snapshot.digest ||
      !test ||
      test.timeoutMs > timeoutMs
    )
      throw new AcceptanceError('suite-candidate-or-case')
    const input = behaviorInput(test)
    const recipe = new EnvironmentRecipes(records.files.root).get(record.recipe).recipe
    const declared = recipe.commands.find(
      (c) => c.id === input.command && c.service === input.service && c.phase === 'test',
    )
    if (
      input.kind !== 'cli' ||
      !declared ||
      input.stdin !== undefined ||
      contractDigest(declared.command.argv) !== contractDigest(command.argv) ||
      declared.command.cwd !== posix.join(`/workspace/${candidate.repository}`, command.cwd) ||
      !test.assertions.some(
        (a) => a.subject === 'exit' && a.operator === 'equals' && a.expected === '0',
      )
    )
      throw new AcceptanceError('suite-command-mapping')
    const result = await acceptance.executeCase(
      digest,
      test.id,
      `suite-${contractDigest({ round, ref: command.ref }).slice(0, 40)}`,
      new DockerAcceptanceBoundary(records, environment, driver),
      new DockerBehaviorHost(acceptance, digest, environment, test.id, driver),
    )
    const artifact = result.artifacts[0]
    if (!artifact || result.invocationState !== 'stopped')
      throw new AcceptanceError('suite-observation-unavailable')
    const observed = JSON.parse(
      acceptance.artifacts.bytes(plan.run, artifact).toString('utf8'),
    ) as { observation: BehaviorObservation }
    const app = observed.observation.application
    if (!app) throw new AcceptanceError('suite-application-unobserved')
    return {
      receipt: {
        ref: command.ref,
        exitCode: result.status === 'passed' ? app.code : app.code || -1,
        signal: '',
        stdout: createHash('sha256').update(app.stdout).digest('hex'),
        stderr: createHash('sha256').update(app.stderr).digest('hex'),
      },
      output: { ref: command.ref, stdout: app.stdout, stderr: app.stderr },
    }
  }
}
