/**
 * Wrap pi-ai's openai-responses stream: encrypted reasoning include, default
 * high effort, optional mixed server-side search tools, optional 401 retry.
 * @module dsh-grok-kit/responses
 */

import {
  createAssistantMessageEventStream,
  type Api,
  type AssistantMessage,
  type AssistantMessageEvent,
  type Model,
  type TranscriptContext,
  type Provider,
  type SimpleStreamOptions,
  type StreamOptions,
} from '@earendil-works/pi-ai'
import { assertBearerDestination, guardBearerFetch } from './bearer-guard.ts'
import type { XaiOAuthTokenSource } from './token-source.ts'
import { safeMessage } from './redact.ts'
import {
  applyStatefulContinuation,
  type ResponseChainStore,
} from './response-chain.ts'

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
const REJECT_TOOL_NAMES = new Set<string>(XAI_SERVER_X_SEARCH_REJECT_NAMES)
const ENCRYPTED_REASONING = 'reasoning.encrypted_content'

export interface XaiResponsesWrapOptions {
  backendSearch: boolean
  /** Undefined preserves the provider default; false explicitly overrides a global on. */
  resolveBackendSearch?: (sessionId: string) => boolean | undefined
  /** Internal: this payload belongs to an explicitly bound session. */
  backendSearchOverride?: boolean
  /** When true, wrap the event stream and retry once on HTTP 401. */
  retry401: boolean
  tokenSource?: XaiOAuthTokenSource
  /** Set by wrap from streamSimple options.reasoning === "off" before inner mapping. */
  skipDefaultHigh?: boolean
  /**
   * store:true + previous_response_id with only new client items.
   * Omit / false keeps pi-ai's store:false full replay.
   */
  statefulResponses?: boolean
  chainStore?: ResponseChainStore
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Read the function name out of any client-tool shape pi-ai may serialize:
 * flat `{type:"function", name}` (current Responses), nested
 * `{type:"function", function:{name}}` (completions), or `{type:"custom", name}`
 * (grammar path). Stripping by name must keep working if upstream changes the
 * shape, otherwise the Duplicate-tool-names 400 comes back.
 */
function toolNameOf(tool: unknown): string | undefined {
  if (!isRecord(tool) || tool['type'] !== 'function' && tool['type'] !== 'custom') return undefined
  if (typeof tool['name'] === 'string') return tool['name']
  const nested = tool['function']
  return isRecord(nested) && typeof nested['name'] === 'string' ? nested['name'] : undefined
}

function isRetriableChat401(event: AssistantMessageEvent): boolean {
  return event.type === 'error' && /\b401\b/.test(event.error.errorMessage ?? '')
}

export function isPreviousResponseError(event: AssistantMessageEvent): boolean {
  if (event.type !== 'error') return false
  const message = event.error.errorMessage ?? ''
  return /\b400\b/.test(message) && /previous_response|unknown.?response|response.?id/i.test(message)
}

/** Drop xAI custom_tool_call stubs so DSH does not start another step and reprint the answer. */
export function stripRejectToolCalls(message: AssistantMessage): AssistantMessage {
  const content = message.content.filter(block => block.type !== 'toolCall' || !REJECT_TOOL_NAMES.has(block.name))
  if (content.length === message.content.length) return message
  const stillTools = content.some(block => block.type === 'toolCall')
  return {
    ...message,
    content,
    stopReason: !stillTools && message.stopReason === 'toolUse' ? 'stop' : message.stopReason,
  }
}

function rejectToolCallName(event: AssistantMessageEvent): string | undefined {
  // Relies on pi-ai createSlot constructing the ToolCall block (with name)
  // at toolcall_start and only mutating the args buffer on deltas — verified
  // in openai-responses-shared.js (custom_tool_call branch). If upstream ever
  // streams the name itself, this needs an accumulating-name strategy.
  if (event.type === 'toolcall_end') return event.toolCall.name
  if (event.type === 'toolcall_start' || event.type === 'toolcall_delta') {
    const block = event.partial.content[event.contentIndex]
    return block?.type === 'toolCall' ? block.name : undefined
  }
  return undefined
}

export function sanitizeRejectToolEvent(event: AssistantMessageEvent): AssistantMessageEvent | undefined {
  const name = rejectToolCallName(event)
  if (name !== undefined && REJECT_TOOL_NAMES.has(name)) return undefined
  if (event.type === 'done') {
    const message = stripRejectToolCalls(event.message)
    const reason = message.stopReason === 'stop' || message.stopReason === 'length' || message.stopReason === 'toolUse'
      ? message.stopReason
      : event.reason
    if (message === event.message && reason === event.reason) return event
    return { ...event, message, reason }
  }
  if (event.type === 'error') {
    const error = stripRejectToolCalls(event.error)
    return error === event.error ? event : { ...event, error }
  }
  if (event.type === 'start') {
    const partial = stripRejectToolCalls(event.partial)
    return partial === event.partial ? event : { ...event, partial }
  }
  return event
}

function finishedResponseOf(event: AssistantMessageEvent): { responseId: string; stopReason: string } | undefined {
  if (event.type !== 'done') return undefined
  const responseId = event.message.responseId
  if (typeof responseId !== 'string' || responseId.length === 0) return undefined
  return { responseId, stopReason: event.message.stopReason }
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
      const name = toolNameOf(tool)
      return name === undefined || !STRIP_FUNCTION_NAMES.has(name)
    })
    for (const type of ['web_search', 'x_search'] as const) {
      if (!stripped.some(tool => isRecord(tool) && tool['type'] === type)) {
        stripped.push({ type })
      }
    }
    params['tools'] = stripped
  } else if (options.backendSearchOverride && Array.isArray(params['tools'])) {
    params['tools'] = params['tools'].filter(tool =>
      !isRecord(tool) || tool['type'] !== 'web_search' && tool['type'] !== 'x_search',
    )
  }

  return params
}

