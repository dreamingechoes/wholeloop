import { createHash } from 'node:crypto'
import { chmodSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import type { NativeBoundaryHost } from '../../../src/delivery/native-host.js'
import { DeliveryQueue } from '../../../src/delivery/queue.js'
import { DeliveryWorkspaces } from '../../../src/delivery/workspaces.js'
import { continueDelivery } from '../../../src/runner/continuation.js'
import { RunnerCorrectionStages } from '../../../src/runner/correction-stages.js'
import {
  DeliveryRunner,
  type DeliveryRunnerHost,
  type RunnerStageObservation,
} from '../../../src/runner/engine.js'
import { RunnerGitStages } from '../../../src/runner/git-stages.js'
import { type RunnerRequest, RunnerStore } from '../../../src/runner/store.js'
import { type RunnerWorkerOptions, RunnerWorkerStages } from '../../../src/runner/worker-stages.js'
import { authorization, fixture, git } from '../../support/delivery.js'

const FAILURE = 'f'.repeat(64),
  GUIDANCE = 'Pinned correction guidance.'

/**
 * Real owned Git workspace and commit stages; every other stage is a
 * synthetic observation. The first run's implementation edits the unit and
 * its integration fails; the continuation's implementation changes nothing.
 */
function hybridHost(
  store: RunnerStore,
  identity: RunnerRequest['host'],
  builders?: RunnerWorkerOptions,
) {
  const git = new RunnerGitStages(store),
    queue = new DeliveryQueue(store.files.root),
    workers = builders && new RunnerWorkerStages(store, queue, builders),
    corrections = builders && new RunnerCorrectionStages(store, queue, builders),
    issued = new Map<string, RunnerStageObservation>(),
    state = { failing: true, edit: true }
  const host: DeliveryRunnerHost = {
    identity,
    preflight: async () => ({
      available: true,
      interactive: 'disabled',
      humanRequired: false,
      reason: 'The explicit hybrid controller protocol is available.',
    }),
    execute: async (context) => {
      if (['workspace', 'commit'].includes(context.stage.kind)) return git.execute(context)
      if (workers && context.stage.kind === 'implementation') return workers.execute(context)
      if (corrections && context.stage.kind === 'correction') return corrections.execute(context)
      context.started({
        backend: 'fixture',
        instance: context.invocation,
        worker: context.stage.id,
      })
      if (context.stage.kind === 'implementation' && state.edit)
        writeFileSync(
          join(git.workspace(context.request, 'search').repository.path, 'app.txt'),
          'Original owned implementation.\n',
        )
      const failed = state.failing && context.stage.kind === 'integration',
        observation: RunnerStageObservation = {
          schema: 'wholeloop/delivery-runner-stage-observation@1',
          plan: contractDigest(context.plan),
          request: contractDigest(context.request),
          stage: context.stage.id,
          invocation: context.invocation,
          status: failed ? 'failed' : 'passed',
          invocationState: 'stopped',
          evidence: failed ? FAILURE : contractDigest({ stage: context.stage.id }),
          provenance: 'fixture',
          reason: failed
            ? 'Original bounded product QA fails at the current QA-ready assembly.'
            : 'The selected normalized fixture host observed its exact stage.',
        }
      issued.set(context.invocation, observation)
      return observation
    },
    inspect: async (request, record) => {
      if (['workspace:', 'commit:'].some((prefix) => record.id.startsWith(prefix)))
        return git.inspect(request, record)
      if (workers && record.id.startsWith('implementation:'))
        return workers.inspect(request, record)
      if (corrections && record.id.startsWith('correction-'))
        return corrections.inspect(request, record)
      const observation = issued.get(record.invocation)
      if (!observation) throw new Error('Unknown invocation')
      return structuredClone(observation)
    },
    endpoint: async () => {
      throw new Error('No endpoint is certified by the hybrid host.')
    },
  }
  return { host, state, git }
}

/**
 * A synthetic builder: its workspace is the recipe's writable root outside its
 * own directory. An ordinary build writes the original text; a correction task
 * writes the corrected text. Normalized host-observed flags certify nothing.
 */
function builderOptions(store: RunnerStore, identity: RunnerRequest['host']): RunnerWorkerOptions {
  const bin = store.files.path('correction-bin'),
    guidance = GUIDANCE
  store.files.atomic('correction-context/artifacts/guidance.txt', guidance)
  store.files.atomic(
    'correction-bin/codex',
    `#!${process.execPath}
const fs=require('node:fs'),path=require('node:path'),args=process.argv.slice(2),conf=args.join(' ');
if(args.includes('--version')){console.log('synthetic policy control');process.exit(0)}
let text='';process.stdin.on('data',b=>text+=b);process.stdin.on('end',()=>{
const {assignment:a}=JSON.parse(text),writes=[...conf.matchAll(/"([^"]+)"="write"/g)].map(m=>m[1]),ws=writes.find(p=>!p.startsWith(process.cwd()));
const repair=JSON.parse(a.brief).task?.kind==='repair';
fs.writeFileSync(path.join(ws,'app.txt'),repair?'Corrected owned implementation.\\n':'Original owned implementation.\\n');
const value={schema:'wholeloop/delivery-worker-proposal@1',assignment:a.assignment,status:'complete',summary:'Synthetic builder claim.',artifacts:[{ref:'artifacts/report.txt',kind:'report',text:'Synthetic report.\\n'}],criteria:[],findings:[],unknowns:[]};
console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify(value)}}));console.log(JSON.stringify({type:'turn.completed'}));
});
`,
  )
  chmodSync(join(bin, 'codex'), 0o700)
  const boundary: NativeBoundaryHost = {
    observe: ({ assignment, recipe, model }) => ({
      schema: 'wholeloop/delivery-native-observation@1',
      target: recipe.target,
      version: recipe.version,
      role: assignment.identity.role,
      assignment: assignment.assignment,
      policy: recipe.policy,
      model,
      evidence: 'f'.repeat(64),
      provenance: 'host-observed',
      authenticated: true,
      boundary: {
        contained: true,
        controllerStoreDenied: true,
        credentialsDenied: true,
        toolsRestricted: true,
        interactiveDisabled: true,
        cancellable: true,
        completeOutput: true,
        ownedOutputReader: true,
      },
      metering: { hardTokens: false, hardCurrency: false },
    }),
  }
  return {
    identity,
    native: {
      target: 'codex',
      version: '0.166.0',
      model: 'fixture-model',
      path: `${bin}:${dirname(process.execPath)}`,
      output: 'inline-proposal',
    },
    boundary: () => boundary,
    admit: () => ({ ready: true, provenance: 'host-observed', evidence: 'f'.repeat(64) }),
    context: (_context, workspace) => ({
      ...(workspace ? { workspace } : {}),
      contextRoot: store.files.path('correction-context'),
      environment: { id: 'fixture', recipe: 'b'.repeat(64), boundary: 'c'.repeat(64) },
      context: [
        {
          kind: 'guidance',
          audience: 'shared',
          artifact: {
            ref: 'artifacts/guidance.txt',
            bytes: Buffer.byteLength(guidance),
            sha256: createHash('sha256').update(guidance).digest('hex'),
          },
        },
      ],
    }),
  }
}

describe('seeded workspaces in a correction continuation (ADR-0208)', () => {
  it(
    'starts the corrected unit at its failed head and commits even an unchanged pass',
    () =>
      fixture(async ({ planning, plan }) => {
        plan.work = plan.work
          .filter((work) => work.id === 'search')
          .map((work) => ({ ...work, after: [], consumes: [] }))
        plan.milestones = plan.milestones.map((milestone) => ({ ...milestone, work: ['search'] }))
        plan.policy.intervention = 'supervised'
        const store = new RunnerStore(planning.sources.files.root),
          prepared = planning.preparePlan(plan),
          grant = store.lifecycle.authority.authorize(authorization(plan, prepared.digest))
        store.lifecycle.track({ run: plan.run, revision: 1, grant: grant.grant.id })
        const request: RunnerRequest = {
            schema: 'wholeloop/delivery-runner-request@1',
            key: 'first',
            run: plan.run,
            revision: 1,
            plan: prepared.digest,
            grant: grant.grant.id,
            host: { id: 'fixture', version: '1', configuration: 'a'.repeat(64) },
            pollMs: 50,
          },
          hybrid = hybridHost(store, request.host),
          first = store.prepare(request),
          result = await new DeliveryRunner(store).run(first.digest, hybrid.host),
          failure = result.stages.find((stage) => stage.id.startsWith('integration:'))
        expect(failure?.status).toBe('failed')
        const failed = hybrid.git.candidate(request, 'search')
        expect(
          continueDelivery(
            store.lifecycle,
            plan.run,
            { request: first.digest, stage: failure?.id ?? '', unit: 'search' },
            { operator: 'Fixture Operator', reason: 'Repair the failed integration case.' },
          ).accepted,
        ).toBe(true)
        const next = store.planning.getPlan(plan.run, 2),
          renewed = store.lifecycle.authority.authorize({
            ...authorization(next.plan, next.digest),
            id: 'authorization-fedcba9876543210',
          })
        store.lifecycle.track({ run: plan.run, revision: 2, grant: renewed.grant.id })
        hybrid.state.failing = false
        hybrid.state.edit = false
        const successor = store.prepare({
            ...request,
            key: 'continuation-1',
            revision: 2,
            plan: next.digest,
            grant: renewed.grant.id,
          }),
          continued = await new DeliveryRunner(store).run(successor.digest, hybrid.host),
          renewedRequest = store.get(successor.digest)
        for (const id of ['workspace:search', 'commit:search'])
          expect(continued.stages.find((stage) => stage.id === id)).toMatchObject({
            status: 'passed',
          })
        // The new topic, under the new grant, starts at exactly the failed head.
        const seeded = hybrid.git.workspace(renewedRequest, 'search'),
          corrected = hybrid.git.candidate(renewedRequest, 'search')
        expect(seeded.grant).toBe(renewed.grant.id)
        expect(seeded.seed?.head).toBe(failed.receipt.head)
        expect(seeded.repository.branch).not.toBe(failed.allocation.repository.branch)
        // Nothing changed on top of it, so the owned commit is empty but its own.
        expect(corrected.receipt.parent).toBe(failed.receipt.head)
        expect(corrected.receipt.head).not.toBe(failed.receipt.head)
        expect(
          git(seeded.repository.path, [
            'diff',
            '--stat',
            failed.receipt.head,
            corrected.receipt.head,
          ]),
        ).toBe('')
        expect(new DeliveryWorkspaces(store.files.root).get(seeded.digest).seed).toEqual(
          seeded.seed,
        )
      }),
    // Two complete engine runs with real Git stages; parallel suites need headroom.
    120000,
  )
  it(
    'corrects the failed unit from its retained failure and commits the result',
    () =>
      fixture(async ({ planning, plan }) => {
        // The builder's context must carry every guidance pin the plan names.
        for (const pin of plan.guidance)
          pin.sha256 = createHash('sha256').update(GUIDANCE).digest('hex')
        plan.work = plan.work
          .filter((work) => work.id === 'search')
          .map((work) => ({ ...work, after: [], consumes: [] }))
        plan.milestones = plan.milestones.map((milestone) => ({ ...milestone, work: ['search'] }))
        plan.policy.intervention = 'supervised'
        const store = new RunnerStore(planning.sources.files.root),
          prepared = planning.preparePlan(plan),
          grant = store.lifecycle.authority.authorize(authorization(plan, prepared.digest))
        store.lifecycle.track({ run: plan.run, revision: 1, grant: grant.grant.id })
        const request: RunnerRequest = {
            schema: 'wholeloop/delivery-runner-request@1',
            key: 'first',
            run: plan.run,
            revision: 1,
            plan: prepared.digest,
            grant: grant.grant.id,
            host: { id: 'fixture', version: '1', configuration: 'a'.repeat(64) },
            pollMs: 50,
          },
          hybrid = hybridHost(store, request.host, builderOptions(store, request.host)),
          first = store.prepare(request),
          result = await new DeliveryRunner(store).run(first.digest, hybrid.host),
          failure = result.stages.find((stage) => stage.id.startsWith('integration:'))
        expect(result.stages.find((stage) => stage.id === 'implementation:search')).toMatchObject({
          status: 'passed',
          provenance: 'host-observed',
        })
        continueDelivery(
          store.lifecycle,
          plan.run,
          { request: first.digest, stage: failure?.id ?? '', unit: 'search' },
          { operator: 'Fixture Operator', reason: 'Repair the failed integration case.' },
        )
        const next = store.planning.getPlan(plan.run, 2),
          renewed = store.lifecycle.authority.authorize({
            ...authorization(next.plan, next.digest),
            id: 'authorization-fedcba9876543210',
          })
        store.lifecycle.track({ run: plan.run, revision: 2, grant: renewed.grant.id })
        hybrid.state.failing = false
        const successor = store.prepare({
            ...request,
            key: 'continuation-1',
            revision: 2,
            plan: next.digest,
            grant: renewed.grant.id,
          }),
          continued = await new DeliveryRunner(store).run(successor.digest, hybrid.host),
          renewedRequest = store.get(successor.digest)
        expect(continued.stages.find((stage) => stage.id === 'correction-1:search')).toMatchObject({
          status: 'passed',
          provenance: 'host-observed',
        })
        // QA now reads the correction's own commit, whose bytes the builder corrected.
        const candidate = hybrid.git.candidate(renewedRequest, 'search')
        expect(readFileSync(join(candidate.allocation.repository.path, 'app.txt'), 'utf8')).toBe(
          'Corrected owned implementation.\n',
        )
        // Failed head, then the unit's own (empty) commit, then the correction.
        expect(
          git(candidate.allocation.repository.path, ['rev-parse', `${candidate.receipt.head}~2`]),
        ).toBe(hybrid.git.workspace(renewedRequest, 'search').seed?.head)
        // The builder saw the retained failure itself, and nothing about it was guessed.
        const bindings = readdirSync(store.files.path('delivery/runner-corrections')),
          binding = JSON.parse(
            readFileSync(
              store.files.path(`delivery/runner-corrections/${bindings[0]}/binding.json`),
              'utf8',
            ),
          )
        expect(bindings).toHaveLength(1)
        expect(binding.feedback).toMatchObject({
          origin: 'integration',
          stage: failure?.id,
          failure: FAILURE,
          cases: [],
        })
        expect(
          continued.stages
            .filter(
              (stage) =>
                stage.id.startsWith('verification:') || stage.id.startsWith('integration:'),
            )
            .every((stage) => stage.status === 'passed'),
        ).toBe(true)
      }),
    // Two complete engine runs with real Git stages; parallel suites need headroom.
    120000,
  )
})
