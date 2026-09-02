/**
 * xAI Grok kit for DeepSeek Harness: SuperGrok / X Premium OAuth, the
 * `xai-oauth` chat route, mixed server-side web/X search on the main
 * grok-4.6 request (`backendSearch`; on in this bundle's composition),
 * optional nested `grok_web_search` / `x_search`, `grok_imagine`, and a
 * per-plugin outbound proxy setting.
 *
 * Nested search tools are not registered on `ctx.web`. Native DSH
 * `web_search` stays in the host tool list; the Responses wrap strips
 * colliding function names from the xAI payload. No dsh source patch
 * is required.
 * @module dsh-grok-kit
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-attachment'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-llm'
import { createXaiOAuthAdapter } from './adapter.ts'
import { registerXaiOAuthAuthRoutes } from './auth-routes.ts'
import { XAI_OAUTH_ROUTE } from './ids.ts'
import { applyXaiProxy, installXaiFetchHook } from './proxy.ts'
import {
  createXaiOAuthSearchTokenSource,
  DEFAULT_XAI_SEARCH_MODEL,
  XaiOAuthSearchProvider,
} from './search.ts'
import { createFileResponseChainStore } from './response-chain.ts'
import { XaiOAuthSession } from './session.ts'
import { XaiOAuthCredentialStore } from './store.ts'
import { mergePluginOptions, readStoredOptions } from './options.ts'
import { applyGrokImagineTool } from './imagine.ts'
import {
  applyGrokSearchTools,
  applyXaiServerSearchRejectTools,
  DEFAULT_SEARCH_MAX_RESULTS,
  DEFAULT_WEB_SEARCH_TIMEOUT_MS,
  DEFAULT_X_SEARCH_TIMEOUT_MS,
} from './tools.ts'

export { createXaiOAuthAdapter, preferredXaiOAuthModel } from './adapter.ts'
export {
  importXaiOAuthFromGrok,
  importXaiOAuthSession,
  loginXaiOAuth,
  loginXaiOAuthSession,
  logoutXaiOAuth,
  xaiOAuthAuthStatus,
} from './auth.ts'
export type { XaiOAuthAuthStatus } from './auth.ts'
export {
  registerXaiOAuthAuthRoutes,
  XAI_OAUTH_AUTH_IMPORT_PATH,
  XAI_OAUTH_AUTH_LOGIN_PATH,
  XAI_OAUTH_AUTH_LOGOUT_PATH,
  XAI_OAUTH_AUTH_MODELS_PATH,
  XAI_OAUTH_AUTH_OPTIONS_PATH,
  XAI_OAUTH_AUTH_PROXY_PATH,
  XAI_OAUTH_AUTH_STATUS_PATH,
} from './auth-routes.ts'
export type { LoginChallenge, XaiOAuthWebAuthStatus } from './auth-routes.ts'
export {
  catalogModels,
  extractModelIds,
  fetchLiveModelIds,
  filterSelectedChatModelIds,
  GROK_46_MODEL,
  isComposerChatModel,
  materializeLiveModel,
  mergeLiveCatalog,
  preferredXaiOAuthModelFrom,
  XAI_MODELS_URL,
} from './catalog.ts'
export type { CatalogSource } from './catalog.ts'
export {
  grokAuthPath,
  importGrokAuth,
  isGrokAuthDocument,
  isGrokAuthPath,
  parseGrokAuthDocument,
  probeGrokAuth,
  removeGrokAuthSlot,
  writeGrokAuthDocument,
  GROK_XAI_CLIENT_ID,
  GROK_XAI_SLOT_KEY,
} from './grok-import.ts'
export type { GrokImportProbe } from './grok-import.ts'
export {
  DEFAULT_XAI_OAUTH_MODEL,
  PREFERRED_XAI_OAUTH_MODEL,
  XAI_OAUTH_AUTH_FILENAME,
  XAI_OAUTH_ROUTE,
  XAI_OAUTH_STREAM_IDLE_TIMEOUT_MS,
  XAI_PI_PROVIDER,
} from './ids.ts'
export {
  applyGrokImagineTool,
  DEFAULT_IMAGINE_MODEL,
  imagineModelId,
  sniffImageMediaType,
  XAI_IMAGES_URL,
} from './imagine.ts'
export {
  applyXaiResponsesPayload,
  isPreviousResponseError,
  sanitizeRejectToolEvent,
  stripRejectToolCalls,
  wrapXaiResponsesProvider,
  XAI_BUILTIN_SEARCH_FUNCTION_NAMES,
  XAI_SERVER_X_SEARCH_REJECT_NAMES,
} from './responses.ts'
export type { XaiResponsesWrapOptions } from './responses.ts'
export { safeMessage } from './redact.ts'
export {
  applyXaiProxy,
  installXaiFetchHook,
  readStoredProxyUrl,
  resolveXaiProxyUrl,
  setXaiProxyUrl,
  writeStoredProxyUrl,
  xaiProxyPath,
} from './proxy.ts'
export {
  createXaiOAuthSearchTokenSource,
  DEFAULT_XAI_SEARCH_MODEL,
  includeForSearchTool,
  buildSearchToolPayload,
  mapXaiSearchResponse,
  XAI_RESPONSES_URL,
  XaiOAuthSearchError,
  XaiOAuthSearchProvider,
} from './search.ts'
export type { SearchRequest, SearchResult, SearchSource, XaiOAuthTokenSource, XaiSearchTool } from './search.ts'
export {
  mergePluginOptions,
  optionsPath,
  readStoredOptions,
  sanitizeStoredOptions,
  writeStoredOptions,
} from './options.ts'
export type { StoredPluginOptions } from './options.ts'
export {
  applyStatefulContinuation,
  clientInputDelta,
  createFileResponseChainStore,
  createMemoryResponseChainStore,
  extractClientInputItems,
  fingerprintInputItem,
  isClientOriginatedInputItem,
  isToolOutputInputItem,
  isUserInputItem,
} from './response-chain.ts'
export type { ResponseChainRecord, ResponseChainStore } from './response-chain.ts'
export { XaiOAuthSession } from './session.ts'
export { XaiOAuthCredentialStore, lockPathForAuthFile, resolveXaiOAuthStorePath, xaiOAuthAuthPath } from './store.ts'
export {
  applyGrokSearchTools,
  applyXaiServerSearchRejectTools,
  capSources,
  DEFAULT_SEARCH_MAX_RESULTS,
  DEFAULT_WEB_SEARCH_TIMEOUT_MS,
  DEFAULT_X_SEARCH_TIMEOUT_MS,
  formatGrokSearchOutput,
  parseGrokWebSearchArgs,
  parseXSearchArgs,
} from './tools.ts'

/**
 * Stable Cordis plugin name. Deliberately UNIQUE vs the old dsh-xai bundle:
 * dsh-xai also inserts `id: llm-xai-oauth`, so sharing that id would make the
 * loader reject a profile that still has both installed. The LLM route id
 * below (`xai-oauth`) is what keeps saved model settings compatible.
 */
