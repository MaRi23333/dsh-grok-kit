import { describe, expect, it, vi } from 'vitest'
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai'
import type { AssistantMessageEvent, Model, Provider } from '@earendil-works/pi-ai'
import {
  applyXaiResponsesPayload,
  isPreviousResponseError,
  stripRejectToolCalls,
  wrapXaiResponsesProvider,
  XAI_SERVER_X_SEARCH_REJECT_NAMES,
} from '../src/responses.ts'
import { createMemoryResponseChainStore, fingerprintInputItem } from '../src/response-chain.ts'
import { GROK_46_MODEL } from '../src/catalog.ts'
import type { XaiOAuthTokenSource } from '../src/token-source.ts'

const completions = { api: 'openai-completions' as const, id: 'grok-build-0.1' }

function errorEvent(message: string): AssistantMessageEvent {
  return {
    type: 'error',
    reason: 'error',
    error: {
      role: 'assistant',
      content: [],
      api: 'openai-responses',
      provider: 'xai-oauth',
      model: 'grok-4.6',
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: 'error',
      timestamp: Date.now(),
      errorMessage: message,
    },
  }
}

function doneEvent(): AssistantMessageEvent {
  const error = errorEvent('x')
  if (error.type !== 'error') throw new Error('unreachable')
  return {
    type: 'done',
    reason: 'stop',
    message: { ...error.error, stopReason: 'stop', errorMessage: undefined },
  }
}

describe('applyXaiResponsesPayload', () => {
  it('never returns undefined and leaves completions untouched', () => {
    const payload = { model: 'grok-build-0.1' }
    expect(applyXaiResponsesPayload(payload, completions, { backendSearch: false, retry401: false })).toBe(payload)
  })

  it('adds encrypted_content include and default high effort', () => {
    const next = applyXaiResponsesPayload({ model: 'grok-4.6' }, GROK_46_MODEL, {
      backendSearch: false,
      retry401: false,
    }) as Record<string, unknown>
    expect(next).not.toBeUndefined()
    expect(next['include']).toEqual(['reasoning.encrypted_content'])
    expect(next['reasoning']).toEqual({ effort: 'high', summary: 'auto' })
    expect(next['tools']).toBeUndefined()
  })

  it('keeps existing include entries and does not override an existing effort', () => {
    const next = applyXaiResponsesPayload({
      include: ['no_inline_citations'],
      reasoning: { effort: 'xhigh', summary: 'detailed' },
    }, GROK_46_MODEL, { backendSearch: false, retry401: false }) as Record<string, unknown>
    expect(next['include']).toEqual(['no_inline_citations', 'reasoning.encrypted_content'])
    expect(next['reasoning']).toEqual({ effort: 'xhigh', summary: 'detailed' })
  })

  it('skipDefaultHigh does not fill effort', () => {
    const next = applyXaiResponsesPayload({ model: 'grok-4.6' }, GROK_46_MODEL, {
      backendSearch: false,
      retry401: false,
      skipDefaultHigh: true,
    }) as Record<string, unknown>
    expect(next['include']).toEqual(['reasoning.encrypted_content'])
    expect(next['reasoning']).toBeUndefined()
  })

  it('does not append server tools when backendSearch is false', () => {
    const next = applyXaiResponsesPayload({
      tools: [{ type: 'function', name: 'bash' }],
    }, GROK_46_MODEL, { backendSearch: false, retry401: false }) as Record<string, unknown>
    expect(next['tools']).toEqual([{ type: 'function', name: 'bash' }])
  })

  it('strips reject names then appends server-side search tools', () => {
    const next = applyXaiResponsesPayload({
      tools: [
        { type: 'function', name: 'bash' },
        { type: 'function', name: 'x_keyword_search' },
      ],
    }, GROK_46_MODEL, { backendSearch: true, retry401: false }) as Record<string, unknown>
    expect(next['tools']).toEqual([
      { type: 'function', name: 'bash' },
      { type: 'web_search' },
      { type: 'x_search' },
    ])
    expect((next['tools'] as unknown[]).some(tool =>
      typeof tool === 'object' && tool !== null && (tool as { name?: string }).name === 'x_keyword_search',
    )).toBe(false)
  })

  it('strips DSH native web_search function so it does not collide with the builtin', () => {
    const next = applyXaiResponsesPayload({
      tools: [
        { type: 'function', name: 'bash' },
        { type: 'function', name: 'web_search' },
        { type: 'function', name: 'x_search' },
        { type: 'function', name: 'grok_web_search' },
      ],
    }, GROK_46_MODEL, { backendSearch: true, retry401: false }) as Record<string, unknown>
    expect(next['tools']).toEqual([
      { type: 'function', name: 'bash' },
      { type: 'web_search' },
      { type: 'x_search' },
    ])
  })

  it('does not duplicate server-side tools already present', () => {
    const next = applyXaiResponsesPayload({
      tools: [{ type: 'web_search' }],
    }, GROK_46_MODEL, { backendSearch: true, retry401: false }) as Record<string, unknown>
    expect(next['tools']).toEqual([{ type: 'web_search' }, { type: 'x_search' }])
  })

  it('strips colliding names in nested-function and custom shapes too', () => {
    const next = applyXaiResponsesPayload({
      tools: [
        { type: 'function', function: { name: 'web_search' } },
        { type: 'custom', name: 'x_search' },
        { type: 'function', name: 'grok_web_search' },
        { type: 'function', function: { name: 'bash' } },
      ],
    }, GROK_46_MODEL, { backendSearch: true, retry401: false }) as Record<string, unknown>
    expect(next['tools']).toEqual([
      { type: 'function', function: { name: 'bash' } },
      { type: 'web_search' },
      { type: 'x_search' },
    ])
  })
})

