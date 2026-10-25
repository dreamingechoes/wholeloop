import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { DOCKER_REFERENCE_HELPER } from '../../../src/environment/docker-policy.js'
import { fixture } from '../../support/delivery.js'

it('inspects closed runtime contracts and refuses ungranted starts without invoking Docker', () =>
  fixture(({ dir, root, planning, plan }) => {
    const bin = join(dir, 'bin'),
      home = join(dir, 'home'),
      marker = join(dir, 'docker-invoked')
    mkdirSync(bin)
    mkdirSync(home)
    writeFileSync(
      join(bin, 'docker'),
      `#!/usr/bin/env node\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)},'unexpected backend execution')\n`,
      { mode: 0o700 },
    )
    const cli = (args: string[], status = 0) => {
      const result = spawnSync(
        process.execPath,
        [resolve('dist/wl.mjs'), 'delivery', ...args, '--json'],
        {
          encoding: 'utf8',
          env: { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}` },
        },
      )
      expect(result.status, result.stderr || result.stdout).toBe(status)
      return JSON.parse(result.stdout)
    }
    const contracts = cli(['environment-runtime-schema'])
    expect(contracts).toMatchObject({
      schema: 'wholeloop/environment-runtime-schema@1',
      executed: false,
      referenceHelper: DOCKER_REFERENCE_HELPER,
    })
    expect(contracts.runtimeSchema.properties.acceptance.const).toBe('not-established')
    expect(contracts.runtimeSchema.additionalProperties).toBe(false)
    expect(contracts.provisionSchema.additionalProperties).toBe(false)
    planning.preparePlan(plan)
    writeFileSync(
      join(root, 'provision.json'),
      JSON.stringify({
        schema: 'wholeloop/environment-provision-request@1',
        run: plan.run,
        recipe: 'a'.repeat(64),
        key: 'ungranted',
        helperImage: DOCKER_REFERENCE_HELPER,
        workspaces: [
          { repository: 'app', path: root, head: 'a'.repeat(40), snapshot: 'b'.repeat(64) },
        ],
      }),
    )
    expect(
      cli(
        [
          'environment-start',
          '--file',
          'provision.json',
          '--root',
          root,
          '--store',
          planning.sources.files.root,
        ],
        3,
      ),
    ).toMatchObject({ schema: 'wholeloop/error@1', code: 3 })
    expect(existsSync(marker)).toBe(false)
  }))
