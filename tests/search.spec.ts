import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_XAI_SEARCH_MODEL,
  XAI_RESPONSES_URL,
  XaiOAuthSearchProvider,
  includeForSearchTool,
  buildSearchToolPayload,
  mapXaiSearchResponse,
  type XaiOAuthTokenSource,
} from '../src/search.ts'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('mapXaiSearchResponse', () => {
  it('maps answer text, structured sources, annotations, and citations', () => {
    const result = mapXaiSearchResponse({
      output: [
        {
          type: 'web_search_call',
          action: {
            sources: [
              { type: 'url', url: 'https://a.example/news' },
              { type: 'url', url: 'https://b.example/', description: 'B description' },
            ],
          },
        },
        {
          type: 'message',
          content: [{
            type: 'output_text',
            text: 'Current summary.',
            annotations: [
              { type: 'url_citation', url: 'https://a.example/news', title: '1' },
              { type: 'url_citation', url: 'https://c.example/x', title: '2' },
            ],
          }],
        },
      ],
      citations: [
        'https://a.example/news',
        { url: 'https://b.example/', title: 'B title', published_at: '2026-08-22' },
        'javascript:alert(1)',
        'https://d.example/',
      ],
    })

    expect(result).toEqual({
      content: 'Current summary.',
      sources: [
        { url: 'https://a.example/news', title: '1' },
        {
          url: 'https://b.example/',
          title: 'B title',
          snippet: 'B description',
          publishedAt: '2026-08-22',
        },
        { url: 'https://c.example/x', title: '2' },
        { url: 'https://d.example/' },
      ],
      truncated: false,
    })
  })

  it('maps x_search_call items, post_citation annotations, and tool usage counters', () => {
    const result = mapXaiSearchResponse({
      output: [
        {
          type: 'x_search_call',
          action: {
            sources: [
              { type: 'post_ref', url: 'https://x.com/elonmusk/status/1', text: 'First post text', published_at: '2026-08-22T10:00:00Z' },
              { type: 'post_ref', url: 'https://x.com/verified/status/2', author: '@verified' },
            ],
          },
        },
        {
          type: 'message',
          content: [{
            type: 'output_text',
            text: 'Trending on X.',
            annotations: [
              { type: 'post_citation', url: 'https://x.com/elonmusk/status/1' },
            ],
          }],
        },
      ],
      citations: [{ url: 'https://x.com/elonmusk/status/1', title: 'post' }],
      usage: {
        server_side_tool_usage_details: { web_search_calls: 0, x_search_calls: 7, code_interpreter_calls: 0 },
      },
    })

    expect(result.content).toBe('Trending on X.')
    expect(result.sources).toEqual([
      { url: 'https://x.com/elonmusk/status/1', title: 'First post text', publishedAt: '2026-08-22T10:00:00Z' },
      { url: 'https://x.com/verified/status/2', snippet: '@verified' },
    ])
    expect(result.toolUsage).toEqual({ web_search_calls: 0, x_search_calls: 7, code_interpreter_calls: 0 })
  })

  it('maps the live x_search shape: custom_tool_call + url_citation annotations', () => {
    const result = mapXaiSearchResponse({
      output: [
        {
          type: 'custom_tool_call',
          name: 'x_keyword_search',
          input: '{"query":"from:elonmusk","limit":"10","mode":"Latest"}',
          status: 'completed',
        },
        {
          type: 'message',
          content: [{
            type: 'output_text',
            text: 'Latest posts from Elon Musk.',
            annotations: [
              { type: 'url_citation', url: 'https://x.com/i/status/1', title: 'https://x.com/i/status/1' },
              { type: 'url_citation', url: 'https://x.com/i/status/2', title: 'Starship update' },
            ],
          }],
        },
      ],
      usage: { server_side_tool_usage_details: { x_search_calls: 1 } },
    })

    expect(result.content).toBe('Latest posts from Elon Musk.')
    expect(result.sources).toEqual([
      { url: 'https://x.com/i/status/1' },
      { url: 'https://x.com/i/status/2', title: 'Starship update' },
    ])
    expect(result.toolUsage).toEqual({ x_search_calls: 1 })
  })

  it('reads sources out of custom_tool_call JSON output when present', () => {
    expect(mapXaiSearchResponse({
      output: [{
        type: 'custom_tool_call',
        name: 'x_keyword_search',
        output: JSON.stringify({ posts: [{ url: 'https://x.com/a/status/3', text: 'hello' }] }),
      }],
    }).sources).toEqual([{ url: 'https://x.com/a/status/3', title: 'hello' }])
  })

  it('falls back to top-level citations and rejects non-http(s) URLs', () => {
    expect(mapXaiSearchResponse({
      citations: ['https://ok.example/x', 'ftp://bad.example/x', 'not a url'],
    }).sources).toEqual([{ url: 'https://ok.example/x' }])
  })

  it('omits toolUsage when absent or non-numeric', () => {
    expect(mapXaiSearchResponse({ output: [] }).toolUsage).toBeUndefined()
    expect(mapXaiSearchResponse({ output: [], usage: { server_side_tool_usage_details: { x_search_calls: 'n/a' } } }).toolUsage).toBeUndefined()
  })
})

