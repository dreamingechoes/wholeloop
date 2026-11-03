import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { REFERENCE_NATIVE_VERSIONS } from '../../../src/delivery/native-adapters.js'
import type { NativeBindings } from '../../../src/delivery/native-bindings.js'
import { type NativeRuntime, validNativeRuntime } from '../../../src/delivery/native-runtime.js'
import { DeliveryRunner } from '../../../src/runner/engine.js'
import { RunnerNativeScope } from '../../../src/runner/native-scope.js'
import { composePublicHost } from '../../../src/runner/public-composition.js'
import {
  publicRunnerIdentity,
  RunnerPublicHost,
  retainedPublicBindings,
  retainPublicBindings,
} from '../../../src/runner/public-host.js'
import { runnerRoute } from '../../../src/runner/route.js'
import { VERSION } from '../../../src/version.js'
import { runnerResearchFixture } from '../../support/runner-research.js'

const bindings: NativeBindings = {
    schema: 'wholeloop/native-bindings@1',
    bindings: [
      {
        target: 'codex',
        version: REFERENCE_NATIVE_VERSIONS.codex,
        model: 'reference-model',
        roles: ['planner', 'challenger', 'researcher'],
      },
    ],
  },
  runtime: NativeRuntime = {
    schema: 'wholeloop/native-runtime@1',
    clients: [{ target: 'codex', client: '/opt/fixture/bin/codex', store: '/opt/fixture/home' }],
  }

/**
 * A synthetic Codex that answers every control the real boundary observer
 * issues (version, features, sandboxed probe, cancellation, login status) and
 * then the research and decision turns. It certifies no client: the sandbox
 * probe reports what a contained client would, so only the wiring is tested.
 */
const SYNTHETIC_CODEX = (log: string) => `#!${process.execPath}
const args=process.argv.slice(2),log=${JSON.stringify(log)};
const fs=require('node:fs');if(log)fs.appendFileSync(log,JSON.stringify(args.filter(a=>!a.startsWith('{')&&a.length<200))+'\\n');
if(args.includes('--version')){console.log('codex-cli 0.166.0');process.exit(0)}
if(args.includes('features')){for(const a of args)if(a.startsWith('features.'))console.log(a.slice(9).split('=')[0]+' stable false');process.exit(0)}
if(args.includes('login')){console.log('Logged in');process.exit(0)}
let input='';process.stdin.on('data',chunk=>input+=chunk);process.stdin.on('end',()=>{
if(args.includes('sandbox')){const v=JSON.parse(input);if(v.mode==='cancel'){console.log(JSON.stringify({ready:v.nonce}));setInterval(()=>{},1000);return}
console.log(JSON.stringify({nonce:v.nonce,read:fs.readFileSync(v.read,'utf8')===v.nonce,privateDenied:true,credentialsDenied:true,workspaceWrite:'denied',outputWrite:'denied',networkDenied:true}));return}
const payload=JSON.parse(input),a=payload.assignment,b=JSON.parse(a.brief);
const emit=(ref,body)=>{const proposal={schema:'wholeloop/delivery-worker-proposal@1',assignment:a.assignment,status:'complete',summary:'Synthetic output.',artifacts:[{ref,kind:'report',text:JSON.stringify(body)}],criteria:[],findings:[],unknowns:[]};
console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify(proposal)}}));console.log(JSON.stringify({type:'turn.completed'}))};
if(b.job){const j=b.job;emit('artifacts/research.json',a.identity.role==='planner'?{angle:j.angle.id,status:'ok',claims:[{id:'index',text:'A title index serves search.',confidence:'high',loadBearing:true,evidence:[{ref:'https://web.example/index',excerpt:'A title index serves search.'}]}],openQuestions:[]}:{claim:j.claim.id,verifier:j.verifier,outcome:'confirm',reason:'The cited excerpt states the claim.',evidence:[]});return}
const inner=JSON.parse(payload.inputs[0].content);
const output={schema:b.response.$id,basis:inner.basis,rationale:'Synthetic judgment of exact cited evidence.',uncertainties:[]};
if(a.identity.role==='planner')output.outcome='accept';else{output.judgment=b.judgment;output.verdict='supported'}
emit('artifacts/decision.json',output);
});
`