describe('wrapXaiResponsesProvider 401', () => {
  it('retries once on HTTP 401 before forwarding start or error', async () => {
    const refresh = vi.fn(async () => 'new-token')
    const tokens: XaiOAuthTokenSource = { available: () => true, resolve: async () => 'old', refresh }
    const calls: Array<string | undefined> = []
    const inner: Provider = {
      id: 'xai-oauth',
      name: 'x',
      auth: { apiKey: { name: 't', resolve: async () => undefined } },
      getModels: () => [],
      stream: () => createAssistantMessageEventStream(),
      streamSimple(_model, _ctx, options) {
        calls.push(options?.apiKey)
        const stream = createAssistantMessageEventStream()
        queueMicrotask(() => {
          if (options?.apiKey === 'old') stream.push(errorEvent('OpenAI API error (401): expired'))
          else {
            const done = doneEvent()
            if (done.type === 'done') stream.push({ type: 'start', partial: done.message })
            stream.push(done)
          }
          stream.end()
        })
        return stream
      },
    }
    const wrapped = wrapXaiResponsesProvider(inner, { backendSearch: false, retry401: true, tokenSource: tokens })
    const events: AssistantMessageEvent[] = []
    for await (const event of wrapped.streamSimple(GROK_46_MODEL as Model<'openai-responses'>, { messages: [] }, { apiKey: 'old' })) {
      events.push(event)
    }
    expect(refresh).toHaveBeenCalledOnce()
    expect(calls).toEqual(['old', 'new-token'])
    expect(events[0]?.type).not.toBe('error')
    expect(events.some(event => event.type === 'done')).toBe(true)
  })

  it('does not retry HTTP 403', async () => {
    const refresh = vi.fn(async () => 'new-token')
    const tokens: XaiOAuthTokenSource = { available: () => true, resolve: async () => 'old', refresh }
    const inner: Provider = {
      id: 'xai-oauth',
      name: 'x',
      auth: { apiKey: { name: 't', resolve: async () => undefined } },
      getModels: () => [],
      stream: () => createAssistantMessageEventStream(),
      streamSimple() {
        const stream = createAssistantMessageEventStream()
        queueMicrotask(() => {
          stream.push(errorEvent('OpenAI API error (403): no'))
          stream.end()
        })
        return stream
      },
    }
    const wrapped = wrapXaiResponsesProvider(inner, { backendSearch: true, retry401: true, tokenSource: tokens })
    const events: AssistantMessageEvent[] = []
    for await (const event of wrapped.streamSimple(GROK_46_MODEL as Model<'openai-responses'>, { messages: [] }, { apiKey: 'old' })) {
      events.push(event)
    }
    expect(refresh).not.toHaveBeenCalled()
    expect(events[0]?.type).toBe('error')
    if (events[0]?.type === 'error') {
      expect(events[0].error.errorMessage).toMatch(/backendSearch: false/)
    }
  })
})

