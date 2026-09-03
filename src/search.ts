//
// Adapted from the dsh-xai web-search fork by lonefisher
// (https://github.com/lonefisher/dsh-xai), Apache-2.0.
// Modified for dsh-grok-kit — see NOTICE for the full attribution.
//
/**
 * Server-side xAI search tools over the Responses API.
 *
 * xAI executes the search on its own infrastructure: the request carries
 * `tools: [{ type: 'web_search' }]` or `tools: [{ type: 'x_search' }]`
 * and the response carries `*_search_call` items with `action.sources`,
 * `output_text` with inline `url_citation`/`post_citation` annotations,
 * and a top-level `citations` list.
 * @module dsh-grok-kit/search
 */

import { HarnessError } from '@deepseek-ai/dsh-llm'
import { safeMessage } from './redact.ts'
import type { XaiOAuthTokenSource } from './token-source.ts'

export type { XaiOAuthTokenSource } from './token-source.ts'
export { createXaiOAuthSearchTokenSource } from './token-source.ts'

export const XAI_SEARCH_TOOLS = ['web_search', 'x_search'] as const
export type XaiSearchTool = typeof XAI_SEARCH_TOOLS[number]

export const XAI_RESPONSES_URL = 'https://api.x.ai/v1/responses'
/** OAuth-friendly Grok Build model; override via config `searchModel`. */
export const DEFAULT_XAI_SEARCH_MODEL = 'grok-build-0.1'

const USER_AGENT = 'dsh-grok-kit/0.1.8'
const ERROR_BODY_LIMIT = 300

export interface XaiOAuthSearchProviderOptions {
  model?: string
  fetch?: typeof fetch
}

