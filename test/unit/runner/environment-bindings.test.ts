import { describe, expect, it } from 'vitest'
import type {
  EnvironmentOperation,
  EnvironmentOperations,
} from '../../../src/environment/operations.js'
import {
  boundEnvironmentOperations,
  selectEnvironmentObservations,
} from '../../../src/runner/environment-bindings.js'

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Fixture entry missing')
  return value
}

function fixture(size: number) {
  let reads = 0
  const retained: EnvironmentOperation[] = Array.from(
      { length: size },
      (_, index) =>
        new Proxy(
          {
            schema: 'wholeloop/environment-operation@1' as const,
            id: `operation-${index}`,
            environment: 'environment-fixture',
            nonce: `nonce-${index}`,
            action: 'start' as const,
            command: `command-${index}`,
            at: '2026-11-06T00:00:00.000Z',
            timeoutMs: 1000,
            provenance: 'fixture' as const,
          },
          {
            get(target, key, receiver) {
              reads++
              return Reflect.get(target, key, receiver)
            },
          },
        ),
    ),
    expected = retained.map(({ id, nonce, command }) => ({ id, nonce, command })),
    observed: ReturnType<EnvironmentOperations['inspect']> = retained.map((operation) => ({
      operation,
      status: 'not-started',
      evidence: 'original-fixture',
    }))
  reads = 0
  return { retained, expected, observed, reads: () => reads }
}

describe('original environment operation selections', () => {
  it('avoids indexing for empty or single selections', () => {
    const input = fixture(400)
    expect(boundEnvironmentOperations([], input.retained, 'fixture')).toEqual([])
    expect(selectEnvironmentObservations([], input.observed)).toEqual([])
    expect(input.reads()).toBe(0)
    const bound = boundEnvironmentOperations(
        [required(input.expected[0])],
        input.retained,
        'fixture',
      ),
      selected = selectEnvironmentObservations([required(input.expected[0])], input.observed)
    expect(input.reads()).toBe(5)
    expect(bound).toEqual([input.retained[0]])
    expect(selected).toEqual([input.observed[0]])
  })
  it('bounds matching work without any filesystem or backend', () => {
    const measurements = [100, 400].map((size) => {
      const input = fixture(size)
      const bound = boundEnvironmentOperations(input.expected, input.retained, 'fixture'),
        selected = selectEnvironmentObservations(input.expected, input.observed),
        reads = input.reads()
      expect(bound).toEqual(input.retained)
      expect(selected).toEqual(input.observed)
      return { size, reads }
    })
    console.info('Environment matching field reads:', JSON.stringify(measurements))
    for (const measurement of measurements)
      expect(measurement.reads).toBeLessThanOrEqual(5 * measurement.size)
    expect(required(measurements[1]).reads / required(measurements[0]).reads).toBeLessThan(4.2)
  })
  it('retains first matches, order, missing observations and exact original tuple refusal', () => {
    const { retained, expected, observed } = fixture(2),
      first = required(retained[0]),
      binding = required(expected[0])
    expect(
      boundEnvironmentOperations([binding], [first, { ...first, nonce: 'different' }], 'fixture'),
    ).toEqual([first])
    expect(
      selectEnvironmentObservations(
        [required(expected[1]), binding, { id: 'missing' }],
        [
          required(observed[0]),
          { ...required(observed[0]), status: 'unknown' },
          required(observed[1]),
        ],
      ),
    ).toEqual([observed[1], observed[0], undefined])
    for (const altered of [
      { ...binding, nonce: 'different' },
      { ...binding, command: 'different' },
      { ...binding, id: 'missing' },
      { ...binding, extra: true },
    ])
      expect(() =>
        boundEnvironmentOperations([required(expected[1]), altered], retained, 'fixture'),
      ).toThrow('environment-stage-operation-binding')
    expect(() => boundEnvironmentOperations(expected, retained, 'host-observed')).toThrow(
      'environment-stage-operation-binding',
    )
  })
})