describe('stripRejectToolCalls', () => {
  it('removes x_keyword_search and turns a stub-only toolUse into stop', () => {
    const done = doneEvent()
    if (done.type !== 'done') throw new Error('unreachable')
    const stripped = stripRejectToolCalls({
      ...done.message,
      stopReason: 'toolUse',
      content: [
        { type: 'text', text: 'search writeup' },
        { type: 'toolCall', id: 'xs|ctc', name: 'x_keyword_search', arguments: {} },
      ],
    })
    expect(stripped.stopReason).toBe('stop')
    expect(stripped.content).toEqual([{ type: 'text', text: 'search writeup' }])
  })

  it('keeps real tools and toolUse when bash remains', () => {
    const done = doneEvent()
    if (done.type !== 'done') throw new Error('unreachable')
    const stripped = stripRejectToolCalls({
      ...done.message,
      stopReason: 'toolUse',
      content: [
        { type: 'toolCall', id: 'a|fc', name: 'pwsh', arguments: {} },
        { type: 'toolCall', id: 'b|ctc', name: 'x_keyword_search', arguments: {} },
      ],
    })
    expect(stripped.stopReason).toBe('toolUse')
    expect(stripped.content).toEqual([{ type: 'toolCall', id: 'a|fc', name: 'pwsh', arguments: {} }])
  })

  it('drops reject-tool start/delta/end events (name present from toolcall_start)', async () => {
    const inner: Provider = {
      id: 'xai-oauth',
      name: 'x',
      auth: { apiKey: { name: 't', resolve: async () => undefined } },
      getModels: () => [],
      stream: () => createAssistantMessageEventStream(),
      streamSimple() {
        const stream = createAssistantMessageEventStream()
        queueMicrotask(() => {
          const done = doneEvent()
          if (done.type !== 'done') throw new Error('unreachable')
          const partial = {
            ...done.message,
            stopReason: 'toolUse' as const,
            content: [
              { type: 'toolCall' as const, id: 'xs|ctc', name: 'x_keyword_search', arguments: { input: '' } },
            ],
          }
          stream.push({ type: 'start', partial })
          stream.push({ type: 'toolcall_start', contentIndex: 0, partial })
          stream.push({ type: 'toolcall_delta', contentIndex: 0, delta: '{"input":"q"}', partial })
          stream.push({ type: 'toolcall_end', contentIndex: 0, toolCall: partial.content[0] as never, partial })
          stream.push({ type: 'done', reason: 'toolUse', message: partial })
          stream.end()
        })
        return stream
      },
    }
    const wrapped = wrapXaiResponsesProvider(inner, { backendSearch: true, retry401: false })
    const events: AssistantMessageEvent[] = []
    for await (const event of wrapped.streamSimple(GROK_46_MODEL as Model<'openai-responses'>, { messages: [] })) {
      events.push(event)
    }
    expect(events.some(event => event.type === 'toolcall_start')).toBe(false)
    expect(events.some(event => event.type === 'toolcall_delta')).toBe(false)
    expect(events.some(event => event.type === 'toolcall_end')).toBe(false)
    const doneResult = events.find(event => event.type === 'done')
    if (doneResult?.type === 'done') {
      expect(doneResult.message.stopReason).toBe('stop')
      expect(doneResult.reason).toBe('stop')
      expect(doneResult.message.content.some(block => block.type === 'toolCall')).toBe(false)
    }
  })
})

