import { describe, expect, it, vi } from 'vitest'
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai'
import type { AssistantMessageEvent, Model, Provider } from '@earendil-works/pi-ai'
import {
  applyXaiResponsesPayload,
  wrapXaiResponsesProvider,
  XAI_SERVER_X_SEARCH_REJECT_NAMES,
} from '../src/responses.ts'
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

describe('reject names', () => {
  it('includes the live x_keyword_search name', () => {
    expect(XAI_SERVER_X_SEARCH_REJECT_NAMES).toContain('x_keyword_search')
  })
})
