import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { sourceHash } from '../../../src/delivery/input.js'
import { validateDeliveryShape } from '../../../src/delivery/plan.js'
import { DockerCli, dockerJson } from '../../../src/environment/docker-command.js'
import { DOCKER_REFERENCE_HELPER } from '../../../src/environment/docker-policy.js'
import { DockerResources } from '../../../src/environment/docker-resources.js'
import { inspectEnvironment } from '../../../src/environment/inspect.js'
import {
  DeliveryEnvironments,
  type EnvironmentProvisionResult,
} from '../../../src/environment/provision.js'
import type { EnvironmentRuntime } from '../../../src/environment/runtime.js'
import evaluationSchema from '../../../src/environment/schemas/evaluation-v1.json' with {
  type: 'json',
}
import { workspaceSnapshot } from '../../../src/gates/snapshot.js'
import { StoreFiles } from '../../../src/state/files.js'
import { authorization, entry, fixture, git } from '../../support/delivery.js'
import { environmentRecipe } from '../../support/environment.js'

const output = new StoreFiles(process.argv[2] ?? '')
const retire = process.argv.includes('--retire-success')
const report: {
  schema: string
  status: string
  controller: { os: string; architecture: string; node: string }
  scope: string
  nativeModels: string
  checks: { id: string; status: string; evidence: string }[]
  environments: { id: string; digest: string; daemon: EnvironmentRuntime['daemon'] }[]
  retainedFixture?: string
  retirement: string
  reason?: string
} = {
  schema: 'wholeloop/environment-evaluation@1',
  status: 'failed',
  controller: { os: process.platform, architecture: process.arch, node: process.version },
  scope:
    'Actual disposable Docker applications; controller runtime and daemon reported separately.',
  nativeModels: 'not-executed',
  checks: [],
  environments: [],
  retirement: 'not-requested',
}
function check(id: string, value: unknown) {
  report.checks.push({ id, status: 'pass', evidence: contractDigest(value) })
}
function endpoint(result: EnvironmentProvisionResult) {
  const resource = result.environment?.record.resources.find(
    (resource) => resource.purpose === 'proxy',
  )
  const port = resource?.ports?.[0]?.host
  assert.ok(port, 'Expected an actually observed proxy port')
  return { url: `http://127.0.0.1:${port}`, port }
}
async function request(url: string, path: string, method = 'GET') {
  const response = await fetch(`${url}${path}`, { method, signal: AbortSignal.timeout(3000) })
  assert.equal(response.status, 200)
  return (await response.json()) as Record<string, unknown>
}
async function retireFixture(
  environments: DeliveryEnvironments,
  result: EnvironmentProvisionResult,
  driver: DockerCli,
) {
  assert.ok(result.environment)
  const id = result.environment.record.id
  const runtime = new DockerResources(
    environments.resources,
    id,
    driver,
    () => {},
    new AbortController().signal,
  )
  const resources = environments.resources.get(id).record.resources
  // Validate every exact identity before the first destructive operation; names alone do not qualify.
  for (const resource of resources) await runtime.owned(resource, false)
  for (const resource of resources
    .slice()
    .sort(
      (a, b) =>
        ({ container: 0, network: 1, volume: 2 })[a.kind] -
        { container: 0, network: 1, volume: 2 }[b.kind],
    )) {
    assert.ok(resource.id)
    await runtime.owned(resource, false)
    const removed = await driver.call([
      resource.kind,
      'rm',
      ...(resource.kind === 'container' ? ['--force'] : []),
      resource.id,
    ])
    assert.equal(removed.status, 'succeeded')
    const listed = await driver.call([
      resource.kind,
      'ls',
      ...(resource.kind === 'container'
        ? ['--all', '--no-trunc']
        : resource.kind === 'network'
          ? ['--no-trunc']
          : []),
      '--filter',
      `label=org.wholeloop.resource=${resource.token}`,
      '--format',
      resource.kind === 'volume' ? '{{json .Name}}' : '{{json .ID}}',
    ])
    assert.equal(listed.status, 'succeeded')
    assert.equal(listed.stdout.trim(), '')
    environments.resources.update(id, (record) => {
      const entry = record.resources.find((entry) => entry.slot === resource.slot)
      assert.ok(entry)
      entry.status = 'retired'
      record.observations.push({
        stage: 'fixture-retirement',
        status: 'absence-observed',
        at: new Date().toISOString(),
        evidence: listed.digest,
        resource: resource.slot,
      })
    })
  }
  environments.resources.update(id, (record) => {
    record.state = 'retired'
  })
}
try {
  await fixture(
    async ({ root, dir, planning, plan }) => {
      report.retainedFixture = dir
      const denied = Object.fromEntries(
        ['controller', 'home', 'credentials', 'sibling'].map((name) => {
          const path = join(dir, `${name}-only`)
          mkdirSync(path)
          writeFileSync(join(path, 'marker.txt'), 'Owned non-secret boundary fixture.\n')
          return [name, join(path, 'marker.txt')]
        }),
      )
      const app = `const http=require('node:http'),fs=require('node:fs'),net=require('node:net');const denied=${JSON.stringify(denied)};http.createServer((req,res)=>{res.setHeader('content-type','application/json');const url=new URL(req.url,'http://fixture');const send=x=>res.end(JSON.stringify(x));if(url.pathname==='/write'){fs.writeFileSync('/data/db/value.txt',url.searchParams.get('value')||'');return send({stored:true})}if(url.pathname==='/read')return send({value:fs.existsSync('/data/db/value.txt')?fs.readFileSync('/data/db/value.txt','utf8'):''});if(url.pathname==='/boundary'){const paths=Object.fromEntries(Object.entries(denied).map(([k,v])=>{try{fs.readFileSync(v);return[k,true]}catch{return[k,false]}}));let writable=false;try{fs.writeFileSync('/workspace/app/forbidden.txt','unexpected');writable=true}catch{}return send({...paths,dockerSocket:fs.existsSync('/var/run/docker.sock'),gitControl:fs.existsSync('/workspace/app/.git'),workspaceWrite:writable,ambient:Object.hasOwn(process.env,'WHOLELOOP_FIXTURE_CONTROLLER_ONLY'),uid:process.getuid()})}if(url.pathname==='/network'){const s=net.connect({host:'192.0.2.1',port:443});let done=false;const finish=(connected,error)=>{if(done)return;done=true;s.destroy();send({connected,error})};s.setTimeout(500,()=>finish(false,'timeout'));s.once('connect',()=>finish(true,'unexpected'));s.once('error',e=>finish(false,e.code));return}send({ready:true})}).listen(3000,'0.0.0.0')\n`
      const inputProbe =
        "const fs=require('node:fs');try{fs.appendFileSync('/inputs/probe/probe.cjs','unexpected');process.exit(9)}catch(e){console.log(JSON.stringify({denied:e.code}));process.exit(['EROFS','EACCES','EPERM'].includes(e.code)?0:8)}\n"
      writeFileSync(join(root, 'probe.cjs'), inputProbe)
      writeFileSync(join(root, 'app.cjs'), app)
      git(root, ['add', 'app.cjs', 'probe.cjs'])
      git(root, [
        'commit',
        '-m',
        'test: seed owned application boundary fixtures',
        '-m',
        'Exercise disposable data, network and filesystem observations.',
      ])
      entry(plan.repositories, 0).base = git(root, ['rev-parse', 'HEAD'])
      const prepared = planning.preparePlan(plan),
        driver = new DockerCli()
      const environments = new DeliveryEnvironments(planning.sources.files.root, driver)
      const grant = environments.effects.lifecycle.authority.authorize(
        authorization(plan, prepared.digest),
      )
      environments.effects.lifecycle.track({ run: plan.run, revision: 1, grant: grant.grant.id })
      environments.effects.lifecycle.transition(plan.run, {
        to: 'queued',
        reason: 'Execute an explicitly authorized disposable backend evaluation.',
      })
      const path = join(dir, 'candidate')
      git(root, ['worktree', 'add', '-b', 'wl/environment-evaluation', path, 'HEAD'])
      const snapshot = workspaceSnapshot(path)
      const observedDaemon = dockerJson(await driver.call(['info', '--format', '{{json .}}'])) as {
        Architecture?: string
      }
      const architecture =
        observedDaemon.Architecture === 'aarch64' || observedDaemon.Architecture === 'arm64'
          ? 'arm64'
          : observedDaemon.Architecture === 'x86_64' || observedDaemon.Architecture === 'amd64'
            ? 'amd64'
            : undefined
      assert.ok(architecture, 'The fixture requires an observed arm64 or amd64 Linux daemon')
      const recipe = environmentRecipe(root, app, architecture)
      recipe.commands.push({
        id: 'offline-setup',
        service: 'web',
        phase: 'setup',
        timeoutMs: 3000,
        command: {
          argv: [
            'node',
            '-e',
            "const net=require('node:net');const s=net.connect({host:'192.0.2.1',port:443});s.setTimeout(500,()=>process.exit(6));s.once('connect',()=>process.exit(7));s.once('error',e=>{console.log(JSON.stringify({denied:e.code}));process.exit(['ENETUNREACH','EHOSTUNREACH','EACCES','EPERM'].includes(e.code)?0:5)})",
          ],
          cwd: '/workspace/app',
          origin: { kind: 'recipe' },
        },
      })
      recipe.files.push({
        id: 'probe',
        repository: 'app',
        ref: 'probe.cjs',
        sha256: sourceHash(inputProbe),
        kind: 'script',
      })
      entry(recipe.services, 0).mounts.push({
        kind: 'input',
        source: 'probe',
        target: '/inputs/probe',
        access: 'read',
      })
      recipe.commands.push({
        id: 'input-readonly',
        service: 'web',
        phase: 'setup',
        timeoutMs: 3000,
        command: {
          argv: ['node', '/inputs/probe/probe.cjs'],
          cwd: '/tmp',
          origin: { kind: 'file', file: 'probe' },
        },
      })
      recipe.retention.success = retire ? 'retire' : 'keep'
      const selected = environments.recipes.prepare(recipe)
      process.env.WHOLELOOP_FIXTURE_CONTROLLER_ONLY = 'non-secret-controller-marker'
      const run = async (key: string) => {
        const result = await environments.provision({
          schema: 'wholeloop/environment-provision-request@1',
          run: plan.run,
          key,
          recipe: selected.digest,
          helperImage: DOCKER_REFERENCE_HELPER,
          workspaces: [{ repository: 'app', path, head: snapshot.head, snapshot: snapshot.digest }],
        })
        output.atomic(`${key}.json`, `${JSON.stringify(result, null, 2)}\n`)
        assert.equal(
          result.status,
          'ready',
          result.environment?.record.reason ?? result.preflight.reason,
        )
        assert.ok(result.environment)
        report.environments.push({
          id: result.environment.record.id,
          digest: result.environment.digest,
          daemon: result.environment.record.daemon,
        })
        return result
      }
      const first = await run('first')
      environments.effects.lifecycle.transition(plan.run, {
        to: 'queued',
        reason:
          'The first exact provisioning effect is observed; run the independent second environment.',
      })
      const second = await run('second')
      assert.ok(
        first.environment?.record.resources.some(
          (resource) => resource.purpose === 'setup' && resource.exit === 0,
        ),
      )
      assert.ok(
        second.environment?.record.resources.some(
          (resource) => resource.purpose === 'setup' && resource.exit === 0,
        ),
      )
      assert.ok(
        first.environment?.record.resources.some(
          (resource) => resource.slot === 'command-input-readonly' && resource.exit === 0,
        ),
      )
      assert.ok(
        second.environment?.record.resources.some(
          (resource) => resource.slot === 'command-input-readonly' && resource.exit === 0,
        ),
      )
      check('owned-input-readonly', {
        first: first.environment?.digest,
        second: second.environment?.digest,
      })
      check('network-denied-setup', {
        first: first.environment?.digest,
        second: second.environment?.digest,
      })
      const a = endpoint(first),
        b = endpoint(second)
      assert.notEqual(a.port, b.port)
      const firstData = first.environment?.record.resources.find(
        (resource) => resource.purpose === 'data',
      )?.id
      const secondData = second.environment?.record.resources.find(
        (resource) => resource.purpose === 'data',
      )?.id
      assert.notEqual(firstData, secondData)
      await request(a.url, '/write?value=first', 'POST')
      assert.deepEqual(await request(a.url, '/read'), { value: 'first' })
      assert.deepEqual(await request(b.url, '/read'), { value: '' })
      check('disjoint-ports-and-data', {
        ports: [a.port, b.port],
        volumes: [firstData, secondData],
      })
      for (const current of [a, b]) {
        const boundary = await request(current.url, '/boundary')
        assert.deepEqual(boundary, {
          controller: false,
          home: false,
          credentials: false,
          sibling: false,
          dockerSocket: false,
          gitControl: false,
          workspaceWrite: false,
          ambient: false,
          uid: 65532,
        })
        check('filesystem-and-environment-denial', boundary)
        const network = await request(current.url, '/network')
        assert.equal(network.connected, false)
        assert.notEqual(
          network.error,
          'timeout',
          'An isolated route refusal should be observed, not inferred from a timeout',
        )
        check('application-egress-denied', network)
      }
      assert.ok(first.environment)
      assert.equal(
        (await inspectEnvironment(environments.resources, first.environment.record.id, driver))
          .state,
        'ready',
      )
      const before = environments.effects.inspect(plan.run)
      const repeated = await environments.provision({
        schema: 'wholeloop/environment-provision-request@1',
        run: plan.run,
        key: 'first',
        recipe: selected.digest,
        helperImage: DOCKER_REFERENCE_HELPER,
        workspaces: [{ repository: 'app', path, head: snapshot.head, snapshot: snapshot.digest }],
      })
      assert.equal(repeated.environment?.record.id, first.environment.record.id)
      assert.deepEqual(environments.effects.inspect(plan.run), before)
      check('current-ownership-and-no-reissue', {
        id: first.environment.record.id,
        effects: before.length,
      })
      writeFileSync(join(path, 'app.cjs'), `${app}// Changed candidate.\n`)
      assert.equal(
        (await inspectEnvironment(environments.resources, first.environment.record.id, driver))
          .state,
        'stale',
      )
      check('changed-candidate-invalidates-readiness', { snapshot: snapshot.digest })
      if (retire) {
        await retireFixture(environments, first, driver)
        await retireFixture(environments, second, driver)
        writeFileSync(join(path, 'app.cjs'), app)
        assert.equal(workspaceSnapshot(path).digest, snapshot.digest)
        const failedRecipe = structuredClone(recipe)
        entry(failedRecipe.commands, 0).command.argv = ['node', '-e', 'process.exit(7)']
        const failedSelection = environments.recipes.prepare(failedRecipe)
        environments.effects.lifecycle.transition(plan.run, {
          to: 'queued',
          reason: 'Observe a deliberately failing setup without accepting readiness.',
        })
        const failed = await environments.provision({
          schema: 'wholeloop/environment-provision-request@1',
          run: plan.run,
          key: 'failed-setup',
          recipe: failedSelection.digest,
          helperImage: DOCKER_REFERENCE_HELPER,
          workspaces: [{ repository: 'app', path, head: snapshot.head, snapshot: snapshot.digest }],
        })
        output.atomic('failed-setup.json', `${JSON.stringify(failed, null, 2)}\n`)
        assert.equal(failed.status, 'failed')
        assert.equal(failed.environment?.record.state, 'failed')
        assert.ok(
          failed.environment?.record.resources.some(
            (resource) => resource.purpose === 'setup' && resource.exit === 7,
          ),
        )
        assert.equal(
          failed.environment?.record.resources.some((resource) => resource.purpose === 'service'),
          false,
        )
        check('setup-failure-refuses-readiness', {
          id: failed.environment?.record.id,
          digest: failed.environment?.digest,
        })
        // The backend retained the failure. This explicit successful-evaluation teardown is a separate operator choice.
        await retireFixture(environments, failed, driver)
        report.retirement = 'exact-owned-absence-observed'
      } else report.retirement = 'retained-by-request'
      report.status = 'pass'
    },
    { retain: true },
  )
} catch (error) {
  report.reason = error instanceof Error ? error.name : 'evaluation-error'
  report.retirement = 'failed-resources-retained'
  process.exitCode = 1
}
validateDeliveryShape(report, evaluationSchema)
output.atomic('report.json', `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
