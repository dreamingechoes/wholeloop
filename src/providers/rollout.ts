// The rollout host: drafts and flag proposals as store artifacts, never sent messages or flag
// writes.
import { resolve } from 'node:path'
import { isObject } from '../config/schema.js'
import { readRegularText } from '../fs/regular-file.js'
import { measurementDigest } from '../launch/measurement.js'
import type { StoreFiles } from '../state/files.js'
import { canonicalPath, inside } from '../state/paths.js'
import { PROVIDER_ID } from './manifest.js'
import type { OperationResult, ProviderHost } from './operations.js'

/** Native drafts/proposals are real external-store artifacts, never remote messages or flag writes. */
export function rolloutHost(
  files: StoreFiles,
  root: string,
  delegate?: ProviderHost,
): ProviderHost {
  return {
    invoke: async (call) => {
      if (
        !['comms.draft', 'flags.propose-change'].includes(call.operation) &&
        delegate?.supports?.(call)
      )
        return delegate.invoke(call)
      const { args } = call
      const store = (
        body: Record<string, unknown>,
        status: 'succeeded' | 'pending',
      ): OperationResult => {
        if (!PROVIDER_ID.test(call.provider))
          throw new Error('Use a validated provider identity for rollout artifacts')
        const content = `${JSON.stringify(body, null, 2)}\n`
        if (Buffer.byteLength(content) > 1024 * 1024)
          throw new Error('Rollout artifact exceeds 1 MiB')
        const digest = measurementDigest({
          provider: call.provider,
          operation: call.operation,
          body,
        })
        const path = `providers/rollout/${call.provider}/${digest}.json`
        const prior = files.read(path)
        if (prior !== undefined && prior !== content)
          throw new Error('Preserve the conflicting rollout artifact before continuing')
        if (prior === undefined) files.atomic(path, content)
        return {
          status,
          ref: files.path(path),
          body: JSON.stringify(body),
          revision: digest,
          complete: true,
        }
      }
      if (call.tool === 'wholeloop.comms.draft' && call.operation === 'comms.draft') {
        if (
          args.draft !== true ||
          args.send !== false ||
          typeof args.body !== 'string' ||
          !args.body.trim()
        )
          throw new Error('Native comms accepts explicit unsent drafts only')
        return store(
          {
            schema: 'wholeloop/comms-draft@1',
            destination: call.provider,
            body: args.body,
            ...(typeof args.audience === 'string' ? { audience: args.audience } : {}),
            draft: true,
            sent: false,
          },
          'succeeded',
        )
      }
      if (
        call.tool === 'wholeloop.flags.propose-change' &&
        call.operation === 'flags.propose-change'
      ) {
        if (
          args.apply !== false ||
          args.proposalOnly !== true ||
          typeof args.flag !== 'string' ||
          !args.flag.trim() ||
          typeof args.environment !== 'string' ||
          !args.environment.trim() ||
          !isObject(args.desired)
        )
          throw new Error(
            'Native flag proposals require explicit unapplied scope and desired state',
          )
        return store(
          {
            schema: 'wholeloop/flag-proposal@1',
            service: call.provider,
            flag: args.flag,
            environment: args.environment,
            desired: args.desired,
            applied: false,
            manualActionRequired: true,
          },
          'pending',
        )
      }
      if (call.tool === 'wholeloop.dashboard.handoff' && call.operation === 'dashboards.create') {
        if (typeof args.body !== 'string')
          throw new Error('A dashboard handoff needs its pinned JSON spec')
        const spec: unknown = JSON.parse(args.body)
        if (
          !isObject(spec) ||
          !isObject(spec.metric) ||
          typeof spec.metricRef !== 'string' ||
          !spec.metricRef.trim()
        )
          throw new Error(
            'A dashboard handoff needs its exact metric and resolvable source pointer',
          )
        return store(
          {
            schema: 'wholeloop/dashboard-handoff@1',
            destination: call.provider,
            spec,
            createdRemotely: false,
            manualActionRequired: true,
          },
          'pending',
        )
      }
      if (
        call.tool === 'wholeloop.config-flags.read-state' &&
        call.operation === 'flags.read-state'
      ) {
        if (typeof args.file !== 'string' || !args.file.trim())
          throw new Error('Confirm the repository flag configuration file')
        const file = canonicalPath(resolve(root, args.file))
        // The canonical path is checked, then read through one descriptor that refuses a link
        // swapped in after the check.
        const content = inside(canonicalPath(root), file)
          ? readRegularText(file, 1024 * 1024)
          : undefined
        if (content === undefined)
          throw new Error('Flag config must be a local repository file under 1 MiB')
        if (!PROVIDER_ID.test(call.provider))
          throw new Error('Use a validated provider identity for rollout artifacts')
        const data: unknown = JSON.parse(content)
        if (
          !isObject(data) ||
          data.schema !== 'wholeloop/config-flags@1' ||
          !Array.isArray(data.flags)
        )
          throw new Error(
            'Use explicit wholeloop/config-flags@1 data; arbitrary booleans imply no cohort or percentage',
          )
        const matches = data.flags.filter(
          (flag) =>
            isObject(flag) && flag.flag === args.flag && flag.environment === args.environment,
        )
        if (matches.length !== 1)
          throw new Error('No unique same-flag/environment configuration observation')
        const value = matches[0]
        if (
          !isObject(value) ||
          typeof value.enabled !== 'boolean' ||
          typeof value.exposure !== 'number' ||
          !Number.isFinite(value.exposure) ||
          value.exposure < 0 ||
          value.exposure > 100 ||
          typeof value.audience !== 'string' ||
          !value.audience.trim()
        )
          throw new Error('Flag configuration must preserve explicit enabled/exposure/audience')
        return {
          status: 'succeeded',
          ref: file,
          revision: measurementDigest(content),
          complete: true,
          body: JSON.stringify({
            flag: value.flag,
            environment: value.environment,
            enabled: value.enabled,
            exposure: value.exposure,
            audience: value.audience,
          }),
        }
      }
      // Virtual service operations run only through the client's MCP connection.
      // A missing binding fails explicitly; it never becomes an observed disabled flag.
      if (!delegate)
        throw new Error('The selected provider operation needs a reviewed client MCP binding')
      return delegate.invoke(call)
    },
  }
}
