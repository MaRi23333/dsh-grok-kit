/**
 * Contract gate for the tool registration surface: schemas pass the registry's
 * JSON-schema assertion, timeout budgets and cancellation forwarding line up,
 * and replay presentation fails closed on dirty metadata.
 */
import { describe, expect, it, vi } from 'vitest'
import { assertSupportedJsonSchema } from '@deepseek-ai/dsh-tools'
import {
  applyGrokSearchTools,
  DEFAULT_WEB_SEARCH_TIMEOUT_MS,
  DEFAULT_X_SEARCH_TIMEOUT_MS,
} from '../src/tools.ts'
import type { XaiOAuthSearchProvider } from '../src/search.ts'

interface RegisteredTool {
  name: string
  description: string
  timeoutMs: number
  isConcurrencySafe: (args: unknown) => boolean
  output: { schema: unknown }
  execute: (args: unknown, exec: { signal: AbortSignal }) => Promise<unknown>
  presentCall: (args: unknown) => unknown
  presentResult: (args: unknown, result: { isError: boolean; meta?: unknown }) => unknown
}

function fixture(backendSearch = false) {
  const registered: RegisteredTool[] = []
  const sections: Array<{ name: string; order: number }> = []
  const search = vi.fn(async (_request: unknown, signal?: AbortSignal) => ({ sources: [], truncated: false, ...signal === undefined ? {} : {} }))
  const ctx = {
    tools: {
      register: vi.fn((definition: RegisteredTool) => {
        registered.push(definition)
        return () => undefined
      }),
    },
    systemPrompt: {
      section: vi.fn((section: { name: string; order: number }) => {
        sections.push(section)
        return () => undefined
      }),
    },
  }
  const providers = { web: { search } as unknown as XaiOAuthSearchProvider, x: { search } as unknown as XaiOAuthSearchProvider }
  applyGrokSearchTools(ctx as never, {
    web: providers.web,
    x: providers.x,
    maxResults: 8,
    webTimeoutMs: DEFAULT_WEB_SEARCH_TIMEOUT_MS,
    xTimeoutMs: DEFAULT_X_SEARCH_TIMEOUT_MS,
    ...backendSearch ? { backendSearch: true } : {},
  })
  return { registered, sections, search, ctx }
}

describe('grok search tool registration', () => {
  it('registers grok_web_search and x_search with the declared budgets and concurrency-safe flags', () => {
    const { registered, sections } = fixture()
    expect(registered.map(tool => tool.name)).toEqual(['grok_web_search', 'x_search'])
    expect(registered[0]!.timeoutMs).toBe(DEFAULT_WEB_SEARCH_TIMEOUT_MS)
    expect(registered[1]!.timeoutMs).toBe(DEFAULT_X_SEARCH_TIMEOUT_MS)
    expect(registered[0]!.isConcurrencySafe({ query: 'q' })).toBe(true)
    expect(registered[1]!.isConcurrencySafe({ query: 'q' })).toBe(true)
    // defineTool fails closed on schema-invalid args before consulting the flag.
    expect(registered[0]!.isConcurrencySafe({})).toBe(false)
    expect(sections.map(section => section.name)).toEqual(['tool:grok_web_search', 'tool:x_search'])
  })

  it('adds the backend-search prompt variant when backendSearch is true', () => {
    const { sections } = fixture(true)
    expect(sections.map(section => section.name)).toEqual([
      'tool:xai-backend-search',
      'tool:grok_web_search',
      'tool:x_search',
    ])
  })

  it('emits output schemas the tool registry accepts', () => {
    const { registered } = fixture()
    for (const tool of registered) {
      expect(() => assertSupportedJsonSchema(tool.output.schema as never)).not.toThrow()
      expect(tool.description.length).toBeGreaterThan(20)
    }
  })

  it('forwards the exec.signal through to the provider search call', async () => {
    const { registered, search } = fixture()
    const controller = new AbortController()
    await registered[0]!.execute({ query: 'x' }, { signal: controller.signal })
    expect(search).toHaveBeenCalledOnce()
    expect(search.mock.calls[0]![1]).toBe(controller.signal)
  })

  it('forwards official xAI filters from x_search args', async () => {
    const { registered, search } = fixture()
    await registered[1]!.execute({
      query: 'Starship',
      allowed_x_handles: ['@elonmusk'],
      from_date: '2026-08-01',
    }, { signal: new AbortController().signal })
    expect(search.mock.calls.at(-1)?.[0]).toEqual({
      query: 'Starship',
      allowedXHandles: ['elonmusk'],
      fromDate: '2026-08-01',
    })
  })

  it('rejects a non-empty-query contract violation with a plain Error', async () => {
    const { registered } = fixture()
    await expect(registered[0]!.execute({ query: '   ' }, { signal: new AbortController().signal })).rejects.toThrow(/non-empty/)
  })

  it('fails closed on dirty replay metadata', () => {
    const { registered } = fixture()
    const args = { query: 'q' }
    expect(registered[0]!.presentResult?.(args, { isError: false, meta: { sources: [{ url: 42 }], truncated: true } })).toBeUndefined()
    expect(registered[0]!.presentResult?.(args, { isError: false, meta: { sources: [{ url: 'javascript:alert(1)' }], truncated: true } })).toBeUndefined()
    expect(registered[0]!.presentResult?.(args, { isError: false, meta: { sources: [{ url: 'https://ok.example/' }], truncated: 'yes' } })).toBeUndefined()
    expect(registered[0]!.presentResult?.(args, { isError: true, meta: undefined })).toBeUndefined()
    expect(registered[0]!.presentResult?.(args, { isError: false, meta: { sources: [{ url: 'https://ok.example/' }], truncated: true } })).toMatchObject({ title: 'q', truncated: true })
  })
})
