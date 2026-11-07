// Offline provider fixtures for binding and normalized-result conformance, separate from live
// probes.
import { isDeepStrictEqual } from 'node:util'
import { isObject } from '../config/schema.js'
import type { LoadedProvider } from './load.js'
import { type OperationResult, performOperation, updateDocument } from './operations.js'

interface FixtureCase {
  key: string
  operation: string
  input: Record<string, unknown>
  calls: { tool: string; args: Record<string, unknown>; result: OperationResult }[]
  result: OperationResult
}
/** Offline binding/normalized-result conformance, deliberately separate from authenticated server probing. */
export async function providerFixtures(provider: LoadedProvider, value: unknown) {
  if (
    !isObject(value) ||
    Object.keys(value).some((key) => !['schema', 'provider', 'cases'].includes(key)) ||
    value.schema !== 'wholeloop/provider-fixtures@1' ||
    value.provider !== provider.manifest.id ||
    !Array.isArray(value.cases) ||
    !value.cases.length
  )
    throw new Error('Use a matching wholeloop/provider-fixtures@1 file')
  const cases = value.cases as unknown as FixtureCase[]
  const keys = new Set<string>()
  for (const entry of cases) {
    if (
      !isObject(entry) ||
      Object.keys(entry).some(
        (key) => !['key', 'operation', 'input', 'calls', 'result'].includes(key),
      ) ||
      typeof entry.key !== 'string' ||
      !entry.key.trim() ||
      keys.has(entry.key) ||
      typeof entry.operation !== 'string' ||
      !provider.manifest.operations[entry.operation] ||
      !isObject(entry.input) ||
      !Array.isArray(entry.calls) ||
      !entry.calls.length ||
      !isObject(entry.result)
    )
      throw new Error(
        'Each fixture needs a unique key, declared operation, input, expected calls and normalized result',
      )
    keys.add(entry.key)
    for (const call of entry.calls)
      if (
        !isObject(call) ||
        Object.keys(call).some((key) => !['tool', 'args', 'result'].includes(key)) ||
        typeof call.tool !== 'string' ||
        !isObject(call.args) ||
        !isObject(call.result)
      )
        throw new Error('Fixture calls need exact tool/args and normalized results')
  }
  if (
    Object.keys(provider.manifest.operations).some(
      (operation) => !cases.some((entry) => entry.operation === operation),
    )
  )
    throw new Error('Fixture coverage must include every declared provider operation')
  const results = []
  for (const entry of cases) {
    let cursor = 0
    try {
      const host = {
        invoke: async (call: { tool: string; args: Record<string, unknown> }) => {
          const expected = entry.calls[cursor++]
          if (
            !expected ||
            call.tool !== expected.tool ||
            !isDeepStrictEqual(call.args, expected.args)
          )
            throw new Error('Call binding mismatch')
          return structuredClone(expected.result)
        },
      }
      const result =
        entry.operation === 'docs.update'
          ? (
              await updateDocument(
                provider,
                String(entry.input.ref ?? ''),
                () => String(entry.input.body ?? ''),
                host,
              )
            ).result
          : await performOperation(provider, entry.operation, entry.input, host)
      if (cursor !== entry.calls.length || !isDeepStrictEqual(result, entry.result))
        throw new Error('Normalized result mismatch')
      results.push({ key: entry.key, operation: entry.operation, status: 'passed' })
    } catch {
      results.push({
        key: entry.key,
        operation: entry.operation,
        status: 'failed',
        reason: 'Fixture call/result contract mismatch; contents omitted',
      })
    }
  }
  return {
    schema: 'wholeloop/provider-test@1',
    provider: provider.manifest.id,
    mode: 'offline-fixtures',
    results,
    passed: results.every((entry) => entry.status === 'passed'),
    remoteProbed: false,
    limitations:
      'Synthetic normalized results verify declared bindings, not authentication, actual tools, permissions or server semantics.',
  }
}