describe('wrap drops reject-tool events so DSH does not start a reprint step', () => {
  it('forwards stop instead of toolUse when the only tool is x_keyword_search', async () => {
    const inner: Provider = {
      id: 'xai-oauth',
      name: 'x',
      auth: { apiKey: { name: 't', resolve: async () => undefined } },
      getModels: () => [],
      stream: () => createAssistantMessageEventStream(),
      streamSimple() {
        const stream = createAssistantMessageEventStream()
        queueMicrotask(() => {
          const done = doneEvent()
          if (done.type !== 'done') throw new Error('unreachable')
          const partial = {
            ...done.message,
            stopReason: 'toolUse' as const,
            content: [
              { type: 'text' as const, text: 'writeup' },
              { type: 'toolCall' as const, id: 'xs|ctc', name: 'x_keyword_search', arguments: {} },
            ],
          }
          stream.push({ type: 'start', partial })
          stream.push({ type: 'toolcall_end', contentIndex: 1, toolCall: partial.content[1] as never, partial })
          stream.push({ type: 'done', reason: 'toolUse', message: partial })
          stream.end()
        })
        return stream
      },
    }
    const wrapped = wrapXaiResponsesProvider(inner, { backendSearch: true, retry401: false })
    const events: AssistantMessageEvent[] = []
    for await (const event of wrapped.streamSimple(GROK_46_MODEL as Model<'openai-responses'>, { messages: [] })) {
      events.push(event)
    }
    expect(events.some(event => event.type === 'toolcall_end')).toBe(false)
    const done = events.find(event => event.type === 'done')
    expect(done?.type).toBe('done')
    if (done?.type === 'done') {
      expect(done.message.stopReason).toBe('stop')
      expect(done.reason).toBe('stop')
      expect(done.message.content.some(block => block.type === 'toolCall')).toBe(false)
    }
  })

  it('keeps a same-named real tool when backendSearch is off even if stateful continuation is on', async () => {
    const inner: Provider = {
      id: 'xai-oauth',
      name: 'x',
      auth: { apiKey: { name: 't', resolve: async () => undefined } },
      getModels: () => [],
      stream: () => createAssistantMessageEventStream(),
      streamSimple() {
        const stream = createAssistantMessageEventStream()
        queueMicrotask(() => {
          const done = doneEvent()
          if (done.type !== 'done') throw new Error('unreachable')
          const partial = {
            ...done.message,
            stopReason: 'toolUse' as const,
            content: [
              { type: 'text' as const, text: 'calling search' },
              { type: 'toolCall' as const, id: 'xs|ctc', name: 'x_keyword_search', arguments: { input: 'q' } },
            ],
          }
          stream.push({ type: 'start', partial })
          stream.push({ type: 'toolcall_start', contentIndex: 1, partial })
          stream.push({ type: 'toolcall_delta', contentIndex: 1, delta: '{"input":"q"}', partial })
          stream.push({ type: 'toolcall_end', contentIndex: 1, toolCall: partial.content[1] as never, partial })
          stream.push({ type: 'done', reason: 'toolUse', message: partial })
          stream.end()
        })
        return stream
      },
    }
    const wrapped = wrapXaiResponsesProvider(inner, {
      backendSearch: false,
      retry401: false,
      statefulResponses: true,
      chainStore: createMemoryResponseChainStore(),
    })
    const events: AssistantMessageEvent[] = []
    for await (const event of wrapped.streamSimple(
      GROK_46_MODEL as Model<'openai-responses'>,
      { messages: [] },
      { sessionId: 'sess-real-tool' },
    )) {
      events.push(event)
    }
    expect(events.some(event => event.type === 'toolcall_start')).toBe(true)
    expect(events.some(event => event.type === 'toolcall_delta')).toBe(true)
    expect(events.some(event => event.type === 'toolcall_end')).toBe(true)
    const done = events.find(event => event.type === 'done')
    expect(done?.type).toBe('done')
    if (done?.type === 'done') {
      expect(done.reason).toBe('toolUse')
      expect(done.message.stopReason).toBe('toolUse')
      expect(done.message.content.some(block => block.type === 'toolCall' && block.name === 'x_keyword_search')).toBe(true)
    }
  })
})

describe('reject names', () => {
  it('includes the live x_keyword_search name', () => {
    expect(XAI_SERVER_X_SEARCH_REJECT_NAMES).toContain('x_keyword_search')
  })
})