function rewriteBackendSearchError(event: AssistantMessageEvent, backendSearch: boolean): AssistantMessageEvent {
  if (event.type === 'error' && event.error.errorMessage !== undefined) {
    event = { ...event, error: { ...event.error, errorMessage: safeMessage(event.error.errorMessage) } }
  }
  if (!backendSearch || event.type !== 'error') return event
  const message = event.error.errorMessage ?? ''
  if (/\b403\b/.test(message)) {
    return {
      ...event,
      error: {
        ...event.error,
        errorMessage:
          'xAI rejected this request (HTTP 403). Server-side web/X search looks unavailable on this account. Turn off Grok search adaptation for this Bot instance, or backendSearch for other DSH chats, then retry.',
      },
    }
  }
  if (/\b400\b/.test(message) && /invalid.?tool|unknown.?tool|web_search|x_search|mixed/i.test(message)) {
    return {
      ...event,
      error: {
        ...event.error,
        errorMessage:
          'xAI rejected this request (HTTP 400): the payload mixed server-side search tools. Turn off Grok search adaptation for this Bot instance, or backendSearch for other DSH chats, then retry.'
          + (message.length > 0 ? ` Original: ${message}` : ''),
      },
    }
  }
  return event
}

function withPayload(
  streamOptions: StreamOptions | SimpleStreamOptions | undefined,
  options: XaiResponsesWrapOptions,
  continuation?: {
    sessionId: string
    forceFullReplay: () => boolean
    pending: { fingerprints?: string[]; usedPrevious?: boolean }
    store: ResponseChainStore
  },
): StreamOptions {
  const skipDefaultHigh = (streamOptions as { reasoning?: string } | undefined)?.reasoning === 'off'
  return {
    ...streamOptions,
    onPayload: async (payload, model) => {
      const upstream = await streamOptions?.onPayload?.(payload, model)
      const base = upstream ?? payload
      const applied = applyXaiResponsesPayload(base, model, { ...options, skipDefaultHigh })
      if (continuation === undefined || !isRecord(applied) || model.api !== 'openai-responses') return applied
      const previous = continuation.store.get(continuation.sessionId)
      const changedSearchMode = previous !== undefined && (previous.backendSearch === undefined
        ? options.backendSearchOverride === true : previous.backendSearch !== options.backendSearch)
      const next = applyStatefulContinuation(applied, {
        sessionId: continuation.sessionId,
        modelId: model.id,
        store: continuation.store,
        forceFullReplay: continuation.forceFullReplay() || changedSearchMode,
      })
      continuation.pending.fingerprints = next.fingerprints
      continuation.pending.usedPrevious = next.usedPrevious
      return next.payload
    },
  }
}

