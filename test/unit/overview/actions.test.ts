import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseArguments } from '../../../src/cli/arguments.js'
import { COMMANDS } from '../../../src/cli/commands.js'
import { DELIVERY_STATES, type DeliveryEvent } from '../../../src/delivery/events.js'
import { replayDelivery } from '../../../src/delivery/reducer.js'
import { nextActions } from '../../../src/runner/operator-report.js'

const legacy = JSON.parse(
    readFileSync('test/fixtures/state/delivery-attribution-legacy.json', 'utf8'),
  ) as DeliveryEvent[],
  original = [...replayDelivery(legacy).values()][0]
if (!original) throw new Error('Legacy fixture run required')
function registered(text: string) {
  const args = text
      .split(' ')
      .slice(1)
      .map((value) => (value.startsWith('<') ? 'fixture' : value)),
    command = COMMANDS.find(
      (entry) => args.slice(0, entry.path.split(' ').length).join(' ') === entry.path,
    )
  expect(command).toBeDefined()
  if (!command) throw new Error('A suggested command must be registered')
  const parsed = parseArguments(
    args.slice(command.path.split(' ').length),
    command.options.filter((option) => !option.includes(' ')),
    command.options
      .filter((option) => option.includes(' '))
      .map((option) => option.split(' ')[0] ?? option),
  )
  if (!command.arguments) expect(parsed.positional).toEqual([])
}
describe('shared permitted delivery action syntax', () => {
  it.each(['active', 'unknown'] as const)(
    'does not start another controller while ownership is %s',
    (ownership) => {
      const state = structuredClone(original),
        request = 'a'.repeat(64)
      state.state = 'queued'
      state.facets.push({
        schema: 'wholeloop/delivery-runner@1',
        records: [
          { request, basis: state.basis.digest, generation: 1, ownership, sequence: 1, stages: [] },
        ],
      })
      const commands = nextActions(state, [request], true, true)
      expect(commands).not.toContain(`wl delivery run --digest ${request}`)
      expect(commands).toContain(`wl delivery reconcile --digest ${request}`)
      commands.forEach(registered)
    },
  )
  it('uses the registered run inspector when no runner request exists', () => {
    const commands = nextActions({ ...original, state: 'paused' }, [], false, true)
    expect(commands).toEqual([`wl delivery status --run ${original.run}`])
    commands.forEach(registered)
  })
  it.each(DELIVERY_STATES.flatMap((state) => [true, false].map((active) => ({ state, active }))))(
    'offers registered arguments for $state with active authority $active',
    ({ state, active }) => {
      const commands = nextActions({ ...original, state }, ['a'.repeat(64)], true, active)
      commands.forEach(registered)
      expect(commands.some((command) => command.includes('--cancel'))).toBe(false)
      if (!active)
        expect(
          commands.some((command) => /delivery (run|resume|human-decide|continue) /.test(command)),
        ).toBe(false)
      if (state === 'stopping')
        expect(commands).toContain(`wl delivery reconcile --digest ${'a'.repeat(64)}`)
    },
  )
})
