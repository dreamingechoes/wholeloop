import { existsSync, type FSWatcher, watch } from 'node:fs'
import { dirname, join } from 'node:path'
import { contractDigest } from '../contracts/compatibility.js'
import type { DeliveryEvent } from '../delivery/events.js'
import type { StateEvent } from '../state/events.js'
import {
  cursorPrefix,
  decodeCursor,
  encodeCursor,
  journalPosition,
  OverviewError,
} from './cursor.js'
import { overviewProblem, projectOverview } from './project.js'
import { type OverviewReadOptions, readOverview } from './read.js'
import { recordedTime } from './time.js'

export interface Activity {
  journal: 'state' | 'delivery'
  position: number
  id: string
  at: string | null
  digest: string
  category: string
  actor: StateEvent['actor']['kind'] | DeliveryEvent['actor']['kind']
  provenance:
    | 'fixture'
    | 'host-observed'
    | 'declared'
    | 'unknown'
    | 'person-record'
    | 'operator-record'
    | 'policy'
    | 'claimed'
    | 'process-observed'
  progress: boolean
  action?: string
  status?: string
}
/** Closed categories only: a private payload is never spread into a feed. */
export function stateActivity(event: StateEvent, index: number): Activity {
  return {
    journal: 'state',
    position: index + 1,
    id: event.id,
    at: recordedTime(event.ts),
    digest: contractDigest(event),
    category: event.type,
    actor: event.actor.kind,
    provenance:
      event.actor.kind === 'person'
        ? 'person-record'
        : event.actor.kind === 'agent'
          ? (event.actor.client?.source ?? 'unknown')
          : 'unknown',
    progress: event.type === 'step.completed',
  }
}
export function deliveryActivity(event: DeliveryEvent): Activity {
  const p = event.payload,
    provenance =
      p.schema === 'wholeloop/delivery-budget-event@1' && p.action === 'progress'
        ? p.progress?.provenance
        : 'provenance' in p
          ? p.provenance
          : 'observation' in p &&
              p.observation &&
              typeof p.observation === 'object' &&
              'provenance' in p.observation
            ? p.observation.provenance
            : undefined,
    observed = provenance === 'fixture' || provenance === 'host-observed',
    action = 'action' in p && typeof p.action === 'string' ? p.action : undefined,
    status = 'status' in p && typeof p.status === 'string' ? p.status : 'to' in p ? p.to : undefined
  return {
    journal: 'delivery',
    position: event.sequence,
    id: event.id,
    at: recordedTime(event.ts),
    digest: event.digest,
    category: p.schema.replace('wholeloop/', ''),
    actor: event.actor.kind,
    provenance: observed
      ? provenance
      : event.actor.kind === 'operator'
        ? 'operator-record'
        : p.schema === 'wholeloop/delivery-grant-event@1' ||
            p.schema === 'wholeloop/delivery-registration-event@1'
          ? 'policy'
          : action === 'claimed'
            ? 'claimed'
            : action === 'started' && 'runtime' in p
              ? 'process-observed'
              : 'unknown',
    progress:
      (p.schema === 'wholeloop/delivery-budget-event@1' && p.action === 'progress') ||
      (p.schema === 'wholeloop/delivery-control-event@1' && p.to === 'completed'),
    ...(action ? { action } : {}),
    ...(status ? { status } : {}),
  }
}

type FrameBody =
  | {
      kind: 'overview'
      change: 'initial' | 'journal' | 'observation'
      progress: false
      overview: ReturnType<typeof projectOverview> | ReturnType<typeof overviewProblem>
    }
  | { kind: 'events'; fromCursor: string; cursor: string; progress: boolean; events: Activity[] }
  | {
      kind: 'liveness'
      progress: false
      state: 'idle' | 'writer-busy'
      wakeup: 'filesystem' | 'poll'
    }
  | { kind: 'problem'; progress: false; problem: OverviewError['problem'] }
export type WatchFrame = FrameBody & {
  schema: 'wholeloop/watch-frame@1'
  sequence: number
  at: string
  resumeCursor: string | null
}

