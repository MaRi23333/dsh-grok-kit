import { describe, expect, it, vi } from 'vitest'
import { createAssistantMessageEventStream, type AssistantMessageEvent, type Provider } from '@earendil-works/pi-ai'
import { GROK_46_MODEL } from '../src/catalog.ts'
import { createMemoryResponseChainStore } from '../src/response-chain.ts'
import { wrapXaiResponsesProvider } from '../src/responses.ts'
import { SessionSearchPolicy, withSearchRequest } from '../src/session-search-policy.ts'
import { createXaiOAuthAdapter } from '../src/adapter.ts'
import { XaiOAuthSession } from '../src/session.ts'

function terminal(responseId = 'response'): AssistantMessageEvent {
  return { type: 'done', reason: 'stop', message: {
    role: 'assistant', content: [{ type: 'text', text: 'answer' }], api: 'openai-responses',
    provider: 'xai-oauth', model: GROK_46_MODEL.id, responseId, timestamp: 1, stopReason: 'stop',
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
  } }
}
const clientSearch = { type: 'function', name: 'web_search' }
const fetchTool = { type: 'function', name: 'web_fetch' }
const tools = [clientSearch, fetchTool, { type: 'web_search' }, { type: 'x_search' }]
type StreamOptions = Parameters<Provider['streamSimple']>[2]

function fixture(onRequest: (options: StreamOptions) => Promise<AssistantMessageEvent>) {
  const stream: Provider['streamSimple'] = (_model, _context, options) => {
    const out = createAssistantMessageEventStream()
    void onRequest(options).then(event => { out.push(event); out.end() })
    return out
  }
  return { id: 'xai-oauth', name: 'fixture', auth: {}, getModels: () => [], stream, streamSimple: stream } as Provider
}

async function consume(provider: Provider, sessionId: string) {
  const events: AssistantMessageEvent[] = []
  const stream = provider.streamSimple(GROK_46_MODEL, { messages: [] } as unknown as Parameters<Provider['streamSimple']>[1], { sessionId, apiKey: 'old' })
  for await (const event of stream) events.push(event)
  return events
}