describe('public host composition (ADR-0205)', () => {
  it('accepts only a closed runtime document with absolute, distinct, unquoted paths', () => {
    expect(validNativeRuntime(runtime)).toBe(true)
    const client = runtime.clients[0]
    if (!client) throw new Error('Fixture client required')
    for (const changed of [
      { ...client, client: 'relative/codex' },
      { ...client, store: '/opt/"home' },
      { ...client, store: '/opt/a/../home' },
      { ...client, store: client.client },
      { ...client, target: 'cursor' },
      { ...client, model: 'extra' },
    ])
      expect(validNativeRuntime({ ...runtime, clients: [changed] })).toBe(false)
    expect(validNativeRuntime({ ...runtime, clients: [client, client] })).toBe(false)
  })
  it('accepts pinned repository inputs and a fixed code host, and nothing looser (ADR-0207)', () => {
    const repository = {
        repository: 'app',
        recipe: 'a'.repeat(64),
        helperImage: `node@sha256:${'b'.repeat(64)}`,
        suite: {
          refs: ['package.json#check'],
          mapping: { 'package.json#check': 'suite' },
          timeoutMs: 120000,
        },
      },
      full: NativeRuntime = {
        ...runtime,
        codeHost: { kind: 'github-cli', client: '/opt/fixture/bin/gh' },
        repositories: [repository],
      }
    expect(validNativeRuntime(full)).toBe(true)
    const suite = repository.suite
    for (const changed of [
      { ...full, codeHost: { kind: 'github-cli', client: 'gh' } },
      { ...full, codeHost: { kind: 'gitlab-cli', client: '/opt/fixture/bin/glab' } },
      { ...full, codeHost: { kind: 'github-cli', client: '/opt/fixture/bin/gh', token: 'x' } },
      { ...full, repositories: [] },
      { ...full, repositories: [repository, repository] },
      { ...full, repositories: [{ ...repository, repository: 'App' }] },
      { ...full, repositories: [{ ...repository, recipe: 'a'.repeat(63) }] },
      { ...full, repositories: [{ ...repository, helperImage: 'node:22' }] },
      { ...full, repositories: [{ ...repository, extra: true }] },
      { ...full, repositories: [{ ...repository, suite: { ...suite, refs: [] } }] },
      { ...full, repositories: [{ ...repository, suite: { ...suite, mapping: {} } }] },
      {
        ...full,
        repositories: [
          {
            ...repository,
            suite: { ...suite, mapping: { ...suite.mapping, 'package.json#lint': 'lint' } },
          },
        ],
      },
      {
        ...full,
        repositories: [
          { ...repository, suite: { ...suite, mapping: { 'package.json#check': 'Suite' } } },
        ],
      },
      { ...full, repositories: [{ ...repository, suite: { ...suite, timeoutMs: 99 } }] },
      { ...full, repositories: [{ ...repository, suite: { ...suite, timeoutMs: 600001 } }] },
      { ...full, environments: [] },
    ])
      expect(validNativeRuntime(changed), JSON.stringify(changed)).toBe(false)
    // The new fields are part of the host; a runtime without them keeps its identity.
    expect(publicRunnerIdentity(bindings, full).configuration).not.toBe(
      publicRunnerIdentity(bindings, runtime).configuration,
    )
    expect(publicRunnerIdentity(bindings, runtime).configuration).toBe(
      contractDigest({ schema: 'wholeloop/delivery-public-host@1', bindings, runtime }),
    )
  })
  it('keeps a bindings-only identity and binds a runtime document into a new one', () => {
    expect(publicRunnerIdentity(bindings)).toEqual({
      id: 'wholeloop-fixed-dispatch',
      version: VERSION,
      configuration: contractDigest({ schema: 'wholeloop/delivery-public-host@1', bindings }),
    })
    expect(publicRunnerIdentity(bindings, runtime).configuration).not.toBe(
      publicRunnerIdentity(bindings).configuration,
    )
  })
  it('composes the research route from the retained documents and nothing else', async () => {
    await runnerResearchFixture(async ({ store, request, plan }) => {
      const identity = retainPublicBindings(store, bindings, runtime),
        publicRequest = { ...request, host: identity },
        stages = runnerRoute(plan),
        signal = new AbortController().signal
      expect(retainedPublicBindings(store, identity)).toEqual({ bindings, runtime })
      const composed = new RunnerPublicHost(store, bindings, runtime, composePublicHost),
        bare = new RunnerPublicHost(store, bindings, runtime)
      expect(await bare.preflight(publicRequest, plan, stages, signal)).toMatchObject({
        available: false,
        reason: 'public-host-native-runtime-unavailable',
      })
      expect(await composed.preflight(publicRequest, plan, stages, signal)).toMatchObject({
        available: true,
        interactive: 'disabled',
      })
      // A runtime without the bound client leaves the route unsupported.
      const empty: NativeRuntime = { schema: 'wholeloop/native-runtime@1', clients: [] },
        missing = new RunnerPublicHost(store, bindings, empty, composePublicHost)
      expect(
        await missing.preflight(
          { ...request, host: publicRunnerIdentity(bindings, empty) },
          plan,
          stages,
          signal,
        ),
      ).toMatchObject({ available: false, reason: 'public-host-unsupported-stage' })
    })
  })
  it('runs the composed research route through the real boundary observers with no prompt', async () => {
    const runtimeFor = (dir: string): NativeRuntime => ({
      schema: 'wholeloop/native-runtime@1',
      clients: [
        { target: 'codex', client: join(dir, 'bin', 'codex'), store: join(dir, 'codex-home') },
      ],
    })
    await runnerResearchFixture(
      async ({ store, digest, dir }) => {
        mkdirSync(join(dir, 'bin'))
        mkdirSync(join(dir, 'codex-home'), { mode: 0o700 })
        writeFileSync(join(dir, 'bin', 'codex'), SYNTHETIC_CODEX(join(dir, 'calls.jsonl')))
        chmodSync(join(dir, 'bin', 'codex'), 0o700)
        const log = join(dir, 'calls.jsonl')
        retainPublicBindings(store, bindings, runtimeFor(dir))
        const host = new RunnerPublicHost(store, bindings, runtimeFor(dir), composePublicHost),
          receipt = await new DeliveryRunner(store).run(digest, host)
        expect(receipt).toMatchObject({ state: 'completed', outcome: 'research-report-complete' })
        const record = store.stage(digest, 'research')
        if (!record) throw new Error('Research stage required')
        expect(record.provenance).toBe('host-observed')
        expect(
          new RunnerNativeScope(store.files, record.invocation)
            .inspect()
            .every((call) => call.observed.invocationState === 'stopped'),
        ).toBe(true)
        const calls = readFileSync(log, 'utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line) as string[])
        // Every launch was preceded by the observer's own controls.
        const launches = calls.filter((args) => args.includes('exec')).length
        expect(launches).toBeGreaterThan(0)
        expect(calls.filter((args) => args.includes('sandbox')).length).toBe(2 * launches)
        expect(calls.filter((args) => args.includes('login')).length).toBe(launches)
        // The native-web angle got the client's live web search; nothing else did.
        expect(calls.some((args) => args.includes('web_search="live"'))).toBe(true)
      },
      { host: (dir) => publicRunnerIdentity(bindings, runtimeFor(dir)) },
    )
  })
})
