// Provisions delivery environments, binding grants and effect budgets to backend observations.
import { createHash, randomUUID } from 'node:crypto'
import { posix } from 'node:path'
import { contractDigest } from '../contracts/compatibility.js'
import { acceptedDecisionPlan } from '../decisions/accepted.js'
import { currentBudgetReservation } from '../delivery/budget-policy.js'
import { DeliveryEffects, type EffectHost } from '../delivery/effects.js'
import { readSourceFile, sourceHash } from '../delivery/input.js'
import { checkPlanEnvelope, validateDeliveryShape } from '../delivery/plan.js'
import {
  captureEnvironmentCandidates,
  type EnvironmentCandidate,
  type EnvironmentCopy,
} from './candidates.js'
import { DockerCli, DockerEnvironmentError, type DockerTransport } from './docker-command.js'
import {
  type ContainerSpec,
  DOCKER_HELPER_CPUS,
  DOCKER_HELPER_MEMORY_MIB,
  type DockerImage,
  type DockerPreflight,
  dockerImage,
  dockerPreflight,
} from './docker-policy.js'
import { publishDockerService } from './docker-proxy.js'
import { TCP_READY } from './docker-readiness.js'
import { DockerResources } from './docker-resources.js'
import { inspectEnvironment } from './inspect.js'
import { EnvironmentOperations, environmentFenced, TrackedDockerTransport } from './operations.js'
import {
  type EnvironmentProvisionControl,
  EnvironmentProvisionParent,
} from './provision-control.js'
import type { EnvironmentRecipe, EnvironmentService } from './recipe.js'
import { EnvironmentRecipes } from './recipe-store.js'
import {
  type EnvironmentResource,
  EnvironmentResources,
  type EnvironmentRuntime,
} from './runtime.js'
import provisionSchema from './schemas/provision-request-v1.json' with { type: 'json' }

const INITIALIZE = `const fs=require('node:fs'),p=require('node:path'),crypto=require('node:crypto');const hash=b=>crypto.createHash('sha256').update(b).digest('hex');let text='';process.stdin.setEncoding('utf8');process.stdin.on('data',c=>{text+=c;if(text.length>67108864)process.exit(2)});process.stdin.on('end',()=>{const data=JSON.parse(text),observed=[];for(const root of data.roots){const base=fs.realpathSync(root.target);fs.chmodSync(base,511);const files=[];for(const file of root.files){if(!file.path||file.path.startsWith('/')||file.path.split('/').some(x=>!x||x==='.'||x==='..'||x==='.git')||file.path.includes(String.fromCharCode(92)))process.exit(3);const path=p.join(base,file.path);fs.mkdirSync(p.dirname(path),{recursive:true,mode:511});let dir=p.dirname(path);while(dir!==base){fs.chmodSync(dir,511);dir=p.dirname(dir)}fs.writeFileSync(path,Buffer.from(file.body,'base64'),{flag:'wx',mode:file.executable?511:438});fs.chmodSync(path,file.executable?511:438);const bytes=fs.readFileSync(path);files.push({path:file.path,sha256:hash(bytes),bytes:bytes.length,mode:fs.statSync(path).mode&511})}observed.push({target:root.target,mode:fs.statSync(base).mode&511,files})}console.log(JSON.stringify({initialized:true,sha256:hash(JSON.stringify(observed))}))})`
export interface EnvironmentProvisionRequest {
  schema: 'wholeloop/environment-provision-request@1'
  run: string
  recipe: string
  key: string
  helperImage: string
  workspaces: EnvironmentCandidate[]
}
export interface EnvironmentProvisionResult {
  schema: 'wholeloop/environment-provision-result@1'
  status: 'ready' | 'failed' | 'unknown' | 'unavailable'
  preflight: DockerPreflight
  environment?: { record: EnvironmentRuntime; digest: string; sequence: number }
  effect?: string
  acceptance: 'not-established'
}

