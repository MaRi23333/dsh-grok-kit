/**
 * Wrap pi-ai's openai-responses stream: encrypted reasoning include, default
 * high effort, optional mixed server-side search tools, optional 401 retry.
 * @module dsh-grok-kit/responses
 */

import {
  createAssistantMessageEventStream,
  type Api,
  type AssistantMessageEvent,
  type Context,
  type Model,
  type Provider,
  type SimpleStreamOptions,
  type StreamOptions,
} from '@earendil-works/pi-ai'
import type { XaiOAuthTokenSource } from './token-source.ts'

export const XAI_SERVER_X_SEARCH_REJECT_NAMES = [
  'x_keyword_search',
  'x_semantic_search',
  'x_user_search',
  'x_thread_fetch',
] as const

/**
 * Function tools that collide with xAI built-in server-side tool names.
 * Live OAuth probe 2026-08-24: `{type:function,name:"web_search"}` +
 * `{type:"web_search"}` → HTTP 400 `Duplicate tool names: web_search`.
 * Mixing a *different* function name with `{type:"web_search"}` is HTTP 200.
 */
export const XAI_BUILTIN_SEARCH_FUNCTION_NAMES = [
  'web_search',
  'x_search',
  'grok_web_search',
] as const

const STRIP_FUNCTION_NAMES = new Set<string>([
  ...XAI_SERVER_X_SEARCH_REJECT_NAMES,
  ...XAI_BUILTIN_SEARCH_FUNCTION_NAMES,
])
const ENCRYPTED_REASONING = 'reasoning.encrypted_content'

