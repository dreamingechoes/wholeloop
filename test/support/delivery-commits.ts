import { DeliveryCommits } from '../../src/delivery/commits.js'
import { deliveryWorkspaceFixture } from './delivery-workspaces.js'

export const fixtureCommitMessage =
  'feat: implement the owned fixture\n\nPin the exact owned candidate before independent QA.\nQA remains pending against this topic commit.'
export async function deliveryCommitFixture(
  run: (input: {
    commits: DeliveryCommits
    workspace: string
    path: string
    root: string
  }) => Promise<void>,
) {
  await deliveryWorkspaceFixture(async ({ workspaces, request, root }) => {
    const record = workspaces.prepare(request)
    if ((await workspaces.execute(record.digest)).status !== 'ready')
      throw new Error('Fixture needs an observed owned workspace')
    await run({
      commits: new DeliveryCommits(workspaces.effects.lifecycle.journal.files.root),
      workspace: record.digest,
      path: record.repository.path,
      root,
    })
  })
}
export function prepareFixtureCommit(commits: DeliveryCommits, workspace: string, key = 'first') {
  const status = commits.workspaces.inspect(workspace)
  if (!status.head || !status.snapshot)
    throw new Error('Fixture needs an observed workspace candidate')
  return commits.prepare({
    schema: 'wholeloop/delivery-commit-request@1',
    workspace,
    key,
    head: status.head,
    snapshot: status.snapshot,
    message: fixtureCommitMessage,
  })
}
