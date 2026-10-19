import { randomBytes } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { buildCriteria } from '../build/contracts.js'
import { buildReceipt } from '../build/workflow.js'
import { CliError } from '../cli/errors.js'
import { EXIT } from '../cli/io.js'
import { loadConfig, userConfigPath } from '../config/load.js'
import { resolveConfig } from '../config/resolve.js'
import { isObject } from '../config/schema.js'
import { writeSetting } from '../config/write.js'
import { resolveSlot } from '../discovery/resolve.js'
import { knownSlot } from '../discovery/rules.js'
import { discover } from '../discovery/tree.js'
import {
  checkFrame,
  type FrameOutcome,
  framingMatches,
  validateFrameOutcome,
} from '../framing/contract.js'
import { impactReceipt } from '../impact/report.js'
import { launchReceipt } from '../launch/artifacts.js'
import { LaunchWorkflow } from '../launch/workflow.js'
import { learningReceipt } from '../learning/contracts.js'
import { closeLearningScope } from '../learning/finalize.js'
import { publicationPlan } from '../providers/publication.js'
import { pullRequestReceipt } from '../pull-requests/workflow.js'
import { rampReceipt } from '../ramp/workflow.js'
import { researchBrief } from '../research/report.js'
import { reviewReceipt } from '../review/workflow.js'
import { checkScopePlan, parseScopePlan, scopeContext } from '../scopes/contract.js'
import { publishScopes } from '../scopes/publish.js'
import { checkSlicePlan, parseSlicePlan, slicingContext } from '../slices/contract.js'
import { publishSlices } from '../slices/publish.js'
import { blockingDependencies } from '../slices/routing.js'
import { checkSpec } from '../spec/contract.js'
import { specTemplate } from '../spec/template.js'
import { itemId, replay } from '../state/events.js'
import { canonicalPath } from '../state/paths.js'
import type { StateStore } from '../state/store.js'
import { verificationCriteria } from '../verification/contracts.js'
import { verificationReceipt } from '../verification/workflow.js'
import { worktreeRecords } from '../worktrees/contracts.js'
import { beginPlan, decisions, decisionTrail, flowPlan, remembered } from './plan.js'
import { checkShape, decisionBlocks, STEPS, stepDefinition } from './registry.js'

