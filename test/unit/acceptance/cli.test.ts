import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { acceptanceFixture } from '../../support/acceptance.js'

it('prepares and reads pinned definitions and captures budgeted bytes without Docker or a result import path', () =>
  acceptanceFixture(async ({ acceptance, plan, dir }) => {
    const bin = join(dir, 'bin'),
      home = join(dir, 'home'),
      marker = join(dir, 'backend-invoked')
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
    expect(cli(['behavior-schema'])).toMatchObject({
      schema: 'wholeloop/behavior-schema@1',
      input: { $id: 'wholeloop/behavior-input@1' },
      executed: false,
    })
    const schemas = cli(['acceptance-schema'])
    expect(schemas).toMatchObject({ schema: 'wholeloop/acceptance-schema@1', executed: false })
    expect(Object.keys(schemas.contracts)).toHaveLength(8)
    writeFileSync(join(dir, 'acceptance.json'), JSON.stringify(plan))
    const prepared = cli([
      'acceptance-plan',
      '--file',
      'acceptance.json',
      '--root',
      dir,
      '--store',
      acceptance.planning.sources.files.root,
    ])
    expect(prepared).toMatchObject({
      schema: 'wholeloop/acceptance-plan-prepared@1',
      executed: false,
      acceptance: 'not-established',
    })
    expect(
      cli([
        'acceptance-inspect',
        '--digest',
        prepared.digest,
        '--store',
        acceptance.planning.sources.files.root,
      ]),
    ).toMatchObject({
      schema: 'wholeloop/acceptance-plan-inspection@1',
      digest: prepared.digest,
      plan,
    })
    writeFileSync(join(dir, 'empty.bin'), new Uint8Array())
    expect(
      cli([
        'acceptance-artifact',
        '--run',
        plan.run,
        '--file',
        'empty.bin',
        '--root',
        dir,
        '--store',
        acceptance.planning.sources.files.root,
      ]),
    ).toMatchObject({
      schema: 'wholeloop/acceptance-artifact-capture@1',
      artifact: { bytes: 0, sharing: 'not-authorized' },
      publication: 'not-performed',
    })
    expect(cli(['acceptance-report', '--file', 'acceptance.json'], 4)).toMatchObject({
      schema: 'wholeloop/error@1',
    })
    expect(cli(['acceptance-result', '--file', 'acceptance.json'], 1)).toMatchObject({
      schema: 'wholeloop/error@1',
    })
    expect(
      cli(
        [
          'acceptance-report',
          '--digest',
          prepared.digest,
          '--environment',
          `environment-${'a'.repeat(32)}`,
          '--store',
          acceptance.planning.sources.files.root,
        ],
        3,
      ),
    ).toMatchObject({ schema: 'wholeloop/error@1', code: 3 })
    expect(
      cli(
        [
          'acceptance-run',
          '--digest',
          prepared.digest,
          '--case',
          'find-title',
          '--key',
          'first',
          '--environment',
          `environment-${'a'.repeat(32)}`,
          '--store',
          acceptance.planning.sources.files.root,
        ],
        3,
      ),
    ).toMatchObject({ schema: 'wholeloop/error@1', code: 3 })
    expect(existsSync(marker)).toBe(false)
  }))