interface XaiResponsesBody extends Record<string, unknown> {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonBlankString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function validWebUrl(value: unknown): string | undefined {
  const candidate = nonBlankString(value)
  if (candidate === undefined) return undefined
  try {
    const parsed = new URL(candidate)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? candidate : undefined
  } catch {
    return undefined
  }
}

export interface SearchSource {
  readonly url: string
  readonly title?: string
  readonly snippet?: string
  readonly publishedAt?: string
}

export interface SearchResult {
  readonly content?: string
  readonly sources: readonly SearchSource[]
  readonly truncated: boolean
  /** xAI audit counters for one call (`server_side_tool_usage_details`). */
  readonly toolUsage?: Readonly<Record<string, number>>
}

/** One already-validated search request. Filters map 1:1 onto the xAI tool payload. */
export interface SearchRequest {
  readonly query: string
  readonly allowedDomains?: readonly string[]
  readonly excludedDomains?: readonly string[]
  readonly allowedXHandles?: readonly string[]
  readonly excludedXHandles?: readonly string[]
  readonly fromDate?: string
  readonly toDate?: string
  readonly enableImageSearch?: boolean
  readonly enableImageUnderstanding?: boolean
  readonly enableVideoUnderstanding?: boolean
}

function sourceFromRecord(value: unknown): SearchSource | undefined {
  if (!isRecord(value)) return undefined
  const url = validWebUrl(value['url'])
  if (url === undefined) return undefined
  const title = nonBlankString(value['title']) ?? nonBlankString(value['text']) ?? nonBlankString(value['post_text'])
  const snippet = nonBlankString(value['snippet']) ?? nonBlankString(value['description']) ?? nonBlankString(value['author'])
  const publishedAt = nonBlankString(value['publishedAt']) ?? nonBlankString(value['published_at'])
  return {
    url,
    ...title !== undefined ? { title } : {},
    ...snippet !== undefined ? { snippet } : {},
    ...publishedAt !== undefined ? { publishedAt } : {},
  }
}

function mergeSources(groups: readonly (readonly SearchSource[])[]): SearchSource[] {
  const byUrl = new Map<string, SearchSource>()
  for (const group of groups) {
    for (const source of group) {
      const previous = byUrl.get(source.url)
      if (previous === undefined) {
        byUrl.set(source.url, source)
        continue
      }
      byUrl.set(source.url, {
        url: source.url,
        ...(previous.title ?? source.title) !== undefined ? { title: previous.title ?? source.title } : {},
        ...(previous.snippet ?? source.snippet) !== undefined ? { snippet: previous.snippet ?? source.snippet } : {},
        ...(previous.publishedAt ?? source.publishedAt) !== undefined
          ? { publishedAt: previous.publishedAt ?? source.publishedAt }
          : {},
      })
    }
  }
  return [...byUrl.values()]
}

function outputItems(body: XaiResponsesBody): readonly unknown[] {
  return Array.isArray(body['output']) ? body['output'] : []
}

function collectOutputText(body: XaiResponsesBody): string[] {
  const texts: string[] = []
  for (const item of outputItems(body)) {
    if (!isRecord(item) || item['type'] !== 'message' || !Array.isArray(item['content'])) continue
    for (const chunk of item['content']) {
      if (!isRecord(chunk) || chunk['type'] !== 'output_text') continue
      const text = nonBlankString(chunk['text'])
      if (text !== undefined) texts.push(text)
    }
  }
  return texts
}

function isXSearchToolName(name: unknown): boolean {
  return typeof name === 'string' && /^x[_-]?/.test(name) && /search|fetch|thread|user/i.test(name)
}

function isSearchCall(item: Record<string, unknown>): boolean {
  const type = item['type']
  if (type === 'web_search_call' || type === 'x_search_call' || (typeof type === 'string' && type.endsWith('_search_call'))) {
    return true
  }
  // Live xAI x_search currently arrives as custom_tool_call / x_keyword_search,
  // not as x_search_call. Keep both shapes so action.sources still maps if added later.
  return type === 'custom_tool_call' && isXSearchToolName(item['name'])
}

/** Responses `include` values xAI actually accepts. `x_search_call.action.sources` is rejected with HTTP 400. */
export function includeForSearchTool(tool: XaiSearchTool): readonly string[] {
  return tool === 'web_search'
    ? ['web_search_call.action.sources', 'no_inline_citations']
    : ['no_inline_citations']
}

/**
 * Build the server-side tool object xAI expects. Only official filter keys
 * are forwarded; empty lists are omitted so a bare `{ type }` stays valid.
 */
export function buildSearchToolPayload(tool: XaiSearchTool, request: SearchRequest): Record<string, unknown> {
  const payload: Record<string, unknown> = { type: tool }
  if (tool === 'web_search') {
    if (request.allowedDomains !== undefined && request.allowedDomains.length > 0) {
      payload['allowed_domains'] = [...request.allowedDomains]
    }
    if (request.excludedDomains !== undefined && request.excludedDomains.length > 0) {
      payload['excluded_domains'] = [...request.excludedDomains]
    }
    if (request.enableImageSearch === true) payload['enable_image_search'] = true
    if (request.enableImageUnderstanding === true) payload['enable_image_understanding'] = true
    return payload
  }
  if (request.allowedXHandles !== undefined && request.allowedXHandles.length > 0) {
    payload['allowed_x_handles'] = [...request.allowedXHandles]
  }
  if (request.excludedXHandles !== undefined && request.excludedXHandles.length > 0) {
    payload['excluded_x_handles'] = [...request.excludedXHandles]
  }
  if (request.fromDate !== undefined) payload['from_date'] = request.fromDate
  if (request.toDate !== undefined) payload['to_date'] = request.toDate
  if (request.enableImageUnderstanding === true) payload['enable_image_understanding'] = true
  if (request.enableVideoUnderstanding === true) payload['enable_video_understanding'] = true
  return payload
}

function collectActionSources(body: XaiResponsesBody): SearchSource[] {
  const sources: SearchSource[] = []
  for (const item of outputItems(body)) {
    if (!isRecord(item) || !isSearchCall(item) || !isRecord(item['action'])) continue
    const rows = item['action']['sources']
    if (!Array.isArray(rows)) continue
    for (const row of rows) {
      const source = sourceFromRecord(row)
      if (source !== undefined) sources.push(source)
    }
  }
  return sources
}

function collectAnnotationSources(body: XaiResponsesBody): SearchSource[] {
  const sources: SearchSource[] = []
  for (const item of outputItems(body)) {
    if (!isRecord(item) || item['type'] !== 'message' || !Array.isArray(item['content'])) continue
    for (const chunk of item['content']) {
      if (!isRecord(chunk) || chunk['type'] !== 'output_text' || !Array.isArray(chunk['annotations'])) continue
      for (const annotation of chunk['annotations']) {
        if (!isRecord(annotation)) continue
        if (annotation['type'] !== 'url_citation' && annotation['type'] !== 'post_citation') continue
        const url = validWebUrl(annotation['url'])
        if (url === undefined) continue
        const title = nonBlankString(annotation['title'])
        sources.push({
          url,
          ...title !== undefined && title !== url ? { title } : {},
        })
      }
    }
  }
  return sources
}

function collectCustomToolSources(body: XaiResponsesBody): SearchSource[] {
  const sources: SearchSource[] = []
  for (const item of outputItems(body)) {
    if (!isRecord(item) || item['type'] !== 'custom_tool_call' || !isXSearchToolName(item['name'])) continue
    for (const key of ['output', 'result', 'content'] as const) {
      pushParsedSources(item[key], sources)
    }
  }
  return sources
}

function pushParsedSources(value: unknown, sources: SearchSource[]): void {
  if (Array.isArray(value)) {
    for (const row of value) {
      const source = sourceFromRecord(row)
      if (source !== undefined) sources.push(source)
    }
    return
  }
  if (typeof value !== 'string' || value.trim().length === 0) return
  try {
    const parsed = JSON.parse(value) as unknown
    if (Array.isArray(parsed)) {
      pushParsedSources(parsed, sources)
      return
    }
    if (isRecord(parsed)) {
      for (const key of ['sources', 'posts', 'results'] as const) {
        if (Array.isArray(parsed[key])) pushParsedSources(parsed[key], sources)
      }
    }
  } catch {
    // Live x_keyword_search `input` is the query JSON, not a source list.
  }
}

function collectXStatusUrls(body: XaiResponsesBody): SearchSource[] {
  const sources: SearchSource[] = []
  const seen = new Set<string>()
  const pattern = /https?:\/\/(?:x|twitter)\.com\/[^\s)\]>'"]+/gi
  for (const text of collectOutputText(body)) {
    for (const match of text.match(pattern) ?? []) {
      const url = validWebUrl(match.replace(/[.,;:]+$/, ''))
      if (url === undefined || seen.has(url)) continue
      seen.add(url)
      sources.push({ url })
    }
  }
  return sources
}