describe('stateful continuation wrap', () => {
  it('stores the first turn then sends only the new user item', async () => {
    const payloads: unknown[] = []
    const inner: Provider = {
      id: 'xai-oauth',
      name: 'x',
      auth: { apiKey: { name: 't', resolve: async () => undefined } },
      getModels: () => [],
      stream: () => createAssistantMessageEventStream(),
      streamSimple(_model, _ctx, options) {
        const stream = createAssistantMessageEventStream()
        const input = payloads.length === 0
          ? [{ role: 'user', content: 'q1' }]
          : [
            { role: 'user', content: 'q1' },
            { type: 'reasoning', encrypted_content: 'sig' },
            { type: 'message', role: 'assistant', content: [] },
            { role: 'user', content: 'q2' },
          ]
        void Promise.resolve(options?.onPayload?.({ model: 'grok-4.6', input }, GROK_46_MODEL)).then(result => {
          payloads.push(result ?? { input })
          const done = doneEvent()
          if (done.type === 'done') {
            done.message.responseId = payloads.length === 1 ? 'resp-1' : 'resp-2'
            stream.push({ type: 'start', partial: done.message })
            stream.push(done)
          }
          stream.end()
        })
        return stream
      },
    }
    const wrapped = wrapXaiResponsesProvider(inner, {
      backendSearch: true,
      retry401: false,
      statefulResponses: true,
      chainStore: createMemoryResponseChainStore(),
    })
    const consume = async () => {
      for await (const event of wrapped.streamSimple(
        GROK_46_MODEL as Model<'openai-responses'>,
        { messages: [] },
        { sessionId: 'sess-1' },
      )) {
        void event
      }
    }
    await consume()
    await consume()
    const first = payloads[0] as Record<string, unknown>
    const second = payloads[1] as Record<string, unknown>
    expect(first['store']).toBe(true)
    expect(first['previous_response_id']).toBeUndefined()
    expect(second['store']).toBe(true)
    expect(second['previous_response_id']).toBe('resp-1')
    expect(second['input']).toEqual([{ role: 'user', content: 'q2' }])
  })

  it('does not set previous_response_id for a same-turn tool follow-up', async () => {
    const payloads: unknown[] = []
    const store = createMemoryResponseChainStore()
    const inner: Provider = {
      id: 'xai-oauth',
      name: 'x',
      auth: { apiKey: { name: 't', resolve: async () => undefined } },
      getModels: () => [],
      stream: () => createAssistantMessageEventStream(),
      streamSimple(_model, _ctx, options) {
        const stream = createAssistantMessageEventStream()
        const input = payloads.length === 0
          ? [{ role: 'user', content: 'q1' }]
          : [
            { role: 'user', content: 'q1' },
            { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'writeup' }] },
            { type: 'function_call', name: 'x_keyword_search' },
            { type: 'function_call_output', call_id: 'c1', output: 'already ran' },
          ]
        void Promise.resolve(options?.onPayload?.({ model: 'grok-4.6', input }, GROK_46_MODEL)).then(result => {
          payloads.push(result ?? { input })
          const done = doneEvent()
          if (done.type === 'done') {
            done.message.responseId = `resp-${payloads.length}`
            stream.push({ type: 'start', partial: done.message })
            stream.push(done)
          }
          stream.end()
        })
        return stream
      },
    }
    const wrapped = wrapXaiResponsesProvider(inner, {
      backendSearch: true,
      retry401: false,
      statefulResponses: true,
      chainStore: store,
    })
    for (let index = 0; index < 2; index += 1) {
      for await (const event of wrapped.streamSimple(
        GROK_46_MODEL as Model<'openai-responses'>,
        { messages: [] },
        { sessionId: 'sess-tool' },
      )) {
        void event
      }
    }
    expect((payloads[1] as Record<string, unknown>)['previous_response_id']).toBeUndefined()
    expect((payloads[1] as Record<string, unknown>)['store']).toBe(true)
  })

  it('retries once without previous_response_id after a 400 pairing error', async () => {
    const payloads: unknown[] = []
    let calls = 0
    const store = createMemoryResponseChainStore()
    store.set('sess-1', {
      responseId: 'stale',
      fingerprints: [fingerprintInputItem({ role: 'user', content: 'q1' })],
      model: 'grok-4.6',
      updatedAt: 1,
      stopReason: 'stop',
    })
    const inner: Provider = {
      id: 'xai-oauth',
      name: 'x',
      auth: { apiKey: { name: 't', resolve: async () => undefined } },
      getModels: () => [],
      stream: () => createAssistantMessageEventStream(),
      streamSimple(_model, _ctx, options) {
        const stream = createAssistantMessageEventStream()
        void Promise.resolve(options?.onPayload?.({
          model: 'grok-4.6',
          input: [{ role: 'user', content: 'q1' }, { role: 'user', content: 'q2' }],
        }, GROK_46_MODEL)).then(result => {
          payloads.push(result)
          calls += 1
          const usedPrevious = typeof (result as { previous_response_id?: string } | undefined)?.previous_response_id === 'string'
          queueMicrotask(() => {
            if (usedPrevious) {
              stream.push(errorEvent('OpenAI API error (400): previous_response_id not found'))
            } else {
              const done = doneEvent()
              if (done.type === 'done') {
                done.message.responseId = 'resp-fresh'
                stream.push({ type: 'start', partial: done.message })
                stream.push(done)
              }
            }
            stream.end()
          })
        })
        return stream
      },
    }
    const wrapped = wrapXaiResponsesProvider(inner, {
      backendSearch: true,
      retry401: false,
      statefulResponses: true,
      chainStore: store,
    })
    const events: AssistantMessageEvent[] = []
    for await (const event of wrapped.streamSimple(
      GROK_46_MODEL as Model<'openai-responses'>,
      { messages: [] },
      { sessionId: 'sess-1' },
    )) {
      events.push(event)
    }
    expect(calls).toBe(2)
    expect((payloads[0] as Record<string, unknown>)['previous_response_id']).toBe('stale')
    expect((payloads[1] as Record<string, unknown>)['previous_response_id']).toBeUndefined()
    expect(events.some(event => event.type === 'done')).toBe(true)
    expect(isPreviousResponseError(errorEvent('OpenAI API error (400): previous_response_id not found'))).toBe(true)
  })

  it('replays the full request with the refreshed key after 401 then previous_response 400', async () => {
    const refresh = vi.fn(async () => 'new-token')
    const tokens: XaiOAuthTokenSource = { available: () => true, resolve: async () => 'old', refresh }
    const calls: Array<string | undefined> = []
    const payloads: unknown[] = []
    const store = createMemoryResponseChainStore({
      'sess-1': {
        responseId: 'resp-1',
        fingerprints: [fingerprintInputItem({ role: 'user', content: 'q1' })],
        model: 'grok-4.6',
        updatedAt: Date.now(),
        stopReason: 'stop',
      },
    })
    const inner: Provider = {
      id: 'xai-oauth',
      name: 'x',
      auth: { apiKey: { name: 't', resolve: async () => undefined } },
      getModels: () => [],
      stream: () => createAssistantMessageEventStream(),
      streamSimple(_model, _ctx, options) {
        calls.push(options?.apiKey)
        const stream = createAssistantMessageEventStream()
        queueMicrotask(() => {
          if (calls.length === 1) {
            // First call: chained request (previous_response_id + new user).
            void Promise.resolve(options?.onPayload?.(
              { model: 'grok-4.6', input: [{ role: 'user', content: 'q1' }, { role: 'user', content: 'q2' }] },
              GROK_46_MODEL,
            )).then(() => {
              stream.push(errorEvent('OpenAI API error (401): expired'))
              stream.end()
            })
            return
          }
          if (calls.length === 2) {
            stream.push(errorEvent('OpenAI API error (400): previous response id (resp-1) not found'))
            stream.end()
            return
          }
          void Promise.resolve(options?.onPayload?.(
            { model: 'grok-4.6', input: [{ role: 'user', content: 'q1' }, { role: 'user', content: 'q2' }] },
            GROK_46_MODEL,
          )).then(result => {
            payloads.push(result ?? {})
            const done = doneEvent()
            if (done.type === 'done') stream.push({ type: 'start', partial: done.message })
            stream.push(done)
            stream.end()
          })
        })
        return stream
      },
    }
    const wrapped = wrapXaiResponsesProvider(inner, {
      backendSearch: false,
      retry401: true,
      tokenSource: tokens,
      statefulResponses: true,
      chainStore: store,
    })
    const events: AssistantMessageEvent[] = []
    for await (const event of wrapped.streamSimple(
      GROK_46_MODEL as Model<'openai-responses'>,
      { messages: [] },
      { apiKey: 'old', sessionId: 'sess-1' },
    )) {
      events.push(event)
    }
    // platform GROK-RETRY-001: the full replay must use the REFRESHED key,
    // not the rejected 'old' one, and must drop previous_response_id.
    expect(refresh).toHaveBeenCalledOnce()
    expect(calls).toEqual(['old', 'new-token', 'new-token'])
    expect((payloads[0] as Record<string, unknown>)['previous_response_id']).toBeUndefined()
    expect(store.get('sess-1')).toBeUndefined()
    expect(events.some(event => event.type === 'done')).toBe(true)
  })
})

