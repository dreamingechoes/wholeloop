import { describe, expect, it } from 'vitest'
import { nativeOutputDiagnostic } from '../../../src/delivery/native-output-diagnostic.js'
import { WorkerProtocolError } from '../../../src/delivery/worker-protocol.js'

describe('bounded private native output diagnostics', () => {
  it('retains only a known protocol category and original digest bindings', () => {
    expect(
      nativeOutputDiagnostic(
        'a'.repeat(64),
        'b'.repeat(64),
        'proposal',
        new WorkerProtocolError('result-scope'),
      ),
    ).toEqual({
      schema: 'wholeloop/native-output-diagnostic@1',
      assignment: 'a'.repeat(64),
      stdout: 'b'.repeat(64),
      phase: 'proposal',
      problem: 'result-scope',
    })
  })
  it.each([
    new Error('UNTRUSTED_CANARY'),
    new WorkerProtocolError('UNTRUSTED_CANARY'),
    { problem: 'result-scope', message: 'UNTRUSTED_CANARY' },
  ])('never records arbitrary thrown text %#', (error) => {
    const value = nativeOutputDiagnostic('a'.repeat(64), 'b'.repeat(64), 'frame', error)
    expect(value.problem).toBe('unclassified')
    expect(JSON.stringify(value)).not.toContain('UNTRUSTED_CANARY')
    expect(Object.keys(value).sort()).toEqual([
      'assignment',
      'phase',
      'problem',
      'schema',
      'stdout',
    ])
  })
  it.each([
    ['../escape', 'b'.repeat(64)],
    ['a'.repeat(64), 'UNTRUSTED_CANARY'],
  ])('refuses unbound metadata %#', (assignment, stdout) =>
    expect(() => nativeOutputDiagnostic(assignment, stdout, 'proposal', new Error())).toThrow(
      'Invalid native diagnostic binding',
    ),
  )
})
