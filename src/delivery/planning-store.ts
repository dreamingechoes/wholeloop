// Stores delivery plans and their revisions.
import { existsSync } from 'node:fs'
import { isObject } from '../config/schema.js'
import { contractDigest } from '../contracts/compatibility.js'
import { canonicalPath } from '../state/paths.js'
import { StateStore } from '../state/store.js'
import { readSourceFile } from './input.js'
import {
  checkPlanEnvelope,
  type DeliveryEnvelope,
  type DeliveryPlan,
  DeliveryPlanError,
  deliveryPlanRoute,
  observePlanBases,
  planWaves,
  validateDeliveryEnvelope,
  validateDeliveryPlan,
} from './plan.js'
import { DeliverySources } from './source.js'

export class DeliveryPlanning {
  readonly sources: DeliverySources
  constructor(store?: string) {
    this.sources = new DeliverySources(store)
  }

  prepareEnvelope(value: unknown) {
    const envelope = validateDeliveryEnvelope(value, this.source(value))
    const digest = contractDigest(envelope)
    const path = `delivery/envelopes/${digest}.json`
    return this.sources.files.locked(() => {
      if (existsSync(this.sources.files.path(path))) return this.getEnvelope(digest)
      observePlanBases(envelope.repositories)
      this.write(path, 'envelope', envelope)
      return { digest, envelope }
    })
  }

  preparePlan(value: unknown) {
    const plan = validateDeliveryPlan(value, this.source(value))
    const digest = contractDigest(plan)
    if (plan.envelope) checkPlanEnvelope(plan, this.getEnvelope(plan.envelope).envelope)
    const path = this.planPath(plan.run, plan.revision)
    return this.sources.files.locked(() => {
      if (existsSync(this.sources.files.path(path))) {
        const existing = this.getPlan(plan.run, plan.revision)
        if (existing.digest !== digest) throw new DeliveryPlanError('revision-conflict')
        return existing
      }
      if (plan.revision > 1 && this.getPlan(plan.run, plan.revision - 1).digest !== plan.previous)
        throw new DeliveryPlanError('predecessor-mismatch')
      observePlanBases(plan.repositories)
      const state = new StateStore(this.sources.files.root)
      for (const unit of plan.work)
        if (unit.subject !== undefined) {
          let item: ReturnType<StateStore['get']>
          try {
            item = state.get(unit.subject)
          } catch {
            throw new DeliveryPlanError('unknown-subject')
          }
          const repo = plan.repositories.find((entry) => entry.id === unit.repository)
          if (
            item.status === 'closed' ||
            (item.repository !== undefined && canonicalPath(item.repository) !== repo?.root)
          )
            throw new DeliveryPlanError('subject-mismatch')
        }
      // ADR-0200: only an observation `wl measure tick` actually scheduled, and not
      // yet settled, can become runner work; its identity is never invented here.
      if (plan.observation) {
        const files = this.sources.files,
          base = `learning/scheduled/${plan.observation.key}`,
          scheduled = files.read(`${base}.json`)
        let record: { schema?: string; key?: string; subject?: string; checkpoint?: string }
        try {
          record = JSON.parse(scheduled ?? '')
        } catch {
          throw new DeliveryPlanError('unscheduled-observation')
        }
        if (
          record.schema !== 'wholeloop/learning-observation@1' ||
          record.key !== plan.observation.key ||
          record.subject !== plan.observation.subject ||
          record.checkpoint !== plan.observation.checkpoint ||
          files.read(`${base}.result.json`) !== undefined
        )
          throw new DeliveryPlanError('unscheduled-observation')
      }
      this.write(path, 'plan', plan)
      return this.receipt(plan, digest)
    })
  }

  getPlan(run: string, revision: number) {
    const record = this.read(this.planPath(run, revision), 'plan')
    const plan = validateDeliveryPlan(record.value, this.source(record.value))
    if (plan.run !== run || plan.revision !== revision)
      throw new DeliveryPlanError('record-identity')
    return this.receipt(plan, record.digest)
  }

  getEnvelope(digest: string) {
    if (!/^[a-f0-9]{64}$/.test(digest)) throw new DeliveryPlanError('invalid-envelope-id')
    const record = this.read(`delivery/envelopes/${digest}.json`, 'envelope')
    if (record.digest !== digest) throw new DeliveryPlanError('record-identity')
    const envelope = validateDeliveryEnvelope(record.value, this.source(record.value))
    return { digest, envelope }
  }

  private source(value: unknown) {
    if (!isObject(value) || typeof value.source !== 'string')
      throw new DeliveryPlanError('missing-source')
    try {
      return this.sources.get(value.source)
    } catch {
      throw new DeliveryPlanError('missing-or-damaged-source')
    }
  }

  private planPath(run: string, revision: number): string {
    if (
      !/^delivery-[a-f0-9]{16}$/.test(run) ||
      !Number.isSafeInteger(revision) ||
      revision < 1 ||
      revision > 1000
    )
      throw new DeliveryPlanError('invalid-plan-id')
    return `delivery/plans/${run}/${revision}.json`
  }

  private write(
    path: string,
    kind: 'plan' | 'envelope',
    value: DeliveryPlan | DeliveryEnvelope,
  ): void {
    this.sources.files.atomic(
      path,
      `${JSON.stringify({ schema: value.schema === 'wholeloop/delivery-plan@2' ? 'wholeloop/delivery-planning-record@2' : 'wholeloop/delivery-planning-record@1', kind, digest: contractDigest(value), value })}\n`,
    )
  }

  private read(path: string, kind: 'plan' | 'envelope') {
    let record: unknown
    try {
      record = JSON.parse(readSourceFile(this.sources.files.root, path, 8 * 1024 * 1024))
    } catch {
      throw new DeliveryPlanError('missing-or-damaged-record')
    }
    if (
      !isObject(record) ||
      Object.keys(record).some((key) => !['schema', 'kind', 'digest', 'value'].includes(key)) ||
      record.schema !==
        (kind === 'plan' &&
        isObject(record.value) &&
        record.value.schema === 'wholeloop/delivery-plan@2'
          ? 'wholeloop/delivery-planning-record@2'
          : 'wholeloop/delivery-planning-record@1') ||
      record.kind !== kind ||
      typeof record.digest !== 'string' ||
      !isObject(record.value) ||
      contractDigest(record.value) !== record.digest
    )
      throw new DeliveryPlanError('damaged-record')
    return { digest: record.digest, value: record.value }
  }

  private receipt(plan: DeliveryPlan, digest: string) {
    return {
      schema:
        plan.schema === 'wholeloop/delivery-plan@2'
          ? 'wholeloop/delivery-plan-prepared@2'
          : 'wholeloop/delivery-plan-prepared@1',
      digest,
      plan,
      route: deliveryPlanRoute(plan),
      waves: planWaves(plan),
      authority: 'not-granted',
      workers: 'not-started',
    }
  }
}
