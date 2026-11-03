import { parse } from 'smol-toml'
import { describe, expect, it } from 'vitest'
import { nativeDeliveryRecipe } from '../../../src/delivery/native-adapters.js'
import { DEFAULT_DELIVERY_BUDGETS } from '../../../src/delivery/plan.js'
import {
  createWorkerAssignment,
  WorkerProtocolError,
  type WorkerRole,
} from '../../../src/delivery/worker-protocol.js'

const assignment = (role: WorkerRole, cell: string | undefined, web: boolean) =>
  createWorkerAssignment(
    {
      identity: {
        run: 'delivery-0123456789abcdef',
        plan: 'a'.repeat(64),
        revision: 0,
        role,
        attempt: 'attempt-0123456789abcdef',
        generation: 1,
        ...(cell ? { cell } : {}),
      },
      grantDigest: 'b'.repeat(64),
      source: 'c'.repeat(64),
      brief: 'Query one pinned research angle.',
      endpoint: 'research-report',
      intervention: 'none',
      environment: { id: 'fixture', recipe: 'd'.repeat(64), boundary: 'e'.repeat(64) },
      candidates: [],
      criteria: [],
      findings: [],
      contracts: [],
      context: [],
      deadline: '2026-11-03T10:00:10.000Z',
      limits: { ...DEFAULT_DELIVERY_BUDGETS },
    },
    { web },
  )
const angle = `research:angle:${'f'.repeat(64)}`,
  claim = `research:claim:${'f'.repeat(64)}`

describe('research web reads (ADR-0204)', () => {
  it('admits web reads only for a research angle planner or claim challenger', () => {
    expect(assignment('planner', angle, true).tools.web).toBe('read')
    expect(assignment('challenger', claim, true).tools.web).toBe('read')
    expect(assignment('planner', angle, false).tools).not.toHaveProperty('web')
    for (const [role, cell] of [
      ['planner', undefined],
      ['planner', claim],
      ['challenger', angle],
    ] as const)
      expect(() => assignment(role, cell, true)).toThrow(WorkerProtocolError)
  })
  it('names the client web tools in the recipe only when the assignment carries them', () => {
    for (const web of [true, false]) {
      const value = assignment('planner', angle, web),
        claude = nativeDeliveryRecipe({
          target: 'claude',
          version: '2.1.316',
          assignment: value,
          directory: '/tmp/wholeloop-fixture',
        }),
        codex = nativeDeliveryRecipe({
          target: 'codex',
          version: '0.166.0',
          assignment: value,
          directory: '/tmp/wholeloop-fixture',
        })
      if (!claude.available || !codex.available) throw new Error('Reference recipes required')
      const tools = claude.recipe.args[claude.recipe.args.indexOf('--tools') + 1]
      expect(tools).toBe(web ? 'Read,Glob,Grep,WebSearch,WebFetch' : 'Read,Glob,Grep')
      expect(claude.recipe.args).toContain('--restricted')
      let config = ''
      codex.recipe.args.forEach((arg, index, all) => {
        if (arg === '--config') config += `${all[index + 1]}\n`
      })
      expect(parse(config).web_search).toBe(web ? 'live' : 'disabled')
      // Web search is a client tool, never sandbox network for commands.
      expect(parse(config).permissions).toMatchObject({
        wholeloop: { network: { enabled: false } },
      })
    }
  })
})
