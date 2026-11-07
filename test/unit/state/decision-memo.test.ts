import { describe, expect, it, vi } from 'vitest'
import { assertObservationWritable, DecisionMemo } from '../../../src/state/read-observation.js'

describe('successful external facts once per synchronous decision (ADR-0243)', () => {
  it('reuses a success within a job and expires on an effect or at the end of the job', async () => {
    const memo = new DecisionMemo<number>(),
      read = vi.fn(() => 1)
    expect([memo.get('a', read), memo.get('a', read)]).toEqual([1, 1])
    expect(read).toHaveBeenCalledTimes(1)
    memo.get('b', read)
    expect(read).toHaveBeenCalledTimes(2)
    assertObservationWritable()
    memo.get('a', read)
    expect(read).toHaveBeenCalledTimes(3)
    await Promise.resolve()
    memo.get('a', read)
    expect(read).toHaveBeenCalledTimes(4)
  })

  it('never stores a refusal, a read that announced an effect, or more than its limit', () => {
    const memo = new DecisionMemo<number>(2)
    let calls = 0
    const refuse = () => {
      calls++
      throw new Error('refused')
    }
    expect(() => memo.get('a', refuse)).toThrow('refused')
    expect(() => memo.get('a', refuse)).toThrow('refused')
    expect(calls).toBe(2)
    const effect = vi.fn(() => {
      assertObservationWritable()
      return 1
    })
    memo.get('b', effect)
    memo.get('b', effect)
    expect(effect).toHaveBeenCalledTimes(2)
    const read = vi.fn(() => 2)
    for (const key of ['c', 'd', 'e', 'e']) memo.get(key, read)
    expect(read).toHaveBeenCalledTimes(4)
  })
})