export const name = 'dsh-grok-kit'

/** LLM registry required before the subscription route can register. */
export const inject = ['llm']

export interface Config {
  /** Optional outbound HTTP/HTTPS proxy for xAI traffic, e.g. http://127.0.0.1:8080; '' = stored/env default. */
  proxyUrl?: string
  /** Model used for nested xAI search. Defaults to grok-build-0.1. */
  searchModel?: string
  /** Upper bound on sources returned by one search call. Defaults to 8. */
  searchMaxResults?: number
  /** Cooperative budget (ms) for grok_web_search. Defaults to 60000. */
  webSearchTimeoutMs?: number
  /** Cooperative budget (ms) for x_search. Defaults to 120000. */
  xSearchTimeoutMs?: number
  /**
   * Mix server-side web_search / x_search into the main chat request.
   * Schema default is false; this bundle's composition sets true.
   */
  backendSearch?: boolean
  /**
   * Register nested grok_web_search / x_search. No schema default: omit means
   * `!backendSearch` at apply() time.
   */
  nestedSearchTools?: boolean
  /**
   * store:true + previous_response_id continuation. No schema default:
   * omit means false. Do not enable while DSH is still in a toolUse step.
   */
  statefulResponses?: boolean
  /** Register grok_imagine. Default true. */
  imagineTool?: boolean
}

export const Config: z<Config> = z.object({
  proxyUrl: z.string().default(''),
  searchModel: z.string().default(DEFAULT_XAI_SEARCH_MODEL),
  searchMaxResults: z.number().default(DEFAULT_SEARCH_MAX_RESULTS),
  webSearchTimeoutMs: z.number().default(DEFAULT_WEB_SEARCH_TIMEOUT_MS),
  xSearchTimeoutMs: z.number().default(DEFAULT_X_SEARCH_TIMEOUT_MS),
  backendSearch: z.boolean().default(false),
  nestedSearchTools: z.boolean(),
  statefulResponses: z.boolean(),
  imagineTool: z.boolean().default(true),
})

