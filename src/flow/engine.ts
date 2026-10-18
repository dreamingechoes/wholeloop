import { randomBytes } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { CliError } from '../cli/errors.js'
import { EXIT } from '../cli/io.js'
import { loadConfig, userConfigPath } from '../config/load.js'
import { resolveConfig } from '../config/resolve.js'
import { isObject } from '../config/schema.js'
import { writeSetting } from '../config/write.js'
import { resolveSlot } from '../discovery/resolve.js'
import { knownSlot } from '../discovery/rules.js'
import { discover } from '../discovery/tree.js'
import { researchBrief } from '../research/report.js'
import { itemId, replay } from '../state/events.js'
import type { StateStore } from '../state/store.js'
import { beginPlan, decisions, flowPlan } from './plan.js'
import { checkShape, stepDefinition } from './registry.js'

const newRun = () => `run-${randomBytes(8).toString('hex')}`
export interface BeginOptions {
  profile?: Record<string, unknown>
  subject?: string
  parent?: string
  input?: string
  owner?: string
  mode?: 'standalone' | 'flow'
}

export class FlowEngine {
  constructor(
    readonly store: StateStore,
    readonly root: string,
    readonly userFile = userConfigPath(),
    readonly home = homedir(),
  ) {}

  configuration() {
    return loadConfig({ root: this.root, userFile: this.userFile })
  }

  config() {
    return this.configuration().values
  }

  additions(): string[] {
    const flow = this.config().flow
    if (!isObject(flow) || !isObject(flow.decisions) || !Array.isArray(flow.decisions.add))
      return []
    return flow.decisions.add.filter((value): value is string => typeof value === 'string')
  }

  begin(name: string, options: BeginOptions) {
    const step = stepDefinition(name)
    const loaded = this.configuration()
    const configuration = options.profile
      ? resolveConfig(
          [
            { scope: 'user', values: loaded.values },
            { scope: 'run', values: { profile: options.profile } },
          ],
          loaded.presets,
        ).values
      : loaded.values
    const inventory = discover(this.root, this.store.files, this.home)
    const bindings = Object.fromEntries(
      step.slots.map((slot) => {
        const binding =
          isObject(configuration.slots) && typeof configuration.slots[slot] === 'string'
            ? configuration.slots[slot]
            : undefined
        return [
          slot,
          resolveSlot(slot, inventory.repo, {
            user: inventory.user,
            ...(binding ? { binding } : {}),
          }),
        ]
      }),
    )
    return this.store.transaction((events, append) => {
      const items = replay(events)
      const subject = options.subject ? items.get(options.subject) : undefined
      if (options.parent && (name !== 'research' || options.subject))
        throw new CliError('--parent is for a new research brief only')
      const parent = options.parent ? items.get(options.parent) : undefined
      if (options.parent && (!parent || !['initiative', 'scope'].includes(parent.kind)))
        throw new CliError(
          'Research parent must be an existing initiative or scope',
          EXIT.precondition,
        )
      if (name === 'research' && subject && subject.kind !== 'brief')
        throw new CliError(
          'Research runs use a brief; use --parent <id> to attach one',
          EXIT.precondition,
        )

      if (options.subject && !subject)
        throw new CliError(`Unknown item: ${options.subject}`, EXIT.precondition)
      const active = [...events]
        .reverse()
        .find(
          (entry) =>
            entry.subject === subject?.id &&
            entry.type === 'step.started' &&
            entry.data.step === name &&
            !events.some(
              (later) =>
                later.subject === entry.subject &&
                (later.type === 'step.completed' || later.type === 'step.skipped') &&
                later.data.run === entry.data.run,
            ),
        )
      const run = active?.type === 'step.started' ? active.data.run : newRun()
      const owner = options.owner ?? parent?.owner
      const payload = beginPlan(step, {
        ...(options.input ? { input: options.input } : {}),
        ...(owner ? { owner } : {}),
        ...(options.mode ? { mode: options.mode } : {}),
        ...(subject ? { subject } : {}),
        run,
        events,
        configuration,
        presets: loaded.presets,
      })
      payload.bindings = bindings
      for (const resolution of Object.values(bindings))
        if (resolution.questions.length) {
          payload.missing.push(`slot:${resolution.slot}`)
          payload.questions.push(...resolution.questions)
        }
      if (payload.missing.length) return { payload, code: EXIT.input }
      if (!step.available) return { payload, code: EXIT.precondition }
      const pending = subject
        ? decisions(events, subject.id, [
            ...step.before,
            ...(name === 'open-pr' ? this.additions() : []),
          ])
        : []
      if (pending.length)
        throw new CliError(
          `Required decisions: ${pending.map((decision) => decision.id).join(', ')}`,
          EXIT.input,
        )
      if (options.mode === 'flow' && subject) {
        const plan = flowPlan(events, subject.id, this.additions())
        if (plan.next !== name)
          throw new CliError(`Flow expects ${plan.next ?? 'no further step'}`, EXIT.precondition)
      }
      let id = subject?.id
      if (!id) {
        id = itemId(step.kind)
        while (items.has(id)) id = itemId(step.kind)
        append(id, {
          type: 'item.created',
          data: {
            kind: step.kind,
            ...(parent ? { parent: parent.id } : {}),
            title: payload.input ?? '',
            owner: payload.owner ?? '',
            body: payload.input ?? '',
          },
        })
      } else if (options.owner && options.owner !== subject?.owner)
        append(id, { type: 'item.updated', data: { owner: options.owner } })
      if (!active)
        append(id, {
          type: 'step.started',
          data: {
            step: step.name,
            run,
            mode: options.mode ?? 'standalone',
            input: payload.input ?? '',
          },
        })
      return {
        payload: { ...payload, subject: { id, kind: subject?.kind ?? step.kind } },
        code: EXIT.ok,
      }
    })
  }

