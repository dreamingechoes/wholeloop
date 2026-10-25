import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { contractDigest } from '../contracts/compatibility.js'
import { readSourceFile, safeSourceText } from '../delivery/input.js'
import { validateDeliveryShape } from '../delivery/plan.js'
import type { StoreFiles } from '../state/files.js'
import {
  DockerCli,
  DockerEnvironmentError,
  type DockerTransport,
  dockerJson,
} from './docker-command.js'
import { dockerObjects } from './docker-policy.js'
import { DockerResources } from './docker-resources.js'
import { EnvironmentOperations, processPresence, TrackedDockerTransport } from './operations.js'
import { EnvironmentRecipes } from './recipe-store.js'
import { type EnvironmentResource, EnvironmentResources } from './runtime.js'
import claimSchema from './schemas/lifecycle-claim-v1.json' with { type: 'json' }
import receiptSchema from './schemas/lifecycle-receipt-v1.json' with { type: 'json' }
import releaseSchema from './schemas/lifecycle-release-v1.json' with { type: 'json' }
import requestSchema from './schemas/lifecycle-request-v1.json' with { type: 'json' }

export interface EnvironmentLifecycleRequest {
  schema: 'wholeloop/environment-lifecycle-request@1'
  id: string
  environment: string
  expected: string
  action: 'stop' | 'reconcile' | 'retire'
  reason: string
}
export interface EnvironmentLifecycleReceipt {
  schema: 'wholeloop/environment-lifecycle-receipt@1'
  request: string
  environment: string
  action: EnvironmentLifecycleRequest['action']
  state: 'stopped' | 'retained' | 'retired' | 'unknown'
  runtime: string
  at: string
  provenance: DockerTransport['provenance']
  clients: 'stopped' | 'unknown'
  reason: string
  reviewAfter: string
  acceptance: 'not-established'
  publication: 'not-performed'
}
export const ENVIRONMENT_LIFECYCLE_SCHEMAS = [
  requestSchema,
  receiptSchema,
  claimSchema,
  releaseSchema,
]

