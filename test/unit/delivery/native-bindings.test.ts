import { describe, expect, it } from 'vitest'
import { REFERENCE_NATIVE_VERSIONS } from '../../../src/delivery/native-adapters.js'
import {
  NATIVE_BINDINGS_DEFAULT,
  type NativeBindings,
  nativeBinding,
} from '../../../src/delivery/native-bindings.js'

const request = {
  target: 'codex',
  version: REFERENCE_NATIVE_VERSIONS.codex,
  model: 'reference-model',
  role: 'builder' as const,
}
const bound = (): NativeBindings => ({
  schema: 'wholeloop/native-bindings@1',
  bindings: [
    {
      target: 'codex',
      version: REFERENCE_NATIVE_VERSIONS.codex,
      model: 'reference-model',
      roles: ['builder', 'verifier'],
    },
  ],
})

describe('explicit trusted native bindings for unattended runs', () => {
  it('refuses every client under the conservative default', () => {
    for (const target of ['claude', 'codex'] as const)
      for (const role of ['builder', 'verifier', 'reviewer', 'planner'] as const)
        expect(
          nativeBinding(NATIVE_BINDINGS_DEFAULT, {
            target,
            version: REFERENCE_NATIVE_VERSIONS[target],
            model: 'reference-model',
            role,
          }),
        ).toEqual({ bound: false, reason: 'unbound-native-client' })
    expect(Object.isFrozen(NATIVE_BINDINGS_DEFAULT)).toBe(true)
  })
  it('binds only an exact pinned target, version, model and named role', () => {
    expect(nativeBinding(bound(), request)).toMatchObject({ bound: true })
    expect(nativeBinding(bound(), { ...request, role: 'verifier' })).toMatchObject({ bound: true })
  })
  it.each([
    [{ role: 'reviewer' as const }, 'unbound-native-client'],
    [{ model: 'other-model' }, 'unbound-native-client'],
    [{ target: 'claude', version: REFERENCE_NATIVE_VERSIONS.claude }, 'unbound-native-client'],
    [{ version: '0.0.1' }, 'unpinned-native-client'],
    [{ target: 'opencode' }, 'unpinned-native-client'],
    [{ target: 'unknown' }, 'unpinned-native-client'],
  ])('refuses %j', (patch, reason) => {
    expect(nativeBinding(bound(), { ...request, ...patch })).toEqual({ bound: false, reason })
  })
  it.each([
    [
      'sandbox relaxation',
      (value: NativeBindings) => Object.assign(entry(value), { sandbox: 'off' }),
    ],
    ['tool widening', (value: NativeBindings) => Object.assign(entry(value), { tools: ['shell'] })],
    ['wildcard model', (value: NativeBindings) => Object.assign(entry(value), { model: '*' })],
    ['unknown role', (value: NativeBindings) => Object.assign(entry(value), { roles: ['owner'] })],
    ['empty roles', (value: NativeBindings) => Object.assign(entry(value), { roles: [] })],
    ['duplicate binding', (value: NativeBindings) => value.bindings.push({ ...entry(value) })],
    ['extra field', (value: NativeBindings) => Object.assign(value, { trustAll: true })],
    [
      'other schema',
      (value: NativeBindings) => Object.assign(value, { schema: 'wholeloop/native-bindings@2' }),
    ],
  ])('refuses a document with %s instead of trusting more', (_name, mutate) => {
    const value = bound()
    mutate(value)
    expect(nativeBinding(value, request)).toEqual({ bound: false, reason: 'invalid-bindings' })
  })
})

function entry(value: NativeBindings) {
  const first = value.bindings[0]
  if (!first) throw new Error('Fixture binding required')
  return first
}
