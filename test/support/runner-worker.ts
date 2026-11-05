import { createHash } from 'node:crypto'
import { chmodSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { NativeBoundaryHost } from '../../src/delivery/native-host.js'
import { DeliveryQueue } from '../../src/delivery/queue.js'
import { type RunnerWorkerOptions, RunnerWorkerStages } from '../../src/runner/worker-stages.js'
import { runnerGitFixture } from './runner-git.js'

const guidance = 'Pinned worker-stage guidance.',
  hash = (value: string) => createHash('sha256').update(value).digest('hex')
export type RunnerWorkerFixture = Parameters<Parameters<typeof runnerGitFixture>[0]>[0]
export interface RunnerWorkerFixtureConfig {
  unattended?: boolean
  guidance?: string
  stageBudget?: 'plan'
  noProgress?: number
  restarts?: number
  seed?: Record<string, string>
  repairText?: Record<number, string>
  retain?: boolean
  provenance?: 'fixture' | 'host-observed'
}
export function runnerWorkerComponents(
  input: RunnerWorkerFixture,
  mode: 'complete' | 'hang' = 'complete',
  config: RunnerWorkerFixtureConfig = {},
) {
  const { store, host, request } = input,
    pinnedGuidance = config.guidance ?? guidance
  const workspace = host.workspace(request, 'search').repository.path,
    queue = new DeliveryQueue(store.files.root),
    bin = store.files.path('fixture-bin'),
    contextRoot = store.files.path('fixture-worker-context')
  store.files.atomic('fixture-worker-context/artifacts/guidance.txt', pinnedGuidance)
  store.files.atomic(
    'fixture-bin/codex',
    `#!${process.execPath}
const fs=require('node:fs');if(process.argv.includes('--version')){console.log('synthetic policy control');process.exit(0)}let text='';process.stdin.on('data',b=>text+=b);process.stdin.on('end',()=>{
const {assignment:a}=JSON.parse(text);
if(${JSON.stringify(mode)}==='hang'){fs.writeFileSync(${JSON.stringify(join(bin, 'ready'))},'ready');setInterval(()=>{},1000);return}
const repair=JSON.parse(a.brief).task?.kind==='repair',texts=${JSON.stringify(config.repairText ?? {})},correction=texts[a.identity.generation]??(a.identity.generation>=3?'Synthetic owned second correction.\\n':'Synthetic owned correction.\\n');
fs.writeFileSync(${JSON.stringify(join(workspace, 'app.txt'))},repair?correction:'Synthetic owned implementation.\\n');
const value={schema:'wholeloop/delivery-worker-proposal@1',assignment:a.assignment,status:'complete',summary:'Synthetic native worker claim.',artifacts:[{ref:'artifacts/report.txt',kind:'report',text:'Retained fixture report.\\n'}],criteria:[],findings:[],unknowns:[]};
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
      provenance: config.provenance ?? 'fixture',
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
  const options: RunnerWorkerOptions = {
    identity: request.host,
    native: {
      target: 'codex',
      version: '0.166.0',
      model: 'fixture-model',
      path: `${bin}:${dirname(process.execPath)}`,
      output: 'inline-proposal',
    },
    boundary: () => boundary,
    admit: () => ({
      ready: true,
      provenance: config.provenance ?? 'fixture',
      evidence: 'f'.repeat(64),
    }),
    context: (_context, workspace) => ({
      ...(workspace ? { workspace } : {}),
      contextRoot,
      environment: { id: 'fixture', recipe: 'b'.repeat(64), boundary: 'c'.repeat(64) },
      context: [
        {
          kind: 'guidance',
          audience: 'shared',
          artifact: {
            ref: 'artifacts/guidance.txt',
            bytes: Buffer.byteLength(pinnedGuidance),
            sha256: hash(pinnedGuidance),
          },
        },
      ],
    }),
  }
  return { queue, options, workers: new RunnerWorkerStages(store, queue, options) }
}
export async function runnerWorkerFixture(
  operation: (
    input: RunnerWorkerFixture & ReturnType<typeof runnerWorkerComponents>,
  ) => Promise<void>,
  mode: 'complete' | 'hang' = 'complete',
  config: RunnerWorkerFixtureConfig = {},
) {
  const pinnedGuidance = config.guidance ?? guidance
  await runnerGitFixture(
    async (input) => {
      input.observe(await input.host.execute(input.dispatch('workspace:search')))
      await operation({ ...input, ...runnerWorkerComponents(input, mode, config) })
    },
    {
      singleUnit: true,
      guidance: pinnedGuidance,
      ...(config.stageBudget ? { stageBudget: config.stageBudget } : {}),
      ...(config.seed ? { seed: config.seed } : {}),
      ...(config.retain ? { retain: true } : {}),
      ...(config.unattended || config.noProgress !== undefined || config.restarts !== undefined
        ? {
            configure: (plan) => {
              if (config.unattended) plan.policy.intervention = 'none'
              if (config.noProgress !== undefined) plan.budgets.noProgress = config.noProgress
              if (config.restarts !== undefined) plan.budgets.restarts = config.restarts
            },
          }
        : {}),
    },
  )
}
