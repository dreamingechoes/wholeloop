import { type DeliveryWorkspaceRequest, DeliveryWorkspaces } from '../../src/delivery/workspaces.js'
import { authorization, fixture } from './delivery.js'

export async function deliveryWorkspaceFixture(
  run: (context: {
    workspaces: DeliveryWorkspaces
    request: DeliveryWorkspaceRequest
    root: string
    dir: string
  }) => Promise<void>,
  options: { prefix?: string; effects?: boolean } = {},
) {
  await fixture(async ({ plan, planning, root, dir }) => {
    const prepared = planning.preparePlan(plan),
      workspaces = new DeliveryWorkspaces(planning.sources.files.root),
      input = authorization(plan, prepared.digest)
    if (options.prefix) for (const repo of input.repositories) repo.topicPrefix = options.prefix
    if (options.effects === false) input.effects = ['source.read', 'report.write']
    const grant = workspaces.effects.lifecycle.authority.authorize(input)
    workspaces.effects.lifecycle.track({ run: plan.run, revision: 1, grant: grant.grant.id })
    workspaces.effects.lifecycle.transition(plan.run, {
      to: 'queued',
      reason: 'Exercise an owned delivery workspace.',
    })
    await run({
      workspaces,
      root,
      dir,
      request: {
        schema: 'wholeloop/delivery-workspace-request@1',
        run: plan.run,
        revision: 1,
        plan: prepared.digest,
        unit: 'contract',
        key: 'first',
        parts: [],
      },
    })
  })
}
