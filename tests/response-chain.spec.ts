import { describe, expect, it } from 'vitest'
import {
  applyStatefulContinuation,
  clientInputDelta,
  createMemoryResponseChainStore,
  extractClientInputItems,
  fingerprintInputItem,
  isClientOriginatedInputItem,
} from '../src/response-chain.ts'

describe('client input items', () => {
  it('keeps user, system, and function_call_output; drops model output', () => {
    const input = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'q1' },
      { type: 'reasoning', encrypted_content: 'x' },
      { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'a' }] },
      { type: 'web_search_call', id: 'ws' },
      { type: 'function_call_output', call_id: 'c1', output: 'ok' },
      { role: 'user', content: 'q2' },
    ]
    expect(input.filter(isClientOriginatedInputItem)).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'q1' },
      { type: 'function_call_output', call_id: 'c1', output: 'ok' },
      { role: 'user', content: 'q2' },
    ])
    expect(extractClientInputItems(input)).toHaveLength(4)
  })
})

describe('clientInputDelta', () => {
  it('returns the suffix when the previous fingerprints are a prefix', () => {
    const previous = [{ role: 'user', content: 'q1' }]
    const current = [{ role: 'user', content: 'q1' }, { role: 'user', content: 'q2' }]
    expect(clientInputDelta(previous.map(fingerprintInputItem), current)).toEqual({
      kind: 'delta',
      items: [{ role: 'user', content: 'q2' }],
    })
  })

  it('resets when history was compacted or edited', () => {
    const previous = [{ role: 'user', content: 'q1' }, { role: 'user', content: 'q2' }]
    const current = [{ role: 'user', content: 'q2' }]
    expect(clientInputDelta(previous.map(fingerprintInputItem), current)).toEqual({ kind: 'reset' })
  })

  it('resets on an empty suffix (same request)', () => {
    const items = [{ role: 'user', content: 'q1' }]
    expect(clientInputDelta(items.map(fingerprintInputItem), items)).toEqual({ kind: 'reset' })
  })
})

describe('applyStatefulContinuation', () => {
  it('sets store:true and omits previous_response_id on the first turn', () => {
    const store = createMemoryResponseChainStore()
    const next = applyStatefulContinuation(
      { model: 'grok-4.6', input: [{ role: 'user', content: 'q1' }] },
      { sessionId: 's1', modelId: 'grok-4.6', store },
    )
    expect(next.payload['store']).toBe(true)
    expect(next.payload['previous_response_id']).toBeUndefined()
    expect(next.usedPrevious).toBe(false)
    expect(next.payload['input']).toEqual([{ role: 'user', content: 'q1' }])
  })

  it('sends only the new client items on a matching continuation', () => {
    const first = [{ role: 'system', content: 'sys' }, { role: 'user', content: 'q1' }]
    const store = createMemoryResponseChainStore({
      s1: {
        responseId: 'resp-1',
        fingerprints: first.map(fingerprintInputItem),
        model: 'grok-4.6',
        updatedAt: 1,
        stopReason: 'stop',
      },
    })
    const next = applyStatefulContinuation(
      {
        model: 'grok-4.6',
        input: [
          ...first,
          { type: 'reasoning', encrypted_content: 'x' },
          { type: 'message', role: 'assistant', content: [] },
          { role: 'user', content: 'q2' },
        ],
      },
      { sessionId: 's1', modelId: 'grok-4.6', store },
    )
    expect(next.usedPrevious).toBe(true)
    expect(next.payload['previous_response_id']).toBe('resp-1')
    expect(next.payload['input']).toEqual([{ role: 'user', content: 'q2' }])
    expect(next.payload['store']).toBe(true)
  })

  it('does not chain on a same-turn tool follow-up (avoids reprinting search text)', () => {
    const first = [{ role: 'user', content: 'q1' }]
    const store = createMemoryResponseChainStore({
      s1: {
        responseId: 'resp-1',
        fingerprints: first.map(fingerprintInputItem),
        model: 'grok-4.6',
        updatedAt: 1,
        stopReason: 'toolUse',
      },
    })
    const next = applyStatefulContinuation(
      {
        model: 'grok-4.6',
        input: [
          ...first,
          { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'search writeup' }] },
          { type: 'function_call', name: 'x_keyword_search' },
          { type: 'function_call_output', call_id: 'c1', output: 'already ran' },
        ],
      },
      { sessionId: 's1', modelId: 'grok-4.6', store },
    )
    expect(next.usedPrevious).toBe(false)
    expect(next.payload['previous_response_id']).toBeUndefined()
    expect(next.payload['store']).toBe(true)
    expect(next.payload['input']).toEqual(expect.arrayContaining([
      { type: 'function_call_output', call_id: 'c1', output: 'already ran' },
    ]))
  })

  it('does not chain after toolUse even if a snapshot looks like a new user item', () => {
    const first = [{ role: 'user', content: 'q1' }]
    const store = createMemoryResponseChainStore({
      s1: {
        responseId: 'resp-1',
        fingerprints: first.map(fingerprintInputItem),
        model: 'grok-4.6',
        updatedAt: 1,
        stopReason: 'toolUse',
      },
    })
    const next = applyStatefulContinuation(
      {
        input: [
          ...first,
          { role: 'user', content: '<system-reminder>\nruntime snapshot\n' },
          { type: 'function_call_output', call_id: 'c1', output: 'already ran' },
        ],
      },
      { sessionId: 's1', modelId: 'grok-4.6', store },
    )
    expect(next.usedPrevious).toBe(false)
    expect(next.payload['previous_response_id']).toBeUndefined()
  })

  it('does not continue across models or when forceFullReplay is set', () => {
    const store = createMemoryResponseChainStore({
      s1: {
        responseId: 'resp-1',
        fingerprints: [fingerprintInputItem({ role: 'user', content: 'q1' })],
        model: 'grok-4.6',
        updatedAt: 1,
        stopReason: 'stop',
      },
    })
    const payload = {
      input: [{ role: 'user', content: 'q1' }, { role: 'user', content: 'q2' }],
    }
    const otherModel = applyStatefulContinuation(payload, {
      sessionId: 's1',
      modelId: 'grok-4.5',
      store,
    })
    expect(otherModel.usedPrevious).toBe(false)
    expect(otherModel.payload['input']).toEqual(payload.input)

    const forced = applyStatefulContinuation(payload, {
      sessionId: 's1',
      modelId: 'grok-4.6',
      store,
      forceFullReplay: true,
    })
    expect(forced.usedPrevious).toBe(false)
    expect(forced.payload['previous_response_id']).toBeUndefined()
  })
})