const newRun = () => `run-${randomBytes(8).toString('hex')}`
export interface BeginOptions {
  profile?: Record<string, unknown>
  subject?: string
  parent?: string
  from?: string
  impact?: string
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
    const templateSource =
      name === 'write-spec'
        ? specTemplate(this.root, this.userFile, configuration, bindings['spec.template']?.selected)
        : null
    if (options.impact && name !== 'write-spec') throw new CliError('--impact is for write-spec')
    return this.store.transaction((events, append) => {
      const items = replay(events)
      let subject = options.subject ? items.get(options.subject) : undefined
      if (options.from && name !== 'frame-problem')
        throw new CliError('--from is for framing a completed research brief')
      const source = options.from ? items.get(options.from) : undefined
      const sourceArtifact = source
        ? [...events]
            .reverse()
            .find(
              (entry) =>
                entry.subject === source.id &&
                entry.type === 'step.completed' &&
                entry.data.step === 'research',
            )
        : undefined
      if (options.from && (source?.kind !== 'brief' || sourceArtifact?.type !== 'step.completed'))
        throw new CliError('--from needs a completed research brief', EXIT.precondition)
      const sourceStart =
        sourceArtifact?.type === 'step.completed'
          ? events.find(
              (entry) =>
                entry.subject === source?.id &&
                entry.type === 'step.started' &&
                entry.data.run === sourceArtifact.data.run,
            )
          : undefined
      const input =
        options.input ??
        (sourceStart?.type === 'step.started' ? sourceStart.data.input : source?.title)
      if (['frame-problem', 'write-spec', 'cut-scopes'].includes(name) && !options.subject) {
        const matches = framingMatches(
          [...items.values()],
          events,
          input,
          source?.id,
          canonicalPath(this.root),
        )
        if (matches.length > 1)
          throw new CliError(
            'Several initiatives match this idea; choose one with --for <id>',
            EXIT.input,
          )
        if (matches[0] && !matches[0].repository && !source)
          throw new CliError(
            'An initiative matches but has no repository identity; confirm it with --for <id>',
            EXIT.input,
          )
        subject = matches[0]
      }
      if (
        ['frame-problem', 'write-spec', 'cut-scopes'].includes(name) &&
        subject?.kind !== undefined &&
        subject.kind !== 'initiative'
      )
        throw new CliError(
          'Framing needs an initiative; use --from for a research brief',
          EXIT.precondition,
        )
      if (name === 'slice-work' && subject && subject.kind !== 'scope')
        throw new CliError(
          'slice-work needs a scope; select a child scope explicitly',
          EXIT.precondition,
        )
      if (subject?.status === 'closed')
        throw new CliError(
          `Item ${subject.id} is closed; inspect its outcome before explicitly reopening it`,
          EXIT.precondition,
        )

      if (name === 'verify-works') {
        if (!subject)
          throw new CliError(
            'Use verify begin to supply agreed criteria before standalone verification',
            EXIT.input,
          )
        if (!verificationCriteria(events, subject.id)) buildCriteria(events, subject.id)
      }
      if (name === 'build-slice') {
        if (!subject || !['slice', 'part'].includes(subject.kind))
          throw new CliError(
            'Agree ad-hoc criteria through build agree or select a stored slice/part before building',
            EXIT.input,
          )
        buildCriteria(events, subject.id)
      }
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
      const owner = options.owner ?? parent?.owner ?? source?.owner
      const frameArtifact = subject
        ? [...events]
            .reverse()
            .find(
              (entry) =>
                entry.subject === subject.id &&
                entry.type === 'step.completed' &&
                entry.data.step === 'frame-problem',
            )
        : undefined
      const frameImpact =
        frameArtifact?.type === 'step.completed'
          ? /^## Expected impact\s*\n([\s\S]*?)(?=\n## |$)/im
              .exec(frameArtifact.data.artifact.content)?.[1]
              ?.trim()
          : undefined
      const impact =
        options.impact ?? remembered(events, subject?.id, run, configuration).impact ?? frameImpact

      const payload = {
        ...beginPlan(step, {
          ...(input ? { input } : {}),
          ...(owner ? { owner } : {}),
          ...(options.mode ? { mode: options.mode } : {}),
          ...(subject ? { subject } : {}),
          run,
          events,
          configuration,
          presets: loaded.presets,
        }),
        bindings,
        templateSource,
        expectedImpact: name === 'write-spec' ? (impact ?? null) : null,
      }
      if (name === 'write-spec' && !impact?.trim()) {
        payload.missing.push('impact')
        payload.questions.push({
          id: 'impact',
          prompt: 'What observable impact should the spec achieve?',
          multi: false,
          options: [],
          remember: ['run', 'initiative'],
        })
      }
      if (sourceArtifact?.type === 'step.completed') {
        payload.preflight.push(
          `Evidence — ${source?.id}: ${sourceArtifact.data.artifact.path}. Preserve its open questions.`,
        )
      }
      if (templateSource) {
        payload.template = templateSource.sections
        payload.preflight.push(
          `Template — ${templateSource.kind}: ${templateSource.ref}. Preserve structured criteria and measurement metadata.`,
        )
      }
      for (const resolution of Object.values(bindings))
        if (resolution.questions.length) {
          payload.missing.push(`slot:${resolution.slot}`)
          payload.questions.push(...resolution.questions)
        }
      if (payload.missing.length) return { payload, code: EXIT.input }
      if (name === 'build-slice' && subject && blockingDependencies(events, subject.id).length)
        throw new CliError(
          `Blocked by: ${blockingDependencies(events, subject.id).join(', ')}`,
          EXIT.precondition,
        )
      if (!step.available) return { payload, code: EXIT.precondition }
      const pending = subject
        ? decisions(events, subject.id, [
            ...step.before,
            ...(name === 'open-pr' ? this.additions() : []),
          ])
            .concat(
              decisionTrail(events, subject.id).filter(
                (decision) => decision.subject !== subject.id,
              ),
            )
            .filter((decision) => decisionBlocks(name, decision.id))
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
        let standaloneParent: string | undefined
        if (name === 'slice-work') {
          standaloneParent = itemId('initiative')
          while (items.has(standaloneParent)) standaloneParent = itemId('initiative')
          append(standaloneParent, {
            type: 'item.created',
            data: {
              kind: 'initiative',
              title: payload.input ?? '',
              owner: payload.owner ?? '',
              body: payload.input ?? '',
              repository: canonicalPath(this.root),
            },
          })
        }
        append(id, {
          type: 'item.created',
          data: {
            kind: step.kind,
            repository: canonicalPath(this.root),
            ...(standaloneParent
              ? { parent: standaloneParent }
              : parent
                ? { parent: parent.id }
                : {}),
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
      if (name === 'write-spec' && options.impact)
        append(id, {
          type: 'answer.remembered',
          data: { qid: 'impact', value: options.impact, scope: 'initiative', run },
        })
      if (
        source &&
        !events.some(
          (entry) =>
            entry.subject === id &&
            entry.type === 'frame.sourced' &&
            entry.data.run === run &&
            entry.data.brief === source.id,
        )
      )
        if (sourceArtifact?.type === 'step.completed')
          append(id, {
            type: 'frame.sourced',
            data: { run, brief: source.id, artifact: sourceArtifact.data.artifact.path },
          })
      return {
        payload: { ...payload, subject: { id, kind: subject?.kind ?? step.kind } },
        code: EXIT.ok,
      }
    })
  }

  plan(subject: string) {
    this.store.get(subject)
    const events = this.store.events()
    const plan = flowPlan(events, subject, this.additions())
    return {
      schema: 'wholeloop/step-plan@1',
      subject,
      ...plan,
      pending: [
        ...decisionTrail(events, subject).filter((decision) => decision.subject !== subject),
        ...plan.pending.map((decision) => ({ ...decision, subject })),
      ],
    }
  }

  complete(name: string, subject: string, content: string, outcome?: FrameOutcome) {
    const step = stepDefinition(name)
    if (!step.available)
      throw new CliError(`Step ${name} is registered but not implemented`, EXIT.precondition)
    if (outcome && name !== 'frame-problem')
      throw new CliError('Framing outcomes apply only to frame-problem')
    if (outcome) validateFrameOutcome(outcome)
    if (name === 'prepare-launch') new LaunchWorkflow(this).context(subject)
    let sections: readonly string[] = step.sections
    if (name === 'write-spec') {
      const configuration = this.config()
      const inventory = discover(this.root, this.store.files, this.home)
      const binding = resolveSlot('spec.template', inventory.repo, {
        user: inventory.user,
        ...(isObject(configuration.slots) &&
        typeof configuration.slots['spec.template'] === 'string'
          ? { binding: configuration.slots['spec.template'] }
          : {}),
      })
      if (binding.questions.length)
        throw new CliError('Resolve the spec.template choice before completion', EXIT.input)
      sections = specTemplate(this.root, this.userFile, configuration, binding.selected).sections
    }
    const problems = [
      ...checkShape(content, sections),
      ...(name === 'write-spec' ? checkSpec(content) : []),
      ...(name === 'frame-problem' ? checkFrame(content) : []),
    ]
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
      if (name === 'build-slice' && blockingDependencies(events, subject).length)
        throw new CliError(
          `Blocked by: ${blockingDependencies(events, subject).join(', ')}`,
          EXIT.precondition,
        )
      const blocking = decisionTrail(events, subject).filter((decision) =>
        decisionBlocks(name, decision.id),
      )
      if (blocking.length)
        throw new CliError(
          `Required decisions: ${blocking.map((decision) => decision.id).join(', ')}`,
          EXIT.input,
        )
      if (name === 'decide-next' && content !== learningReceipt(events, subject))
        throw new CliError(
          'Learning completion requires its canonical challenged human decision',
          EXIT.precondition,
        )
      if (name === 'measure-impact' && content !== impactReceipt(events, subject))
        throw new CliError(
          'Impact completion requires its canonical evidence-backed receipt',
          EXIT.precondition,
        )
      if (name === 'ramp-exposure' && content !== rampReceipt(events, subject))
        throw new CliError(
          'Complete ramping through its per-stage decisions and confirmations',
          EXIT.precondition,
        )
      if (name === 'prepare-launch' && content !== launchReceipt(events, subject, run))
        throw new CliError(
          'Complete launch preparation through its pinned kit receipt',
          EXIT.precondition,
        )
      if (name === 'open-pr' && content !== pullRequestReceipt(events, subject))
        throw new CliError(
          'Complete PR publication through its tested draft receipt',
          EXIT.precondition,
        )
      if (name === 'review-code' && content !== reviewReceipt(events, subject))
        throw new CliError('Complete reviews through their gate-backed receipt', EXIT.precondition)
      if (name === 'verify-works' && content !== verificationReceipt(events, subject))
        throw new CliError(
          'Complete verification through its gate-backed receipt',
          EXIT.precondition,
        )
      if (name === 'build-slice') {
        const workspace = worktreeRecords(events).find(
          (record) => record.subject === subject && record.status === 'active',
        )
        if (!workspace || content !== buildReceipt(events, subject, workspace.path))
          throw new CliError(
            'Complete builds through their current gate-backed receipt',
            EXIT.precondition,
          )
      }
      let slices: ReturnType<typeof publishSlices> | undefined
      if (name === 'slice-work') {
        const plan = parseSlicePlan(content)
        checkSlicePlan(plan, slicingContext(events, subject))
        slices = publishSlices({
          root: this.root,
          userFile: this.userFile,
          configuration: this.config(),
          subject,
          run,
          plan,
          events,
          append,
        })
      }
      let scopes: ReturnType<typeof publishScopes> | undefined
      if (name === 'cut-scopes') {
        const plan = parseScopePlan(content)
        checkScopePlan(plan, scopeContext(events, subject))
        scopes = publishScopes({
          root: this.root,
          userFile: this.userFile,
          configuration: this.config(),
          subject,
          run,
          plan,
          events,
          append,
        })
      }
      if (name === 'research' && content !== researchBrief(events, subject, run))
        throw new CliError(
          'Complete research through the aggregated report; do not replace its evidence',
          EXIT.precondition,
        )
      const path = `items/${subject}/artifacts/${name}/${run}.md`
      const publication = ['frame-problem', 'write-spec'].includes(name)
        ? publicationPlan(this.root, this.userFile, this.config(), subject, path)
        : undefined
      append(subject, {
        type: 'step.completed',
        data: { step: step.name, run, artifact: { path, content } },
      })
      if (name === 'decide-next') closeLearningScope(events, append, subject)
      if (name === 'frame-problem') {
        append(subject, {
          type: 'frame.decided',
          data: {
            run,
            ...(outcome ?? { outcome: 'go', reason: 'Framing completed for specification.' }),
          },
        })
        if (outcome && outcome.outcome !== 'go') {
          append(subject, {
            type: 'note.added',
            data: {
              text: `Framing ${outcome.outcome}: ${outcome.reason}${outcome.reopen ? ` Reopen when: ${outcome.reopen}` : ''}`,
            },
          })
          append(subject, { type: 'item.closed', data: {} })
        }
        for (const destination of Object.values(publication ?? {}))
          if (destination.status === 'pending')
            append(subject, {
              type: 'note.added',
              data: {
                text: `Publication pending: ${destination.provider} ${destination.operation}; local reference: ${destination.ref}.`,
              },
            })
      }
      return {
        schema: 'wholeloop/step-complete@1',
        subject,
        step: name,
        run,
        artifact: path,
        ...(scopes ? { scopes } : {}),
        ...(slices ? { slices } : {}),
        ...(publication ? { publication } : {}),
        ...(outcome ? { outcome } : {}),
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
    if (!['owner', 'input', 'impact', 'docs.destination', 'tracker.destination'].includes(qid))
      throw new CliError(`Unknown question: ${qid}`)
    if (scope === 'user' || scope === 'project') {
      if (qid === 'input' || qid === 'impact')
        throw new CliError('Input and impact can only be remembered for a run or initiative')
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
      const producer = STEPS.find((step) => step.after.includes(decision))
      if (producer) {
        const latest = [...events]
          .reverse()
          .find(
            (entry) =>
              entry.subject === subject &&
              (entry.type === 'step.started' ||
                entry.type === 'step.completed' ||
                entry.type === 'step.skipped') &&
              entry.data.step === producer.name,
          )
        if (latest?.type === 'step.started')
          throw new CliError(
            `Complete ${producer.name} before recording ${decision}`,
            EXIT.precondition,
          )
      }
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
