import { randomUUID } from 'node:crypto'
import { rmdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { artifactDigest } from '../adapters/generate.js'
import { inside } from '../state/paths.js'
import {
  type InstallationResult,
  type InstallInput,
  metadata,
  owned,
  type Pending,
  type Receipt,
  TARGETS,
} from './contracts.js'
import {
  archive,
  checkOwned,
  checkPrivate,
  exists,
  matches,
  missingDirectories,
  writeOwned,
} from './files.js'
import { installationPlan } from './plan.js'
import { allowed, installationScope, readReceipt, sameComponent, saveReceipt } from './receipts.js'

export type { InstallationResult, InstallInput } from './contracts.js'

export function manageInstallation(action: 'install' | 'uninstall', input: InstallInput) {
  const { canonical, core, version } = input
  if (!core.startsWith('#!/usr/bin/env node\n') || Buffer.byteLength(core) > 4 * 1024 * 1024)
    throw new Error('Use a bounded built wholeloop core for native installation management')
  if (
    !input.targets.length ||
    new Set(input.targets).size !== input.targets.length ||
    input.targets.some((target) => !TARGETS.includes(target as (typeof TARGETS)[number]))
  )
    throw new Error('Choose unique installation targets: claude,codex,opencode,copilot')
  if (!['user', 'project'].includes(input.context.scope))
    throw new Error('Choose --scope user|project')
  const { context, identity, store, control, artifact, receiptPath } = installationScope(
    input.context,
  )
  const operate = (): InstallationResult => {
    const receipt = readReceipt(control, receiptPath, context, identity, artifact)
    if (action === 'install' && receipt.pending)
      throw new Error(
        'An installation is pending; inspect its writer/receipt and recover pending targets only after the writer stops',
      )
    if (receipt.pending?.targets.some((target) => !input.targets.includes(target)))
      throw new Error('Recover all pending targets together before another uninstall')
    const selected = receipt.components.filter((component) =>
      input.targets.includes(component.target),
    )
    const recover = receipt.pending
      ? [...receipt.pending.before, ...receipt.pending.after].filter((component) =>
          input.targets.includes(component.target),
        )
      : []
    const previous = checkOwned(
      [...selected, ...recover],
      action === 'uninstall' || !!receipt.pending,
    )
    const plans =
      action === 'install'
        ? input.targets.map((target) =>
            installationPlan(target, context, artifact(target), canonical, core, version),
          )
        : []
    const after = plans.map(metadata)
    const newFiles = plans.flatMap((plan) => plan.files)
    const duplicates = new Set<string>()
    for (const file of newFiles) {
      if (duplicates.has(file.path))
        throw new Error('Selected clients resolve to colliding native output paths')
      duplicates.add(file.path)
      const component = after.find((entry) => entry.target === file.component)
      if (!component || !allowed(owned(file), component, context))
        throw new Error('Native output escapes the selected installation scope')
      if (exists(file.path) && !previous.has(file.path))
        throw new Error(
          'Native output already exists without this installation ownership; preserve it instead of overwriting',
        )
    }
    if (action === 'install')
      checkPrivate(
        after.map((component) => ({
          ...component,
          files: [
            ...component.files,
            ...selected
              .filter((entry) => entry.target === component.target)
              .flatMap((entry) => entry.files),
          ],
        })),
      )
    const same =
      action === 'install' &&
      after.every((component) =>
        sameComponent(
          component,
          selected.find((entry) => entry.target === component.target),
        ),
      )
    const base: Pick<
      InstallationResult,
      'schema' | 'scope' | 'targets' | 'receipt' | 'conformance' | 'authenticated'
    > = {
      schema: `wholeloop/${action}@1`,
      scope: context.scope,
      targets: input.targets,
      receipt: control.path(receiptPath),
      conformance: 'unverified',
      authenticated: false,
    }
    if (same || (action === 'uninstall' && !selected.length && !recover.length))
      return {
        ...base,
        status: same ? 'already-correct' : 'already-absent',
        artifacts: plans.map((plan) => plan.artifact),
      }
    if (input.dryRun) {
      const removed = [...previous.keys()].filter(
        (path) => !newFiles.some((file) => file.path === path) && exists(path),
      )
      return {
        ...base,
        status: 'planned',
        files:
          action === 'install'
            ? newFiles
                .filter(
                  (file) =>
                    !(previous.get(file.path) ?? []).some(
                      (entry) =>
                        entry.mode === file.mode && entry.sha256 === artifactDigest(file.content),
                    ),
                )
                .map((file) => file.path)
            : removed,
        remove: removed,
        artifacts: plans.map((plan) => plan.artifact),
      }
    }
    const directories = [
      ...new Set([...receipt.directories, ...missingDirectories(newFiles, identity)]),
    ]
    const backup = receipt.pending?.backup ?? `backups/${randomUUID()}`
    const pending: Pending = {
      kind: action,
      targets: [...input.targets],
      before: [...selected, ...recover].filter(
        (component, index, all) =>
          all.findIndex((other) => sameComponent(component, other)) === index,
      ),
      after,
      backup,
    }
    const changing: Receipt = { ...receipt, directories, pending }
    saveReceipt(control, receiptPath, changing)
    archive(
      control,
      backup,
      new Map(
        [...previous].filter(([path, versions]) => {
          const next = newFiles.find((file) => file.path === path)
          return (
            !next ||
            !versions.some(
              (file) => file.sha256 === artifactDigest(next.content) && file.mode === next.mode,
            )
          )
        }),
      ),
    )
    let removalCore = ''
    if (action === 'uninstall') {
      // The selected installed core may be removed; retain a checked executable for the Git handoff.
      const digest = artifactDigest(core)
      const relative = `${backup}/wl-${digest}.mjs`
      const existing = control.read(relative)
      if (existing === undefined) control.atomic(relative, core)
      else if (artifactDigest(existing) !== digest)
        throw new Error('The retained removal core changed; preserve it before continuing')
      removalCore = control.path(relative)
    }
    if (action === 'install')
      for (const file of [...newFiles].sort(
        (a, b) =>
          Number(!inside(artifact(a.component), a.path)) -
            Number(!inside(artifact(b.component), b.path)) || a.path.localeCompare(b.path),
      )) {
        const prior = previous.get(file.path) ?? []
        if (
          !prior.some(
            (entry) =>
              entry.sha256 === artifactDigest(file.content) &&
              entry.mode === file.mode &&
              matches(entry),
          )
        )
          writeOwned(file, prior)
      }
    for (const [path, versions] of previous)
      if (!newFiles.some((file) => file.path === path) && exists(path)) {
        if (!versions.some(matches))
          throw new Error('An owned file changed before removal; preserve the pending installation')
        unlinkSync(path)
      }
    const components = [
      ...receipt.components.filter((component) => !input.targets.includes(component.target)),
      ...after,
    ].sort((a, b) => a.target.localeCompare(b.target))
    for (const directory of [...directories].sort((a, b) => b.length - a.length))
      if (exists(directory))
        try {
          rmdirSync(directory)
        } catch (error) {
          if (!['ENOTEMPTY', 'EEXIST'].includes((error as NodeJS.ErrnoException).code ?? ''))
            throw error
        }
    const retained = directories.filter(
      (path) =>
        exists(path) &&
        components.some((component) => component.files.some((file) => inside(path, file.path))),
    )
    const completed: Receipt = {
      schema: receipt.schema,
      identity,
      scope: context.scope,
      components,
      directories: retained,
    }
    if (components.length) saveReceipt(control, receiptPath, completed)
    else {
      saveReceipt(control, `${backup}/receipt.json`, changing)
      unlinkSync(control.path(receiptPath))
    }
    return {
      ...base,
      status: action === 'install' ? 'installed' : 'uninstalled',
      backup: control.path(backup),
      artifacts: plans.map((plan) => plan.artifact),
      ...(action === 'install'
        ? {
            activation: {
              native: 'restart-and-verify',
              gitHooks: 'per-repository-required',
              command: [
                'node',
                join(plans[0]?.artifact ?? artifact(input.targets[0] ?? ''), 'bin/wl.mjs'),
                'guard',
                'hooks',
                'install',
                '--repo',
                context.root,
                '--store',
                store.root,
                '--json',
              ],
            },
          }
        : {
            removal: {
              native: 'restart-and-verify-removal',
              gitHooks: 'managed-separately',
              command: [
                'node',
                removalCore,
                'guard',
                'hooks',
                'uninstall',
                '--repo',
                context.root,
                '--store',
                store.root,
                '--json',
              ],
            },
          }),
    }
  }
  return input.dryRun ? operate() : control.locked(operate)
}