/** Operator-only lifecycle authority narrows to exact owned resources; it never restores execution authority. */
export class EnvironmentLifecycle {
  readonly records: EnvironmentResources
  constructor(
    readonly files: StoreFiles,
    readonly driver: DockerTransport = new DockerCli(),
  ) {
    this.records = new EnvironmentResources(files)
  }
  async execute(request: EnvironmentLifecycleRequest): Promise<EnvironmentLifecycleReceipt> {
    safeSourceText(JSON.stringify(request), 65536)
    validateDeliveryShape(request, requestSchema)
    const initial = this.records.get(request.environment)
    if (initial.record.provenance !== this.driver.provenance)
      throw new DockerEnvironmentError('lifecycle-provenance-mismatch')
    const digest = contractDigest(request)
    const base = `delivery/environment-control/${request.environment}`
    const requestPath = `${base}/requests/${request.id}.json`
    const completePath = `${base}/completed/${digest}.json`
    let claim = ''
    this.files.locked(() => {
      if (existsSync(this.files.path(requestPath))) {
        const old = this.read(requestPath, requestSchema)
        if (contractDigest(old) !== digest)
          throw new DockerEnvironmentError('lifecycle-request-conflict')
      } else {
        if (request.expected !== this.records.get(request.environment).digest)
          throw new DockerEnvironmentError('stale-lifecycle-review')
        this.files.atomic(requestPath, `${JSON.stringify(request)}\n`)
      }
      if (existsSync(this.files.path(completePath))) return
      const activePath = `${base}/claim.json`
      if (existsSync(this.files.path(activePath))) {
        const active = this.read(activePath, claimSchema)
        if (active.environment !== request.environment)
          throw new DockerEnvironmentError('changed-lifecycle-claim')
        const release = `${base}/released/${active.id}.json`
        if (existsSync(this.files.path(release))) {
          if (this.read(release, releaseSchema).claim !== active.id)
            throw new DockerEnvironmentError('changed-lifecycle-release')
        } else if (processPresence(Number(active.pid)) !== 'absent')
          throw new DockerEnvironmentError('lifecycle-controller-not-confirmed-stopped')
      }
      claim = randomUUID()
      const value = {
        schema: 'wholeloop/environment-lifecycle-claim@1',
        id: claim,
        environment: request.environment,
        request: digest,
        pid: process.pid,
        at: new Date().toISOString(),
      }
      validateDeliveryShape(value, claimSchema)
      this.files.atomic(`${base}/claims/${claim}.json`, `${JSON.stringify(value)}\n`)
      this.files.atomic(activePath, `${JSON.stringify(value)}\n`)
    })
    if (!claim) {
      const receipt = this.read(completePath, receiptSchema)
      if (
        receipt.request !== digest ||
        receipt.environment !== request.environment ||
        receipt.action !== request.action ||
        receipt.state === 'unknown'
      )
        throw new DockerEnvironmentError('changed-lifecycle-receipt')
      return receipt as unknown as EnvironmentLifecycleReceipt
    }
    try {
      const operations = new EnvironmentOperations(
        this.files,
        request.environment,
        this.driver.provenance,
      )
      let clients: EnvironmentLifecycleReceipt['clients'] = 'unknown'
      let state: EnvironmentLifecycleReceipt['state'] = 'unknown'
      let reason = 'lifecycle-observation-unknown'
      try {
        operations.fence(request.id, request.reason)
        operations.cancelAll()
        const deadline = Date.now() + 6000
        while (
          operations.inspect().some((entry) => entry.status === 'unknown') &&
          Date.now() < deadline
        )
          await new Promise((resolve) => setTimeout(resolve, 50))
        const record = this.records.get(request.environment).record
        // Legacy completed startup has no pending caller. Incomplete pre-tracking histories cannot acquire that proof retroactively.
        const tracked =
          operations.provisionTracked() ||
          (record.state === 'ready' &&
            record.resources.every((resource) => Boolean(resource.id))) ||
          ['stopped', 'retained', 'retired'].includes(record.state)
        clients =
          tracked && operations.inspect().every((entry) => entry.status !== 'unknown')
            ? 'stopped'
            : 'unknown'
        await this.daemon(request.environment)
        const cleanup = new TrackedDockerTransport(this.driver, operations, true)
        const resources = new DockerResources(
          this.records,
          request.environment,
          cleanup,
          () => {},
          new AbortController().signal,
        )
        let unresolved = false
        // Stop known services even if a lost client prevents proving the whole environment quiet. Never delete in that case.
        for (const original of this.records.get(request.environment).record.resources) {
          try {
            const resource = await this.locate(resources, original)
            if (!resource) {
              if (clients !== 'stopped') {
                unresolved = true
                continue
              }
              this.status(request.environment, original.slot, 'retired')
              continue
            }
            if (resource.kind !== 'container') continue
            const value = await resources.owned(resource, false)
            const observed = this.object(value.State)
            if (observed.Running === true) {
              await this.daemon(request.environment)
              await resources.owned(resource, false)
              resources.observation(
                'stop-issued',
                'issued',
                contractDigest({ request: digest, resource: resource.id }),
                resource.slot,
              )
              await cleanup.call(['container', 'stop', '--time', '1', this.id(resource)], {
                timeoutMs: 5000,
              })
            }
            const stopped = this.object((await resources.owned(resource, false)).State)
            if (stopped.Running !== false || stopped.Restarting === true || stopped.Paused === true)
              throw new DockerEnvironmentError('container-stop-unobserved')
            this.status(request.environment, resource.slot, 'stopped')
          } catch {
            unresolved = true
          }
        }
        // A stopped CLI can have submitted a daemon-side start. Inspect again only after every prior client group is absent.
        if (
          clients !== 'stopped' ||
          unresolved ||
          operations.inspect().some((entry) => entry.status === 'unknown')
        )
          throw new DockerEnvironmentError('owned-stop-incomplete')
        if (request.action === 'retire') {
          for (const kind of ['container', 'network', 'volume'] as const) {
            for (const resource of this.records
              .get(request.environment)
              .record.resources.filter((entry) => entry.kind === kind)) {
              if (resource.status === 'retired') continue
              await this.daemon(request.environment)
              const located = await this.locate(resources, resource)
              if (!located) {
                this.status(request.environment, resource.slot, 'retired')
                continue
              }
              const observed = await resources.owned(located, false)
              if (kind === 'container' && this.object(observed.State).Running !== false)
                throw new DockerEnvironmentError('retirement-requires-stopped-container')
              resources.observation(
                'retire-issued',
                'issued',
                contractDigest({ request: digest, resource: located.id }),
                resource.slot,
              )
              await cleanup.call([kind, 'rm', this.id(located)], { timeoutMs: 5000 })
              if ((await this.list(located)).length !== 0)
                throw new DockerEnvironmentError('retirement-absence-unobserved')
              this.status(request.environment, resource.slot, 'retired')
            }
          }
          state = 'retired'
          reason = 'exact-owned-absence-observed'
        } else {
          state = this.records
            .get(request.environment)
            .record.resources.some((entry) => entry.kind === 'volume' && entry.status !== 'retired')
            ? 'retained'
            : 'stopped'
          reason = 'owned-stop-observed-evidence-retained'
        }
      } catch (error) {
        reason =
          error instanceof DockerEnvironmentError ? error.problem : 'lifecycle-observation-unknown'
      }
      const saved = this.records.update(request.environment, (record) => {
        record.state = state
        record.reason = reason
        record.observations.push({
          stage: request.action,
          status: state,
          evidence: digest,
          at: new Date().toISOString(),
        })
      })
      const recipe = new EnvironmentRecipes(this.files.root).get(saved.record.recipe).recipe
      const receipt: EnvironmentLifecycleReceipt = {
        schema: 'wholeloop/environment-lifecycle-receipt@1',
        request: digest,
        environment: request.environment,
        action: request.action,
        state,
        runtime: saved.digest,
        at: new Date().toISOString(),
        provenance: this.driver.provenance,
        clients,
        reason,
        reviewAfter: new Date(
          Date.parse(saved.record.createdAt) + recipe.retention.reviewAfterMs,
        ).toISOString(),
        acceptance: 'not-established',
        publication: 'not-performed',
      }
      validateDeliveryShape(receipt, receiptSchema)
      this.files.locked(() => {
        this.files.atomic(
          `${base}/receipts/${contractDigest(receipt)}.json`,
          `${JSON.stringify(receipt)}\n`,
        )
        if (state !== 'unknown') this.files.atomic(completePath, `${JSON.stringify(receipt)}\n`)
      })
      return receipt
    } finally {
      this.files.locked(() =>
        this.files.atomic(
          `${base}/released/${claim}.json`,
          `${JSON.stringify({ schema: 'wholeloop/environment-lifecycle-release@1', claim, at: new Date().toISOString() })}\n`,
        ),
      )
    }
  }
  private async daemon(environment: string) {
    const expected = this.records.get(environment).record.daemon?.id
    const value = this.object(
      dockerJson(await this.driver.call(['info', '--format', '{{json .}}'])),
    )
    if (!expected || value.ID !== expected)
      throw new DockerEnvironmentError('daemon-identity-changed')
  }
  private async list(resource: EnvironmentResource) {
    const result = await this.driver.call([
      resource.kind,
      'ls',
      ...(resource.kind === 'container'
        ? ['--all', '--no-trunc']
        : resource.kind === 'network'
          ? ['--no-trunc']
          : []),
      '--filter',
      resource.id && resource.kind !== 'volume' ? `id=${resource.id}` : `name=${resource.name}`,
      '--format',
      '{{json .}}',
    ])
    if (result.status !== 'succeeded') throw new DockerEnvironmentError('resource-list-unavailable')
    try {
      return result.stdout
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => {
          const value = this.object(JSON.parse(line))
          if (
            resource.kind === 'volume'
              ? typeof value.Name !== 'string' || !value.Name
              : typeof value.ID !== 'string' || !/^[a-f0-9]{64}$/.test(value.ID)
          )
            throw new DockerEnvironmentError('invalid-resource-list')
          return value
        })
        .filter((value) =>
          resource.id && resource.kind !== 'volume'
            ? value.ID === resource.id
            : (resource.kind === 'container' ? value.Names : value.Name) === resource.name,
        )
    } catch {
      throw new DockerEnvironmentError('invalid-resource-list')
    }
  }
  private async locate(resources: DockerResources, resource: EnvironmentResource) {
    const matches = await this.list(resource)
    if (!matches.length) return undefined
    if (matches.length !== 1) throw new DockerEnvironmentError('ambiguous-owned-resource')
    const listed = matches[0]
    const locator = resource.kind === 'volume' ? listed?.Name : listed?.ID
    if (
      typeof locator !== 'string' ||
      !locator ||
      (resource.id &&
        !(resource.kind === 'volume' ? locator === resource.id : resource.id.startsWith(locator)))
    )
      throw new DockerEnvironmentError('resource-locator-changed')
    if (resource.id) {
      await resources.owned(resource, false)
      return resource
    }
    const inspected = dockerObjects(
      dockerJson(await this.driver.call([resource.kind, 'inspect', locator])),
    )
    if (inspected.length !== 1 || !inspected[0])
      throw new DockerEnvironmentError('ambiguous-owned-resource')
    return resources.recover(resource, inspected[0])
  }
  private status(environment: string, slot: string, status: EnvironmentResource['status']) {
    this.records.update(environment, (record) => {
      const resource = record.resources.find((entry) => entry.slot === slot)
      if (!resource) throw new DockerEnvironmentError('unknown-resource')
      resource.status = status
    })
  }
  private id(resource: EnvironmentResource) {
    if (!resource.id) throw new DockerEnvironmentError('resource-id-unobserved')
    return resource.id
  }
  private read(path: string, schema: Parameters<typeof validateDeliveryShape>[1]) {
    const value = JSON.parse(readSourceFile(this.files.root, path, 65536)) as Record<
      string,
      unknown
    >
    validateDeliveryShape(value, schema)
    return value
  }
  private object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new DockerEnvironmentError('invalid-resource-observation')
    return value as Record<string, unknown>
  }
}
