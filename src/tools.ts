//
// Adapted from the dsh-xai web-search fork by lonefisher
// (https://github.com/lonefisher/dsh-xai), Apache-2.0.
// Modified for dsh-grok-kit — see NOTICE for the full attribution.
//
/**
 * Nested `grok_web_search` / `x_search` (opt-in via nestedSearchTools) and
 * execute-only reject stubs for xAI custom_tool_call when backendSearch is on.
 * Neither nested tool is registered on `ctx.web`. Native DSH `web_search`
 * stays in the host list; colliding names are stripped in responses.ts.
 * @module dsh-grok-kit/tools
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, ToolResult, WebSearchResultView } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type { XaiOAuthSearchProvider, SearchRequest, SearchResult, SearchSource } from './search.ts'
import { XAI_SERVER_X_SEARCH_REJECT_NAMES } from './responses.ts'

/** Default upper bound on returned sources per call. */
export const DEFAULT_SEARCH_MAX_RESULTS = 8
/** Cooperative budget for `grok_web_search` (xAI web_search measured ~5-12s). */
export const DEFAULT_WEB_SEARCH_TIMEOUT_MS = 60_000
/** Cooperative budget for `x_search` (xAI x_search measured ~24-45s; docs advise >=120s). */
export const DEFAULT_X_SEARCH_TIMEOUT_MS = 120_000

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const X_HANDLE = /^[A-Za-z0-9_]{1,15}$/
const MAX_X_HANDLES = 20
const MAX_DOMAINS = 5

function parseQuery(args: unknown): string {
  if (typeof args !== 'object' || args === null || typeof (args as { query?: unknown }).query !== 'string') {
    throw new Error('query must be a string')
  }
  const query = (args as { query: string }).query
  if (query.trim().length === 0) throw new Error('query must be a non-empty string')
  return query
}

function parseStringList(value: unknown, name: string, max: number): string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error(`${name} must be an array of strings`)
  }
  if (value.length > max) throw new Error(`${name} accepts at most ${max} entries`)
  return value
}

function parseIsoDate(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !ISO_DATE.test(value)) {
    throw new Error(`${name} must be YYYY-MM-DD`)
  }
  if (!Number.isFinite(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${name} must be a valid date`)
  }
  return value
}

function normalizeHandle(raw: string): string {
  const handle = raw.trim().replace(/^@+/, '')
  if (!X_HANDLE.test(handle)) {
    throw new Error(`invalid X handle "${raw}" — use 1-15 letters, digits, or underscore`)
  }
  return handle
}

function normalizeDomain(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.length === 0) throw new Error('domain entries must be non-empty')
  try {
    const host = (trimmed.includes('://') ? new URL(trimmed) : new URL(`https://${trimmed}`)).hostname
    if (host.length === 0) throw new Error(`invalid domain "${raw}"`)
    return host.toLowerCase()
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('invalid domain')) throw error
    throw new Error(`invalid domain "${raw}"`)
  }
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)]
}

function parseOptionalTrue(value: unknown, name: string): true | undefined {
  if (value === undefined) return undefined
  if (value !== true) throw new Error(`${name} must be true when set`)
  return true
}

/** Validate model-facing `grok_web_search` args into a provider request. */
export function parseGrokWebSearchArgs(args: unknown): SearchRequest {
  const query = parseQuery(args)
  const record = args as {
    allowed_domains?: unknown
    excluded_domains?: unknown
    enable_image_search?: unknown
    enable_image_understanding?: unknown
  }
  const allowed = parseStringList(record.allowed_domains, 'allowed_domains', MAX_DOMAINS)
  const excluded = parseStringList(record.excluded_domains, 'excluded_domains', MAX_DOMAINS)
  return {
    query,
    ...allowed !== undefined ? { allowedDomains: unique(allowed.map(normalizeDomain)) } : {},
    ...excluded !== undefined ? { excludedDomains: unique(excluded.map(normalizeDomain)) } : {},
    ...parseOptionalTrue(record.enable_image_search, 'enable_image_search') !== undefined
      ? { enableImageSearch: true }
      : {},
    ...parseOptionalTrue(record.enable_image_understanding, 'enable_image_understanding') !== undefined
      ? { enableImageUnderstanding: true }
      : {},
  }
}

