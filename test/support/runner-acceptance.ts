import { chmodSync } from 'node:fs'
import { dirname } from 'node:path'
import { contractDigest } from '../../src/contracts/compatibility.js'
import { NativeDelegatedDecisionHost } from '../../src/decisions/native-host.js'
import { readSourceFile, sourceHash } from '../../src/delivery/input.js'
import type { NativeBoundaryHost } from '../../src/delivery/native-host.js'
import { NativePurposeAttempts } from '../../src/delivery/native-purpose.js'
import { DeliveryQueue } from '../../src/delivery/queue.js'
import type { RunnerAcceptanceOptions } from '../../src/runner/acceptance-stages.js'
import type { RunnerRequest, RunnerStore } from '../../src/runner/store.js'

/** Actual synthetic processes test ownership; normalized host flags certify no account or model. */
export function runnerAcceptanceOptions(
  store: RunnerStore,
  request: RunnerRequest,
  outcome: 'accept' | 'reject' = 'accept',
): RunnerAcceptanceOptions {
  const bin = store.files.path('acceptance-bin')
  store.files.atomic(
    'acceptance-bin/codex',
    `#!${process.execPath}
if(process.argv.includes('--version')){console.log('codex-cli 0.163.0');process.exit(0)}
let input='';process.stdin.on('data',chunk=>input+=chunk);process.stdin.on('end',()=>{
const payload=JSON.parse(input),a=payload.assignment,b=JSON.parse(a.brief),inner=JSON.parse(payload.inputs[0].content);
const output={schema:b.response.$id,basis:inner.basis,rationale:'Synthetic independent acceptance of exact scoped fixture evidence.',uncertainties:[]};
if(a.identity.role==='planner')output.outcome=${JSON.stringify(outcome)};else{output.judgment=b.judgment;output.verdict='supported'}
const proposal={schema:'wholeloop/delivery-worker-proposal@1',assignment:a.assignment,status:'complete',summary:'Synthetic delegated acceptance; no account or model certification.',artifacts:[{ref:'artifacts/decision.json',kind:'report',text:JSON.stringify(output)}],criteria:[],findings:[],unknowns:[]};
console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify(proposal)}}));console.log(JSON.stringify({type:'turn.completed'}));
});\n`,
  )
  chmodSync(`${bin}/codex`, 0o700)
  const nativePath = `${bin}:${dirname(process.execPath)}`
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
    identity: request.host,
    requests: (context, artifact) => [
      {
        schema: 'wholeloop/delegated-decision-request@1',
        key: `acceptance-${context.invocation.slice(0, 40)}`,
        grant: context.request.grant,
        run: context.request.run,
        revision: context.plan.revision,
        plan: contractDigest(context.plan),
        decision: 'acceptance',
        artifacts: [artifact],
        evidence: [{ id: 'production', ...artifact }],
        unknowns: [],
      },
    ],
    host: (process) =>
      new NativeDelegatedDecisionHost(
        new NativePurposeAttempts(
          new DeliveryQueue(store.files.root, store.now, undefined, store.budgets.clock),
        ),
        {
          prerequisites: () => ({ supported: true, humanRequired: false, interactive: 'disabled' }),
          observeEvidence: (decision) =>
            decision.evidence.map((entry) => {
              const digest = sourceHash(readSourceFile(store.files.root, entry.ref, 256 * 1024))
              return {
                ...entry,
                status: digest === entry.sha256 ? 'passed' : 'unknown',
                observation: digest,
                provenance: 'host-observed',
              }
            }),
        },
        {
          native: {
            target: 'codex',
            version: '0.163.0',
            model: 'fixture-model',
            path: nativePath,
            host: boundary,
            process,
          },
          environment: { id: 'fixture', recipe: 'b'.repeat(64), boundary: 'c'.repeat(64) },
          provenance: 'host-observed',
        },
      ),
  }
}