/** Resolve nested-tool registration. `nestedSearchTools` omit stays undefined until here. */
export function resolveNestedSearchTools(config: Config): { backendSearch: boolean; nestedSearchTools: boolean } {
  const backendSearch = config.backendSearch ?? false
  return { backendSearch, nestedSearchTools: config.nestedSearchTools ?? !backendSearch }
}

/** Opt-in only. Default off: DSH multi-step tool loops reprint search text if chained. */
export function resolveStatefulResponses(config: Config): boolean {
  return config.statefulResponses ?? false
}

/** Register the xai-oauth LLM route, OAuth routes, Imagine, and search wiring. */
export function apply(ctx: Context, config: Config): void {
  // UI-stored overrides win per key over the Cordis config (which is where
  // the bundle's composition defaults live); untouched keys follow it.
  const effectiveConfig: Config = mergePluginOptions(
    config as unknown as Record<string, unknown>,
    readStoredOptions(),
  ) as unknown as Config
  // Proxy hook FIRST: every later x.ai request (OAuth, models, chat, search)
  // goes through globalThis.fetch and is routed by the hook. Registered as an
  // effect so the hook is restored and the ProxyAgent closed on dispose.
  ctx.effect(() => {
    const dispose = installXaiFetchHook()
    applyXaiProxy(effectiveConfig.proxyUrl)
    return dispose
  }, 'dsh-grok-kit: xAI proxy hook')

  const session = new XaiOAuthSession(new XaiOAuthCredentialStore(), () => {
    ctx.emit('llm/adapters-updated')
  })
  const tokens = createXaiOAuthSearchTokenSource(session)
  const { backendSearch, nestedSearchTools } = resolveNestedSearchTools(effectiveConfig)
  const statefulResponses = resolveStatefulResponses(effectiveConfig)
  session.setWrapOptions({
    backendSearch,
    retry401: true,
    tokenSource: tokens,
    statefulResponses,
    ...statefulResponses ? { chainStore: createFileResponseChainStore() } : {},
  })

  void session.loadCachedCatalog()
    .then(() => session.refreshLiveCatalog())
    .catch(error => {
      console.warn(
        'dsh-grok-kit: startup catalog refresh failed; chat still works with the cached or fallback model list.',
        error instanceof Error ? error.message : error,
      )
    })

  const already = ctx.llm.listProviders().some(provider => provider.id === XAI_OAUTH_ROUTE)
  if (already) {
    // The old dsh-xai bundle still owns the route: leave it (its credential
    // store is the same file) and keep the tools + proxy active.
    console.warn('dsh-grok-kit: the xai-oauth chat route is already registered by another bundle (dsh-xai still installed?). Keeping the existing registration. Nested grok_web_search / x_search stay available only when nestedSearchTools is on. Remove dsh-xai to let dsh-grok-kit own the route.')
  } else {
    ctx.llm.registerAdapter(
      [XAI_OAUTH_ROUTE],
      createXaiOAuthAdapter(session, () => ctx.get('attachments')),
    )
  }
  ctx.inject(['webServer'], webCtx => registerXaiOAuthAuthRoutes(webCtx, session))

  const searchModel = effectiveConfig.searchModel ?? DEFAULT_XAI_SEARCH_MODEL
  if (nestedSearchTools) {
    const web = new XaiOAuthSearchProvider(tokens, 'web_search', { model: searchModel })
    const x = new XaiOAuthSearchProvider(tokens, 'x_search', { model: searchModel })
    ctx.inject(['tools', 'systemPrompt'], toolCtx => applyGrokSearchTools(toolCtx, {
      web,
      x,
      maxResults: effectiveConfig.searchMaxResults ?? DEFAULT_SEARCH_MAX_RESULTS,
      webTimeoutMs: effectiveConfig.webSearchTimeoutMs ?? DEFAULT_WEB_SEARCH_TIMEOUT_MS,
      xTimeoutMs: effectiveConfig.xSearchTimeoutMs ?? DEFAULT_X_SEARCH_TIMEOUT_MS,
      backendSearch,
    }))
  }
  if (backendSearch) {
    ctx.inject(['tools', 'systemPrompt'], toolCtx => applyXaiServerSearchRejectTools(toolCtx))
  }
  if (effectiveConfig.imagineTool !== false) {
    ctx.inject(['tools'], toolCtx => applyGrokImagineTool(toolCtx, {
      tokens,
      session,
      resolveAttachments: () => ctx.get('attachments'),
    }))
  }
}
