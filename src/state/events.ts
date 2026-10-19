import { randomBytes, randomUUID } from 'node:crypto'
import { isAbsolute } from 'node:path'
import { type BuildEventData, validBuildData } from '../build/contracts.js'
import { isObject } from '../config/schema.js'
import {
  type EnvironmentEventData,
  environmentDeclarations,
  validEnvironmentData,
} from '../environment/contracts.js'
import { STEP_NAMES, type StepName } from '../flow/registry.js'
import { type FrameOutcome, validateFrameOutcome } from '../framing/contract.js'
import type { GateEventData } from '../gates/contracts.js'
import { gateRuns, validGateData } from '../gates/state.js'
import { type ImpactEventData, impactRuns, validImpactData } from '../impact/contracts.js'
import { impactDeliveries } from '../impact/publish.js'
import { type LaunchEventData, launchRuns, validLaunchData } from '../launch/contracts.js'
import { launchDeliveries } from '../launch/publish.js'
import {
  type PullRequestEventData,
  pullRequestPlans,
  validPullRequestData,
} from '../pull-requests/contracts.js'
import { type RampEventData, rampRuns, validRampData } from '../ramp/contracts.js'
import { rampProposals } from '../ramp/publish.js'
import {
  type AngleResult,
  type Refutation,
  type ResearchPlan,
  validatePlan,
  validateRefutation,
  validateResult,
} from '../research/contracts.js'
import { type ReviewEventData, validReviewData } from '../review/contracts.js'
import { reviewInputs } from '../review/state.js'
import { type ScopeDefinition, validateScope } from '../scopes/contract.js'
import { type Repository, type SliceDefinition, validateSlice } from '../slices/contract.js'
import { type VerificationEventData, validVerificationData } from '../verification/contracts.js'
import { verificationRuns } from '../verification/state.js'
import {
  validWorktreeData,
  type WorktreeEventData,
  worktreeRecords,
} from '../worktrees/contracts.js'
import { replayMailbox } from './mailbox.js'

export const KINDS = ['initiative', 'scope', 'slice', 'part', 'brief', 'review'] as const
export type ItemKind = (typeof KINDS)[number]
const PREFIX: Record<ItemKind, string> = {
  initiative: 'init',
  scope: 'scope',
  slice: 'slice',
  part: 'part',
  brief: 'brief',
  review: 'review',
}
export const ITEM_ID = /^(init|scope|slice|part|brief|review)-[a-f0-9]{8}$/

export interface ItemInput {
  kind: ItemKind
  title: string
  owner: string
  body: string
  parent?: string
  repository?: string
}
export interface Item extends ItemInput {
  id: string
  status: 'open' | 'closed'
  createdAt: string
  updatedAt: string
  notes: { id: string; text: string; ts: string }[]
  links: string[]
}
export type ItemPatch = Partial<Pick<Item, 'title' | 'owner' | 'body' | 'status'>>
export const MESSAGE_KINDS = ['contract', 'handoff', 'status', 'question', 'note'] as const
export type MessageKind = (typeof MESSAGE_KINDS)[number]
export interface TrackerReference {
  provider: string
  operation: string
  status: 'stored' | 'pending'
  ref: string
  handoff?: string
}
export type EventData =
  | WorktreeEventData
  | GateEventData
  | BuildEventData
  | VerificationEventData
  | ReviewEventData
  | PullRequestEventData
  | EnvironmentEventData
  | LaunchEventData
  | RampEventData
  | ImpactEventData
  | {
      type: 'slice.defined'
      data: {
        scope: string
        run: string
        definition: SliceDefinition
        repositories: Repository[]
        blockedBy: string[]
        parts: string[]
        tracker: TrackerReference
      }
    }
  | {
      type: 'part.defined'
      data: {
        slice: string
        run: string
        repository: Repository
        role: 'contract' | 'implementation'
        blockedBy: string[]
        tracker: TrackerReference
      }
    }
  | {
      type: 'scope.defined'
      data: {
        initiative: string
        run: string
        definition: ScopeDefinition
        after: string[]
        tracker: TrackerReference
      }
    }
  | { type: 'frame.sourced'; data: { run: string; brief: string; artifact: string } }
  | { type: 'frame.decided'; data: { run: string } & FrameOutcome }
  | { type: 'research.planned'; data: { run: string; plan: ResearchPlan } }
  | { type: 'research.submitted'; data: { run: string; result: AngleResult } }
  | { type: 'research.examined'; data: { run: string; vote: Refutation } }
  | { type: 'item.created'; data: ItemInput }
  | { type: 'item.updated'; data: ItemPatch }
  | { type: 'item.closed'; data: Record<string, never> }
  | { type: 'note.added'; data: { text: string } }
  | { type: 'link.added'; data: { url: string } }
  | { type: 'msg.sent'; data: { to: string; from: string; kind: MessageKind; body: string } }
  | { type: 'msg.read'; data: { reader: string; role: string; through: string } }
  | {
      type: 'step.started'
      data: { step: StepName; run: string; mode: 'standalone' | 'flow'; input: string }
    }
  | {
      type: 'step.completed'
      data: { step: StepName; run: string; artifact: { path: string; content: string } }
    }
  | { type: 'step.skipped'; data: { step: StepName; run: string; reason: string } }
  | {
      type: 'answer.remembered'
      data: { qid: string; value: string; scope: 'run' | 'initiative'; run: string }
    }
  | {
      type: 'decision.recorded'
      data: { decision: string; outcome: 'approved' | 'rejected'; by: string; basis: string }
    }