/** Validate model-facing `x_search` args into a provider request. */
export function parseXSearchArgs(args: unknown): SearchRequest {
  const query = parseQuery(args)
  const record = args as {
    allowed_x_handles?: unknown
    excluded_x_handles?: unknown
    from_date?: unknown
    to_date?: unknown
    enable_image_understanding?: unknown
    enable_video_understanding?: unknown
  }
  const allowed = parseStringList(record.allowed_x_handles, 'allowed_x_handles', MAX_X_HANDLES)
  const excluded = parseStringList(record.excluded_x_handles, 'excluded_x_handles', MAX_X_HANDLES)
  if (allowed !== undefined && excluded !== undefined) {
    throw new Error('allowed_x_handles and excluded_x_handles cannot be set together')
  }
  const fromDate = parseIsoDate(record.from_date, 'from_date')
  const toDate = parseIsoDate(record.to_date, 'to_date')
  if (fromDate !== undefined && toDate !== undefined && fromDate > toDate) {
    throw new Error('from_date must be on or before to_date')
  }
  return {
    query,
    ...allowed !== undefined ? { allowedXHandles: unique(allowed.map(normalizeHandle)) } : {},
    ...excluded !== undefined ? { excludedXHandles: unique(excluded.map(normalizeHandle)) } : {},
    ...fromDate !== undefined ? { fromDate } : {},
    ...toDate !== undefined ? { toDate } : {},
    ...parseOptionalTrue(record.enable_image_understanding, 'enable_image_understanding') !== undefined
      ? { enableImageUnderstanding: true }
      : {},
    ...parseOptionalTrue(record.enable_video_understanding, 'enable_video_understanding') !== undefined
      ? { enableVideoUnderstanding: true }
      : {},
  }
}

/** Display label for a source: its title, else its hostname. */
function sourceLabel(url: string, title: string | undefined): string {
  if (title !== undefined && title.length > 0) return title
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

/** Format a search result as one model-facing text block (web and X posts alike). */
export function formatGrokSearchOutput(result: SearchResult): string {
  const parts: string[] = []
  if (result.content !== undefined && result.content.length > 0) parts.push(result.content)
  if (result.sources.length > 0) {
    const lines = result.sources.map((source) => {
      const label = sourceLabel(source.url, source.title)
      const meta: string[] = []
      if (source.snippet !== undefined && source.snippet.length > 0) meta.push(source.snippet)
      if (source.publishedAt !== undefined && source.publishedAt.length > 0) meta.push(`(${source.publishedAt})`)
      const suffix = meta.length > 0 ? ` — ${meta.join(' ')}` : ''
      return `- [${label}](${source.url})${suffix}`
    })
    parts.push(`Sources:\n${lines.join('\n')}`)
  } else if (result.content === undefined || result.content.length === 0) {
    parts.push('No results found.')
  }
  if (result.truncated) {
    parts.push(`(Showing the first ${result.sources.length} sources. Refine the query for more.)`)
  }
  parts.push('Cite the relevant URLs above as markdown links in your answer.')
  return parts.join('\n\n')
}

/** Project one source to a plain object omitting absent optional fields. */
export function projectSearchSource(source: SearchSource) {
  return {
    url: source.url,
    ...source.title !== undefined ? { title: source.title } : {},
    ...source.snippet !== undefined ? { snippet: source.snippet } : {},
    ...source.publishedAt !== undefined ? { publishedAt: source.publishedAt } : {},
  }
}

const SEARCH_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    content: { type: 'string' },
    sources: {
      type: 'array',
      required: true,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          url: { type: 'string', required: true },
          title: { type: 'string' },
          snippet: { type: 'string' },
          publishedAt: { type: 'string' },
        },
      },
    },
    truncated: { type: 'boolean', required: true },
  },
} as const

/** Pending-call presentation: a search card titled by the query. */
function presentSearchCall(query: string): GenericCallView {
  return { card: 'generic', title: query, kind: 'search', rawInput: query }
}

function searchMetaFromValue(value: SearchResult): JsonValue {
  return {
    sources: value.sources.map(projectSearchSource),
    truncated: value.truncated,
    ...value.content !== undefined ? { answer: value.content } : {},
  }
}

function validHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function searchMetaFromResult(meta: unknown): { sources: SearchSource[]; truncated: boolean; answer?: string } | undefined {
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return undefined
  const { sources, truncated, answer } = meta as { sources?: unknown; truncated?: unknown; answer?: unknown }
  if (!Array.isArray(sources)) return undefined
  const validated: SearchSource[] = []
  for (const source of sources) {
    if (typeof source !== 'object' || source === null || Array.isArray(source)) return undefined
    const record = source as Record<string, unknown>
    if (typeof record['url'] !== 'string' || !validHttpUrl(record['url'])) return undefined
    validated.push({
      url: record['url'],
      ...typeof record['title'] === 'string' ? { title: record['title'] } : {},
      ...typeof record['snippet'] === 'string' ? { snippet: record['snippet'] } : {},
      ...typeof record['publishedAt'] === 'string' ? { publishedAt: record['publishedAt'] } : {},
    })
  }
  if (typeof truncated !== 'boolean') return undefined
  return {
    sources: validated,
    truncated,
    ...typeof answer === 'string' ? { answer } : {},
  }
}

function presentSearchResult(query: string, result: ToolResult): WebSearchResultView | undefined {
  if (result.isError) return undefined
  const meta = searchMetaFromResult(result.meta)
  if (meta === undefined) return undefined
  return {
    card: 'web',
    kind: 'search',
    title: query,
    sources: meta.sources,
    truncated: meta.truncated,
    ...meta.answer !== undefined ? { answer: meta.answer } : {},
  }
}

export interface GrokSearchToolOptions {
  web: XaiOAuthSearchProvider
  x: XaiOAuthSearchProvider
  maxResults: number
  webTimeoutMs: number
  xTimeoutMs: number
  /** When true, add the backend-search prompt that demotes nested tools. */
  backendSearch?: boolean
}

/**
 * Register `grok_web_search` and `x_search` plus their system-prompt guidance.
 * Both stay visible when the OAuth login is missing and fail with a clear
 * structured error at execution time — the standard dsh tool contract.
 */
export function applyGrokSearchTools(ctx: Context, options: GrokSearchToolOptions): void {
  if (options.backendSearch === true) {
    ctx.systemPrompt.section({
      name: 'tool:xai-backend-search',
      order: 104,
      text: 'The main chat request already mixes xAI server-side web_search and x_search. Do not call grok_web_search or x_search for the same query. Use those nested tools only when you need allowed_domains / allowed_x_handles / a date window, or the user explicitly wants a citation-heavy Grok summary.',
    })
  }
  ctx.systemPrompt.section({
    name: 'tool:grok_web_search',
    order: 105,
    text: 'Use grok_web_search when you need a Grok-grounded summary plus citations. Native web_search is faster URL discovery only (no summary) — prefer it for cheap lookup, then web_fetch. Pin or drop sites with allowed_domains / excluded_domains (hostnames, max 5). Do not use grok_web_search as a fallback for a failed x_search.',
  })
  ctx.systemPrompt.section({
    name: 'tool:x_search',
    order: 106,
    text: 'Use the x_search tool to search X (Twitter) posts, accounts, and trends through Grok. It is comparatively slow (about 10-45 seconds, sometimes longer) and returns post URLs; cite them as markdown links. Prefer allowed_x_handles / excluded_x_handles (no @, max 20) and from_date / to_date (YYYY-MM-DD) over stuffing operators into the query. allowed_x_handles and excluded_x_handles cannot be set together. The query may still use X operators (from:handle, since:YYYY-MM-DD) when a structured filter does not apply. If x_search fails or times out, do NOT retry with web_search or grok_web_search — report the partial result and the reason instead.',
  })

  ctx.tools.register(defineTool({
    name: 'grok_web_search',
    description: 'Search the web through Grok using your SuperGrok / X Premium subscription. Returns an optional Grok summary and a list of source URLs. Use for current information when a grounded summary is useful. Optional allowed_domains / excluded_domains pin or drop sites.',
    parameters: {
      query: { type: 'string', required: true, description: 'The search query.' },
      allowed_domains: { type: 'array', items: { type: 'string' }, description: 'Optional hostnames to search (max 5). Example: x.ai' },
      excluded_domains: { type: 'array', items: { type: 'string' }, description: 'Optional hostnames to exclude (max 5).' },
      enable_image_search: { type: 'boolean', description: 'When true, include image search results.' },
      enable_image_understanding: { type: 'boolean', description: 'When true, analyze images found while browsing.' },
    },
    output: {
      schema: SEARCH_OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: formatGrokSearchOutput(value as SearchResult) }],
      presentationMeta: (_args, value) => searchMetaFromValue(value as SearchResult),
    },
    timeoutMs: options.webTimeoutMs,
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const request = parseGrokWebSearchArgs(args)
      const result = await options.web.search(request, exec.signal)
      const capped = capSources(result, options.maxResults)
      return { ...capped.content !== undefined ? { content: capped.content } : {}, sources: capped.sources.map(projectSearchSource), truncated: capped.truncated }
    },
    presentCall: (args) => presentSearchCall(args.query),
    presentResult: (args, result) => presentSearchResult(args.query, result),
  }))

  ctx.tools.register(defineTool({
    name: 'x_search',
    description: 'Search X (Twitter) posts, accounts, and trends through Grok using your SuperGrok / X Premium subscription. Returns post URLs and an optional summary. Comparatively slow (about 10-45 seconds). Prefer allowed_x_handles and from_date / to_date over query operators.',
    parameters: {
      query: { type: 'string', required: true, description: 'The X search query, e.g. an account handle or topic.' },
      allowed_x_handles: { type: 'array', items: { type: 'string' }, description: 'Optional X handles to search, without @ (max 20). Cannot be combined with excluded_x_handles.' },
      excluded_x_handles: { type: 'array', items: { type: 'string' }, description: 'Optional X handles to exclude, without @ (max 20). Cannot be combined with allowed_x_handles.' },
      enable_image_understanding: { type: 'boolean', description: 'When true, analyze images in matching posts.' },
      enable_video_understanding: { type: 'boolean', description: 'When true, analyze videos in matching posts.' },
      from_date: { type: 'string', description: 'Optional inclusive start date, YYYY-MM-DD.' },
      to_date: { type: 'string', description: 'Optional inclusive end date, YYYY-MM-DD.' },
    },
    output: {
      schema: SEARCH_OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: formatGrokSearchOutput(value as SearchResult) }],
      presentationMeta: (_args, value) => searchMetaFromValue(value as SearchResult),
    },
    timeoutMs: options.xTimeoutMs,
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const request = parseXSearchArgs(args)
      const result = await options.x.search(request, exec.signal)
      const capped = capSources(result, options.maxResults)
      return { ...capped.content !== undefined ? { content: capped.content } : {}, sources: capped.sources.map(projectSearchSource), truncated: capped.truncated }
    },
    presentCall: (args) => presentSearchCall(args.query),
    presentResult: (args, result) => presentSearchResult(args.query, result),
  }))
}

