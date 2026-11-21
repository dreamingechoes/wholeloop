// Promise barriers prove overlap and complete joins without using elapsed-time assertions.

import { expect, it } from 'vitest'
import { scheduleAssignments } from '../../../src/workers/schedule.js'

function deferred() {
  let resolve: () => void = () => {
    throw new Error('Uninitialized barrier')
  }
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

it('starts every independent native job before any is released and preserves result order', async () => {
  const release = deferred(),
    started = deferred(),
    seen: number[] = []
  const pending = scheduleAssignments([1, 2, 3], async (id) => {
    seen.push(id)
    if (seen.length === 3) started.resolve()
    await release.promise
    return id * 2
  })
  await started.promise
  expect(seen).toEqual([1, 2, 3])
  release.resolve()
  expect(await pending).toEqual([2, 4, 6])
})

it('joins all started workers before reporting a synchronous failure', async () => {
  const release = deferred(),
    otherStarted = deferred()
  let otherFinished = false,
    finished = false
  const pending = scheduleAssignments([1, 2], (id) => {
    if (id === 1) throw new Error('Invalid first response')
    otherStarted.resolve()
    return release.promise.then(() => {
      otherFinished = true
      return id
    })
  })
  const observed = pending.catch((error) => {
    finished = true
    return error.message
  })
  await otherStarted.promise
  expect(finished).toBe(false)
  release.resolve()
  expect(await observed).toBe('Invalid first response')
  expect(otherFinished).toBe(true)
})

it('retains an explicit sequential fallback without changing coverage', async () => {
  const first = deferred(),
    release = deferred(),
    seen: number[] = []
  const pending = scheduleAssignments(
    [1, 2],
    async (id) => {
      seen.push(id)
      if (id === 1) {
        first.resolve()
        await release.promise
      }
      return id
    },
    'sequential',
  )
  await first.promise
  expect(seen).toEqual([1])
  release.resolve()
  expect(await pending).toEqual([1, 2])
  expect(seen).toEqual([1, 2])
})