export type StateEvent = {
  v: 1
  id: string
  ts: string
  actor: { kind: 'person' | 'agent' | 'system'; name: string }
  subject: string
} & EventData

export function itemId(kind: ItemKind): string {
  return `${PREFIX[kind]}-${randomBytes(4).toString('hex')}`
}

function keys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key))
}
function text(value: unknown, empty = false): value is string {
  return typeof value === 'string' && (empty || value.trim().length > 0)
}
function tracker(value: unknown): boolean {
  return (
    isObject(value) &&
    keys(value, ['provider', 'operation', 'status', 'ref', 'handoff']) &&
    text(value.provider) &&
    value.operation === 'tracker.create-item' &&
    ['stored', 'pending'].includes(String(value.status)) &&
    text(value.ref) &&
    (value.handoff === undefined || text(value.handoff))
  )
}
function repository(value: unknown): boolean {
  return (
    isObject(value) &&
    keys(value, ['key', 'path']) &&
    text(value.key) &&
    /^[a-z][a-z0-9_-]*$/.test(value.key) &&
    text(value.path) &&
    isAbsolute(value.path)
  )
}
function references(value: unknown, kinds: string): boolean {
  return (
    Array.isArray(value) &&
    new Set(value).size === value.length &&
    value.every((id) => typeof id === 'string' && new RegExp(`^(${kinds})-[a-f0-9]{8}$`).test(id))
  )
}
function validData(type: string, data: Record<string, unknown>): boolean {
  if (type.startsWith('impact.')) return validImpactData(type, data)
  if (type.startsWith('ramp.')) return validRampData(type, data)
  if (type.startsWith('launch.')) return validLaunchData(type, data)
  if (type.startsWith('env.')) return validEnvironmentData(type, data)
  if (type.startsWith('pr.')) return validPullRequestData(type, data)
  if (type.startsWith('review.')) return validReviewData(type, data)
  if (type.startsWith('verify.')) return validVerificationData(type, data)
  if (type.startsWith('build.')) return validBuildData(type, data)
  if (type.startsWith('gate.')) return validGateData(type, data)
  if (type.startsWith('worktree.')) return validWorktreeData(type, data)
  switch (type) {
    case 'slice.defined':
      if (
        !keys(data, [
          'scope',
          'run',
          'definition',
          'repositories',
          'blockedBy',
          'parts',
          'tracker',
        ]) ||
        !text(data.scope) ||
        !/^scope-[a-f0-9]{8}$/.test(data.scope) ||
        !runId(data.run) ||
        !Array.isArray(data.repositories) ||
        !data.repositories.length ||
        !data.repositories.every(repository) ||
        !references(data.blockedBy, 'slice') ||
        !references(data.parts, 'part') ||
        !tracker(data.tracker)
      )
        return false
      try {
        validateSlice(data.definition)
        return true
      } catch {
        return false
      }
    case 'part.defined':
      return (
        keys(data, ['slice', 'run', 'repository', 'role', 'blockedBy', 'tracker']) &&
        text(data.slice) &&
        /^slice-[a-f0-9]{8}$/.test(data.slice) &&
        runId(data.run) &&
        repository(data.repository) &&
        ['contract', 'implementation'].includes(String(data.role)) &&
        references(data.blockedBy, 'slice|part') &&
        tracker(data.tracker)
      )
    case 'scope.defined':
      if (
        !keys(data, ['initiative', 'run', 'definition', 'after', 'tracker']) ||
        !text(data.initiative) ||
        !/^init-[a-f0-9]{8}$/.test(data.initiative) ||
        !runId(data.run) ||
        !Array.isArray(data.after) ||
        !data.after.every((ref) => text(ref) && /^scope-[a-f0-9]{8}$/.test(ref)) ||
        !tracker(data.tracker)
      )
        return false
      try {
        validateScope(data.definition)
        return true
      } catch {
        return false
      }

    case 'frame.sourced':
      return (
        keys(data, ['run', 'brief', 'artifact']) &&
        runId(data.run) &&
        text(data.brief) &&
        /^brief-[a-f0-9]{8}$/.test(data.brief) &&
        text(data.artifact) &&
        new RegExp(`^items/${data.brief}/artifacts/research/run-[a-f0-9]{16}\\.md$`).test(
          data.artifact,
        )
      )
    case 'frame.decided':
      if (
        !keys(data, ['run', 'outcome', 'reason', 'reopen']) ||
        !runId(data.run) ||
        !text(data.reason) ||
        (data.reopen !== undefined && !text(data.reopen))
      )
        return false
      try {
        validateFrameOutcome(data as unknown as FrameOutcome)
        return true
      } catch {
        return false
      }

    case 'research.planned':
    case 'research.submitted':
    case 'research.examined': {
      const field =
        type === 'research.planned' ? 'plan' : type === 'research.submitted' ? 'result' : 'vote'
      if (!keys(data, ['run', field]) || !runId(data.run)) return false
      try {
        if (field === 'plan') validatePlan(data[field])
        else if (field === 'result') validateResult(data[field])
        else validateRefutation(data[field])
        return true
      } catch {
        return false
      }
    }
    case 'step.started':
      return (
        keys(data, ['step', 'run', 'mode', 'input']) &&
        stepData(data) &&
        ['standalone', 'flow'].includes(String(data.mode)) &&
        text(data.input)
      )
    case 'step.completed':
      return (
        keys(data, ['step', 'run', 'artifact']) &&
        stepData(data) &&
        isObject(data.artifact) &&
        keys(data.artifact, ['path', 'content']) &&
        text(data.artifact.path) &&
        text(data.artifact.content)
      )
    case 'step.skipped':
      return keys(data, ['step', 'run', 'reason']) && stepData(data) && text(data.reason)
    case 'answer.remembered':
      return (
        keys(data, ['qid', 'value', 'scope', 'run']) &&
        ['owner', 'input', 'impact', 'docs.destination', 'tracker.destination'].includes(
          String(data.qid),
        ) &&
        text(data.value) &&
        ['run', 'initiative'].includes(String(data.scope)) &&
        runId(data.run)
      )
    case 'decision.recorded':
      return (
        keys(data, ['decision', 'outcome', 'by', 'basis']) &&
        text(data.decision) &&
        /^[a-z][a-z0-9-]*$/.test(data.decision) &&
        ['approved', 'rejected'].includes(String(data.outcome)) &&
        text(data.by) &&
        text(data.basis) &&
        /^ev-[a-f0-9-]{36}$/.test(data.basis)
      )
    case 'item.created':
      return (
        keys(data, ['kind', 'title', 'owner', 'body', 'parent', 'repository']) &&
        KINDS.includes(data.kind as ItemKind) &&
        text(data.title) &&
        text(data.owner) &&
        text(data.body, true) &&
        (data.parent === undefined || (text(data.parent) && ITEM_ID.test(data.parent))) &&
        (data.repository === undefined || (text(data.repository) && isAbsolute(data.repository)))
      )
    case 'item.updated':
      return (
        Object.keys(data).length > 0 &&
        keys(data, ['title', 'owner', 'body', 'status']) &&
        Object.entries(data).every(([key, value]) =>
          key === 'status'
            ? typeof value === 'string' && ['open', 'closed'].includes(value)
            : text(value, key === 'body'),
        )
      )
    case 'item.closed':
      return Object.keys(data).length === 0
    case 'note.added':
      return keys(data, ['text']) && text(data.text)
    case 'link.added': {
      if (!keys(data, ['url']) || !text(data.url)) return false
      try {
        return ['https:', 'http:'].includes(new URL(data.url).protocol)
      } catch {
        return false
      }
    }
    case 'msg.sent':
      return (
        keys(data, ['to', 'from', 'kind', 'body']) &&
        address(data.to) &&
        address(data.from) &&
        MESSAGE_KINDS.includes(data.kind as MessageKind) &&
        text(data.body) &&
        data.body.length <= 32768
      )
    case 'msg.read':
      return (
        keys(data, ['reader', 'role', 'through']) &&
        address(data.reader) &&
        address(data.role) &&
        text(data.through) &&
        /^ev-[a-f0-9-]{36}$/.test(data.through)
      )
    default:
      return false
  }
}

