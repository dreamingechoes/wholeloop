// Reopens a recorded Docker suite case without running the suite again.
import { createHash } from 'node:crypto'
import { contractDigest } from '../contracts/compatibility.js'
import type { SuiteResult } from '../verification/contracts.js'
import type { BehaviorObservation } from './assertions.js'
import { behaviorInput } from './behavior-input.js'
import { AcceptanceError } from './contracts.js'
import type { DeliveryAcceptance } from './store.js'

/** Recover only the original fixed-host case; reading cannot run a suite again. */
export function observedDockerSuiteCommand(
  acceptance: DeliveryAcceptance,
  digest: string,
  round: { run: string; round: number },
  command: string,
  caseId: string,
) {
  const { plan } = acceptance.get(digest),
    test = plan.cases.find((c) => c.id === caseId)
  if (
    test?.owner !== 'machine' ||
    test.applicability !== 'applicable' ||
    behaviorInput(test).kind !== 'cli'
  )
    throw new AcceptanceError('suite-observation-case')
  const result = acceptance.observedCase(
    digest,
    caseId,
    `suite-${contractDigest({ round, ref: command }).slice(0, 40)}`,
  )
  if (
    result.invocationState !== 'stopped' ||
    result.host.id !== 'docker-behavior' ||
    result.host.version !== '1' ||
    result.host.capability !== test.runner.capability
  )
    throw new AcceptanceError('suite-observation-unavailable')
  const artifact = result.artifacts[0]
  if (!artifact) throw new AcceptanceError('suite-observation-unavailable')
  const body = JSON.parse(acceptance.artifacts.bytes(plan.run, artifact).toString('utf8')) as {
      observation: BehaviorObservation
      execution?: { controllerOperation?: unknown; container?: unknown }
    },
    app = body.observation?.application
  if (
    !app ||
    !Number.isInteger(app.code) ||
    typeof app.stdout !== 'string' ||
    typeof app.stderr !== 'string'
  )
    throw new AcceptanceError('suite-application-unobserved')
  const receipt: SuiteResult['commands'][number] = {
    ref: command,
    exitCode: result.status === 'passed' ? app.code : app.code || -1,
    signal: '',
    stdout: createHash('sha256').update(app.stdout).digest('hex'),
    stderr: createHash('sha256').update(app.stderr).digest('hex'),
  }
  return {
    receipt,
    applicationExit: app.code,
    execution: body.execution,
    output: { ref: command, stdout: app.stdout, stderr: app.stderr },
    result,
    artifact,
  }
}