function collectCitationSources(body: XaiResponsesBody): SearchSource[] {
  if (!Array.isArray(body['citations'])) return []
  const sources: SearchSource[] = []
  for (const citation of body['citations']) {
    if (typeof citation === 'string') {
      const url = validWebUrl(citation)
      if (url !== undefined) sources.push({ url })
      continue
    }
    const source = sourceFromRecord(citation)
    if (source !== undefined) sources.push(source)
  }
  return sources
}

function collectToolUsage(body: XaiResponsesBody): Readonly<Record<string, number>> | undefined {
  const usage = body['usage']
  if (!isRecord(usage)) return undefined
  const details = usage['server_side_tool_usage_details']
  if (!isRecord(details)) return undefined
  const counts: Record<string, number> = {}
  for (const [key, value] of Object.entries(details)) {
    if (typeof value === 'number' && Number.isFinite(value)) counts[key] = value
  }
  return Object.keys(counts).length > 0 ? counts : undefined
}

/** Map an xAI Responses API envelope into DSH search result shape. */
export function mapXaiSearchResponse(body: XaiResponsesBody): SearchResult {
  const content = collectOutputText(body).join('\n\n').trim()
  const sources = mergeSources([
    collectActionSources(body),
    collectCustomToolSources(body),
    collectAnnotationSources(body),
    collectCitationSources(body),
    collectXStatusUrls(body),
  ])
  const toolUsage = collectToolUsage(body)
  return {
    ...content.length > 0 ? { content } : {},
    sources,
    truncated: false,
    ...toolUsage !== undefined ? { toolUsage } : {},
  }
}

function xaiApiErrorMessage(body: unknown): string | undefined {
  if (!isRecord(body)) return undefined
  const error = body['error']
  if (typeof error === 'string') return nonBlankString(error)
  if (!isRecord(error)) return undefined
  return nonBlankString(error['message']) ?? nonBlankString(error['code'])
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true
  return isRecord(error) && error['name'] === 'AbortError'
}

async function parseErrorResponse(response: Response, signal?: AbortSignal): Promise<string> {
  const mode = response.status === 403
    ? 'xAI search may be disabled for this account tier or model — try setting searchModel to a chat model such as grok-4.5, or set backendSearch: false if you enabled it'
    : `xAI search failed (HTTP ${response.status})`
  try {
    const text = await response.text()
    if (signal?.aborted) throw new XaiOAuthSearchError('xAI search aborted', 'WEB_ABORTED')
    if (text.length === 0) return mode
    try {
      const parsed = JSON.parse(text) as unknown
      const detail = xaiApiErrorMessage(parsed)
      if (detail !== undefined) return `${mode}: ${safeMessage(detail).slice(0, ERROR_BODY_LIMIT)}`
    } catch {
      // Fall through to a bounded plain-text detail.
    }
    return `${mode}: ${safeMessage(text.trim()).slice(0, ERROR_BODY_LIMIT)}`
  } catch (error) {
    if (error instanceof XaiOAuthSearchError) throw error
    if (signal?.aborted || isAbortError(error)) {
      throw new XaiOAuthSearchError('xAI search aborted', 'WEB_ABORTED', { cause: error })
    }
    return mode
  }
}

function buildSearchPrompt(tool: XaiSearchTool, query: string): string {
  const instruction = tool === 'x_search'
    ? 'Use the x_search tool to research X (Twitter) posts, accounts, and trends for the search topic below.'
    : 'Use the web_search tool to research the search topic below.'
  return [
    instruction,
    'Return a concise factual summary grounded in the sources you found.',
    `Search topic: ${JSON.stringify(query)}`,
  ].join('\n')
}