function runId(value: unknown): value is string {
  return typeof value === 'string' && /^run-[a-f0-9]{16}$/.test(value)
}
function stepData(data: Record<string, unknown>): boolean {
  return STEP_NAMES.includes(data.step as StepName) && runId(data.run)
}

function address(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9:_.-]{0,127}$/.test(value)
}

export function validateEvent(value: unknown): asserts value is StateEvent {
  if (
    !isObject(value) ||
    !keys(value, ['v', 'id', 'ts', 'actor', 'subject', 'type', 'data']) ||
    value.v !== 1 ||
    !text(value.id) ||
    !/^ev-[a-f0-9-]{36}$/.test(value.id) ||
    !text(value.ts) ||
    !Number.isFinite(Date.parse(value.ts)) ||
    !text(value.subject) ||
    !ITEM_ID.test(value.subject) ||
    !isObject(value.actor) ||
    !keys(value.actor, ['kind', 'name']) ||
    !text(value.actor.kind) ||
    !['person', 'agent', 'system'].includes(value.actor.kind) ||
    !text(value.actor.name) ||
    !text(value.type) ||
    !isObject(value.data) ||
    !validData(value.type, value.data)
  ) {
    throw new Error('Invalid wholeloop/state-event@1 event')
  }
  if (
    value.type === 'item.created' &&
    !String(value.subject).startsWith(`${PREFIX[value.data.kind as ItemKind]}-`)
  )
    throw new Error('Item kind does not match its typed id')
  if (value.type === 'scope.defined' && !String(value.subject).startsWith('scope-'))
    throw new Error('Scope definitions require a scope subject')
  for (const kind of ['slice', 'part'])
    if (value.type === `${kind}.defined` && !String(value.subject).startsWith(`${kind}-`))
      throw new Error(`${kind} definitions require the matching typed subject`)
  if (value.type.startsWith('worktree.') && !/^(slice|part|review)-/.test(String(value.subject)))
    throw new Error('Worktrees require a slice, part or review subject')
  if (value.type === 'research.planned') {
    const plan = value.data.plan as ResearchPlan
    if (plan.subject !== value.subject || plan.run !== value.data.run)
      throw new Error('Research plan must match its journal subject and run')
  }
  if (value.type === 'step.completed') {
    const artifact = value.data.artifact as { path: string }
    if (
      artifact.path !== `items/${value.subject}/artifacts/${value.data.step}/${value.data.run}.md`
    )
      throw new Error('Artifact path does not match its step and subject')
  }
}

