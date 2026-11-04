import { describe, expect, it } from 'vitest'
import { nativeUsage } from '../../../src/delivery/native-adapters.js'

describe('client-reported native usage (ADR-0206)', () => {
  it("reads Claude's single JSON result, including its own cost estimate", () => {
    // Field names as Claude Code 2.1.316 reported them in a live turn.
    const stdout = JSON.stringify({
      type: 'result',
      is_error: false,
      total_cost_usd: 0.0257184,
      usage: {
        input_tokens: 4,
        cache_creation_input_tokens: 2314,
        cache_read_input_tokens: 8252,
        output_tokens: 277,
      },
      structured_output: {},
    })
    expect(nativeUsage('claude', stdout)).toEqual({
      provenance: 'client-reported',
      inputTokens: 4,
      outputTokens: 277,
      cacheReadTokens: 8252,
      cacheCreationTokens: 2314,
      costMicros: 25718,
    })
  })
  it('sums Codex turn.completed events and ignores other lines', () => {
    const stdout = [
      JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: '{}' } }),
      JSON.stringify({
        type: 'turn.completed',
        usage: { input_tokens: 100, cached_input_tokens: 40, output_tokens: 7 },
      }),
      JSON.stringify({
        type: 'turn.completed',
        usage: { input_tokens: 50, cached_input_tokens: 0, output_tokens: 3 },
      }),
    ].join('\n')
    expect(nativeUsage('codex', stdout)).toEqual({
      provenance: 'client-reported',
      inputTokens: 150,
      outputTokens: 10,
      cacheReadTokens: 40,
      cacheCreationTokens: 0,
    })
  })
  it('reports nothing rather than guessing from malformed or unknown output', () => {
    expect(nativeUsage('claude', 'not json')).toBeUndefined()
    expect(nativeUsage('claude', JSON.stringify({ result: 'no usage' }))).toBeUndefined()
    expect(nativeUsage('codex', '{"type":"turn.completed"')).toBeUndefined()
    expect(nativeUsage('opencode', '{}')).toBeUndefined()
    expect(
      nativeUsage('claude', JSON.stringify({ usage: { input_tokens: -5, output_tokens: 1.5 } })),
    ).toMatchObject({ inputTokens: 0, outputTokens: 0 })
  })
})
