// Joins every started read-only assignment before returning, including after a malformed result.

export async function scheduleAssignments<T, R>(
  inputs: readonly T[],
  operation: (input: T) => Promise<R>,
  mode: 'native' | 'sequential' = 'native',
): Promise<R[]> {
  if (mode === 'sequential') {
    const results: R[] = []
    for (const input of inputs) results.push(await operation(input))
    return results
  }
  const pending = inputs.map((input) => Promise.resolve().then(() => operation(input)))
  const settled = await Promise.allSettled(pending)
  const failure = settled.find((result) => result.status === 'rejected')
  if (failure?.status === 'rejected') throw failure.reason
  return settled.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
}
