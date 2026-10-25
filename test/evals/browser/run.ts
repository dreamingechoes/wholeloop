import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DockerAcceptanceBoundary } from '../../../src/acceptance/boundary.js'
import { BROWSER_REFERENCE } from '../../../src/acceptance/browser-reference.js'
import type { AcceptanceCase, AcceptancePlan } from '../../../src/acceptance/contracts.js'
import { acceptanceShape } from '../../../src/acceptance/contracts.js'
import { DockerBrowserHost } from '../../../src/acceptance/docker-browser.js'
import evaluationSchema from '../../../src/acceptance/schemas/browser-evaluation-v1.json' with {
  type: 'json',
}
import { DeliveryAcceptance } from '../../../src/acceptance/store.js'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { sourceHash } from '../../../src/delivery/input.js'
import { DockerCli, dockerJson } from '../../../src/environment/docker-command.js'
import { DOCKER_REFERENCE_HELPER } from '../../../src/environment/docker-policy.js'
import { EnvironmentLifecycle } from '../../../src/environment/lifecycle.js'
import { DeliveryEnvironments } from '../../../src/environment/provision.js'
import { workspaceSnapshot } from '../../../src/gates/snapshot.js'
import { browserRecipe } from '../../support/browser.js'
import { authorization, entry, fixture, git } from '../../support/delivery.js'

const destination = process.argv[2]
if (!destination) throw new Error('Provide an external evidence directory')
mkdirSync(destination, { recursive: true })
const report = {
  schema: 'wholeloop/browser-evaluation@1',
  status: 'failed',
  controller: { os: process.platform, architecture: process.arch, node: process.version },
  scope:
    'Actual model-free isolated Chromium and private stdio MCP observations; native coding clients, accounts and independent Linux controllers are not certified.',
  checks: [] as { id: string; evidence: string }[],
  environments: [] as { id: string; daemon: unknown }[],
  retainedFixture: '',
  retirement: 'not-requested',
  reason: '',
}
function check(id: string, value: unknown) {
  report.checks.push({ id, evidence: contractDigest(value) })
  console.log(`Observed: ${id}`)
}
const design =
  'Task title is the textbox label. Add task is the submit button. Created tasks appear in the list. Durable task must survive restarting the server and opening a fresh browser context.\n'