export class XaiOAuthSearchError extends HarnessError {}

/**
 * OAuth-only Grok search provider for one server-side xAI tool.
 * Deliberately NOT registered on `ctx.web`: tools call this class directly,
 * so the native `web_search` seam (provider selection) is never touched.
 */
export class XaiOAuthSearchProvider {
  readonly id: string
  private readonly model: string
  private readonly fetchImpl: typeof fetch

  constructor(
    private readonly tokens: XaiOAuthTokenSource,
    readonly tool: XaiSearchTool,
    options: XaiOAuthSearchProviderOptions = {},
  ) {
    this.id = `xai-oauth:${tool}`
    this.model = options.model?.trim() || DEFAULT_XAI_SEARCH_MODEL
    this.fetchImpl = options.fetch ?? globalThis.fetch
  }

  available(): boolean {
    return this.model.length > 0 && this.tokens.available()
  }

  private async request(
    accessToken: string,
    request: SearchRequest,
    signal?: AbortSignal,
  ): Promise<Response> {
    try {
      return await this.fetchImpl(XAI_RESPONSES_URL, {
        method: 'POST',
        redirect: 'error',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
          accept: 'application/json',
          'user-agent': USER_AGENT,
        },
        body: JSON.stringify({
          model: this.model,
          input: [{ role: 'user', content: buildSearchPrompt(this.tool, request.query) }],
          tools: [buildSearchToolPayload(this.tool, request)],
          include: includeForSearchTool(this.tool),
          store: false,
        }),
        ...signal !== undefined ? { signal } : {},
      })
    } catch (error) {
      if (signal?.aborted || isAbortError(error)) {
        throw new XaiOAuthSearchError('xAI search aborted', 'WEB_ABORTED', { cause: error })
      }
      throw new XaiOAuthSearchError('Could not reach xAI search', 'WEB_PROVIDER_ERROR', { cause: error })
    }
  }

  async search(request: SearchRequest, signal?: AbortSignal): Promise<SearchResult> {
    let accessToken: string | undefined
    try {
      accessToken = await this.tokens.resolve(signal)
    } catch (error) {
      if (signal?.aborted || isAbortError(error)) {
        throw new XaiOAuthSearchError('xAI search aborted', 'WEB_ABORTED', { cause: error })
      }
      throw new XaiOAuthSearchError('Could not resolve the SuperGrok OAuth credential', 'WEB_PROVIDER_ERROR', { cause: error })
    }
    if (accessToken === undefined || accessToken.length === 0) {
      throw new XaiOAuthSearchError(
        'xAI search requires a SuperGrok/X OAuth sign-in (Settings → xAI Grok · dsh-grok-kit); API-key fallback is intentionally disabled',
        'WEB_PROVIDER_ERROR',
      )
    }

    let response = await this.request(accessToken, request, signal)

    // OAuth access tokens can be revoked or become invalid before their local expiry metadata says so.
    // Retry exactly once after a serialized forced refresh. There is deliberately no API-key path.
    if (response.status === 401 && this.tokens.refresh !== undefined) {
      let refreshed: string | undefined
      try {
        refreshed = await this.tokens.refresh(accessToken, signal)
      } catch (error) {
        if (signal?.aborted || isAbortError(error)) {
          throw new XaiOAuthSearchError('xAI search aborted', 'WEB_ABORTED', { cause: error })
        }
        throw new XaiOAuthSearchError('Could not refresh the SuperGrok OAuth credential after HTTP 401', 'WEB_PROVIDER_ERROR', { cause: error })
      }
      if (refreshed !== undefined && refreshed.length > 0 && refreshed !== accessToken) {
        accessToken = refreshed
        response = await this.request(accessToken, request, signal)
      }
    }

    if (!response.ok) {
      throw new XaiOAuthSearchError(await parseErrorResponse(response, signal), 'WEB_PROVIDER_ERROR')
    }

    let body: unknown
    try {
      body = await response.json()
    } catch (error) {
      if (signal?.aborted || isAbortError(error)) {
        throw new XaiOAuthSearchError('xAI search aborted', 'WEB_ABORTED', { cause: error })
      }
      throw new XaiOAuthSearchError('xAI search returned invalid JSON', 'WEB_PROVIDER_ERROR', { cause: error })
    }
    const apiError = xaiApiErrorMessage(body)
    if (apiError !== undefined) {
      throw new XaiOAuthSearchError(`xAI search returned an error: ${safeMessage(apiError)}`, 'WEB_PROVIDER_ERROR')
    }
    if (!isRecord(body)) {
      throw new XaiOAuthSearchError('xAI search returned an invalid response envelope', 'WEB_PROVIDER_ERROR')
    }
    return mapXaiSearchResponse(body)
  }
}