const REJECT_TOOL_DESCRIPTION = 'Do not call this tool. It exists only to complete an xAI server-side x_search custom_tool_call; the search already ran.'
const REJECT_TOOL_OUTPUT = 'xAI already ran server-side x_search on this turn. Continue from the assistant text. Do not mention this tool name to the user.'

/** Register execute-only reject tools. Callers must strip them from Responses params.tools. */
export function applyXaiServerSearchRejectTools(ctx: Context): void {
  ctx.systemPrompt?.section({
    name: 'tool:xai-backend-search',
    order: 104,
    text: 'The main chat request already includes xAI server-side web_search and x_search. Web lookup happens inside the model turn (shown as thinking). x_keyword_search, x_semantic_search, x_user_search, and x_thread_fetch are completion stubs for xAI custom_tool_call — never advertise them as tools you chose to call.',
  })
  for (const name of XAI_SERVER_X_SEARCH_REJECT_NAMES) {
    ctx.tools.register(defineTool({
      name,
      description: REJECT_TOOL_DESCRIPTION,
      parameters: {},
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { message: { type: 'string', required: true } } },
        render: () => [{ type: 'text', text: REJECT_TOOL_OUTPUT }],
      },
      isConcurrencySafe: () => true,
      presentCall: () => ({ card: 'generic', title: 'X search', kind: 'search' }),
      presentResult: () => ({ card: 'generic', title: 'X search' }),
      async execute() {
        return { message: REJECT_TOOL_OUTPUT }
      },
    }))
  }
}

/** Enforce the consumer-side source cap, mirroring the ctx.web seam contract. */
export function capSources(result: SearchResult, maxResults: number): SearchResult {
  // A non-positive cap is fail-closed: return no sources (and mark truncation),
  // never "unlimited". The seam treats `undefined` as no bound; 0 means none.
  if (maxResults <= 0) {
    return result.sources.length === 0 ? result : { ...result, sources: [], truncated: true }
  }
  if (result.sources.length <= maxResults) return result
  return { ...result, sources: result.sources.slice(0, maxResults), truncated: true }
}
