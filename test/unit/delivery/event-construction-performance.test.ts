import { describe, expect, it, vi } from 'vitest'
import * as compatibility from '../../../src/contracts/compatibility.js'
import { deliveryEvent, validateDeliveryEvent } from '../../../src/delivery/events.js'

const actor = { kind: 'controller' as const, name: 'Fixture' },
  at = '2026-11-06T00:00:00.000Z'
const registration = () => ({
  schema: 'wholeloop/delivery-registration-event@1' as const,
  basis: { kind: 'plan' as const, digest: 'a'.repeat(64), revision: 1 },
  source: 'b'.repeat(64),
  policy: {
    digest: 'c'.repeat(64),
    endpoint: 'local-handoff' as const,
    intervention: 'supervised' as const,
  },
  units: [{ id: 'search', role: 'implementation' as const, repository: 'app' }],
})

describe('owned delivery event construction', () => {
  it.each([100, 400])('hashes %i newly constructed bindings once', (count) => {
    const digest = vi.spyOn(compatibility, 'contractDigest')
    let values: ReturnType<typeof deliveryEvent>[]
    try {
      values = Array.from({ length: count }, (_, index) =>
        deliveryEvent(
          `delivery-${index.toString(16).padStart(16, '0')}`,
          actor,
          registration(),
          undefined,
          at,
        ),
      )
      console.info(
        'Event construction binding hashes:',
        JSON.stringify({ count, hashes: digest.mock.calls.length }),
      )
      expect(digest).toHaveBeenCalledTimes(count)
    } finally {
      digest.mockRestore()
    }
    for (const value of values) expect(() => validateDeliveryEvent(value)).not.toThrow()
  })
  it('keeps returned inputs independent and rechecks caller-modified events', () => {
    const payload = registration(),
      event = deliveryEvent('delivery-0000000000000000', actor, payload, undefined, at)
    payload.units.length = 0
    expect(event.payload).toEqual(registration())
    event.payload = { ...registration(), source: 'd'.repeat(64) }
    expect(() => validateDeliveryEvent(event)).toThrow('event-digest')
  })
  it('retains exact digest-before-predecessor refusal order for external events', () => {
    const first = deliveryEvent('delivery-0000000000000000', actor, registration(), undefined, at),
      changed = { ...first, sequence: 2, digest: 'f'.repeat(64) }
    expect(() => validateDeliveryEvent(changed)).toThrow('event-digest')
    const { digest: _digest, ...binding } = changed
    changed.digest = compatibility.contractDigest(binding)
    expect(() => validateDeliveryEvent(changed)).toThrow('event-predecessor')
    expect(() =>
      deliveryEvent(first.run, actor, registration(), { ...first, sequence: 0 }, at),
    ).toThrow('event-predecessor')
  })
})