describe('XaiOAuthSearchProvider', () => {
  const tokens = (accessToken: string | undefined, refresh?: XaiOAuthTokenSource['refresh']): XaiOAuthTokenSource => ({
    available: () => true,
    resolve: vi.fn(async () => accessToken),
    ...refresh === undefined ? {} : { refresh },
  })

  it('uses the fixed xAI Responses endpoint and the requested server-side tool', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      output: [{ type: 'x_search_call', action: { sources: [{ url: 'https://x.com/a/status/9' }] } }],
      citations: ['https://x.com/a/status/9'],
    }))
    const provider = new XaiOAuthSearchProvider(tokens('oauth-secret'), 'x_search', { fetch: fetchMock as typeof fetch })

    await expect(provider.search({ query: 'counts on X' })).resolves.toMatchObject({
      sources: [{ url: 'https://x.com/a/status/9' }],
      truncated: false,
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(XAI_RESPONSES_URL)
    expect(init.redirect).toBe('error')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer oauth-secret')
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.model).toBe(DEFAULT_XAI_SEARCH_MODEL)
    expect(body.tools).toEqual([{ type: 'x_search' }])
    expect(body.include).toEqual(includeForSearchTool('x_search'))
    expect(body.include).toEqual(['no_inline_citations'])
    expect(body.store).toBe(false)
  })

  it('forwards enable_image_search only when true', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ output: [] }))
    const provider = new XaiOAuthSearchProvider(tokens('oauth-secret'), 'web_search', { fetch: fetchMock as typeof fetch })
    await provider.search({ query: 'pics', enableImageSearch: true })
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string) as Record<string, unknown>
    expect(body.tools).toEqual([{ type: 'web_search', enable_image_search: true }])
  })

  it('sends web_search for the web tool with the accepted include list', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ output: [] }))
    const provider = new XaiOAuthSearchProvider(tokens('oauth-secret'), 'web_search', { fetch: fetchMock as typeof fetch })
    await provider.search({ query: 'latest' })
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string) as Record<string, unknown>
    expect(body.tools).toEqual([{ type: 'web_search' }])
    expect(body.include).toEqual(includeForSearchTool('web_search'))
    expect(body.include).not.toContain('x_search_call.action.sources')
  })

  it('forwards official xAI filter fields on the server-side tool object', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ output: [] }))
    const provider = new XaiOAuthSearchProvider(tokens('oauth-secret'), 'x_search', { fetch: fetchMock as typeof fetch })
    await provider.search({
      query: 'Starship',
      allowedXHandles: ['elonmusk', 'SpaceX'],
      fromDate: '2026-08-01',
      toDate: '2026-08-23',
    })
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string) as Record<string, unknown>
    expect(body.tools).toEqual([{
      type: 'x_search',
      allowed_x_handles: ['elonmusk', 'SpaceX'],
      from_date: '2026-08-01',
      to_date: '2026-08-23',
    }])
    expect(buildSearchToolPayload('web_search', {
      query: 'docs',
      allowedDomains: ['x.ai'],
      excludedDomains: ['example.com'],
    })).toEqual({
      type: 'web_search',
      allowed_domains: ['x.ai'],
      excluded_domains: ['example.com'],
    })
    expect(buildSearchToolPayload('x_search', { query: 'q' })).toEqual({ type: 'x_search' })
  })

  it('never falls back to an API key when OAuth is absent', async () => {
    const fetchMock = vi.fn()
    const provider = new XaiOAuthSearchProvider(tokens(undefined), 'web_search', { fetch: fetchMock as typeof fetch })
    await expect(provider.search({ query: 'x' })).rejects.toMatchObject({
      code: 'WEB_PROVIDER_ERROR',
      message: expect.stringContaining('API-key fallback is intentionally disabled'),
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('force-refreshes OAuth once after HTTP 401 and retries with the rotated bearer', async () => {
    const refresh = vi.fn(async (rejectedAccessToken: string) => {
      expect(rejectedAccessToken).toBe('old-token')
      return 'new-token'
    })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'expired' } }, 401))
      .mockResolvedValueOnce(jsonResponse({
        output: [{ type: 'web_search_call', action: { sources: [{ url: 'https://fresh.example/' }] } }],
      }))
    const provider = new XaiOAuthSearchProvider(tokens('old-token', refresh), 'web_search', { fetch: fetchMock as typeof fetch })

    await expect(provider.search({ query: 'x' })).resolves.toMatchObject({ truncated: false })
    expect(refresh).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect((fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>).authorization).toBe('Bearer old-token')
    expect((fetchMock.mock.calls[1]?.[1]?.headers as Record<string, string>).authorization).toBe('Bearer new-token')
  })

  it('never loops refresh when the retry also returns HTTP 401', async () => {
    const refresh = vi.fn(async () => 'new-token')
    const fetchMock = vi.fn(async () => jsonResponse({ error: { message: 'still invalid' } }, 401)) as typeof fetch
    const provider = new XaiOAuthSearchProvider(tokens('old-token', refresh), 'web_search', { fetch: fetchMock })

    await expect(provider.search({ query: 'x' })).rejects.toMatchObject({
      code: 'WEB_PROVIDER_ERROR',
      message: expect.stringContaining('still invalid'),
    })
    expect(refresh).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry when a forced refresh cannot rotate the rejected bearer', async () => {
    const refresh = vi.fn(async () => 'old-token')
    const fetchMock = vi.fn(async () => jsonResponse({ error: { message: 'invalid bearer' } }, 401)) as typeof fetch
    const provider = new XaiOAuthSearchProvider(tokens('old-token', refresh), 'web_search', { fetch: fetchMock })

    await expect(provider.search({ query: 'x' })).rejects.toMatchObject({
      code: 'WEB_PROVIDER_ERROR',
      message: expect.stringContaining('HTTP 401'),
    })
    expect(refresh).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('surfaces xAI HTTP and in-band errors', async () => {
    const http = new XaiOAuthSearchProvider(tokens('oauth-secret'), 'web_search', {
      fetch: vi.fn(async () => jsonResponse({ error: { message: 'invalid bearer' } }, 401)) as typeof fetch,
    })
    await expect(http.search({ query: 'x' })).rejects.toMatchObject({
      code: 'WEB_PROVIDER_ERROR',
      message: expect.stringContaining('HTTP 401'),
    })

    const inBand = new XaiOAuthSearchProvider(tokens('oauth-secret'), 'x_search', {
      fetch: vi.fn(async () => jsonResponse({ error: { message: 'subscription limit' } })) as typeof fetch,
    })
    await expect(inBand.search({ query: 'x' })).rejects.toMatchObject({
      code: 'WEB_PROVIDER_ERROR',
      message: expect.stringContaining('subscription limit'),
    })
  })

  it('maps AbortError to WEB_ABORTED', async () => {
    const provider = new XaiOAuthSearchProvider(tokens('oauth-secret'), 'web_search', {
      fetch: vi.fn(async () => { throw new DOMException('aborted', 'AbortError') }) as typeof fetch,
    })
    await expect(provider.search({ query: 'x' })).rejects.toMatchObject({ code: 'WEB_ABORTED' })
  })
})
