import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import output from '../../../src/cli/schemas/output-v1.json' with { type: 'json' }
import { validate } from '../../../src/config/schema.js'
import { DelegatedDecisions } from '../../../src/decisions/store.js'
import { authorization, fixture } from '../../support/delivery.js'

const cli = join(process.cwd(), 'dist/wl.mjs')
function command(root: string, args: string[]) {
  const result = spawnSync(process.execPath, [cli, ...args, '--json'], {
    cwd: root,
    encoding: 'utf8',
  })
  const receipt = JSON.parse(result.stdout)
  const schema = output.oneOf.find((v) => v.properties.schema.const === receipt.schema)
  expect(schema).toBeDefined()
  expect(validate(receipt, schema as never)).toEqual([])
  return { receipt, code: result.status }
}
describe('compiled delegated decision control plane', () => {
  it('opens no store for schemas and rejects invented decision imports', async () => {
    await fixture(({ root, dir }) => {
      const receipt = command(root, ['delivery', 'decision-schema'])
      expect(receipt.code).toBe(0)
      expect(receipt.receipt.executed).toBe(false)
      expect(existsSync(join(dir, 'repo', '.wholeloop'))).toBe(false)
      const result = spawnSync(
        process.execPath,
        [cli, 'delivery', 'decision-record', '--file', 'worker.json', '--json'],
        { cwd: root, encoding: 'utf8' },
      )
      expect(result.status).toBe(1)
    })
  })
  it('pins an explicit grant and reports none limitations without interactive prompts', async () => {
    await fixture(({ planning, plan, root }) => {
      const decisions = new DelegatedDecisions(planning.sources.files.root)
      const prepared = planning.preparePlan(plan),
        grant = decisions.budgets.lifecycle.authority.authorize(
          authorization(plan, prepared.digest),
        )
      const args = ['--grant', grant.grant.id, '--store', planning.sources.files.root]
      expect(command(root, ['delivery', 'decision-pin', ...args]).receipt.authority).toBe(
        'original-grant-only',
      )
      const result = command(root, [
        'delivery',
        'decision-preflight',
        '--run',
        plan.run,
        '--revision',
        '1',
        ...args,
      ])
      expect(result.code).toBe(0)
      expect(result.receipt).toMatchObject({
        status: 'ready',
        scope: 'policy-only',
        runtime: 'not-observed',
        interactive: 'permitted',
        gates: 'mandatory',
      })
    })
  })
})
