import { readFileSync } from 'node:fs'
import { FlowEngine } from '../flow/engine.js'
import type { ImpactLayout, QualitativeQuery } from '../impact/contracts.js'
import { impactDigest } from '../impact/digest.js'
import { configuredCheckpoints } from '../impact/schedule.js'
import eventsSchema from '../impact/schemas/events-v1.json' with { type: 'json' }
import { impactReadRequests, impactResponseHost } from '../impact/transcript.js'
import { ImpactWorkflow } from '../impact/workflow.js'
import type { MeasurementPlan } from '../launch/measurement.js'
import measurementSchema from '../launch/schemas/measurement-v1.json' with { type: 'json' }
import { dueObservations, ObservationSchedule } from '../learning/scheduler.js'
import { StateStore } from '../state/store.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'

export async function impactCommand(
  command: string,
  { positional, options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
) {
  const value = (key: string) => (typeof options[key] === 'string' ? options[key] : undefined)
  const read = (file: string): unknown => {
    try {
      return JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      throw new Error('Cannot read valid impact JSON; contents omitted')
    }
  }
  if (positional.length > (command === 'measure begin' ? 1 : 0))
    throw new CliError('Unexpected measurement argument')
  const engine = new FlowEngine(new StateStore(), root)
  const workflow = new ImpactWorkflow(engine)
  const subject = value('--for')
  if (!['measure begin', 'measure schema', 'measure digest'].includes(command) && !subject)
    throw new CliError('Provide --for <scope-id>')
  let payload: unknown
  if (command === 'measure schema')
    payload = {
      schema: 'wholeloop/impact-schema@1',
      measurement: measurementSchema,
      qualitative: eventsSchema.properties['impact.planned'].properties.qualitative,
      layout: eventsSchema.properties['impact.formatted'].properties.sections,
    }
  else if (command === 'measure begin')
    payload = workflow.begin({
      ...(subject ? { subject } : {}),
      ...(positional[0] ? { input: positional[0] } : {}),
      ...(value('--owner') ? { owner: value('--owner') as string } : {}),
      ...(value('--checkpoint') ? { checkpoint: value('--checkpoint') as string } : {}),
      ...(value('--launched-at') ? { launchedAt: value('--launched-at') as string } : {}),
      ...(value('--after-days') !== undefined ? { afterDays: Number(value('--after-days')) } : {}),
      ...(value('--at') ? { at: value('--at') as string } : {}),
      ...(value('--measurement')
        ? { measurement: read(value('--measurement') ?? '') as MeasurementPlan }
        : {}),
      ...(value('--qualitative')
        ? { qualitative: read(value('--qualitative') ?? '') as QualitativeQuery[] }
        : {}),
    })
  else if (command === 'measure requests')
    payload = await impactReadRequests(workflow, subject ?? '')
  else if (command === 'measure observe') {
    if (!value('--file')) throw new Error('Provide --file <normalized-read-responses.json>')
    const requests = await impactReadRequests(workflow, subject ?? '')
    payload = await workflow.observe(
      subject ?? '',
      impactResponseHost(read(value('--file') ?? ''), requests),
    )
  } else if (command === 'measure format') {
    if (!value('--file')) throw new Error('Provide --file <report-layout.json>')
    payload = workflow.format(subject ?? '', read(value('--file') ?? '') as ImpactLayout[])
  } else if (command === 'measure complete')
    payload = { schema: 'wholeloop/impact-complete@1', ...workflow.complete(subject ?? '') }
  else if (command === 'measure schedule') payload = workflow.schedule(subject ?? '')
  else if (command === 'measure tick') {
    const at = value('--at') ?? new Date().toISOString()
    if (!Number.isFinite(Date.parse(at))) throw new CliError('Provide --at <iso-time>')
    const config = engine.config(),
      due = dueObservations(
        engine.store.events(),
        (subject ?? '').split(','),
        configuredCheckpoints(config),
        new Date(Date.parse(at)).toISOString(),
        { checkpoints: configuredCheckpoints(config), learn: config.learn ?? null },
      ),
      result = new ObservationSchedule(engine.store.files).tick(due)
    payload = { schema: 'wholeloop/impact-tick@1', at, due, ...result, reads: 'not-performed' }
  } else if (command === 'measure digest')
    payload = impactDigest(engine.store.events(), subject?.split(','))
  else
    payload = {
      ...workflow.report(subject ?? ''),
      guidance: workflow.context(subject ?? '').guidance,
    }
  io.out(JSON.stringify(payload, null, json ? undefined : 2))
  return payload &&
    typeof payload === 'object' &&
    'status' in payload &&
    payload.status === 'question'
    ? EXIT.input
    : EXIT.ok
}