/** Always settle result(): ending a pi-ai stream alone leaves that promise pending. */
function streamFailure(error: unknown, model: Model<Api>, signal?: AbortSignal): AssistantMessageEvent {
  const reason = signal?.aborted === true ? 'aborted' : 'error'
  return {
    type: 'error',
    reason,
    error: {
      role: 'assistant', content: [], api: model.api, provider: model.provider, model: model.id,
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: reason,
      timestamp: Date.now(),
      errorMessage: safeMessage(error),
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
    model: Model<Api>
  },
): ReturnType<Provider['streamSimple']> {
  const out = createAssistantMessageEventStream()
  void (async () => {
    try {
      const iterator = inner[Symbol.asyncIterator]()
      const first = await iterator.next()
      if (first.done) {
        out.push(streamFailure(new Error('xAI chat stream ended without a terminal event'), options.model, options.signal))
        out.end()
        return
      }
      const event = first.value
      if (isRetriableChat401(event)) {
        const refreshed = await options.tokenSource.refresh?.(options.rejected, options.signal)
        if (refreshed !== undefined && refreshed.length > 0 && refreshed !== options.rejected) {
          const second = options.retry(refreshed)
          let retriedTerminal = false
          for await (const next of second) {
            if (next.type === 'done' || next.type === 'error') retriedTerminal = true
            out.push(rewriteBackendSearchError(next, options.backendSearch))
          }
          if (!retriedTerminal) {
            out.push(streamFailure(new Error('xAI chat stream ended without a terminal event'), options.model, options.signal))
          }
          out.end()
          return
        }
      }
      let sawTerminal = event.type === 'done' || event.type === 'error'
      out.push(rewriteBackendSearchError(event, options.backendSearch))
      while (true) {
        const step = await iterator.next()
        if (step.done) break
        if (step.value.type === 'done' || step.value.type === 'error') sawTerminal = true
        out.push(rewriteBackendSearchError(step.value, options.backendSearch))
      }
      if (!sawTerminal) {
        out.push(streamFailure(new Error('xAI chat stream ended without a terminal event'), options.model, options.signal))
      }
      out.end()
    } catch (error: unknown) {
      // Never drop an error silently: an empty stream looks like a hang on the
      // user side. The host idle watchdog would eventually fire, but log now.
      console.error(`dsh-grok-kit: chat stream failed: ${safeMessage(error)}`)
      out.push(streamFailure(error, options.model, options.signal))
      out.end()
    }
  })()
  return out
}

function forwardStream(
  inner: ReturnType<Provider['streamSimple']>,
  backendSearch: boolean,
  model: Model<Api>,
  signal?: AbortSignal,
  extras?: {
    remember?: (responseId: string, stopReason: string) => void
    retryPrevious?: () => ReturnType<Provider['streamSimple']>
    usedPrevious?: () => boolean
  },
): ReturnType<Provider['streamSimple']> {
  const out = createAssistantMessageEventStream()
  void (async () => {
    try {
      let source = inner
      let first = true
      let sawTerminal = false
      for await (const event of source) {
        if (
          first
          && extras?.retryPrevious !== undefined
          && extras.usedPrevious?.() === true
          && isPreviousResponseError(event)
        ) {
          first = false
          source = extras.retryPrevious()
          let retriedTerminal = false
          for await (const retried of source) {
            if (retried.type === 'done' || retried.type === 'error') retriedTerminal = true
            const sanitized = backendSearch ? sanitizeRejectToolEvent(retried) : retried
            if (sanitized === undefined) continue
            const finished = finishedResponseOf(sanitized)
            if (finished !== undefined) extras.remember?.(finished.responseId, finished.stopReason)
            out.push(rewriteBackendSearchError(sanitized, backendSearch))
          }
          if (!retriedTerminal) {
            out.push(streamFailure(new Error('xAI chat stream ended without a terminal event'), model, signal))
          }
          out.end()
          return
        }
        first = false
        if (event.type === 'done' || event.type === 'error') sawTerminal = true
        const sanitized = backendSearch ? sanitizeRejectToolEvent(event) : event
        if (sanitized === undefined) continue
        const finished = finishedResponseOf(sanitized)
        if (finished !== undefined) extras?.remember?.(finished.responseId, finished.stopReason)
        out.push(rewriteBackendSearchError(sanitized, backendSearch))
      }
      if (!sawTerminal) {
        out.push(streamFailure(new Error('xAI chat stream ended without a terminal event'), model, signal))
      }
      out.end()
    } catch (error: unknown) {
      console.error(`dsh-grok-kit: chat stream failed: ${safeMessage(error)}`)
      out.push(streamFailure(error, model, signal))
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
    context: TranscriptContext,
    streamOptions?: StreamOptions,
  ) => {
    const sessionId = typeof streamOptions?.sessionId === 'string' && streamOptions.sessionId.length > 0
      ? streamOptions.sessionId
      : undefined
    // Freeze once: retries and result sanitization must use the mode of this request.
    const override = sessionId === undefined ? undefined : options.resolveBackendSearch?.(sessionId)
    const requestOptions = { ...options, backendSearch: override ?? options.backendSearch, backendSearchOverride: override !== undefined }
    const stateful = options.statefulResponses === true && options.chainStore !== undefined && sessionId !== undefined
    let forceFullReplay = false
    const pending: { fingerprints?: string[]; usedPrevious?: boolean } = {}
    const continuation = stateful
      ? {
        sessionId,
        forceFullReplay: () => forceFullReplay,
        pending,
        store: options.chainStore as ResponseChainStore,
      }
      : undefined
    // pi-ai sends the OAuth bearer itself (OpenAI SDK Authorization header).
    // Refuse a model whose base URL is outside the allowlist before that
    // request starts, and wrap fetch so the URL the SDK actually calls is
    // checked again. The wrapper also forces redirect: 'error' whenever the
    // request carries Authorization. Lookup global fetch at call time so the
    // proxy hook is the same one the SDK would have used.
    if (model.baseUrl.length > 0) assertBearerDestination(model.baseUrl)
    const injected = {
      ...withPayload(streamOptions, requestOptions, continuation),
      fetch: guardBearerFetch(streamOptions?.fetch ?? ((input, init) => globalThis.fetch(input, init))),
    }
    const begin = (apiKey?: string) => fn.call(
      provider,
      model,
      context,
      apiKey === undefined ? injected : { ...injected, apiKey },
    )
    // Tracks the key of the *currently active* request. retryOn401 updates it
    // after a refresh so the previous_response 400 fallback replays with the
    // fresh key instead of the rejected one (platform GROK-RETRY-001).
    let currentKey = streamOptions?.apiKey
    const extras = stateful
      ? {
        remember: (responseId: string, stopReason: string) => {
          if (pending.fingerprints === undefined) return
          options.chainStore?.set(sessionId, {
            responseId,
            fingerprints: pending.fingerprints,
            model: model.id,
            updatedAt: Date.now(),
            stopReason,
            backendSearch: requestOptions.backendSearch,
          })
        },
        retryPrevious: () => {
          forceFullReplay = true
          options.chainStore?.delete(sessionId)
          pending.usedPrevious = false
          return begin(currentKey)
        },
        usedPrevious: () => pending.usedPrevious === true,
      }
      : undefined
    const decorate = (inner: ReturnType<Provider['streamSimple']>) =>
      forwardStream(inner, requestOptions.backendSearch, model, streamOptions?.signal, extras)
    if (!options.retry401 || options.tokenSource === undefined) {
      return decorate(begin(currentKey))
    }
    const rejected = currentKey
    if (rejected === undefined || rejected.length === 0) {
      return decorate(begin(currentKey))
    }
    return decorate(retryOn401(begin(rejected), {
      retry: apiKey => {
        currentKey = apiKey
        return begin(apiKey)
      },
      tokenSource: options.tokenSource,
      rejected,
      signal: streamOptions?.signal,
      backendSearch: requestOptions.backendSearch,
      model,
    }))
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
