import { lstatSync } from 'node:fs'
import { contractDigest } from '../contracts/compatibility.js'
import { validateDeliveryShape } from '../delivery/plan.js'
import { DeliveryRunner, type DeliveryRunnerHost } from './engine.js'
import {
  FOREGROUND_ARGUMENT,
  FOREGROUND_INVOCATION_SCHEMA,
  type ForegroundInvocation,
  ForegroundOwner,
} from './foreground-owner.js'
import type { ManagedProcessObservation } from './native-process.js'
import { DeliveryRunnerError } from './route.js'
import { type RunnerRequest, RunnerStore } from './store.js'

/** The caller supplies its own installed controller core, never an executable from request/source text. */
export class OwnedForegroundRunner {
  constructor(readonly store: RunnerStore) {}
  async run(digest: string, core: string, options: { signal?: AbortSignal } = {}) {
    if (options.signal?.aborted) throw new DeliveryRunnerError('foreground-already-cancelled')
    const claimed = ForegroundOwner.claim(this.store, digest, core),
      owner = claimed.owner,
      lease = owner.lease
    let invoked = false,
      observation: ManagedProcessObservation | undefined
    try {
      const record = claimed.invocation,
        abort = options.signal ?? new AbortController().signal,
        remaining = Math.max(0, Date.parse(record.deadline) - Date.now())
      if (!remaining) throw new DeliveryRunnerError('foreground-deadline')
      invoked = true
      const result = await owner.manager.invoke(
        process.execPath,
        [record.core.path, FOREGROUND_ARGUMENT],
        JSON.stringify(record),
        {
          cwd: this.store.files.root,
          env: { ...process.env },
          timeoutMs: Math.min(2147482647, remaining),
          signal: abort,
          current: () => owner.current(false, true),
          started: (pid) => owner.register(pid),
        },
      )
      observation = result.ownership
    } finally {
      const record = this.store.record(digest)
      if (
        record.controller === lease.controller &&
        record.generation === lease.generation &&
        record.ownership === 'active'
      ) {
        const hasIntent =
            lstatSync(this.store.files.path(`${owner.manager.relative}/intent.json`), {
              throwIfNoEntry: false,
            }) !== undefined,
          observed = invoked && hasIntent ? owner.observe() : undefined
        if (
          !invoked ||
          !hasIntent ||
          observed?.invocationState === 'stopped' ||
          observed?.invocationState === 'not-started'
        )
          this.store.release(
            lease,
            'The original parent confirmed its foreground invoker closed or never started; stage/effect facts remain separate.',
          )
      }
      const current = this.store.record(digest),
        request = this.store.get(digest),
        state = this.store.lifecycle.journal.view(request.run)
      if (
        current.controller === lease.controller &&
        current.generation === lease.generation &&
        state.basis.digest === current.basis &&
        ['queued', 'running'].includes(state.state)
      ) {
        const to =
          this.store.lifecycle.authority.inspect(request.grant).grant.policy.intervention === 'none'
            ? 'blocked'
            : 'paused'
        this.store.lifecycle.transition(request.run, {
          to,
          ...(to === 'blocked' ? { outcome: 'blocked' as const } : {}),
          reason:
            'The foreground invocation returned without a verified endpoint; preserve original process/stage uncertainty and budgets.',
        })
      }
    }
    // The authoritative journal remains readable when this terminal loses the child output.
    if (!observation) throw new DeliveryRunnerError('foreground-observation-unavailable')
    return { status: this.store.inspect(digest), process: observation }
  }
}

/** Installed CLI code selects the fixed host factory after one private, group-bound consumption. */
export async function receiveOwnedForeground(
  value: unknown,
  core: string,
  hostFactory: (request: Readonly<RunnerRequest>) => DeliveryRunnerHost,
) {
  // Validate before creating/opening a store selected by untrusted stdin.
  validateDeliveryShape(value, FOREGROUND_INVOCATION_SCHEMA)
  const message = value as ForegroundInvocation,
    store = new RunnerStore(message.store),
    owner = new ForegroundOwner(store, message.lease)
  owner.consume(value, core)
  try {
    const request = store.get(message.lease.request),
      host = hostFactory(structuredClone(request))
    if (contractDigest(host.identity) !== contractDigest(request.host))
      throw new DeliveryRunnerError('runner-host-binding')
    return await new DeliveryRunner(store).run(message.lease.request, host, {
      lease: message.lease,
    })
  } catch (error) {
    const request = store.get(message.lease.request),
      state = store.lifecycle.journal.view(request.run)
    if (['queued', 'running'].includes(state.state)) {
      const to =
        store.lifecycle.authority.inspect(request.grant).grant.policy.intervention === 'none'
          ? 'blocked'
          : 'paused'
      store.lifecycle.transition(request.run, {
        to,
        ...(to === 'blocked' ? { outcome: 'blocked' as const } : {}),
        reason:
          'The fixed foreground controller could not continue; retain exact stage/effect uncertainty and original budgets.',
      })
    }
    throw error
  } finally {
    const record = store.record(message.lease.request)
    if (
      record.controller === message.lease.controller &&
      record.generation === message.lease.generation &&
      record.ownership === 'active'
    )
      store.release(
        message.lease,
        'The original foreground consumer has stopped issuing work; native/domain closure remains independently observable.',
      )
  }
}