/** Only this controller path binds private grants and effect budgets to backend observations. */
export class DeliveryEnvironments {
  readonly effects: DeliveryEffects
  readonly recipes: EnvironmentRecipes
  readonly resources: EnvironmentResources
  readonly driver: DockerTransport
  private readonly parent: EnvironmentProvisionParent
  constructor(
    store?: string,
    driver: DockerTransport = new DockerCli(),
    now?: () => string,
    readonly planAccepted?: (grant: string, plan: string) => boolean,
    control?: EnvironmentProvisionControl,
  ) {
    this.parent = new EnvironmentProvisionParent(driver, control)
    this.driver = this.parent.driver
    this.effects = new DeliveryEffects(store, now)
    this.recipes = new EnvironmentRecipes(this.effects.lifecycle.journal.files.root)
    this.resources = new EnvironmentResources(this.recipes.files)
  }
  async provision(inputRequest: EnvironmentProvisionRequest): Promise<EnvironmentProvisionResult> {
    this.parent.check()
    let input: EnvironmentProvisionRequest
    try {
      // Preflight yields to the caller; subsequent admission must retain the
      // same run, recipe and key that were checked before that observation.
      input = structuredClone(inputRequest)
      validateDeliveryShape(input, provisionSchema)
    } catch {
      throw new DockerEnvironmentError('invalid-provision-request')
    }
    if (
      input.schema !== 'wholeloop/environment-provision-request@1' ||
      !/^[a-z][a-z0-9_-]{0,63}$/.test(input.key) ||
      !/^[a-f0-9]{64}$/.test(input.recipe) ||
      !Array.isArray(input.workspaces)
    )
      throw new DockerEnvironmentError('invalid-provision-request')
    const { state, grant, prepared } = this.authority(input.run)
    const recipe = this.recipes.get(input.recipe).recipe
    if (this.recipes.inspect(input.recipe).inputs !== 'current')
      throw new DockerEnvironmentError('changed-environment-recipe-inputs')
    const captured = captureEnvironmentCandidates(recipe, prepared.plan, grant, input.workspaces)
    const candidates = captured.map((entry) => entry.candidate)
    const preflight = await dockerPreflight(this.driver, recipe, input.helperImage)
    this.parent.check()
    const result: EnvironmentProvisionResult = {
      schema: 'wholeloop/environment-provision-result@1',
      status: 'unavailable',
      preflight,
      acceptance: 'not-established',
    }
    this.recipes.files.atomic(
      `delivery/environment-preflights/${preflight.evidence}.json`,
      `${JSON.stringify(preflight)}\n`,
    )
    if (!preflight.available) return result
    const scope = grant.repositories.find(
      (entry) => entry.repository === recipe.repositories[0]?.id,
    )
    const primary = prepared.plan.repositories.find((entry) => entry.id === scope?.repository)
    if (!scope || !primary) throw new DockerEnvironmentError('missing-environment-repository')
    const id = `environment-${contractDigest({ run: input.run, basis: state.basis.digest, key: input.key }).slice(0, 32)}`
    const digest = contractDigest({
      recipe: input.recipe,
      helperImage: input.helperImage,
      candidates,
    })
    this.parent.check()
    const effect = this.effects.prepare(input.run, {
      key: `environment-${input.key}`,
      operation: 'workspace.create',
      repository: primary.id,
      ref: `${scope.topicPrefix}${scope.topicPrefix.endsWith('/') ? '' : '/'}environment/${input.key}`,
      expectedHead: primary.base,
      inputDigest: digest,
    })
    const now = this.effects.lifecycle.journal.now()
    const record: EnvironmentRuntime = {
      schema: 'wholeloop/environment-runtime@1',
      id,
      run: input.run,
      basis: state.basis.digest,
      recipe: input.recipe,
      key: input.key,
      grant: grant.id,
      grantDigest: state.grant?.digest ?? '',
      token: randomUUID(),
      effect: effect.intent.id,
      createdAt: now,
      deadline: this.parent.deadline(
        new Date(
          Math.min(
            Date.parse(now) + recipe.limits.setupMs + recipe.limits.readinessMs,
            Date.parse(grant.expiresAt),
          ),
        ).toISOString(),
      ),
      lifetimeDeadline: new Date(
        Math.min(Date.parse(now) + grant.budgets.wallTimeMs, Date.parse(grant.expiresAt)),
      ).toISOString(),
      state: 'planned',
      provenance: this.driver.provenance,
      helperImage: input.helperImage,
      host: preflight.host,
      ...(preflight.daemon ? { daemon: preflight.daemon } : {}),
      candidates,
      resources: [],
      observations: [],
      acceptance: 'not-established',
      publication: 'not-performed',
    }
    let saved: ReturnType<EnvironmentResources['create']>
    try {
      saved = this.resources.create(record, (existing) => {
        this.parent.check()
        this.authority(input.run)
        const active = existing.filter(
          (entry) =>
            !['retired', 'unavailable', 'stopped', 'retained'].includes(entry.record.state),
        )
        const memory = active.reduce(
          (sum, entry) => sum + this.recipes.get(entry.record.recipe).recipe.limits.memoryMiB,
          0,
        )
        const cpus = active.reduce(
          (sum, entry) => sum + this.recipes.get(entry.record.recipe).recipe.limits.cpus,
          0,
        )
        if (
          !preflight.daemon ||
          (memory + recipe.limits.memoryMiB) * 1024 * 1024 > preflight.daemon.memoryBytes ||
          cpus + recipe.limits.cpus > preflight.daemon.cpus
        )
          throw new DockerEnvironmentError('reserved-capacity-unavailable')
      })
    } catch (error) {
      // Only a still-unissued intent can be abandoned after local admission fails.
      // A concurrent issue remains retained and must be reconciled.
      try {
        this.effects.abandon(input.run, effect.intent.id)
      } catch {}
      throw error
    }
    // The standalone API can inspect an existing key. A root producer must
    // also win actual resource admission after preflight, not adopt a racer.
    if (this.parent.requireNewResource && saved.record.token !== record.token)
      throw new DockerEnvironmentError('environment-resource-already-exists')
    if (
      saved.record.recipe !== input.recipe ||
      saved.record.helperImage !== input.helperImage ||
      contractDigest(saved.record.candidates) !== contractDigest(candidates)
    )
      throw new DockerEnvironmentError('environment-key-conflict')
    if (effect.status !== 'prepared' || saved.record.state !== 'planned') {
      const observed = await inspectEnvironment(
        this.resources,
        id,
        this.driver,
        this.effects.lifecycle.journal.now,
      )
      this.parent.check()
      return {
        ...result,
        status:
          observed.state === 'ready'
            ? 'ready'
            : saved.record.state === 'failed'
              ? 'failed'
              : 'unknown',
        environment: saved,
        effect: effect.intent.id,
      }
    }
    const host: EffectHost = {
      eligible: () => {
        this.parent.check()
        return {
          allowed: true,
          provenance: this.driver.provenance,
          evidence: preflight.evidence,
        }
      },
      invoke: async (_intent, invocation, signal) => {
        this.parent.check()
        this.resources.update(id, (record) => {
          record.invocation = invocation
          record.state = 'provisioning'
        })
        await this.execute(id, recipe, captured, preflight, signal)
      },
      observe: async (intent) => {
        const current = this.resources.get(id)
        const stopped = ['ready', 'failed'].includes(current.record.state)
        const runtime = new DockerResources(
          this.resources,
          id,
          this.driver,
          () => {},
          new AbortController().signal,
        )
        let observed = true
        for (const resource of current.record.resources) {
          if (!resource.id || !resource.stamp) {
            observed = false
            break
          }
          try {
            await runtime.owned(resource)
          } catch {
            observed = false
            break
          }
        }
        const applied = observed && current.record.resources.length > 0
        return {
          available: true,
          value: {
            binding: contractDigest(intent),
            status: applied
              ? 'applied'
              : stopped &&
                  !current.record.resources.length &&
                  !current.record.observations.some((entry) => entry.stage === 'image-pull-issued')
                ? 'not-applied'
                : 'unknown',
            evidence: current.digest,
            provenance: this.driver.provenance,
            invocationState: stopped ? 'stopped' : 'unknown',
            reason: 'observed',
            ...(applied ? { resource: { ref: intent.ref, revision: current.digest } } : {}),
          },
        }
      },
    }
    const executed = await this.effects.execute(input.run, effect.intent.id, host)
    this.parent.check()
    const final = this.resources.get(id)
    const status =
      executed.status === 'unknown' ||
      executed.status === 'pending' ||
      ['unknown', 'provisioning', 'planned'].includes(final.record.state)
        ? 'unknown'
        : final.record.state === 'ready'
          ? 'ready'
          : 'failed'
    return { ...result, status, environment: final, effect: effect.intent.id }
  }
  private authority(run: string) {
    const state = this.effects.lifecycle.journal.view(run)
    const receipt = state.grant
      ? this.effects.lifecycle.authority.inspect(state.grant.id)
      : undefined
    if (
      receipt?.status !== 'active' ||
      receipt.digest !== state.grant?.digest ||
      !receipt.grant.effects.includes('workspace.create') ||
      !receipt.grant.effects.includes('test.run') ||
      state.basis.kind !== 'plan' ||
      !['queued', 'running', 'waiting-external'].includes(state.state)
    )
      throw new DockerEnvironmentError('inactive-environment-authority')
    const prepared = this.effects.lifecycle.authority.planning.getPlan(
      run,
      state.basis.revision ?? 0,
    )
    if (prepared.digest !== state.basis.digest)
      throw new DockerEnvironmentError('changed-environment-basis')
    if (receipt.grant.basis.kind === 'envelope') {
      if (
        prepared.plan.envelope !== receipt.grant.basis.digest ||
        !receipt.grant.decisions.includes('delivery-plan') ||
        !(
          this.planAccepted?.(receipt.digest, prepared.digest) ??
          acceptedDecisionPlan(this.recipes.files.root, receipt.digest, prepared.digest)
        )
      )
        throw new DockerEnvironmentError('unaccepted-environment-plan')
      checkPlanEnvelope(
        prepared.plan,
        this.effects.lifecycle.authority.planning.getEnvelope(receipt.grant.basis.digest).envelope,
      )
    } else if (receipt.grant.basis.digest !== prepared.digest)
      throw new DockerEnvironmentError('changed-environment-grant')
    return { state, grant: receipt.grant, prepared }
  }
  private current(id: string) {
    this.parent.check()
    const { record } = this.resources.get(id)
    if (environmentFenced(this.recipes.files, id))
      throw new DockerEnvironmentError('environment-fenced')
    const { state } = this.authority(record.run)
    if (
      state.basis.digest !== record.basis ||
      state.grant?.digest !== record.grantDigest ||
      !record.invocation ||
      !currentBudgetReservation(state, record.invocation, this.effects.budgetClock()) ||
      this.effects.lifecycle.journal.now() >= record.deadline
    )
      throw new DockerEnvironmentError('environment-deadline-or-authority')
  }
  private remaining(id: string, maximum: number) {
    const record = this.resources.get(id).record
    return Math.max(
      1,
      Math.min(
        maximum,
        Date.parse(record.deadline) - Date.parse(this.effects.lifecycle.journal.now()),
      ),
    )
  }
  private async execute(
    id: string,
    recipe: EnvironmentRecipe,
    captured: ReturnType<typeof captureEnvironmentCandidates>,
    preflight: DockerPreflight,
    signal: AbortSignal,
  ) {
    const abort = new AbortController()
    const cancel = () => abort.abort()
    signal.addEventListener('abort', cancel, { once: true })
    const watch = setInterval(() => {
      try {
        this.current(id)
      } catch {
        abort.abort()
      }
    }, 250)
    if (signal.aborted) abort.abort()
    let setupDeadline = Date.now() + recipe.limits.setupMs
    let readinessRemaining = recipe.limits.readinessMs
    let readiness = false
    const operations = new EnvironmentOperations(this.recipes.files, id, this.driver.provenance)
    const tracked = new TrackedDockerTransport(this.driver, operations)
    const runtime = new DockerResources(
      this.resources,
      id,
      tracked,
      () => {
        if (abort.signal.aborted) throw new DockerEnvironmentError('environment-cancelled')
        this.current(id)
        if (!readiness && Date.now() >= setupDeadline)
          throw new DockerEnvironmentError('setup-deadline')
      },
      abort.signal,
      recipe.limits.outputBytes,
    )
    try {
      operations.activateProvisioning()
      const images = new Map<string, DockerImage>()
      for (const observed of preflight.images) {
        const image = await dockerImage(this.driver, observed.ref, recipe.backend.architecture)
        if (
          !image ||
          image.id !== observed.id ||
          image.manifest !== observed.manifest ||
          contractDigest({
            env: image.env,
            entrypoint: image.entrypoint,
            command: image.command,
          }) !== observed.configuration
        )
          throw new DockerEnvironmentError('image-observation-changed')
        images.set(image.ref, image)
      }
      for (const ref of preflight.missing) {
        this.current(id)
        runtime.observation('image-pull-issued', 'issued', contractDigest({ ref }))
        const pulled = await tracked.call(
          ['image', 'pull', '--platform', `linux/${recipe.backend.architecture}`, ref],
          { timeoutMs: this.remaining(id, recipe.limits.setupMs), signal: abort.signal },
        )
        runtime.observation('image-pull', pulled.status, pulled.digest)
        const image = await dockerImage(this.driver, ref, recipe.backend.architecture)
        if (
          image?.os !== 'linux' ||
          image.architecture !== recipe.backend.architecture ||
          pulled.status !== 'succeeded'
        )
          throw new DockerEnvironmentError('image-provision-unknown')
        images.set(ref, image)
      }
      const helper = images.get(this.resources.get(id).record.helperImage)
      if (!helper) throw new DockerEnvironmentError('helper-image-unavailable')
      const volumes = new Map<string, EnvironmentResource>()
      const roots: { target: string; files: EnvironmentCopy[] }[] = []
      for (const candidate of captured) {
        const volume = await runtime.volume(
          `workspace-${candidate.candidate.repository}`,
          'workspace',
        )
        volumes.set(`workspace:${candidate.candidate.repository}`, volume)
        roots.push({ target: `/volumes/${volume.slot}`, files: candidate.files })
      }
      for (const data of recipe.data) {
        const volume = await runtime.volume(`data-${data}`, 'data')
        volumes.set(`data:${data}`, volume)
        roots.push({ target: `/volumes/${volume.slot}`, files: [] })
      }
      for (const file of recipe.files.filter((file) =>
        recipe.services.some((service) =>
          service.mounts.some((mount) => mount.kind === 'input' && mount.source === file.id),
        ),
      )) {
        const volume = await runtime.volume(`input-${file.id}`, 'input')
        volumes.set(`input:${file.id}`, volume)
        const text = readSourceFile(
          this.recipes.files.root,
          `delivery/environment-inputs/${file.sha256}.txt`,
        )
        roots.push({
          target: `/volumes/${volume.slot}`,
          files: [
            {
              path: posix.basename(file.ref),
              body: Buffer.from(text).toString('base64'),
              executable: false,
            },
          ],
        })
      }
      const init: ContainerSpec = {
        image: helper,
        command: { argv: ['node', '-e', INITIALIZE], cwd: '/tmp', origin: { kind: 'recipe' } },
        mounts: [...volumes.values()].map((volume) => ({
          source: volume.name,
          target: `/volumes/${volume.slot}`,
          write: true,
        })),
        network: 'none',
        ports: [],
        user: '0:0',
        memoryMiB: DOCKER_HELPER_MEMORY_MIB,
        cpus: DOCKER_HELPER_CPUS,
        interactive: true,
      }
      const initializer = await runtime.container('initialize', 'initialize', init)
      const copied = await runtime.job(
        initializer,
        JSON.stringify({ roots }),
        this.remaining(id, Math.max(1, setupDeadline - Date.now())),
      )
      const expectedCopy = sourceHash(
        JSON.stringify(
          roots.map((root) => ({
            target: root.target,
            mode: 511,
            files: root.files.map((file) => {
              const bytes = Buffer.from(file.body, 'base64')
              return {
                path: file.path,
                sha256: createHash('sha256').update(bytes).digest('hex'),
                bytes: bytes.length,
                mode: file.executable ? 511 : 438,
              }
            }),
          })),
        ),
      )
      const actualCopy = JSON.parse(copied.stdout) as { initialized?: unknown; sha256?: unknown }
      if (actualCopy.initialized !== true || actualCopy.sha256 !== expectedCopy)
        throw new DockerEnvironmentError('copied-bytes-unobserved')
      runtime.observation('copy-bytes', 'observed', expectedCopy, initializer.slot)
      const network =
        recipe.network.setup === 'internal' || recipe.network.runtime === 'internal'
          ? await runtime.network()
          : undefined
      const ingress = recipe.services.some((service) =>
        service.ports.some((port) => port.publish === 'loopback'),
      )
        ? await runtime.network(true)
        : undefined
      const complete = new Set<string>()
      while (complete.size < recipe.services.length) {
        const service = recipe.services.find(
          (service) => !complete.has(service.id) && service.after.every((id) => complete.has(id)),
        )
        if (!service) throw new DockerEnvironmentError('service-order')
        const image = images.get(service.image)
        if (!image) throw new DockerEnvironmentError('service-image-unavailable')
        const spec = (mode: 'setup' | 'runtime', command = service.start): ContainerSpec => ({
          image,
          command,
          mounts: service.mounts.map((mount) => {
            const volume = volumes.get(`${mount.kind}:${mount.source}`)
            if (!volume) throw new DockerEnvironmentError('missing-owned-volume')
            return { source: volume.name, target: mount.target, write: mount.access === 'write' }
          }),
          network: recipe.network[mode] === 'internal' ? (network?.name ?? 'none') : 'none',
          ports: [],
          ...(mode === 'runtime' && recipe.network.runtime === 'internal'
            ? { alias: service.id }
            : {}),
          user: '65532:65532',
          memoryMiB: service.memoryMiB,
          cpus: mode === 'setup' ? DOCKER_HELPER_CPUS : service.cpus,
          interactive: mode === 'setup',
        })
        for (const step of recipe.commands.filter(
          (step) => step.service === service.id && step.phase !== 'test',
        )) {
          const job = await runtime.container(
            `command-${step.id}`,
            step.phase,
            spec('setup', step.command),
            service.id,
          )
          await runtime.job(
            job,
            '',
            this.remaining(id, Math.max(1, Math.min(step.timeoutMs, setupDeadline - Date.now()))),
          )
        }
        const container = await runtime.container(
          `service-${service.id}`,
          'service',
          spec('runtime'),
          service.id,
        )
        const started = await runtime.start(container)
        if (readinessRemaining <= 0) throw new DockerEnvironmentError('readiness-deadline')
        const readyStarted = Date.now()
        readiness = true
        try {
          await this.ready(
            id,
            service,
            started,
            spec('runtime'),
            helper,
            runtime,
            readinessRemaining,
          )
        } finally {
          const elapsed = Date.now() - readyStarted
          readinessRemaining -= elapsed
          setupDeadline += elapsed
          readiness = false
        }
        for (const port of service.ports.filter((port) => port.publish === 'loopback')) {
          if (!network || !ingress) throw new DockerEnvironmentError('missing-ingress-boundary')
          await publishDockerService({
            runtime,
            service: started,
            port: port.container,
            internal: network,
            ingress,
            helper,
            deadline: this.resources.get(id).record.lifetimeDeadline,
          })
        }
        complete.add(service.id)
      }
      for (const entry of this.resources
        .get(id)
        .record.resources.filter((entry) => entry.purpose === 'service'))
        await runtime.owned(entry)
      this.current(id)
      this.resources.update(id, (record) => {
        record.state = 'ready'
        record.observations.push({
          stage: 'ready',
          status: 'observed',
          at: this.effects.lifecycle.journal.now(),
          evidence: contractDigest({
            recipe: record.recipe,
            candidates: record.candidates,
            resources: record.resources,
          }),
        })
      })
    } catch (error) {
      // Lifecycle recovery owns shutdown after fencing; the old starter must not revive or race its final state.
      if (environmentFenced(this.recipes.files, id)) return
      let unknown = false
      for (const resource of this.resources
        .get(id)
        .record.resources.filter(
          (resource) =>
            resource.kind === 'container' &&
            resource.id !== undefined &&
            !['exited', 'stopped', 'retired'].includes(resource.status),
        )) {
        try {
          await runtime.owned(resource, false)
          await tracked.call(['container', 'stop', '--time', '1', resource.id ?? ''], {
            timeoutMs: 5000,
          })
          const value = await runtime.owned(resource, false)
          if ((value.State as { Running?: unknown }).Running !== false) unknown = true
          else
            this.resources.update(id, (record) => {
              const entry = record.resources.find((entry) => entry.slot === resource.slot)
              if (entry) entry.status = 'stopped'
            })
        } catch {
          unknown = true
        }
      }
      this.resources.update(id, (record) => {
        if (environmentFenced(this.recipes.files, id)) return
        record.state = unknown ? 'unknown' : 'failed'
        record.reason =
          error instanceof DockerEnvironmentError ? error.problem : 'backend-operation-failed'
      })
    } finally {
      clearInterval(watch)
      signal.removeEventListener('abort', cancel)
    }
  }
  private async ready(
    id: string,
    service: EnvironmentService,
    container: EnvironmentResource,
    spec: ContainerSpec,
    helper: ContainerSpec['image'],
    runtime: DockerResources,
    readinessRemaining: number,
  ) {
    const deadline =
      Date.now() + this.remaining(id, Math.min(service.readiness.timeoutMs, readinessRemaining))
    let round = 0
    while (Date.now() < deadline) {
      this.current(id)
      await runtime.owned(container)
      const command =
        service.readiness.kind === 'exec'
          ? service.readiness.command
          : { argv: ['node', '-e', TCP_READY], cwd: '/tmp', origin: { kind: 'recipe' } as const }
      if (!command) throw new DockerEnvironmentError('missing-readiness-command')
      const check: ContainerSpec =
        service.readiness.kind === 'exec'
          ? {
              ...spec,
              command,
              network: `container:${container.id}`,
              ports: [],
              interactive: true,
              cpus: DOCKER_HELPER_CPUS,
            }
          : {
              image: helper,
              command,
              mounts: [],
              network: `container:${container.id}`,
              ports: [],
              user: '65532:65532',
              memoryMiB: DOCKER_HELPER_MEMORY_MIB,
              cpus: DOCKER_HELPER_CPUS,
              interactive: true,
            }
      delete check.alias
      delete check.networks
      const job = await runtime.container(
        `ready-${service.id}-${round++}`,
        'readiness',
        check,
        service.id,
      )
      try {
        await runtime.job(
          job,
          service.readiness.kind === 'tcp' ? JSON.stringify({ port: service.readiness.port }) : '',
          Math.max(1, Math.min(2000, deadline - Date.now())),
        )
        await runtime.owned(container)
        const value = await runtime.owned(container)
        if ((value.State as { Running?: unknown }).Running !== true)
          throw new DockerEnvironmentError('service-not-running')
        return
      } catch (error) {
        if (
          !(error instanceof DockerEnvironmentError) ||
          error.problem !== 'command-failed' ||
          round >= 10
        )
          throw error
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(200, Math.max(1, deadline - Date.now()))),
        )
      }
    }
    throw new DockerEnvironmentError('readiness-timeout')
  }
}
