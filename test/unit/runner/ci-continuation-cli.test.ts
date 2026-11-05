import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { EXIT } from '../../../src/cli/io.js'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { runnerCiFailureFixture } from '../../support/runner-ci.js'

it('previews and records an exact CI proposal in cold CLI processes with no journal or authority changes', async () => {
  await runnerCiFailureFixture(({ store, request, input }) => {
    const owner = store.record(input.request)
    if (!owner.controller) throw new Error('Original CI fixture controller required')
    store.release(
      { request: input.request, controller: owner.controller, generation: owner.generation },
      'Release original stub CI owner before cold CLI inspection.',
    )
    store.lifecycle.transition(request.run, {
      to: 'failed',
      outcome: 'failed',
      reason: 'Retain the component CI failure.',
    })
    const before = contractDigest(store.lifecycle.journal.events()),
      call = (args: string[]) => {
        const result = spawnSync(
          process.execPath,
          [resolve('dist/wl.mjs'), 'delivery', ...args, '--store', store.files.root, '--json'],
          {
            encoding: 'utf8',
            maxBuffer: 1024 * 1024,
          },
        )
        return {
          code: result.status,
          out: result.stdout ? JSON.parse(result.stdout) : null,
          error: result.stderr,
        }
      },
      args = ['continue-ci', '--run', request.run, '--request', input.request, '--unit', 'search'],
      preview = call(args)
    expect(preview).toMatchObject({
      code: EXIT.ok,
      out: {
        schema: 'wholeloop/delivery-ci-continue@1',
        accepted: false,
        admission: {
          status: 'admissible',
          origin: 'ci',
          execution: 'fresh-feedback-and-remote-head-preflight-required',
          composition: 'installed-sdk-controller-required',
        },
      },
    })
    expect(JSON.stringify(preview.out)).not.toContain('https://github.com')
    expect(existsSync(store.files.path(`delivery/plans/${request.run}/2.json`))).toBe(false)
    const accepted = call([
      ...args,
      '--accept',
      '--operator',
      'Fixture Operator',
      '--reason',
      'Record only an exact proposal.',
    ])
    expect(accepted, accepted.error).toMatchObject({
      code: EXIT.ok,
      out: {
        schema: 'wholeloop/delivery-ci-continue@1',
        accepted: true,
        record: {
          schema: 'wholeloop/delivery-ci-continuation@1',
          authority: 'new-exact-plan-grant-required',
        },
      },
    })
    expect(accepted.out.next[0]).toContain('--schema-version 2')
    expect(
      accepted.out.next.some((line: string) => /^wl delivery (run|runner-prepare) /.test(line)),
    ).toBe(false)
    const inspect = ['inspect-plan', '--run', request.run, '--revision', '2']
    expect(call(inspect).code).toBe(EXIT.precondition)
    expect(call([...inspect, '--schema-version', '2'])).toMatchObject({
      code: EXIT.ok,
      out: {
        schema: 'wholeloop/delivery-plan-prepared@2',
        plan: { schema: 'wholeloop/delivery-plan@2' },
      },
    })
    expect(store.lifecycle.journal.get(request.run)).toMatchObject({
      state: 'failed',
      basis: { digest: request.plan },
    })
    expect(contractDigest(store.lifecycle.journal.events())).toBe(before)
  })
})