export interface WatchOptions extends OverviewReadOptions {
  since?: string
  poll?: boolean
  pollMs?: number
  livenessMs?: number
  signal?: AbortSignal
}
/** One serialized reader and bounded batch at a time; slow consumers apply backpressure. */
export async function watchOverview(
  options: WatchOptions,
  emit: (frame: WatchFrame) => void | Promise<void>,
) {
  let sequence = 0,
    resume: string | null = null,
    digest: string | undefined,
    initial = true,
    stopped = false
  let pendingHint = false
  let wakeup: 'filesystem' | 'poll' = 'poll',
    notify: (() => void) | undefined
  const watchers = new Map<string, FSWatcher>(),
    signal = options.signal,
    validAt =
      options.at === undefined ||
      (Number.isFinite(Date.parse(options.at)) &&
        new Date(options.at).toISOString() === options.at),
    now = () => (validAt && options.at !== undefined ? options.at : new Date().toISOString()),
    frame = async (value: FrameBody & { resumeCursor?: string | null }) => {
      await emit({
        schema: 'wholeloop/watch-frame@1',
        sequence: ++sequence,
        at: now(),
        resumeCursor: resume,
        ...value,
      })
    },
    close = () => {
      for (const watcher of watchers.values()) watcher.close()
      watchers.clear()
    },
    hint = () => {
      pendingHint = true
      notify?.()
    },
    attach = (store: string) => {
      if (options.poll) return
      const desired = [
        store,
        join(store, 'journal'),
        join(store, 'delivery'),
        join(store, 'delivery/journal'),
      ]
      let ancestor = store
      while (!existsSync(ancestor) && dirname(ancestor) !== ancestor) ancestor = dirname(ancestor)
      desired.push(ancestor)
      for (const path of new Set(desired)) {
        if (watchers.has(path) || !existsSync(path)) continue
        try {
          const watcher = watch(path, { persistent: false }, hint)
          watcher.on('error', () => {
            watcher.close()
            watchers.delete(path)
          })
          watchers.set(path, watcher)
        } catch {
          /* File events are optional hints; polling retains correctness. */
        }
      }
    },
    wait = () =>
      new Promise<'filesystem' | 'poll'>((resolve) => {
        if (pendingHint) {
          pendingHint = false
          resolve('filesystem')
          return
        }
        let timer: ReturnType<typeof setTimeout>
        const done = () => {
          clearTimeout(timer)
          signal?.removeEventListener('abort', done)
          notify = undefined
          const reason = pendingHint ? 'filesystem' : 'poll'
          pendingHint = false
          resolve(reason)
        }
        notify = done
        timer = setTimeout(done, options.pollMs ?? 1000)
        signal?.addEventListener('abort', done, { once: true })
        if (signal?.aborted) done()
      })
  let lastLiveness = Date.now()
  try {
    if (
      !validAt ||
      !Number.isSafeInteger(options.pollMs ?? 1000) ||
      (options.pollMs ?? 1000) < 10 ||
      (options.pollMs ?? 1000) > 60000 ||
      !Number.isSafeInteger(options.livenessMs ?? 15000) ||
      (options.livenessMs ?? 15000) < 1 ||
      (options.livenessMs ?? 15000) > 60000
    )
      throw new OverviewError('store-unreadable')
    if (options.since !== undefined) {
      decodeCursor(options.since)
      resume = options.since
    }
    while (!signal?.aborted) {
      let read: ReturnType<typeof readOverview>
      try {
        read = readOverview({
          root: options.root,
          ...(options.store ? { store: options.store } : {}),
          ...(options.userFile ? { userFile: options.userFile } : {}),
          at: now(),
        })
      } catch (error) {
        if (error instanceof OverviewError && error.problem === 'store-busy') {
          if (initial) {
            const unavailable = overviewProblem('store-busy', now())
            await frame({
              kind: 'overview',
              change: 'initial',
              progress: false,
              overview: unavailable,
            })
            initial = false
            digest = unavailable.digest
          }
          await frame({ kind: 'liveness', progress: false, state: 'writer-busy', wakeup })
          wakeup = await wait()
          continue
        }
        throw error
      }
      attach(read.store)
      if (resume) cursorPrefix(resume, read.stateEvents, read.deliveryEvents)
      else resume = read.cursor
      const overview = projectOverview(read),
        changed = digest !== overview.digest,
        before = decodeCursor(resume),
        journalChanged = resume !== read.cursor
      if (initial) {
        await frame({ kind: 'overview', change: 'initial', progress: false, overview })
        initial = false
      }
      if (journalChanged) {
        // Independent journal prefixes have no invented total ordering: state first, then delivery.
        let stateCount = before.state.count,
          deliveryCount = before.delivery.sequence
        while (stateCount < read.stateEvents.length || deliveryCount < read.deliveryEvents.length) {
          const fromCursor = resume,
            events: Activity[] = []
          while (stateCount < read.stateEvents.length && events.length < 128) {
            const event = read.stateEvents[stateCount]
            if (!event) throw new OverviewError('store-unreadable')
            events.push(stateActivity(event, stateCount++))
          }
          while (deliveryCount < read.deliveryEvents.length && events.length < 128) {
            const event = read.deliveryEvents[deliveryCount++]
            if (!event) throw new OverviewError('store-unreadable')
            events.push(deliveryActivity(event))
          }
          const nextCursor = encodeCursor(
            journalPosition(
              read.stateEvents.slice(0, stateCount),
              read.deliveryEvents.slice(0, deliveryCount),
            ),
          )
          await frame({
            kind: 'events',
            fromCursor,
            cursor: nextCursor,
            resumeCursor: nextCursor,
            progress: events.some((event) => event.progress),
            events,
          })
          resume = nextCursor
          if (signal?.aborted) {
            stopped = true
            break
          }
        }
        if (!stopped)
          await frame({ kind: 'overview', change: 'journal', progress: false, overview })
      } else if (changed && digest !== undefined)
        await frame({ kind: 'overview', change: 'observation', progress: false, overview })
      digest = overview.digest
      if (signal?.aborted) break
      if (Date.now() - lastLiveness >= (options.livenessMs ?? 15000)) {
        await frame({ kind: 'liveness', progress: false, state: 'idle', wakeup })
        lastLiveness = Date.now()
      }
      if (stopped) break
      wakeup = await wait()
    }
    return 0
  } catch (error) {
    if (signal?.aborted) return 0
    await frame({
      kind: 'problem',
      progress: false,
      problem: error instanceof OverviewError ? error.problem : 'store-unreadable',
    })
    return 3
  } finally {
    close()
  }
}
