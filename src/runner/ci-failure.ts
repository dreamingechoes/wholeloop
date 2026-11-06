import { contractDigest } from '../contracts/compatibility.js'
import { readSourceFile } from '../delivery/input.js'
import { type CiObservation, ciVerdict, validateCiObservation } from './ci-observations.js'
import { type CiRepairRequest, ciRepairRequest } from './ci-repair.js'
import type { CiResult, StageBinding } from './merge-stages.js'
import { publicationMarker, publicationRecords } from './publication-evidence.js'
import type { PublicationBinding } from './publication-stages.js'
import { DeliveryRunnerError } from './route.js'
import type { RunnerStore } from './store.js'

const digest = (value: string) => /^[a-f0-9]{64}$/.test(value)
const exactKeys = (value: object, keys: string) => Object.keys(value).sort().join(',') === keys

/**
 * Read one failed CI production and its original owned publication as history.
 * No host, newest-file search, active grant or current PR state participates.
 * A caller must separately admit new authority, budgets and remote old-head reads.
 */
export function originalCiFailure(
  store: RunnerStore,
  input: { request: string; failure: string; repository: string },
) {
  try {
    const request = store.get(input.request),
      state = store.lifecycle.journal.view(request.run),
      owner = store.record(input.request),
      stage = owner.stages.find((entry) => entry.id === 'ci'),
      publication = owner.stages.find((entry) => entry.id === 'publication'),
      revision = state.plans.find((entry) => entry.digest === stage?.basis)?.revision,
      basis = store.planning.getPlan(request.run, revision ?? 0),
      merge = basis.plan.policy.merge
    if (
      !digest(input.failure) ||
      !stage ||
      stage.origin ||
      stage.status !== 'failed' ||
      stage.evidence !== input.failure ||
      stage.provenance !== 'host-observed' ||
      stage.runtime?.backend !== 'owned-core' ||
      stage.runtime.instance !== stage.invocation ||
      !publication ||
      publication.origin ||
      publication.status !== 'passed' ||
      publication.provenance !== 'host-observed' ||
      publication.runtime?.backend !== 'owned-core' ||
      publication.runtime.instance !== publication.invocation ||
      publication.basis !== stage.basis ||
      publication.sequence >= stage.sequence ||
      basis.digest !== stage.basis ||
      !merge ||
      basis.plan.policy.endpoint !== 'to-merge'
    )
      throw new Error('Original failed CI and publication required')
    const read = <T>(base: string) => {
        const binding = JSON.parse(
          readSourceFile(store.files.root, `${base}/binding.json`, 2 * 1024 * 1024),
        ) as T
        if (
          readSourceFile(store.files.root, `${base}/consumed`, 128).trim() !==
          contractDigest(binding)
        )
          throw new Error('Original consumed binding required')
        return binding
      },
      binding = read<StageBinding>(`delivery/runner-ci-stages/${stage.invocation}`),
      published = read<PublicationBinding>(
        `delivery/runner-publications/${publication.invocation}`,
      ),
      result = JSON.parse(
        readSourceFile(
          store.files.root,
          `delivery/runner-ci-stages/${stage.invocation}/result.json`,
          4 * 1024 * 1024,
        ),
      ) as CiResult,
      identity = (value: StageBinding | PublicationBinding, id: string, invocation: string) =>
        value.version === 1 &&
        value.request === input.request &&
        value.plan === basis.digest &&
        value.stage === id &&
        value.invocation === invocation &&
        Number.isFinite(Date.parse(value.at)) &&
        new Date(value.at).toISOString() === value.at
    if (
      !exactKeys(binding, 'at,invocation,plan,publication,request,stage,targets,version') ||
      !identity(binding, 'ci', stage.invocation) ||
      binding.publication !== publication.evidence ||
      !exactKeys(
        published,
        'acceptance,at,invocation,plan,ready,request,stage,targets,texts,version',
      ) ||
      !identity(published, 'publication', publication.invocation) ||
      published.ready !== true ||
      !digest(published.acceptance) ||
      !Array.isArray(published.targets) ||
      !published.targets.length ||
      published.texts.length !== published.targets.length ||
      binding.targets.length !== published.targets.length ||
      new Set(binding.targets.map((target) => target.repository)).size !== binding.targets.length ||
      result.binding !== contractDigest(binding) ||
      !exactKeys(result, 'binding,targets') ||
      contractDigest({ binding, result }) !== stage.evidence ||
      !result.targets.length ||
      result.targets.length > binding.targets.length
    )
      throw new Error('Original CI result binding required')
    const effects = publicationRecords(store, request.run, published)
    if (contractDigest({ binding: published, effects, accepted: true }) !== publication.evidence)
      throw new Error('Original publication receipt required')
    for (const [index, target] of binding.targets.entries()) {
      const original = published.targets[index],
        repository = basis.plan.repositories.find((entry) => entry.id === target.repository),
        owned = effects[index],
        { pr, method, ...candidate } = target
      if (
        !original ||
        contractDigest(candidate) !== contractDigest(original) ||
        method !== merge.method ||
        !repository?.remote ||
        target.remote !== repository.remote.name ||
        target.base !== repository.target.replace(/^refs\/heads\//, '') ||
        !/^wl\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(target.branch) ||
        !pr.startsWith(`${repository.remote.url}/pull/`) ||
        !/\/pull\/[1-9][0-9]*$/.test(pr) ||
        !published.texts[index]?.body.includes(publicationMarker(request.run, target.repository)) ||
        !owned ||
        ['push', 'create', 'ready'].some((step) => {
          const effect = owned[step as keyof typeof owned],
            observation = effect?.observations.at(-1)
          return (
            effect?.status !== 'applied' ||
            effect.admission?.provenance !== 'host-observed' ||
            effect.intent.expectedHead !== target.head ||
            effect.intent.ref !== target.branch ||
            observation?.provenance !== 'host-observed' ||
            observation.status !== 'applied' ||
            observation.resource?.revision !== (step === 'push' ? target.head : pr)
          )
        })
      )
        throw new Error('Original owned publication target required')
    }
    for (const [index, entry] of result.targets.entries())
      if (
        entry.repository !== binding.targets[index]?.repository ||
        (index < result.targets.length - 1 &&
          (entry.outcome !== 'settled' || entry.verdict.status !== 'passed'))
      )
        throw new Error('Original CI prefix required')
    const entry = result.targets.at(-1),
      target = binding.targets[result.targets.length - 1],
      observationId = entry?.observations.at(-1)
    if (
      !entry ||
      !target ||
      target.repository !== input.repository ||
      entry.outcome !== 'settled' ||
      entry.verdict.status !== 'failed' ||
      !entry.repair ||
      !digest(entry.repair) ||
      !observationId ||
      !digest(observationId)
    )
      throw new Error('Original failed target required')
    const observation = JSON.parse(
        readSourceFile(
          store.files.root,
          `delivery/runner-ci/${request.run}/${observationId}.json`,
          4 * 1024 * 1024,
        ),
      ) as CiObservation,
      repair = JSON.parse(
        readSourceFile(
          store.files.root,
          `delivery/runner-ci-repairs/${request.run}/${entry.repair}.json`,
          4 * 1024 * 1024,
        ),
      ) as CiRepairRequest,
      repository = basis.plan.repositories.find((entry) => entry.id === input.repository)
    validateCiObservation(observation)
    if (
      contractDigest(observation) !== observationId ||
      observation.provenance !== 'host-observed' ||
      observation.candidate !== target.head ||
      observation.head !== target.head ||
      observation.pr !== target.pr ||
      observation.base !== target.base ||
      observation.repository !== repository?.remote?.url ||
      contractDigest(ciVerdict(observation, merge.checks)) !== contractDigest(entry.verdict) ||
      contractDigest(repair) !== entry.repair ||
      repair.status !== 'repair' ||
      !repair.admission.allowed ||
      !Number.isSafeInteger(repair.admission.pushes) ||
      repair.admission.pushes < 1 ||
      !Number.isSafeInteger(repair.admission.limit) ||
      repair.admission.limit > basis.plan.budgets.ciPushes ||
      repair.admission.pushes >= repair.admission.limit ||
      contractDigest(
        ciRepairRequest({
          run: request.run,
          observation,
          policy: merge.checks,
          comments: [],
          admission: repair.admission,
        }),
      ) !== entry.repair
    )
      throw new Error('Original repairable CI observation required')
    return {
      historical: true as const,
      request: input.request,
      plan: basis.digest,
      failure: stage.evidence,
      stage: stage.id,
      publication: publication.evidence,
      target,
      targets: binding.targets,
      observation: observationId,
      repair: entry.repair,
      failures: repair.failures,
    }
  } catch {
    throw new DeliveryRunnerError('original-ci-failure-unavailable')
  }
}