  plan(subject: string) {
    this.store.get(subject)
    return {
      schema: 'wholeloop/step-plan@1',
      subject,
      ...flowPlan(this.store.events(), subject, this.additions()),
    }
  }

  complete(name: string, subject: string, content: string) {
    const step = stepDefinition(name)
    if (!step.available)
      throw new CliError(`Step ${name} is registered but not implemented`, EXIT.precondition)
    const problems = checkShape(content, step.sections)
    if (problems.length) throw new CliError(problems.join('\n'))
    return this.store.transaction((events, append) => {
      const latest = [...events]
        .reverse()
        .find(
          (entry) =>
            entry.subject === subject &&
            ['step.started', 'step.completed', 'step.skipped'].includes(entry.type) &&
            'step' in entry.data &&
            entry.data.step === name,
        )
      if (latest?.type !== 'step.started')
        throw new CliError(`Begin ${name} for ${subject} before completing it`, EXIT.precondition)
      const run = latest.data.run
      if (name === 'research' && content !== researchBrief(events, subject, run))
        throw new CliError(
          'Complete research through the aggregated report; do not replace its evidence',
          EXIT.precondition,
        )
      const path = `items/${subject}/artifacts/${name}/${run}.md`
      append(subject, {
        type: 'step.completed',
        data: { step: step.name, run, artifact: { path, content } },
      })
      return {
        schema: 'wholeloop/step-complete@1',
        subject,
        step: name,
        run,
        artifact: path,
        receipt: {
          produced: path,
          undo: 'Artifacts are retained in the append-only journal; refine with a new run.',
        },
        next: flowPlan(events, subject, this.additions()),
      }
    })
  }