function app(persistent: boolean) {
  const html = `<!doctype html><title>Task list</title><h1>Owned task application</h1><form><label>Task title<input name="title"></label><button>Add task</button></form><ul></ul><script>
const list=document.querySelector('ul'),form=document.querySelector('form');
const render=tasks=>{list.replaceChildren(...tasks.map(t=>{const li=document.createElement('li');li.textContent=t.title;return li}))};
${persistent ? "fetch('/tasks').then(r=>r.json()).then(r=>render(r.tasks));" : 'let local=[];'}
form.onsubmit=async e=>{e.preventDefault();const title=form.elements.title.value;${persistent ? "await fetch('/tasks',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title})});render((await (await fetch('/tasks')).json()).tasks)" : 'local.push({title});render(local)'}};
</script>`
  return `const fs=require('node:fs'),http=require('node:http'),net=require('node:net');
const file='/data/db/tasks.json';let tasks=[];${persistent ? "try{tasks=JSON.parse(fs.readFileSync(file,'utf8'))}catch{}" : ''}
http.createServer((req,res)=>{const url=new URL(req.url,'http://owned');
if(url.pathname==='/'){res.setHeader('content-type','text/html');res.end(${JSON.stringify(html)});return}
if(url.pathname==='/control-probe'){const socket=net.connect({host:'browser',port:8931});socket.setTimeout(1000);socket.once('connect',()=>{socket.destroy();res.end(JSON.stringify({reachable:true}))});socket.once('error',()=>res.end(JSON.stringify({reachable:false})));socket.once('timeout',()=>{socket.destroy();res.end(JSON.stringify({reachable:true}))});return}
let body='';req.on('data',c=>body+=c);req.on('end',()=>{res.setHeader('content-type','application/json');if(req.method==='POST'){tasks.push({id:'task-1',title:JSON.parse(body).title});${persistent ? 'fs.writeFileSync(file,JSON.stringify(tasks));' : ''}}
const found=tasks.filter(t=>t.title.includes(url.searchParams.get('title')||''));res.end(JSON.stringify({ids:found.map(t=>t.id),tasks:found}))})}).listen(3000,'0.0.0.0');\n`
}
try {
  await fixture(
    async ({ root, dir, planning, plan }) => {
      report.retainedFixture = dir
      writeFileSync(join(root, 'app.cjs'), app(false))
      writeFileSync(join(root, 'ui-contract.md'), design)
      git(root, ['add', '.'])
      git(root, [
        'commit',
        '-m',
        'test: seed an intentionally cosmetic task application',
        '-m',
        'Prove that a successful screenshot does not establish backend persistence.',
      ])
      entry(plan.repositories, 0).base = git(root, ['rev-parse', 'HEAD'])
      const source = planning.sources.capture(
        {
          schema: 'wholeloop/delivery-source-request@1',
          kind: 'inline',
          ref: 'browser-durability',
          body: design,
          mapping: [{ id: 'search', role: 'criterion', startLine: 1, endLine: 1 }],
        },
        root,
      )
      plan.source = source.id
      entry(plan.criteria, 0).text = design.trim()
      plan.budgets.wallTimeMs = 1800000
      plan.budgets.attemptMs = 180000
      const prepared = planning.preparePlan(plan)
      const acceptance = new DeliveryAcceptance(planning.sources.files.root)
      const environments = new DeliveryEnvironments(planning.sources.files.root)
      const grant = environments.effects.lifecycle.authority.authorize(
        authorization(plan, prepared.digest),
      )
      environments.effects.lifecycle.track({ run: plan.run, revision: 1, grant: grant.grant.id })
      environments.effects.lifecycle.transition(plan.run, {
        to: 'queued',
        reason: 'Observe explicitly authorized disposable browser acceptance.',
      })
      const driver = new DockerCli()
      const daemon = dockerJson(await driver.call(['info', '--format', '{{json .}}'])) as {
        Architecture: string
      }
      const architecture = ['aarch64', 'arm64'].includes(daemon.Architecture) ? 'arm64' : 'amd64'
      const candidate = join(dir, 'candidate')
      git(root, ['worktree', 'add', '-b', 'wl/browser-evaluation', candidate, 'HEAD'])
      const test: AcceptanceCase = {
        id: 'durability',
        criteria: ['search'],
        owner: 'machine',
        applicability: 'applicable',
        rationale: 'A cosmetic task list must not satisfy durable task acceptance.',
        initial: 'An owned application starts with an empty data volume and a fresh browser.',
        actions: [
          'Create the task through the form, capture it, restart the app and open a fresh context.',
        ],
        failureConditions: [
          'The UI loses the task or the backend does not contain its identifier.',
        ],
        assertions: [
          {
            id: 'created',
            subject: 'state',
            operator: 'equals',
            path: '/checks/created',
            expected: 'true',
            description: 'The actual UI displays the created task.',
          },
          {
            id: 'retained',
            subject: 'state',
            operator: 'equals',
            path: '/checks/retained',
            expected: 'true',
            description: 'A fresh browser sees the task after an actual application restart.',
          },
          {
            id: 'ids',
            subject: 'json',
            operator: 'equals',
            path: '/ids',
            expected: '["task-1"]',
            description: 'The actual backend retains the task identifier.',
          },
        ],
        runner: {
          kind: 'browser',
          capability: 'browser.journey',
          input: JSON.stringify({
            schema: 'wholeloop/browser-input@1',
            service: 'web',
            port: 3000,
            browser: {
              service: 'browser',
              reference: BROWSER_REFERENCE.id,
              tools: BROWSER_REFERENCE.digest,
            },
            grounding: [{ file: 'design', sha256: sourceHash(design) }],
            persistence: 'backend-roundtrip',
            backend: { path: '/tasks?title=Durable' },
            steps: [
              { id: 'open', kind: 'navigate', path: '/' },
              {
                id: 'title',
                kind: 'fill',
                target: { role: 'textbox', name: 'Task title' },
                text: 'Durable task',
              },
              { id: 'submit', kind: 'click', target: { role: 'button', name: 'Add task' } },
              {
                id: 'visible',
                kind: 'check',
                assertion: 'created',
                text: 'Durable task',
                mode: 'present',
              },
              { id: 'image', kind: 'capture', label: 'created-task' },
              { id: 'restart', kind: 'restart' },
              { id: 'fresh', kind: 'fresh' },
              {
                id: 'persistent',
                kind: 'check',
                assertion: 'retained',
                text: 'Durable task',
                mode: 'present',
              },
            ],
          }),
        },
        fixture: {
          ref: 'fixture:durable-browser-task',
          sha256: contractDigest({ title: 'Durable task' }),
        },
        timeoutMs: 120000,
      }
      const network = structuredClone(test)
      network.id = 'private-control'
      network.assertions = [
        {
          id: 'loaded',
          subject: 'state',
          operator: 'equals',
          path: '/checks/loaded',
          expected: 'true',
          description: 'The actual application renders in Chromium.',
        },
        {
          id: 'private',
          subject: 'json',
          operator: 'equals',
          path: '/reachable',
          expected: 'false',
          description: 'The untrusted application cannot reach a browser control listener.',
        },
      ]
      const networkInput = JSON.parse(test.runner.input)
      networkInput.persistence = 'not-applicable'
      networkInput.backend = { path: '/control-probe' }
      networkInput.steps = [
        { id: 'open', kind: 'navigate', path: '/' },
        {
          id: 'loaded',
          kind: 'check',
          assertion: 'loaded',
          text: 'Owned task application',
          mode: 'present',
        },
      ]
      network.runner.input = JSON.stringify(networkInput)
      const pinned = acceptance.prepare({
        schema: 'wholeloop/acceptance-plan@1',
        run: plan.run,
        revision: 1,
        plan: prepared.digest,
        source: plan.source,
        cases: [test, network],
        retention: { reviewAfterMs: 86400000, expiryAction: 'retain' },
      } satisfies AcceptancePlan)
      async function provision(key: string, persistent: boolean) {
        const code = app(persistent)
        writeFileSync(join(root, 'app.cjs'), code)
        writeFileSync(join(candidate, 'app.cjs'), code)
        const recipe = browserRecipe(root, code, architecture)
        recipe.files.push({
          id: 'design',
          repository: 'app',
          ref: 'ui-contract.md',
          sha256: sourceHash(design),
          kind: 'script',
        })
        const observed = workspaceSnapshot(candidate)
        const result = await environments.provision({
          schema: 'wholeloop/environment-provision-request@1',
          run: plan.run,
          recipe: environments.recipes.prepare(recipe).digest,
          key,
          helperImage: DOCKER_REFERENCE_HELPER,
          workspaces: [
            { repository: 'app', path: candidate, head: observed.head, snapshot: observed.digest },
          ],
        })
        assert.equal(result.status, 'ready', JSON.stringify(result))
        assert.ok(result.environment)
        report.environments.push({
          id: result.environment.record.id,
          daemon: result.environment.record.daemon,
        })
        environments.effects.lifecycle.transition(plan.run, {
          to: 'queued',
          reason: 'Observe actual UI and backend behavior in the exact owned environment.',
        })
        return result.environment.record.id
      }
      const boundary = (id: string) =>
        new DockerAcceptanceBoundary(environments.resources, id, driver)
      const execute = (id: string, key: string) =>
        acceptance.executeCase(
          pinned.digest,
          test.id,
          key,
          boundary(id),
          new DockerBrowserHost(acceptance, pinned.digest, id, test.id, driver),
        )
      const broken = await provision('cosmetic', false)
      const failed = await execute(broken, 'cosmetic')
      assert.equal(failed.status, 'failed', JSON.stringify(failed))
      assert.equal(failed.assertions.find((a) => a.id === 'created')?.status, 'passed')
      assert.equal(failed.assertions.find((a) => a.id === 'retained')?.status, 'failed')
      assert.equal(failed.assertions.find((a) => a.id === 'ids')?.status, 'failed')
      assert.equal(failed.artifacts.length, 2)
      const png = acceptance.artifacts.bytes(plan.run, entry(failed.artifacts, 1))
      assert.equal(Buffer.from(png).subarray(1, 4).toString('ascii'), 'PNG')
      check('actual-ui-success-and-screenshot-do-not-prove-persistence', failed)
      const isolated = await acceptance.executeCase(
        pinned.digest,
        network.id,
        'private-control',
        boundary(broken),
        new DockerBrowserHost(acceptance, pinned.digest, broken, network.id, driver),
      )
      assert.equal(isolated.status, 'passed', JSON.stringify(isolated))
      check('actual-application-cannot-reach-browser-control-listener', isolated)
      const stopped = await new EnvironmentLifecycle(environments.recipes.files, driver).execute({
        schema: 'wholeloop/environment-lifecycle-request@1',
        id: 'browser-evaluation-stop',
        environment: broken,
        expected: environments.resources.get(broken).digest,
        action: 'stop',
        reason:
          'Retain the failed browser evidence and data while releasing disposable compute capacity.',
      })
      assert.equal(stopped.state, 'retained', JSON.stringify(stopped))
      const repaired = await provision('durable', true)
      const stale = await acceptance.report(pinned.digest, boundary(repaired))
      assert.notEqual(stale.status, 'passed')
      check('candidate-repair-invalidates-old-browser-evidence', stale)
      const passed = await execute(repaired, 'durable')
      assert.equal(passed.status, 'passed', JSON.stringify(passed))
      assert.ok(passed.process?.pid)
      check('actual-ui-create-restart-fresh-context-and-backend-roundtrip', passed)
      const replay = await execute(repaired, 'durable')
      assert.deepEqual(replay, passed)
      check('completed-case-is-reused-without-replaying-ui-actions', replay)
      if (process.argv.includes('--retire-success')) {
        for (const id of [broken, repaired]) {
          const retired = await new EnvironmentLifecycle(
            environments.recipes.files,
            driver,
          ).execute({
            schema: 'wholeloop/environment-lifecycle-request@1',
            id: 'browser-evaluation-retire',
            environment: id,
            expected: environments.resources.get(id).digest,
            action: 'retire',
            reason:
              'Retire this exact disposable browser fixture after retaining actual observations.',
          })
          assert.equal(retired.state, 'retired', JSON.stringify(retired))
        }
        report.retirement = 'observed-retired'
      }
      report.status = 'passed'
    },
    { retain: true },
  )
} catch (error) {
  report.reason = error instanceof Error ? error.message : 'Evaluation failed'
  process.exitCode = 1
} finally {
  acceptanceShape(report, evaluationSchema)
  writeFileSync(join(destination, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report, null, 2))
}
