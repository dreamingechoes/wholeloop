import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parse } from 'smol-toml'
import { describe, expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import {
  NATIVE_DELIVERY_TARGETS,
  nativeDeliveryRecipe,
  nativeTomlLiteral,
} from '../../../src/delivery/native-adapters.js'
import {
  type NativeDeliveryObservation,
  negotiateNativeDelivery,
} from '../../../src/delivery/native-capabilities.js'
import { type NativeBoundaryHost, NativeDeliveryHost } from '../../../src/delivery/native-host.js'
import { DEFAULT_DELIVERY_BUDGETS } from '../../../src/delivery/plan.js'
import { DeliveryQueue } from '../../../src/delivery/queue.js'
import { createWorkerAssignment, type WorkerRole } from '../../../src/delivery/worker-protocol.js'
import { ManagedRunnerProcess } from '../../../src/runner/native-process.js'
import { authorization, entry, fixture, git } from '../../support/delivery.js'

const at = '2026-10-24T10:00:00.000Z'
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')
const roles: WorkerRole[] = [
  'builder',
  'verifier',
  'reviewer',
  'refuter',
  'researcher',
  'planner',
  'challenger',
]
function assignment(role: WorkerRole = 'builder') {
  return createWorkerAssignment({
    identity: {
      run: 'delivery-0123456789abcdef',
      plan: 'a'.repeat(64),
      revision: ['planner', 'challenger'].includes(role) ? 0 : 1,
      role,
      ...(['planner', 'challenger'].includes(role) ? {} : { unit: 'contract' }),
      attempt: 'attempt-0123456789abcdef',
      generation: 1,
    },
    grantDigest: 'b'.repeat(64),
    source: 'c'.repeat(64),
    brief: 'Implement only the assigned fixture.',
    endpoint: 'local-handoff',
    intervention: 'none',
    environment: { id: 'fixture', recipe: 'd'.repeat(64), boundary: 'e'.repeat(64) },
    candidates: [],
    criteria: [],
    findings: [],
    contracts: [],
    context: [],
    tools: undefined as never,
    deadline: '2026-10-24T10:00:10.000Z',
    limits: { ...DEFAULT_DELIVERY_BUDGETS },
  } as Parameters<typeof createWorkerAssignment>[0])
}
const host = {
  observe: ({
    assignment: value,
    recipe,
    model,
  }: Parameters<NativeBoundaryHost['observe']>[0]): NativeDeliveryObservation => ({
    schema: 'wholeloop/delivery-native-observation@1',
    target: recipe.target,
    version: recipe.version,
    role: value.identity.role,
    assignment: value.assignment,
    policy: recipe.policy,
    model,
    evidence: 'f'.repeat(64),
    provenance: 'fixture',
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

describe('dedicated native delivery recipes', () => {
  it.each(['claude', 'codex'] as const)(
    'keeps %s file mode unchanged and binds read-only inline output explicitly',
    (target) => {
      const value = assignment('verifier'),
        input = {
          target,
          version: target === 'claude' ? '2.1.307' : '0.163.0',
          assignment: value,
          directory: '/tmp/native-fixture',
          workspace: '/tmp/workspace-fixture',
          model: 'fixture-model',
        },
        legacy = nativeDeliveryRecipe(input),
        explicit = nativeDeliveryRecipe({ ...input, output: 'files' }),
        inline = nativeDeliveryRecipe({ ...input, output: 'inline-proposal' })
      if (!legacy.available || !explicit.available || !inline.available)
        throw new Error('The selected reference recipe must exist.')
      expect(explicit.recipe.policy).toBe(legacy.recipe.policy)
      expect(explicit.recipe.args).toEqual(legacy.recipe.args)
      expect(explicit.recipe.files).toEqual(legacy.recipe.files)
      expect(inline.recipe.policy).not.toBe(legacy.recipe.policy)
      if (target === 'claude') {
        expect(inline.recipe.args[inline.recipe.args.indexOf('--tools') + 1]).toBe('Read,Glob,Grep')
        const schema = JSON.parse(
          inline.recipe.args[inline.recipe.args.indexOf('--json-schema') + 1] ?? '{}',
        )
        expect(schema.$id).toBe('wholeloop/delivery-worker-proposal@1')
        expect(schema.properties.assignment.const).toBe(value.assignment)
        expect(schema.properties.artifacts.items.properties).not.toHaveProperty('sha256')
      } else {
        const config = inline.recipe.args.filter(
            (_, index, args) => args[index - 1] === '--config',
          ),
          permissions = config.find((entry) => entry.startsWith('permissions.wholeloop='))
        if (!permissions) throw new Error('The scoped native filesystem policy is missing.')
        const parsed = parse(permissions)
        expect(JSON.stringify(parsed)).toContain('"/tmp/native-fixture/outputs":"read"')
        expect(JSON.stringify(parsed)).toContain('"/tmp/workspace-fixture":"read"')
        expect(inline.recipe.files.get('response.schema.json')).toContain(
          'wholeloop/delivery-worker-proposal@1',
        )
      }
    },
  )
  it('exports non-granting contracts in a fresh compiled process', () => {
    const result = spawnSync(
      process.execPath,
      [resolve('dist/wl.mjs'), 'delivery', 'native-schema', '--json'],
      { encoding: 'utf8' },
    )
    expect(result.status, result.stderr || result.stdout).toBe(0)
    const value = JSON.parse(result.stdout)
    expect(value).toMatchObject({
      schema: 'wholeloop/delivery-native-schema@1',
      dispatch: 'not-performed',
      runSchema: { properties: { acceptance: { const: 'not-established' } } },
    })
    expect(value.targets).toHaveLength(7)
  })

  it.each(NATIVE_DELIVERY_TARGETS)('keeps %s expanded capability and denial explicit', (target) => {
    for (const role of roles) {
      const value = assignment(role)
      const selected = nativeDeliveryRecipe({
        target,
        version: target === 'claude' ? '2.1.307' : '0.163.0',
        assignment: value,
        directory: '/tmp/wholeloop-fixture',
        ...(value.tools.workspace !== 'none' ? { workspace: '/tmp/wholeloop-workspace' } : {}),
        model: 'fixture-model',
      })
      if (!['claude', 'codex'].includes(target)) {
        expect(selected).toEqual({ available: false, reason: 'expanded-target-unverified' })
        continue
      }
      if (!selected.available) throw new Error('Reference recipe required')
      const recipe = selected.recipe
      expect(
        recipe.args.some((arg) =>
          /bypass|danger-full-access|fallback-model|--resume|--continue/.test(arg),
        ),
      ).toBe(false)
      expect(negotiateNativeDelivery(value, recipe, 'fixture-model')).toEqual({
        available: false,
        reason: 'runtime-unobserved',
      })
      const observed = host.observe({ assignment: value, recipe, model: 'fixture-model' })
      expect(negotiateNativeDelivery(value, recipe, 'fixture-model', observed)).toMatchObject({
        available: true,
        metering: { hardTokens: false, hardCurrency: false, provenance: 'fixture' },
      })
      if (target === 'codex') {
        expect(recipe.args).not.toContain('--sandbox')
        let configText = ''
        for (let index = 0; index < recipe.args.length; index++)
          if (recipe.args[index] === '--config') configText += `${entry(recipe.args, index + 1)}\n`
        expect(parse(configText)).toMatchObject({
          default_permissions: 'wholeloop',
          features: { shell_tool: false, apps: false, multi_agent: false },
          web_search: 'disabled',
        })
        const schema = JSON.parse(recipe.files.get('response.schema.json') ?? '{}')
        expect(schema.properties.assignment.enum).toEqual([value.assignment])
      } else {
        expect(recipe.args).toContain('--restricted')
        expect(recipe.args).toContain('--safe-mode')
        expect(recipe.args).toContain('--strict-mcp-config')
        expect(recipe.args).toContain(
          role === 'builder' ? 'Read,Glob,Grep,Edit,Write' : 'Read,Glob,Grep',
        )
      }
    }
  })

  it('round-trips bounded policy values without treating shell metacharacters as code', () => {
    const value = {
      '/tmp/a b/quotes"/$literal': 'read',
      nested: { enabled: false },
      tools: ['read', 'write'],
    }
    expect(parse(`policy=${nativeTomlLiteral(value)}`).policy).toEqual(value)
  })

  it('refuses different runtime bindings, missing controls and unsupported hard metering', () => {
    const value = assignment(),
      selected = nativeDeliveryRecipe({
        target: 'codex',
        version: '0.163.0',
        assignment: value,
        directory: '/tmp/fixture',
        workspace: '/tmp/workspace',
        model: 'fixture-model',
      })
    if (!selected.available) throw new Error('Fixture requires a recipe')
    const observed = host.observe({
      assignment: value,
      recipe: selected.recipe,
      model: 'fixture-model',
    })
    if (!observed) throw new Error('Fixture requires an observation')
    for (const field of ['assignment', 'policy', 'version', 'role', 'model'] as const) {
      const wrong = {
        ...observed,
        [field]:
          field === 'role'
            ? 'reviewer'
            : field === 'version'
              ? 'unknown'
              : field === 'model'
                ? 'another-model'
                : 'a'.repeat(64),
      }
      expect(
        negotiateNativeDelivery(
          value,
          selected.recipe,
          'fixture-model',
          wrong as NativeDeliveryObservation,
        ),
      ).toMatchObject({ available: false })
    }
    for (const control of Object.keys(observed.boundary))
      expect(
        negotiateNativeDelivery(value, selected.recipe, 'fixture-model', {
          ...observed,
          boundary: { ...observed.boundary, [control]: false },
        }),
      ).toMatchObject({ available: false, reason: 'containment-unavailable' })
    expect(
      negotiateNativeDelivery(value, selected.recipe, 'fixture-model', {
        ...observed,
        authenticated: false,
      }),
    ).toMatchObject({ available: false, reason: 'authentication-required' })
    expect(
      negotiateNativeDelivery(value, selected.recipe, 'fixture-model', {
        ...observed,
        metering: { hardTokens: true, hardCurrency: false },
      } as never),
    ).toMatchObject({ available: false, reason: 'invalid-runtime-observation' })
    expect(
      nativeDeliveryRecipe({
        target: 'codex',
        version: 'future',
        assignment: value,
        directory: '/tmp/fixture',
        workspace: '/tmp/workspace',
      }),
    ).toMatchObject({ available: false, reason: 'native-version-unverified' })
  })
})

async function nativeFixture(
  run: (input: {
    queue: DeliveryQueue
    lease: NonNullable<ReturnType<DeliveryQueue['claim']>['assignment']>
    context: Parameters<NativeDeliveryHost['run']>[1]
    options: Parameters<NativeDeliveryHost['run']>[2]
    root: string
    workspace: string
    bin: string
    dir: string
  }) => Promise<void>,
  mode = 'complete',
  target = 'claude',
) {
  return fixture(async ({ planning, plan, root, dir }) => {
    entry(plan.guidance, 0).sha256 = hash('Pinned guidance.')
    if (mode === 'timeout') plan.budgets.attemptMs = 100
    if (mode === 'quota') plan.budgets.artifactBytes = 1
    if (mode === 'blocked') plan.policy.intervention = 'none'
    if (mode.startsWith('inline')) {
      plan.work = plan.work
        .filter((work) => work.id === 'search')
        .map((work) => ({ ...work, after: [], consumes: [] }))
      plan.milestones = plan.milestones.map((milestone) => ({ ...milestone, work: ['search'] }))
    }
    if (mode === 'source-only') {
      const source = planning.sources.capture(
        {
          schema: 'wholeloop/delivery-source-request@1',
          kind: 'inline',
          ref: 'research',
          body: 'Investigate whether title search helps people find tasks.',
          mapping: [{ id: 'search', role: 'criterion', startLine: 1, endLine: 1 }],
        },
        root,
      )
      plan.source = source.id
      plan.policy.endpoint = 'research-report'
      plan.repositories = []
      entry(plan.scope.outcomes, 0).text = 'Produce evidence about title-based task lookup.'
      entry(plan.criteria, 0).text = source.body
      entry(plan.criteria, 0).test =
        'Read the selected sources and retain findings and owned unknowns.'
      plan.work = [
        {
          id: 'research',
          role: 'research',
          criteria: ['search'],
          after: [],
          consumes: [],
          produces: [],
        },
      ]
      plan.milestones = [
        {
          id: 'research',
          work: ['research'],
          criteria: ['search'],
          after: [],
          procedure: 'Inspect source-backed findings and unresolved questions.',
        },
      ]
    }
    const prepared = planning.preparePlan(plan),
      queue = new DeliveryQueue(
        planning.sources.files.root,
        () => at,
        undefined,
        () => ({ wall: at, monotonicMs: 0, epoch: 'fixture-native-clock' }),
      )
    const request = authorization(plan, prepared.digest)
    if (mode === 'source-only') request.effects = ['source.read', 'report.write']
    const grant = queue.lifecycle.authority.authorize(request)
    queue.lifecycle.track({ run: plan.run, revision: 1, grant: grant.grant.id })
    queue.enqueue(
      plan.run,
      mode === 'source-only'
        ? { unit: 'research' }
        : mode.startsWith('inline')
          ? { unit: 'search', role: 'verifier', cell: 'independent' }
          : mode === 'read-only-change'
            ? { unit: 'contract', role: 'verifier', cell: 'independent' }
            : { unit: 'contract' },
    )
    const lease = queue.claim('controller-0123456789abcdef0123456789abcdef', () => ({
      ready: true,
      evidence: 'f'.repeat(64),
      provenance: 'fixture',
    })).assignment
    if (!lease) throw new Error('Fixture requires one claim')
    const workspace = join(dir, 'worktree'),
      contextRoot = join(dir, 'context'),
      bin = join(dir, 'bin')
    git(root, ['worktree', 'add', '-b', 'wl/contract', workspace])
    mkdirSync(join(contextRoot, 'artifacts'), { recursive: true })
    mkdirSync(bin)
    writeFileSync(join(contextRoot, 'artifacts/guidance.txt'), 'Pinned guidance.')
    const executable = join(bin, target)
    writeFileSync(
      executable,
      `#!${process.execPath}
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');let input='';
process.stdin.on('data',chunk=>input+=chunk);process.stdin.on('end',()=>{
const payload=JSON.parse(input),assignment=payload.assignment,mode=${JSON.stringify(mode)};
if(!mode.startsWith('inline'))fs.writeFileSync(path.join(process.cwd(),'outputs','environment.json'),JSON.stringify({keys:Object.keys(process.env).sort(),home:process.env.HOME,args:process.argv.slice(2)}));
if(mode==='timeout'||mode==='hang'){setInterval(()=>{},1000);return}
if(mode==='permission'){console.error('Permission denied by native policy');process.exit(1)}
if(mode==='model'){console.error('Model unavailable');process.exit(1)}
if(mode==='mcp'){console.error('MCP startup failed');process.exit(1)}
if(mode==='malformed'){console.log('{"schema":');return}
if(mode==='overflow'){console.log('x'.repeat(1048577));return}
if(mode==='changed-git'){fs.writeFileSync(${JSON.stringify(join(workspace, '.git'))},'gitdir: /missing-fixture-gitdir\\n')}
if(mode==='read-only-change'){fs.writeFileSync(${JSON.stringify(join(workspace, 'app.txt'))},'Unexpected fixture edit.')}
const proof=mode==='inline-empty'?'':'Fixture proof.\\n';if(!mode.startsWith('inline'))fs.writeFileSync(path.join(process.cwd(),'outputs','artifacts','proof.txt'),proof);
const result=mode.startsWith('inline')?{schema:'wholeloop/delivery-worker-proposal@1',assignment:mode==='inline-wrong-fence'?'f'.repeat(64):assignment.assignment,status:'complete',summary:'Observed fixture proposal.',artifacts:[{ref:'artifacts/proof.txt',kind:'evidence',text:proof}],criteria:[{id:'search',status:'pass',evidence:['artifacts/proof.txt']}],findings:[],unknowns:[]}:{schema:'wholeloop/delivery-worker-result@1',assignment:assignment.assignment,identity:assignment.identity,status:mode==='blocked'?'blocked':'complete',origin:'worker-claim',summary:'Observed fixture output.',artifacts:[{ref:'artifacts/proof.txt',sha256:crypto.createHash('sha256').update(proof).digest('hex'),bytes:Buffer.byteLength(proof),kind:'report'}],criteria:[],findings:[],unknowns:[]};
if(mode==='wrong-fence')result.identity.generation++;
if(${JSON.stringify(target)}==='codex'){console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify(result)}}));console.log(JSON.stringify({type:'turn.completed'}))}
else console.log(JSON.stringify({is_error:false,structured_output:result}));
});
`,
    )
    chmodSync(executable, 0o700)
    await run({
      queue,
      lease,
      root,
      workspace,
      bin,
      dir,
      context: {
        ...(mode === 'source-only' ? {} : { workspace }),
        contextRoot,
        environment: { id: 'fixture', recipe: 'b'.repeat(64), boundary: 'c'.repeat(64) },
        context: [
          {
            kind: 'guidance',
            audience: 'shared',
            artifact: {
              ref: 'artifacts/guidance.txt',
              sha256: hash('Pinned guidance.'),
              bytes: Buffer.byteLength('Pinned guidance.'),
            },
          },
        ],
      },
      options: {
        target,
        version: target === 'claude' ? '2.1.307' : '0.163.0',
        model: 'fixture-model',
        path: `${bin}:${dirname(process.execPath)}`,
        host,
      },
    })
  })
}

describe('actual synthetic native processes', () => {
  it.each(['claude', 'codex'])(
    'retains exact empty %s inline artifact bytes as a claim',
    (target) =>
      nativeFixture(
        async ({ queue, lease, context, options }) => {
          const receipt = await new NativeDeliveryHost(queue).run(lease, context, {
            ...options,
            output: 'inline-proposal',
          })
          expect(receipt.status).toBe('succeeded')
          expect(receipt.result?.artifacts[0]).toMatchObject({ bytes: 0, sha256: hash('') })
          const artifact = receipt.artifacts?.[0]
          if (!artifact) throw new Error('The exact empty artifact must be retained.')
          expect(readFileSync(queue.lifecycle.journal.files.path(artifact.ref)).length).toBe(0)
          expect(receipt.acceptance).toBe('not-established')
        },
        'inline-empty',
        target,
      ),
  )
  it.each(['claude', 'codex'])(
    'captures %s inline verifier evidence without a worker artifact file',
    (target) =>
      nativeFixture(
        async ({ queue, lease, context, options }) => {
          const receipt = await new NativeDeliveryHost(queue).run(lease, context, {
            ...options,
            output: 'inline-proposal',
          })
          expect(receipt.status).toBe('succeeded')
          expect(receipt.acceptance).toBe('not-established')
          expect(receipt.execution?.provenance).toBe('fixture')
          expect(receipt.result?.criteria).toEqual([
            { id: 'search', status: 'pass', evidence: ['artifacts/proof.txt'] },
          ])
          expect(receipt.result?.artifacts[0]?.sha256).toBe(hash('Fixture proof.\n'))
          expect(
            existsSync(
              queue.lifecycle.journal.files.path(
                `${receipt.directory}/outputs/artifacts/proof.txt`,
              ),
            ),
          ).toBe(false)
          const captured = receipt.artifacts?.[0]
          if (!captured) throw new Error('The controller must capture the exact output bytes.')
          expect(readFileSync(queue.lifecycle.journal.files.path(captured.ref), 'utf8')).toBe(
            'Fixture proof.\n',
          )
        },
        'inline',
        target,
      ),
  )
  it.each(['claude', 'codex'])(
    'rejects %s stale inline proposals before artifact capture',
    (target) =>
      nativeFixture(
        async ({ queue, lease, context, options }) => {
          const receipt = await new NativeDeliveryHost(queue).run(lease, context, {
            ...options,
            output: 'inline-proposal',
          })
          expect(receipt).toMatchObject({
            status: 'failed',
            reason: 'invalid-output',
            acceptance: 'not-established',
          })
          expect(receipt.artifacts).toBeUndefined()
          expect(
            new NativeDeliveryHost(queue).budgets.inspect(lease.run).counters.artifactBytes,
          ).toBe(0)
        },
        'inline-wrong-fence',
        target,
      ),
  )
  it.each(['claude', 'codex'])(
    'retains managed process ownership and actual output on %s',
    (target) =>
      nativeFixture(
        async ({ queue, lease, context, options }) => {
          const manager = new ManagedRunnerProcess(
            queue.lifecycle.journal.files,
            contractDigest({ lease, managed: true }),
          )
          const receipt = await new NativeDeliveryHost(queue).run(lease, context, {
            ...options,
            process: (command, args, { input, ...operation }) =>
              manager.invoke(command, args, input, { ...operation, current: () => true }),
          })
          expect(receipt.status).toBe('succeeded')
          expect(manager.observe()).toMatchObject({
            invocationState: 'stopped',
            reason: 'finished',
            code: 0,
          })
          expect(queue.inspect(lease.run).find((r) => r.attempt === lease.attempt)?.status).toBe(
            'complete',
          )
        },
        'success',
        target,
      ),
  )
  it('holds the original queue claim when the native process owner cannot establish shutdown', async () => {
    await nativeFixture(async ({ queue, lease, context, options }) => {
      const receipt = await new NativeDeliveryHost(queue).run(lease, context, {
        ...options,
        process: async () => ({
          status: 'cancelled',
          stdout: '',
          code: null,
          signal: null,
          ownership: { invocationState: 'unknown' },
        }),
      })
      expect(receipt).toMatchObject({ status: 'failed', reason: 'runtime-unobserved' })
      expect(queue.inspect(lease.run).find((r) => r.attempt === lease.attempt)?.status).toBe(
        'claimed',
      )
    })
  })

  it.each(['claude', 'codex'])(
    'runs source-only research on %s without an application workspace',
    (target) =>
      nativeFixture(
        async ({ queue, lease, context, options }) => {
          expect(context.workspace).toBeUndefined()
          const receipt = await new NativeDeliveryHost(queue).run(lease, context, options)
          expect(receipt).toMatchObject({
            status: 'succeeded',
            execution: { identity: { role: 'researcher', unit: 'research' } },
          })
          expect(receipt.candidate).toBeUndefined()
        },
        'source-only',
        target,
      ),
  )

  it('retains and rejects unexpected implementation changes from a read-only evaluator', () =>
    nativeFixture(async ({ queue, lease, context, options, workspace }) => {
      const receipt = await new NativeDeliveryHost(queue).run(lease, context, options)
      expect(receipt).toMatchObject({
        status: 'failed',
        reason: 'changed',
        execution: { status: 'changed' },
      })
      expect(readFileSync(join(workspace, 'app.txt'), 'utf8')).toBe('Unexpected fixture edit.')
      expect(queue.inspect(lease.run)[0]?.status).toBe('cancelled')
    }, 'read-only-change'))

  it.each(['claude', 'codex'])(
    'runs one fresh %s process, observes output bytes and preserves provenance',
    (target) =>
      nativeFixture(
        async ({ queue, lease, context, options }) => {
          const receipt = await new NativeDeliveryHost(queue).run(lease, context, options)
          expect(receipt).toMatchObject({
            status: 'succeeded',
            execution: {
              status: 'succeeded',
              code: 0,
              provenance: 'fixture',
              acceptance: 'not-established',
            },
            result: { origin: 'worker-claim' },
            publication: 'not-performed',
          })
          expect(queue.inspect(lease.run)[0]?.status).toBe('complete')
          expect(receipt.artifacts).toHaveLength(1)
          expect(
            readFileSync(
              queue.lifecycle.journal.files.path(entry(receipt.artifacts ?? [], 0).ref),
              'utf8',
            ),
          ).toBe('Fixture proof.\n')
          const observed = JSON.parse(
            readFileSync(
              queue.lifecycle.journal.files.path(`${receipt.directory}/outputs/environment.json`),
              'utf8',
            ),
          )
          expect(
            observed.keys.some((key: string) => /TOKEN|SECRET|API_KEY|NODE_OPTIONS/.test(key)),
          ).toBe(false)
          expect(observed.home).toContain(receipt.directory)
        },
        'complete',
        target,
      ),
  )

  it.each([
    ['permission', 'permission-denied'],
    ['model', 'model-unavailable'],
    ['mcp', 'mcp-unavailable'],
    ['malformed', 'invalid-output'],
    ['wrong-fence', 'invalid-output'],
    ['overflow', 'output-limit'],
    ['changed-git', 'changed'],
  ])('retains a typed %s failure without fallback or completion', (mode, reason) =>
    nativeFixture(async ({ queue, lease, context, options }) => {
      const receipt = await new NativeDeliveryHost(queue).run(lease, context, options)
      expect(receipt).toMatchObject({ status: 'failed', reason, acceptance: 'not-established' })
      expect(queue.inspect(lease.run)[0]?.status).toBe('cancelled')
      expect(receipt.execution?.provenance).toBe('fixture')
    }, mode),
  )

  it('bounds a hanging process by its attempt timer', () =>
    nativeFixture(async ({ queue, lease, context, options }) => {
      const receipt = await new NativeDeliveryHost(queue).run(lease, context, options)
      expect(receipt).toMatchObject({
        status: 'failed',
        reason: 'timed-out',
        execution: { status: 'timed-out', provenance: 'fixture' },
      })
      expect(queue.inspect(lease.run)[0]?.status).toBe('cancelled')
    }, 'timeout'))

  it.each(['cancel', 'revoke'] as const)(
    'stops the observed native process on %s and retains ownership evidence',
    (action) =>
      nativeFixture(async ({ queue, lease, context, options }) => {
        let directory = ''
        const controller = new AbortController()
        const running = new NativeDeliveryHost(queue).run(lease, context, {
          ...options,
          signal: controller.signal,
          host: {
            observe: (input) => {
              directory = input.recipe.cwd
              return host.observe(input)
            },
          },
        })
        try {
          const deadline = Date.now() + 2000
          while (!existsSync(join(directory, 'outputs/environment.json')) && Date.now() < deadline)
            await new Promise((resolve) => setTimeout(resolve, 5))
          expect(existsSync(join(directory, 'outputs/environment.json'))).toBe(true)
          if (action === 'cancel') controller.abort()
          else
            queue.lifecycle.authority.revoke({
              schema: 'wholeloop/delivery-revocation-request@1',
              grant: lease.grant,
              operator: 'Fixture Operator',
              reason: 'Revoke the active fixture worker.',
            })
          const receipt = await running
          expect(receipt).toMatchObject({
            status: 'failed',
            reason: action === 'cancel' ? 'cancelled' : 'stale',
            execution: { provenance: 'fixture' },
          })
          expect(queue.inspect(lease.run)[0]?.status).toBe('cancelled')
        } finally {
          controller.abort()
          await running
        }
      }, 'hang'),
  )

  it('preserves a blocked worker claim in none mode without accepting or completing its work', () =>
    nativeFixture(async ({ queue, lease, context, options }) => {
      const receipt = await new NativeDeliveryHost(queue).run(lease, context, options)
      expect(receipt).toMatchObject({
        status: 'blocked',
        execution: { status: 'succeeded', acceptance: 'not-established' },
        result: { status: 'blocked', origin: 'worker-claim' },
      })
      expect(queue.inspect(lease.run)[0]?.status).toBe('cancelled')
    }, 'blocked'))

  it('retains output quota failure without charging or promoting an unavailable artifact', () =>
    nativeFixture(async ({ queue, lease, context, options }) => {
      const receipt = await new NativeDeliveryHost(queue).run(lease, context, options)
      expect(receipt).toMatchObject({ status: 'failed', reason: 'artifact-limit' })
      expect(receipt.artifacts ?? []).toEqual([])
      expect(queue.inspect(lease.run)[0]?.status).toBe('cancelled')
    }, 'quota'))

  it('rechecks authority after runtime observation and before launching the client', () =>
    nativeFixture(async ({ queue, lease, context, options }) => {
      const receipt = await new NativeDeliveryHost(queue).run(lease, context, {
        ...options,
        host: {
          observe: (input) => {
            queue.lifecycle.authority.revoke({
              schema: 'wholeloop/delivery-revocation-request@1',
              grant: lease.grant,
              operator: 'Fixture Operator',
              reason: 'Revoke before native startup.',
            })
            return host.observe(input)
          },
        },
      })
      expect(receipt).toMatchObject({ status: 'unavailable', reason: 'stale' })
      expect(receipt.execution).toBeUndefined()
      expect(queue.inspect(lease.run)[0]?.status).toBe('cancelled')
    }))

  it('refuses native credential references under a fixture runtime observation', () =>
    nativeFixture(async ({ queue, lease, context, options, dir }) => {
      const receipt = await new NativeDeliveryHost(queue).run(lease, context, {
        ...options,
        nativeStore: join(dir, 'native-auth'),
      })
      expect(receipt).toMatchObject({
        status: 'unavailable',
        reason: 'invalid-runtime-observation',
      })
      expect(receipt.execution).toBeUndefined()
    }))

  it('refuses unobserved runtime capability before starting a process', () =>
    nativeFixture(async ({ queue, lease, context, options }) => {
      const { host: _host, ...withoutHost } = options
      const receipt = await new NativeDeliveryHost(queue).run(lease, context, withoutHost)
      expect(receipt).toMatchObject({ status: 'unavailable', reason: 'runtime-unobserved' })
      expect(receipt).not.toHaveProperty('execution')
    }))
})