  skip(name: string, subject: string, reason: string) {
    const step = stepDefinition(name)
    if (!reason.trim()) throw new CliError('step skip requires --reason', EXIT.input)
    return this.store.transaction((events, append) => {
      const latest = [...events]
        .reverse()
        .find(
          (entry) =>
            entry.subject === subject &&
            (entry.type === 'step.started' ||
              entry.type === 'step.completed' ||
              entry.type === 'step.skipped') &&
            entry.data.step === name,
        )
      append(subject, {
        type: 'step.skipped',
        data: {
          step: step.name,
          run: latest?.type === 'step.started' ? latest.data.run : newRun(),
          reason,
        },
      })
      return {
        schema: 'wholeloop/step-skip@1',
        subject,
        step: name,
        reason,
        next: flowPlan(events, subject, this.additions()),
      }
    })
  }

  answer(
    qid: string,
    value: string,
    options: { scope: string; subject?: string; run?: string; by?: string },
  ) {
    if (!value.trim()) throw new CliError('Answer must not be empty')
    const scope = options.scope
    if (!['run', 'initiative', 'project', 'user'].includes(scope))
      throw new CliError(`Unknown remember scope: ${scope}`)
    if (qid.startsWith('decision.')) return this.decide(qid.slice(9), value, options)
    if (qid.startsWith('slot:')) {
      const slot = qid.slice(5)
      if (!knownSlot(slot)) throw new CliError(`Unknown slot: ${slot}`)
      if (scope !== 'project' && scope !== 'user')
        throw new CliError('Slot choices must be remembered at project or user scope')
      const file = scope === 'user' ? this.userFile : join(this.root, '.wholeloop/config.yml')
      writeSetting(file, ['slots', slot], value)
      return { schema: 'wholeloop/answer@1', qid, value, scope, file }
    }
    if (!['owner', 'input', 'docs.destination', 'tracker.destination'].includes(qid))
      throw new CliError(`Unknown question: ${qid}`)
    if (scope === 'user' || scope === 'project') {
      if (qid === 'input')
        throw new CliError('Input can only be remembered for a run or initiative')
      const file = scope === 'user' ? this.userFile : join(this.root, '.wholeloop/config.yml')
      const path = qid.endsWith('.destination')
        ? ['providers', qid.split('.')[0] ?? '']
        : ['answers', qid]
      writeSetting(file, path, value)
      return { schema: 'wholeloop/answer@1', qid, value, scope, file }
    }
    const subject = options.subject
    if (!subject) throw new CliError('Run and initiative answers require --for <id>', EXIT.input)
    return this.store.transaction((events, append) => {
      const latest = [...events]
        .reverse()
        .find((entry) => entry.subject === subject && entry.type === 'step.started')
      const run = options.run ?? (latest?.type === 'step.started' ? latest.data.run : undefined)
      if (scope === 'run' && !run)
        throw new CliError(
          'Begin a step or provide --run before remembering a run answer',
          EXIT.input,
        )
      append(subject, {
        type: 'answer.remembered',
        data: { qid, value, scope: scope as 'run' | 'initiative', run: run ?? newRun() },
      })
      return { schema: 'wholeloop/answer@1', qid, value, scope, subject, run: run ?? null }
    })
  }

  private decide(
    decision: string,
    value: string,
    options: { scope: string; subject?: string; by?: string },
  ) {
    if (!options.subject || !options.by)
      throw new CliError('A decision requires --for <id> and --by <person>', EXIT.input)
    if (options.scope !== 'run')
      throw new CliError('Decisions cannot be remembered as reusable configuration')
    if (value !== 'approved' && value !== 'rejected')
      throw new CliError('Decision answer must be approved or rejected')
    const subject = options.subject
    const by = options.by
    return this.store.transaction((events, append) => {
      const required = decisions(
        events,
        subject,
        decision === 'test-it' || this.additions().includes(decision) ? [decision] : [],
      )
      const pending = required.find((candidate) => candidate.id === decision)
      if (!pending) throw new CliError(`No pending decision: ${decision}`, EXIT.precondition)
      append(subject, {
        type: 'decision.recorded',
        data: { decision, outcome: value, by, basis: pending.basis },
      })
      return {
        schema: 'wholeloop/answer@1',
        qid: `decision.${decision}`,
        value,
        scope: 'run',
        subject,
        by,
      }
    })
  }
}
