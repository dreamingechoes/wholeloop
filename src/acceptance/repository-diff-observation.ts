import { contractDigest } from '../contracts/compatibility.js'
import { readSourceFile } from '../delivery/input.js'
import { EnvironmentResources } from '../environment/runtime.js'
import { ManagedRunnerProcess } from '../runner/native-process.js'
import { type AcceptanceCase, type AcceptanceCaseResult, AcceptanceError } from './contracts.js'
import {
  REPOSITORY_DIFF_OPERATIONS,
  type RepositoryDiffExecution,
  repositoryDiffArguments,
} from './repository-diff.js'
import { repositoryDiffFixture, repositoryDiffInput } from './repository-diff-input.js'
import type { DeliveryAcceptance } from './store.js'

/** A multi-read controller case has original read receipts, never a fabricated application process. */
export function observedRepositoryDiff(
  acceptance: DeliveryAcceptance,
  result: AcceptanceCaseResult,
  test: AcceptanceCase,
) {
  const { plan } = acceptance.get(result.plan),
    repository = repositoryDiffInput(test).repository,
    declared = acceptance.planning
      .getPlan(plan.run, plan.revision)
      .plan.repositories.find((entry) => entry.id === repository),
    files = acceptance.planning.sources.files,
    candidate = new EnvironmentResources(files)
      .get(result.bindings.environment)
      .record.candidates.find((entry) => entry.repository === repository),
    artifact = result.artifacts[0]
  if (
    !declared ||
    !candidate ||
    !artifact ||
    result.host.id !== 'docker-repository-diff' ||
    result.host.version !== '1' ||
    result.host.capability !== 'repository.diff' ||
    result.process ||
    contractDigest(test.fixture) !==
      contractDigest(repositoryDiffFixture(repository, declared.base))
  )
    throw new AcceptanceError('repository-diff-read-evidence-required')
  const execution = (
    JSON.parse(acceptance.artifacts.bytes(plan.run, artifact).toString('utf8')) as {
      execution?: RepositoryDiffExecution
    }
  ).execution
  if (
    execution?.kind !== 'repository.diff' ||
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
      }) ||
    new Set(execution.calls.map((call) => call.invocation)).size !== execution.calls.length
  )
    throw new AcceptanceError('repository-diff-read-evidence-required')
  const reads = ManagedRunnerProcess.observeAll(
      files,
      execution.calls.map((call) => call.invocation),
    ),
    intent = JSON.parse(
      readSourceFile(
        files.root,
        `delivery/acceptance-cases/${result.plan}/${result.case}/${result.key}/intent.json`,
        65536,
      ),
    ) as { deadline: string }
  execution.calls.forEach((call, index) => {
    const operation = REPOSITORY_DIFF_OPERATIONS[index],
      read = reads[index],
      manager = new ManagedRunnerProcess(files, call.invocation),
      processIntent = JSON.parse(
        readSourceFile(files.root, `${manager.relative}/intent.json`, 65536),
      ) as { cwd: string; command: string; deadline: string },
      outcome = JSON.parse(
        readSourceFile(files.root, `${manager.relative}/outcome.json`, 65536),
      ) as { at: string }
    if (
      !operation ||
      call.operation !== operation ||
      !read ||
      read.invocationState !== 'stopped' ||
      read.evidence !== call.evidence ||
      read.signal ||
      (read.code !== 0 && !(operation === 'ancestor' && read.code === 1)) ||
      processIntent.cwd !== candidate.path ||
      processIntent.command !==
        contractDigest({
          command: 'git',
          args: repositoryDiffArguments(operation, declared.base, candidate.head),
          input: contractDigest(''),
        }) ||
      !Number.isFinite(Date.parse(processIntent.deadline)) ||
      processIntent.deadline > intent.deadline ||
      !Number.isFinite(Date.parse(outcome.at)) ||
      outcome.at < result.startedAt ||
      outcome.at > result.endedAt
    )
      throw new AcceptanceError('repository-diff-read-evidence-required')
  })
  return execution
}
