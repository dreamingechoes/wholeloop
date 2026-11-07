// The source and pinned definitions the public host plans builds from.
import { existsSync } from 'node:fs'
import { DeliveryAcceptance } from '../acceptance/store.js'
import { contractDigest } from '../contracts/compatibility.js'
import { readSourceFile, safeSourceText, sourceHash } from '../delivery/input.js'
import { type NativeRuntime, nativeRuntimeRepository } from '../delivery/native-runtime.js'
import type { WorkerContext } from '../delivery/worker-protocol.js'
import { EnvironmentRecipes } from '../environment/recipe-store.js'
import { workspaceSnapshot } from '../gates/snapshot.js'
import type { RunnerStageContext } from './engine.js'
import { RunnerGitStages } from './git-stages.js'
import { DeliveryRunnerError } from './route.js'
import type { RunnerStore } from './store.js'

/** Selected source and pinned definitions are planning data, never execution or approval. */
export class PublicBuildPlanInputs {
  constructor(
    readonly store: RunnerStore,
    readonly runtime: Readonly<NativeRuntime>,
  ) {}

  private selected(context: RunnerStageContext) {
    const basis = this.store.basis(context.request),
      request = contractDigest(context.request),
      record = this.store.stage(request, context.stage.id),
      unit = context.plan.work.find((work) => work.id === context.stage.unit),
      repository = context.plan.repositories.find((repo) => repo.id === unit?.repository)
    if (
      basis.digest !== contractDigest(context.plan) ||
      context.stage.kind !== 'build-plan' ||
      context.stage.id !== `build-plan:${unit?.id}` ||
      !unit ||
      !repository ||
      record?.invocation !== context.invocation ||
      record.basis !== basis.digest ||
      !['prepared', 'running'].includes(record.status) ||
      !/^[a-f0-9]{64}$/.test(context.invocation) ||
      context.signal.aborted ||
      !context.current() ||
      !basis.authority.grant.effects.includes('source.read')
    )
      throw new DeliveryRunnerError('public-build-plan-inputs-scope')
    const definition = this.store.stage(request, 'acceptance-definition'),
      acceptance = new DeliveryAcceptance(this.store.files.root).pinnedFor(
        context.plan.run,
        context.plan.revision,
      )
    if (
      definition?.status !== 'passed' ||
      definition.provenance !== 'host-observed' ||
      definition.basis !== basis.digest ||
      !/^[a-f0-9]{64}$/.test(definition.invocation) ||
      !/^[a-f0-9]{64}$/.test(definition.evidence ?? '') ||
      acceptance.plan.plan !== basis.digest ||
      acceptance.plan.source !== context.plan.source
    )
      throw new DeliveryRunnerError('public-build-plan-inputs-acceptance')
    const selected = nativeRuntimeRepository(this.runtime, repository.id)
    if (!selected) throw new DeliveryRunnerError('public-build-plan-inputs-recipe')
    const recipe = new EnvironmentRecipes(this.store.files.root).get(selected.recipe),
      workspace = new RunnerGitStages(this.store).workspace(context.request, unit.id).repository,
      before = workspaceSnapshot(workspace.path)
    let bytes = 0
    const files = recipe.files
      .filter((file) => file.repository === repository.id)
      .sort((a, b) => (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0))
      .map((file) => {
        // Read only operator-selected paths in this exact owned candidate. A
        // recipe's baseline digest must never label changed source as current.
        const text = readSourceFile(workspace.path, file.ref, 128 * 1024)
        bytes += Buffer.byteLength(text)
        if (bytes > 128 * 1024) throw new DeliveryRunnerError('public-build-plan-inputs-limit')
        return { path: file.ref, selectedBaseSha256: file.sha256, sha256: sourceHash(text), text }
      })
    if (
      workspaceSnapshot(workspace.path).digest !== before.digest ||
      this.store.basis(context.request).digest !== basis.digest ||
      !context.current()
    )
      throw new DeliveryRunnerError('public-build-plan-inputs-changed')
    const body = JSON.stringify({
      schema: 'wholeloop/public-build-plan-inputs@1',
      request,
      plan: basis.digest,
      stage: context.stage.id,
      invocation: context.invocation,
      unit: unit.id,
      repository: {
        id: repository.id,
        base: repository.base,
        head: before.head,
        snapshot: before.digest,
        files,
      },
      acceptance: {
        digest: acceptance.digest,
        // Coverage and the original receipt establish the prerequisite without
        // exposing private runner inputs, fixtures, assertions or expected values.
        cases: acceptance.plan.cases.map(({ id, criteria, owner, applicability }) => ({
          id,
          criteria,
          owner,
          applicability,
        })),
        production: {
          stage: 'acceptance-definition',
          invocation: definition.invocation,
          evidence: definition.evidence,
          status: definition.status,
          provenance: definition.provenance,
        },
      },
      meaning:
        'Selected current source and pinned acceptance definitions only; no execution, acceptance, approval or authority is established.',
    })
    safeSourceText(body, 256 * 1024)
    const ref = `artifacts/build-plan-${context.invocation}.json`,
      artifact = {
        ref: `delivery/public-guidance/${contractDigest(context.plan.guidance)}/${ref}`,
        sha256: sourceHash(body),
      },
      input: WorkerContext = {
        kind: 'source',
        audience: 'shared',
        artifact: { ref, sha256: artifact.sha256, bytes: Buffer.byteLength(body) },
      }
    return { body, artifact, context: input }
  }

  prepare(context: RunnerStageContext) {
    const selected = this.selected(context)
    this.store.files.locked(() => {
      if (!existsSync(this.store.files.path(selected.artifact.ref)))
        this.store.files.atomic(selected.artifact.ref, selected.body)
      else if (
        readSourceFile(this.store.files.root, selected.artifact.ref, 256 * 1024) !== selected.body
      )
        throw new DeliveryRunnerError('public-build-plan-inputs-changed')
    })
    this.read(context)
    return { artifact: selected.artifact, context: selected.context }
  }

  read(context: RunnerStageContext) {
    const selected = this.selected(context)
    if (readSourceFile(this.store.files.root, selected.artifact.ref, 256 * 1024) !== selected.body)
      throw new DeliveryRunnerError('public-build-plan-inputs-changed')
    return selected.artifact
  }
}
