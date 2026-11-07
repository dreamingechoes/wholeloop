// Checks ownership of recorded repository-diff observations from private receipts.
import type { AcceptanceCase, AcceptanceCaseResult } from '../acceptance/contracts.js'
import {
  REPOSITORY_DIFF_OPERATIONS,
  type RepositoryDiffExecution,
  repositoryDiffArguments,
} from '../acceptance/repository-diff.js'
import { repositoryDiffInput } from '../acceptance/repository-diff-input.js'
import { DeliveryAcceptance } from '../acceptance/store.js'
import { contractDigest } from '../contracts/compatibility.js'
import { readSourceFile } from '../delivery/input.js'
import { EnvironmentResources } from '../environment/runtime.js'
import { type ManagedProcessObservation, ManagedRunnerProcess } from './native-process.js'
import { DeliveryRunnerError } from './route.js'
import type { RunnerStore } from './store.js'

/** Read existing private receipts only: historical proof cannot launch or renew an observation. */
export function assertRepositoryDiffOwnership(
  store: RunnerStore,
  stage: string,
  environment: string,
  test: AcceptanceCase,
  result: AcceptanceCaseResult,
  value: unknown,
  reads: readonly ManagedProcessObservation[],
  deadline: string,
) {
  const execution = value as RepositoryDiffExecution | undefined,
    repository = repositoryDiffInput(test).repository,
    candidate = new EnvironmentResources(store.files)
      .get(environment)
      .record.candidates.find((candidate) => candidate.repository === repository),
    acceptance = new DeliveryAcceptance(store.files.root),
    pinned = acceptance.get(result.plan).plan,
    plan = acceptance.planning.getPlan(pinned.run, pinned.revision).plan,
    declared = plan.repositories.find((entry) => entry.id === repository)
  if (
    !execution ||
    !candidate ||
    !declared ||
    result.host.id !== 'docker-repository-diff' ||
    execution.kind !== 'repository.diff' ||
    execution.invocation !== result.invocation ||
    !Array.isArray(execution.calls) ||
    execution.calls.length !== REPOSITORY_DIFF_OPERATIONS.length ||
    contractDigest(execution.source) !==
      contractDigest({
        repository,
        path: candidate.path,
        base: declared.base,
        head: candidate.head,
        snapshot: candidate.snapshot,
      })
  )
    throw new DeliveryRunnerError('integration-stage-original-git-owner')
  const ids = new Set<string>()
  execution.calls.forEach((call, index) => {
    const operation = REPOSITORY_DIFF_OPERATIONS[index],
      readIndex = reads.findIndex((read) => read.invocation === call.invocation),
      read = reads[readIndex]
    if (
      !operation ||
      !read ||
      ids.has(call.invocation) ||
      call.operation !== operation ||
      call.invocation !==
        contractDigest({
          stage,
          read: readIndex,
          kind: 'repository.diff',
          repository,
          operation,
          case: result.invocation,
        }) ||
      call.evidence !== read.evidence ||
      read.invocationState !== 'stopped' ||
      read.signal ||
      (read.code !== 0 && !(operation === 'ancestor' && read.code === 1))
    )
      throw new DeliveryRunnerError('integration-stage-original-git-owner')
    ids.add(call.invocation)
    const manager = new ManagedRunnerProcess(store.files, call.invocation),
      intent = JSON.parse(
        readSourceFile(store.files.root, `${manager.relative}/intent.json`, 65536),
      ) as { cwd: string; command: string; deadline: string }
    if (
      intent.cwd !== candidate.path ||
      intent.command !==
        contractDigest({
          command: 'git',
          args: repositoryDiffArguments(operation, declared.base, candidate.head),
          input: contractDigest(''),
        }) ||
      !Number.isFinite(Date.parse(intent.deadline)) ||
      intent.deadline > deadline
    )
      throw new DeliveryRunnerError('integration-stage-original-git-owner')
  })
}