describe('per-session search reaches actual Responses payloads', () => {
  it('isolates concurrent on/off requests and preserves the global default for unbound callers', async () => {
    const policy = new SessionSearchPolicy(), payloads = new Map<string, unknown>()
    policy.bindSession('qq', {}, () => true)
    policy.bindSession('tg', {}, () => false)
    const inner = fixture(async options => {
      const payload = await options?.onPayload?.({ tools }, GROK_46_MODEL)
      payloads.set(options?.sessionId ?? '', payload)
      return terminal()
    })
    const provider = wrapXaiResponsesProvider(inner, {
      backendSearch: true, retry401: false, resolveBackendSearch: id => policy.resolve(id),
    })
    await Promise.all(['qq', 'tg', 'desktop'].map(id => consume(provider, id)))
    expect(payloads.get('qq')).toMatchObject({ tools: [fetchTool, { type: 'web_search' }, { type: 'x_search' }] })
    expect(payloads.get('tg')).toMatchObject({ tools: [clientSearch, fetchTool] })
    expect(payloads.get('desktop')).toMatchObject({ tools: [fetchTool, { type: 'web_search' }, { type: 'x_search' }] })
  })

  it('explicit on overrides global off and auxiliary requests with the same ID stay off', async () => {
    const policy = new SessionSearchPolicy(), payloads: unknown[] = []
    policy.bindSession('qq', {}, () => true)
    const provider = wrapXaiResponsesProvider(fixture(async options => {
      payloads.push(await options?.onPayload?.({ tools }, GROK_46_MODEL))
      return terminal()
    }), { backendSearch: false, retry401: false, resolveBackendSearch: id => policy.resolve(id) })
    const generate = (purpose?: 'compaction') => withSearchRequest({ sessionId: 'qq', purpose }, async function* () {
      yield await consume(provider, 'qq')
    })
    for await (const _ of generate()) { /* consume lazy request */ }
    for await (const _ of generate('compaction')) { /* consume auxiliary request */ }
    expect(payloads[0]).toMatchObject({ tools: [fetchTool, { type: 'web_search' }, { type: 'x_search' }] })
    expect(payloads[1]).toMatchObject({ tools: [clientSearch, fetchTool] })
  })

  it('freezes the search mode across a 401 retry and sanitizes server X calls using that mode', async () => {
    let enabled = true
    const payloads: unknown[] = [], resolve = vi.fn(() => enabled)
    const inner = fixture(async options => {
      payloads.push(await options?.onPayload?.({ tools }, GROK_46_MODEL))
      const event = terminal()
      if (event.type !== 'done') throw new Error('unreachable')
      if (options?.apiKey === 'old') return { type: 'error', reason: 'error', error: {
        ...event.message, stopReason: 'error', errorMessage: 'HTTP 401',
      } }
      return { ...event, reason: 'toolUse', message: { ...event.message, stopReason: 'toolUse', content: [
        { type: 'text', text: 'answer' }, { type: 'toolCall', id: 'x', name: 'x_keyword_search', arguments: {} },
      ] } }
    })
    const provider = wrapXaiResponsesProvider(inner, {
      backendSearch: false, retry401: true, resolveBackendSearch: resolve,
      tokenSource: { available: () => true, resolve: async () => 'old', refresh: async () => { enabled = false; return 'new' } },
    })
    const events = await consume(provider, 'qq')
    expect(resolve).toHaveBeenCalledTimes(1)
    expect(payloads).toHaveLength(2)
    for (const payload of payloads) expect(payload).toMatchObject({ tools: [fetchTool, { type: 'web_search' }, { type: 'x_search' }] })
    expect(events).toEqual([expect.objectContaining({ type: 'done', reason: 'stop', message: expect.objectContaining({
      content: [{ type: 'text', text: 'answer' }], stopReason: 'stop',
    }) })])
  })

  it('does not continue an on-mode server response after the switch changes to off', async () => {
    let enabled = true, turn = 0
    const payloads: Array<Record<string, unknown>> = []
    const provider = wrapXaiResponsesProvider(fixture(async options => {
      turn++
      payloads.push(await options?.onPayload?.({ tools, input: Array.from({ length: turn }, (_, i) => ({ role: 'user', content: `q${i}` })) }, GROK_46_MODEL) as Record<string, unknown>)
      return terminal(`response-${turn}`)
    }), { backendSearch: true, retry401: false, resolveBackendSearch: () => enabled,
      statefulResponses: true, chainStore: createMemoryResponseChainStore() })
    await consume(provider, 'qq')
    enabled = false
    await consume(provider, 'qq')
    await consume(provider, 'qq')
    expect(payloads[1]?.['previous_response_id']).toBeUndefined()
    expect(payloads[2]?.['previous_response_id']).toBe('response-2')
    expect(payloads[2]?.['tools']).toEqual([clientSearch, fetchTool])
  })

  it('carries auxiliary purpose through the real PiAiAdapter direct and prepared streams', async () => {
    const policy = new SessionSearchPolicy(), payloads: Array<Record<string, unknown>> = []
    policy.bindSession('qq', {}, () => true)
    const inner = fixture(async options => {
      payloads.push(await options?.onPayload?.({ tools: [] }, GROK_46_MODEL) as Record<string, unknown>)
      return terminal()
    })
    const provider = wrapXaiResponsesProvider({ ...inner,
      getModels: () => [{ ...GROK_46_MODEL, provider: 'xai-oauth' }],
      auth: { apiKey: { name: 'test', resolve: async () => ({ auth: { apiKey: 'synthetic' }, source: 'test' }) } },
    }, { backendSearch: false, retry401: false, resolveBackendSearch: id => policy.resolve(id) })
    const session = new XaiOAuthSession()
    session.provider = () => provider
    const adapter = createXaiOAuthAdapter(session, () => undefined)
    const prepared = await adapter.prepareCall('xai-oauth', GROK_46_MODEL.id)
    const request = { provider: 'xai-oauth', model: GROK_46_MODEL.id, sessionId: 'qq', messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }] }
    for (const [source, auxiliary] of [[adapter, false], [prepared, true], [adapter, true], [prepared, false]] as const) {
      for await (const _ of source.stream({ ...request, ...auxiliary ? { purpose: 'compaction' } : {} } as never)) { /* consume actual adapter */ }
    }
    expect(payloads.map(payload => payload['tools'])).toEqual([
      [{ type: 'web_search' }, { type: 'x_search' }], [], [], [{ type: 'web_search' }, { type: 'x_search' }],
    ])
  })

  it.each([true, false])('replays complete history when toggling away from and back to %s', async initial => {
    let enabled = initial, turn = 0
    const payloads: Array<Record<string, unknown>> = [], history: unknown[] = []
    const store = createMemoryResponseChainStore()
    const provider = wrapXaiResponsesProvider(fixture(async options => {
      turn++
      history.push({ role: 'user', content: `q${turn}` })
      payloads.push(await options?.onPayload?.({ tools, input: [...history] }, GROK_46_MODEL) as Record<string, unknown>)
      history.push({ role: 'assistant', content: `a${turn}` })
      return terminal(`r${turn}`)
    }), { backendSearch: true, retry401: false, resolveBackendSearch: () => enabled,
      statefulResponses: true, chainStore: store })
    await consume(provider, 'qq')
    enabled = !initial
    await consume(provider, 'qq')
    enabled = initial
    await consume(provider, 'qq')
    expect(payloads[2]?.['previous_response_id']).toBeUndefined()
    expect(payloads[2]?.['input']).toContainEqual({ role: 'assistant', content: 'a2' })
    expect(store.get('qq')).toMatchObject({ responseId: 'r3', backendSearch: initial })
    await consume(provider, 'qq')
    expect(payloads[3]?.['previous_response_id']).toBe('r3')
  })
})
