import { type InstallInput, metadata } from './contracts.js'
import { checkOwned } from './files.js'
import { installationPlan } from './plan.js'
import { installationScope, readReceipt, sameComponent } from './receipts.js'

/** Read owned receipts/files without acquiring a writer lock or activating native clients. */
export function inspectInstallation(input: InstallInput) {
  const base = {
    schema: 'wholeloop/installation-status@1',
    scope: input.context.scope,
    conformance: 'unverified',
    authenticated: false,
  }
  try {
    const { context, identity, control, artifact, receiptPath } = installationScope(input.context)
    const receipt = readReceipt(control, receiptPath, context, identity, artifact)
    const selected = receipt.components.filter((component) =>
      input.targets.includes(component.target),
    )
    const targets = [
      ...new Set([
        ...selected.map((component) => component.target),
        ...(receipt.pending?.targets ?? []),
      ]),
    ]
    if (receipt.pending)
      return { ...base, status: 'pending', targets, receipt: control.path(receiptPath) }
    if (!selected.length)
      return { ...base, status: 'absent', targets, receipt: control.path(receiptPath) }
    try {
      checkOwned(selected)
    } catch {
      return { ...base, status: 'changed', targets, receipt: control.path(receiptPath) }
    }
    const current = selected.every((component) =>
      (component.target === 'opencode' && input.context.opencodeVersion === undefined
        ? [context, { ...context, opencodeVersion: '2.0.0' }]
        : [context]
      ).some((selectedContext) =>
        sameComponent(
          metadata(
            installationPlan(
              component.target,
              selectedContext,
              artifact(component.target),
              input.canonical,
              input.core,
              input.version,
            ),
          ),
          component,
        ),
      ),
    )
    return {
      ...base,
      status: current ? 'current' : 'stale',
      targets,
      receipt: control.path(receiptPath),
    }
  } catch {
    return { ...base, status: 'invalid', targets: [] }
  }
}
