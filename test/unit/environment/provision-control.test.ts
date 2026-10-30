import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import {
  DockerCli,
  type DockerProcessObservation,
  type DockerTransport,
} from '../../../src/environment/docker-command.js'
import { DOCKER_REFERENCE_HELPER } from '../../../src/environment/docker-policy.js'
import { operationGroup } from '../../../src/environment/operations.js'
import { DeliveryEnvironments } from '../../../src/environment/provision.js'
import {
  type EnvironmentProvisionControl,
  EnvironmentProvisionParent,
} from '../../../src/environment/provision-control.js'
import { workspaceSnapshot } from '../../../src/gates/snapshot.js'
import { authorization, entry, fixture, git } from '../../support/delivery.js'
import { environmentRecipe } from '../../support/environment.js'

const deny: DockerTransport = {
  provenance: 'fixture',
  call: async () => {
    throw new Error('No backend call is authorized')
  },
}
const control = (): EnvironmentProvisionControl => ({
  deadline: new Date(Date.now() + 10000).toISOString(),
  signal: new AbortController().signal,
  current: () => true,
})

describe('original provisioning parent bounds', () => {
  it('preserves the unconfigured transport and narrower resource deadlines', () => {
    const original = new EnvironmentProvisionParent(deny),
      input = { ...control(), requireNewResource: true },
      parent = new EnvironmentProvisionParent(deny, input),
      deadline = input.deadline,
      earlier = new Date(Date.parse(deadline) - 1000).toISOString(),
      later = new Date(Date.parse(deadline) + 1000).toISOString()
    input.deadline = later
    input.requireNewResource = false
    expect(original.requireNewResource).toBe(false)
    expect(parent.requireNewResource).toBe(true)
    expect(original.driver).toBe(deny)
    expect(original.deadline(later)).toBe(later)
    expect(parent.deadline(later)).toBe(deadline)
    expect(parent.deadline(earlier)).toBe(earlier)
  })
  it.each(['cancelled', 'expired', 'fenced', 'malformed'] as const)(
    'refuses %s before source selection or backend admission',
    async (mode) => {
      await fixture(async ({ planning, plan }) => {
        const input = control()
        if (mode === 'cancelled') input.signal = AbortSignal.abort()
        if (mode === 'expired') input.deadline = new Date(Date.now() - 1).toISOString()
        if (mode === 'fenced') input.current = () => false
        if (mode === 'malformed') input.deadline = 'invalid'
        const environments = new DeliveryEnvironments(
          planning.sources.files.root,
          deny,
          undefined,
          undefined,
          input,
        )
        await expect(
          environments.provision({
            schema: 'wholeloop/environment-provision-request@1',
            run: plan.run,
            key: 'refused',
            recipe: 'a'.repeat(64),
            helperImage: DOCKER_REFERENCE_HELPER,
            workspaces: [],
          }),
        ).rejects.toThrow('environment-parent-not-current')
        expect(environments.resources.list()).toEqual([])
      })
    },
  )
  it.each(['cancelled', 'fenced'] as const)(
    'refuses %s after preflight awaits without preparing an effect',
    async (mode) => {
      await fixture(async ({ planning, plan, root, dir }) => {
        const app = 'process.stdout.write("Owned provisioning input.")\n'
        writeFileSync(join(root, 'app.cjs'), app)
        git(root, ['add', 'app.cjs'])
        git(root, [
          'commit',
          '-m',
          'test: pin a disposable provisioning input',
          '-m',
          'Provide exact candidate bytes for parent admission checks.',
        ])
        entry(plan.repositories, 0).base = git(root, ['rev-parse', 'HEAD'])
        const prepared = planning.preparePlan(plan),
          abort = new AbortController(),
          input = control()
        let active = true,
          calls = 0
        input.signal = abort.signal
        input.current = () => active
        const driver: DockerTransport = {
            provenance: 'fixture',
            call: async () => {
              calls++
              if (mode === 'cancelled') {
                abort.abort()
                input.signal = new AbortController().signal
              } else {
                active = false
                input.current = () => true
              }
              return {
                status: 'succeeded',
                stdout: JSON.stringify('unix:///fixture/docker.sock'),
                code: 0,
                digest: 'a'.repeat(64),
              }
            },
          },
          environments = new DeliveryEnvironments(
            planning.sources.files.root,
            driver,
            undefined,
            undefined,
            input,
          ),
          grant = environments.effects.lifecycle.authority.authorize(
            authorization(plan, prepared.digest),
          )
        environments.effects.lifecycle.track({ run: plan.run, revision: 1, grant: grant.grant.id })
        environments.effects.lifecycle.transition(plan.run, {
          to: 'queued',
          reason: 'Observe original parent preflight refusal.',
        })
        const candidate = join(dir, 'candidate')
        git(root, ['worktree', 'add', '-b', 'wl/parent-fixture', candidate, 'HEAD'])
        const snapshot = workspaceSnapshot(candidate),
          selected = environments.recipes.prepare(environmentRecipe(root, app)),
          before = contractDigest(environments.effects.lifecycle.journal.events())
        await expect(
          environments.provision({
            schema: 'wholeloop/environment-provision-request@1',
            run: plan.run,
            key: 'parent-preflight',
            recipe: selected.digest,
            helperImage: DOCKER_REFERENCE_HELPER,
            workspaces: [
              {
                repository: 'app',
                path: candidate,
                head: snapshot.head,
                snapshot: snapshot.digest,
              },
            ],
          }),
        ).rejects.toThrow('environment-parent-not-current')
        expect(calls).toBe(1)
        expect(environments.resources.list()).toEqual([])
        expect(environments.effects.inspect(plan.run)).toEqual([])
        expect(contractDigest(environments.effects.lifecycle.journal.events())).toBe(before)
        expect(existsSync(planning.sources.files.path('delivery/environment-preflights'))).toBe(
          false,
        )
      })
    },
  )
  it.each(['parent-abort', 'call-abort', 'fenced', 'deadline'] as const)(
    'closes only its original actual client on %s',
    async (mode) => {
      const root = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-provision-parent-'))),
        ready = join(root, 'ready'),
        peerReady = join(root, 'peer-ready'),
        binary = join(root, 'docker'),
        peerBinary = join(root, 'peer-docker'),
        abort = new AbortController(),
        callAbort = new AbortController(),
        peerAbort = new AbortController(),
        observed: DockerProcessObservation[] = [],
        peers: DockerProcessObservation[] = [],
        input = control()
      let active = true,
        settled = false
      input.signal = abort.signal
      input.deadline = new Date(Date.now() + (mode === 'deadline' ? 1500 : 10000)).toISOString()
      input.current = () => active
      for (const [path, marker] of [
        [binary, ready],
        [peerBinary, peerReady],
      ] as const)
        writeFileSync(
          path,
          `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)},'ready');setInterval(()=>{},100)\n`,
          { mode: 0o700 },
        )
      const parent = new EnvironmentProvisionParent(new DockerCli(binary), input),
        options = {
          timeoutMs: 10000,
          signal: callAbort.signal,
          process: (value: DockerProcessObservation) => observed.push(value),
        },
        peer = new DockerCli(peerBinary).call(['info'], {
          timeoutMs: 10000,
          signal: peerAbort.signal,
          process: (value) => peers.push(value),
        }),
        pending = parent.driver.call(['info'], options).then(
          (value) => {
            settled = true
            return { value, error: undefined }
          },
          (error: unknown) => {
            settled = true
            return { value: undefined, error }
          },
        )
      try {
        const until = Date.now() + 3000
        while ((!existsSync(ready) || !existsSync(peerReady)) && !settled && Date.now() < until)
          await new Promise((resolve) => setTimeout(resolve, 10))
        expect(existsSync(ready)).toBe(true)
        expect(existsSync(peerReady)).toBe(true)
        if (mode === 'parent-abort') {
          abort.abort()
          input.signal = new AbortController().signal
        }
        if (mode === 'call-abort') {
          callAbort.abort()
          options.signal = new AbortController().signal
        }
        if (mode === 'fenced') {
          active = false
          input.current = () => true
        }
        const outcome = await pending
        expect(outcome.error).toBeInstanceOf(Error)
        if (!(outcome.error instanceof Error)) throw new Error('Expected parent admission refusal')
        expect(outcome.error.message).toContain('environment-parent-not-current')
        expect(observed).toHaveLength(1)
        const original = observed[0]
        if (!original) throw new Error('Original native observation missing')
        expect(operationGroup(original.pid).status).toBe('absent')
        expect(peers).toEqual([])
      } finally {
        abort.abort()
        callAbort.abort()
        peerAbort.abort()
        await pending
        await peer
        rmSync(root, { recursive: true, force: true })
      }
    },
  )
})