export function event(subject: string, data: EventData, ts: string): StateEvent {
  const value = {
    v: 1,
    id: `ev-${randomUUID()}`,
    ts,
    actor: { kind: 'person', name: 'local' },
    subject,
    ...data,
  }
  validateEvent(value)
  return value
}

export function replay(events: readonly StateEvent[]): Map<string, Item> {
  const items = new Map<string, Item>()
  const ids = new Set<string>()
  const buildRuns = new Map<string, string>()
  const agreements = new Set<string>()
  for (const entry of events) {
    validateEvent(entry)
    if (ids.has(entry.id)) throw new Error(`Duplicate journal event: ${entry.id}`)
    ids.add(entry.id)
    if (entry.type === 'item.created') {
      if (items.has(entry.subject)) throw new Error(`Duplicate item: ${entry.subject}`)
      if (entry.data.parent && !items.has(entry.data.parent))
        throw new Error(`Missing parent: ${entry.data.parent}`)
      items.set(entry.subject, {
        ...entry.data,
        id: entry.subject,
        status: 'open',
        createdAt: entry.ts,
        updatedAt: entry.ts,
        notes: [],
        links: [],
      })
      continue
    }
    const item = items.get(entry.subject)
    if (!item) throw new Error(`Missing item: ${entry.subject}`)
    if (entry.type === 'step.started' && entry.data.step === 'build-slice')
      buildRuns.set(entry.subject, entry.data.run)
    if (
      (entry.type === 'step.completed' || entry.type === 'step.skipped') &&
      entry.data.step === 'build-slice'
    )
      buildRuns.delete(entry.subject)
    if (entry.type === 'build.agreed') {
      if (item.kind !== 'slice' || agreements.has(entry.subject))
        throw new Error('An ad-hoc slice has one explicit criteria agreement')
      agreements.add(entry.subject)
    }
    if (
      entry.type === 'build.planned' &&
      (!['slice', 'part'].includes(item.kind) || buildRuns.get(entry.subject) !== entry.data.run)
    )
      throw new Error('Builder plan needs the current active build run')

    if (
      entry.type === 'scope.defined' &&
      (item.kind !== 'scope' || item.parent !== entry.data.initiative)
    )
      throw new Error('Scope definition does not match its initiative parent')
    if (
      entry.type === 'slice.defined' &&
      (item.kind !== 'slice' || item.parent !== entry.data.scope)
    )
      throw new Error('Slice definition does not match its scope parent')
    if (
      entry.type === 'part.defined' &&
      (item.kind !== 'part' ||
        item.parent !== entry.data.slice ||
        item.repository !== entry.data.repository.path)
    )
      throw new Error('Part definition does not match its slice parent and repository')
    if (
      entry.type === 'decision.recorded' &&
      (!ids.has(entry.data.basis) || entry.data.basis === entry.id)
    )
      throw new Error('Decision basis must reference an earlier event')
    if (entry.type === 'step.completed') {
      const started = events.find(
        (candidate) =>
          candidate.type === 'step.started' &&
          candidate.subject === entry.subject &&
          candidate.data.step === entry.data.step &&
          candidate.data.run === entry.data.run &&
          ids.has(candidate.id),
      )
      if (!started) throw new Error('Step completion needs a matching start')
    }
    switch (entry.type) {
      case 'item.updated':
        Object.assign(item, entry.data)
        break
      case 'item.closed':
        item.status = 'closed'
        break
      case 'note.added':
        item.notes.push({ id: entry.id, text: entry.data.text, ts: entry.ts })
        break
      case 'link.added':
        if (!item.links.includes(entry.data.url)) item.links.push(entry.data.url)
        break
    }
    item.updatedAt = entry.ts
  }
  replayMailbox(events)
  worktreeRecords(events)
  gateRuns(events)
  verificationRuns(events)
  reviewInputs(events)
  pullRequestPlans(events)
  environmentDeclarations(events)
  launchRuns(events)
  launchDeliveries(events)
  impactRuns(events)
  impactDeliveries(events)
  rampRuns(events)
  rampProposals(events)
  return items
}