export interface XaiResponsesWrapOptions {
  backendSearch: boolean
  /** When true, wrap the event stream and retry once on HTTP 401. */
  retry401: boolean
  tokenSource?: XaiOAuthTokenSource
  /** Set by wrap from streamSimple options.reasoning === "off" before inner mapping. */
  skipDefaultHigh?: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isRetriableChat401(event: AssistantMessageEvent): boolean {
  return event.type === 'error' && /\b401\b/.test(event.error.errorMessage ?? '')
}

/**
 * Mutate a Responses payload. Never returns undefined (pi-ai only replaces
 * params when onPayload's result is defined). Completions models get the
 * same object reference back.
 */
export function applyXaiResponsesPayload(
  payload: unknown,
  model: Pick<Model<Api>, 'api'>,
  options: XaiResponsesWrapOptions,
): unknown {
  if (model.api !== 'openai-responses') return payload
  if (!isRecord(payload)) return payload === undefined ? {} : payload
  const params: Record<string, unknown> = { ...payload }

  const include = Array.isArray(params['include'])
    ? params['include'].filter((item): item is string => typeof item === 'string')
    : []
  if (!include.includes(ENCRYPTED_REASONING)) include.push(ENCRYPTED_REASONING)
  params['include'] = include

  if (!options.skipDefaultHigh) {
    const reasoning = isRecord(params['reasoning']) ? { ...params['reasoning'] } : {}
    if (typeof reasoning['effort'] !== 'string' || reasoning['effort'].length === 0) {
      reasoning['effort'] = 'high'
      if (reasoning['summary'] === undefined) reasoning['summary'] = 'auto'
    }
    params['reasoning'] = reasoning
  }

  if (options.backendSearch) {
    const tools = Array.isArray(params['tools']) ? [...params['tools']] : []
    const stripped = tools.filter(tool => {
      if (!isRecord(tool) || tool['type'] !== 'function') return true
      return typeof tool['name'] !== 'string' || !STRIP_FUNCTION_NAMES.has(tool['name'])
    })
    for (const type of ['web_search', 'x_search'] as const) {
      if (!stripped.some(tool => isRecord(tool) && tool['type'] === type)) {
        stripped.push({ type })
      }
    }
    params['tools'] = stripped
  }

  return params
}

function rewriteBackendSearchError(event: AssistantMessageEvent, backendSearch: boolean): AssistantMessageEvent {
  if (!backendSearch || event.type !== 'error') return event
  const message = event.error.errorMessage ?? ''
  if (/\b403\b/.test(message)) {
    return {
      ...event,
      error: {
        ...event.error,
        errorMessage:
          'xAI rejected this request (HTTP 403). Server-side web_search/x_search may be disabled for this SuperGrok tier — set backendSearch: false in the dsh-grok-kit plugin config.',
      },
    }
  }
  if (/\b400\b/.test(message) && /invalid.?tool|unknown.?tool|web_search|x_search|mixed/i.test(message)) {
    return {
      ...event,
      error: {
        ...event.error,
        errorMessage:
          'xAI rejected mixed server-side search tools (HTTP 400). Set backendSearch: false in the dsh-grok-kit plugin config.'
          + (message.length > 0 ? ` Original: ${message}` : ''),
      },
    }
  }
  return event
}

function withPayload(
  streamOptions: StreamOptions | SimpleStreamOptions | undefined,
  options: XaiResponsesWrapOptions,
): StreamOptions {
  const skipDefaultHigh = (streamOptions as { reasoning?: string } | undefined)?.reasoning === 'off'
  return {
    ...streamOptions,
    onPayload: async (payload, model) => {
      const upstream = await streamOptions?.onPayload?.(payload, model)
      const base = upstream ?? payload
      return applyXaiResponsesPayload(base, model, { ...options, skipDefaultHigh })
    },
  }
}

function retryOn401(
  inner: ReturnType<Provider['streamSimple']>,
  options: {
    retry: (apiKey: string) => ReturnType<Provider['streamSimple']>
    tokenSource: XaiOAuthTokenSource
    rejected: string
    signal?: AbortSignal
    backendSearch: boolean
  },
): ReturnType<Provider['streamSimple']> {
  const out = createAssistantMessageEventStream()
  void (async () => {
    try {
      const iterator = inner[Symbol.asyncIterator]()
      const first = await iterator.next()
      if (first.done) {
        out.end()
        return
      }
      const event = first.value
      if (isRetriableChat401(event)) {
        const refreshed = await options.tokenSource.refresh?.(options.rejected, options.signal)
        if (refreshed !== undefined && refreshed.length > 0 && refreshed !== options.rejected) {
          const second = options.retry(refreshed)
          for await (const next of second) {
            out.push(rewriteBackendSearchError(next, options.backendSearch))
          }
          out.end()
          return
        }
      }
      out.push(rewriteBackendSearchError(event, options.backendSearch))
      while (true) {
        const step = await iterator.next()
        if (step.done) break
        out.push(rewriteBackendSearchError(step.value, options.backendSearch))
      }
      out.end()
    } catch {
      out.end()
    }
  })()
  return out
}

function forwardStream(
  inner: ReturnType<Provider['streamSimple']>,
  backendSearch: boolean,
): ReturnType<Provider['streamSimple']> {
  const out = createAssistantMessageEventStream()
  void (async () => {
    try {
      for await (const event of inner) {
        out.push(rewriteBackendSearchError(event, backendSearch))
      }
      out.end()
    } catch {
      out.end()
    }
  })()
  return out
}

/** Wrap a provider's stream / streamSimple. Outer 401 retry, inner onPayload. */
export function wrapXaiResponsesProvider(
  provider: Provider,
  options: XaiResponsesWrapOptions,
): Provider {
  const run = (
    fn: Provider['streamSimple'],
    model: Model<Api>,
    context: Context,
    streamOptions?: StreamOptions,
  ) => {
    const injected = withPayload(streamOptions, options)
    const inner = fn.call(provider, model, context, injected)
    if (!options.retry401 || options.tokenSource === undefined) {
      return options.backendSearch ? forwardStream(inner, true) : inner
    }
    const rejected = streamOptions?.apiKey
    if (rejected === undefined || rejected.length === 0) {
      return options.backendSearch ? forwardStream(inner, true) : inner
    }
    return retryOn401(inner, {
      retry: apiKey => fn.call(provider, model, context, { ...injected, apiKey }),
      tokenSource: options.tokenSource,
      rejected,
      signal: streamOptions?.signal,
      backendSearch: options.backendSearch,
    })
  }
  return {
    ...provider,
    stream: (model, context, streamOptions) =>
      run(provider.stream, model, context, streamOptions),
    streamSimple: (model, context, streamOptions) =>
      run(provider.streamSimple, model, context, streamOptions),
  }
}

export { isRetriableChat401 }
