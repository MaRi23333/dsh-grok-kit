/**
 * xAI Grok kit for DeepSeek Harness: SuperGrok / X Premium OAuth, the
 * `xai-oauth` chat route, optional server-side web/X search fused into the
 * main grok-4.6 request (`backendSearch`; off by default — opt in via config
 * or the settings page), optional nested `grok_web_search` / `x_search`,
 * `grok_imagine`, and a per-plugin outbound proxy setting.
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
import type {} from '@deepseek-ai/dsh-system-prompt'
import { createXaiOAuthAdapter } from './adapter.ts'
import { registerXaiOAuthAuthRoutes } from './auth-routes.ts'
import { XAI_OAUTH_ROUTE, XAI_PI_PROVIDER } from './ids.ts'
import { applyXaiProxy, fetchGrokQuota, installXaiFetchHook } from './proxy.ts'
import {
  createXaiOAuthSearchTokenSource,
  DEFAULT_XAI_SEARCH_MODEL,
  XaiOAuthSearchProvider,
} from './search.ts'
import { createFileResponseChainStore } from './response-chain.ts'
import { XaiOAuthSession } from './session.ts'
import { SessionSearchPolicy } from './session-search-policy.ts'
import { XaiOAuthCredentialStore } from './store.ts'
import { mergePluginOptions, readStoredOptions } from './options.ts'
import { resolveMediaOptions, type MediaToolKey } from './media-options.ts'
import { applyGrokImagineTool } from './imagine.ts'
import { applyGrokImagineEditTool } from './imagine-edit.ts'
import { DEFAULT_VIDEO_MODEL, DEFAULT_VIDEO_MAX_BYTES, validVideoModel, validVideoMaxBytes } from './video-config.ts'
import { VideoTaskManager } from './video-core.ts'
import { applyGrokVideoTools } from './video-tools.ts'
import { CapabilityTracker } from './capabilities.ts'
import { registerGrokCapabilityRoutes } from './capability-routes.ts'
import { registerGrokVideoFileRoute } from './video-file-route.ts'
import { SuperGrokQuotaClient } from './quota.ts'
import { registerGrokQuotaRoute } from './quota-routes.ts'
import { DEFAULT_MAX_IMAGE_BYTES as DEFAULT_EDIT_MAX_IMAGE_BYTES, MAX_SOURCE_IMAGES as EDIT_MAX_SOURCE_IMAGES } from './imagine-edit-core.ts'
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
  applyGrokImagineEditTool,
} from './imagine-edit.ts'
export {
  alignExtension,
  buildEditRequestBody,
  decodeFirstImage,
  DEFAULT_EDIT_MODEL,
  extensionFor as editExtensionFor,
  MAX_N as EDIT_MAX_N,
  normalizeDataImageUri,
  parseAttachmentSpec,
  resolveImageSources,
  runImageEdit,
  safeDetail,
  sniffEditableImageMediaType,
  XAI_IMAGES_EDIT_URL,
} from './imagine-edit-core.ts'
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
  presentPluginOptions,
  readStoredOptions,
  sanitizeStoredOptions,
  writeStoredOptions,
} from './options.ts'
export type { EffectivePluginOptions, OptionValueSource, PresentedPluginOptions, StoredPluginOptions } from './options.ts'
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
export { VideoTaskManager } from './video-core.ts'
export type { VideoTaskResult, VideoTaskState, VideoTaskManagerOptions, VideoSourceContext } from './video-core.ts'
export { applyGrokVideoTools } from './video-tools.ts'
export { CapabilityTracker } from './capabilities.ts'
export type { CapabilitySnapshot, CapabilityFeatureState, CapabilityObservation } from './capabilities.ts'
export { registerGrokCapabilityRoutes } from './capability-routes.ts'
export { registerGrokVideoFileRoute, GROK_VIDEO_FILE_PATH } from './video-file-route.ts'
export { DEFAULT_VIDEO_MODEL, DEFAULT_VIDEO_MAX_BYTES } from './video-config.ts'
export { XaiOAuthSession } from './session.ts'
export { XaiOAuthCredentialStore, lockPathForAuthFile, resolveXaiOAuthStorePath, xaiOAuthAuthPath } from './store.ts'
export { breakStaleWriterLock, isPidAlive, parseLockPid } from './lock-rescue.ts'
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
   * Schema default is false; this bundle's composition is also false.
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
  /** Register grok_imagine after explicit media consent. Default false. */
  imagineTool?: boolean
  /**
   * Register grok_imagine_edit (image-to-image over POST /v1/images/edits),
   * merged from the former dsh-grok-imagine-edit plugin. Default false;
   * independent advanced config; the settings page controls both image tools.
   */
  editTool?: boolean
  /** Pin the edit model; '' follows the live catalog (grok-imagine-image-2.0, fallback grok-imagine-image). */
  editModel?: string
  /** Per-request source-image cap for grok_imagine_edit. Defaults to 5 (xAI maximum). */
  editMaxSourceImages?: number
  /** Per-source byte cap for grok_imagine_edit. Defaults to 20 MiB. */
  editMaxImageBytes?: number
  /** Register video task tools. Opt-in only; generation consumes subscription usage. */
  videoTool?: boolean
  /** Explicit local acknowledgement of the documented media risks; not official authorization. Default false. */
  mediaRiskAcknowledged?: boolean
  /** Supported single-image video model. */
  videoModel?: string
  /** Hard streamed download ceiling, defaults to 100 MiB. */
  videoMaxBytes?: number
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
  imagineTool: z.boolean().default(false),
  editTool: z.boolean().default(false),
  editModel: z.string().default(''),
  editMaxSourceImages: z.number().default(EDIT_MAX_SOURCE_IMAGES),
  editMaxImageBytes: z.number().default(DEFAULT_EDIT_MAX_IMAGE_BYTES),
  videoTool: z.boolean().default(false),
  mediaRiskAcknowledged: z.boolean().default(false),
  videoModel: z.string().default(DEFAULT_VIDEO_MODEL),
  videoMaxBytes: z.number().default(DEFAULT_VIDEO_MAX_BYTES),
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
  const media = resolveMediaOptions(effectiveConfig as unknown as Record<string, unknown>)
  // Registration remains a startup decision. A saved close/revocation also
  // blocks subsequent calls through already registered tools and video routes.
  const mediaEnabled = (key: MediaToolKey): boolean => media[key] && resolveMediaOptions(mergePluginOptions(
    config as unknown as Record<string, unknown>,
    readStoredOptions(),
  ))[key]
  // Proxy lifecycle FIRST: OAuth, models, chat and search retain the global
  // hook; quota can opt into the same current proxy through an owned transport.
  // The effect restores our hook and closes both owned dispatchers on dispose.
  ctx.effect(() => {
    const dispose = installXaiFetchHook()
    applyXaiProxy(effectiveConfig.proxyUrl)
    return dispose
  }, 'dsh-grok-kit: xAI proxy hook')

  const session = new XaiOAuthSession(new XaiOAuthCredentialStore(), () => {
    // Model selection and catalog retries are not account changes. Auth routes
    // invalidate account-scoped data separately, including failed transitions.
    ctx.emit('llm/adapters-updated')
  })
  // Stop the session's background catalog retry timer on plugin unload.
  ctx.effect(() => () => session.dispose(), 'dsh-grok-kit: session retry lifecycle')
  const tokens = createXaiOAuthSearchTokenSource(session)
  const capabilities = new CapabilityTracker()
  const quota = new SuperGrokQuotaClient({ tokens, fetch: fetchGrokQuota })
  ctx.effect(() => () => quota.dispose(), 'dsh-grok-kit: quota lifecycle')
  ctx.inject(['webServer'], webCtx => registerGrokQuotaRoute(webCtx, quota))
  let capabilityIdentity: string | undefined
  // Auth transitions invalidate every earlier read. Within one auth epoch,
  // only the newest completed read may update the tracker; concurrent reads
  // for that same account can still return its identity.
  let identityGeneration = 0
  let identityRead = 0
  let observedIdentityRead = 0
  const currentIdentity = async (): Promise<string | undefined> => {
    const generation = identityGeneration
    const read = ++identityRead
    const identity = await tokens.identity?.()
    if (generation !== identityGeneration) return undefined
    if (read < observedIdentityRead) return identity === capabilityIdentity ? identity : undefined
    observedIdentityRead = read
    // Unknown identity is deliberately fail-closed: never retain a previous account's observations.
    if (identity !== capabilityIdentity || identity === undefined) capabilities.reset()
    // First capability initialization does not invalidate a cached quota for
    // that same account. Unknown identity still fails closed immediately.
    if (identity === undefined || (capabilityIdentity !== undefined && identity !== capabilityIdentity)) quota.reset()
    capabilityIdentity = identity
    return identity
  }
  const authenticated = async (): Promise<boolean> => {
    await currentIdentity()
    const credential = await session.store.read(XAI_PI_PROVIDER)
    return credential?.type === 'oauth'
  }
  const videoEnabled = media.videoTool
  const video = videoEnabled ? new VideoTaskManager({
    tokens,
    identity: currentIdentity,
    resolveAttachments: () => ctx.get('attachments'),
    model: validVideoModel(effectiveConfig.videoModel) ? effectiveConfig.videoModel : DEFAULT_VIDEO_MODEL,
    maxVideoBytes: validVideoMaxBytes(effectiveConfig.videoMaxBytes) ? effectiveConfig.videoMaxBytes : DEFAULT_VIDEO_MAX_BYTES,
    onCapability: event => {
      // A late response from the previous account must not contaminate this tracker.
      if (event.identity === capabilityIdentity) capabilities.observe('video', event)
    },
  }) : undefined
  if (video !== undefined) {
    ctx.effect(() => () => video.dispose(), 'dsh-grok-kit: video task lifecycle')
    ctx.inject(['tools'], toolCtx => applyGrokVideoTools(toolCtx, { manager: video, enabled: () => mediaEnabled('videoTool') }))
  }
  ctx.inject(['webServer'], webCtx => registerGrokCapabilityRoutes(webCtx, {
    tracker: capabilities,
    videoEnabled: () => mediaEnabled('videoTool'),
    authenticated,
    identity: currentIdentity,
    tasks: () => video?.list() ?? Promise.resolve([]),
    resume: (taskId, signal) => {
      if (video === undefined || !mediaEnabled('videoTool')) return Promise.reject(new Error('video generation is disabled'))
      return video.resume(taskId, signal)
    },
  }))
  ctx.inject(['webServer'], webCtx => registerGrokVideoFileRoute(webCtx, {
    enabled: () => mediaEnabled('videoTool'),
    identity: currentIdentity,
    tasks: () => video?.list() ?? Promise.resolve([]),
    resolveAttachments: () => ctx.get('attachments'),
    maxBytes: validVideoMaxBytes(effectiveConfig.videoMaxBytes) ? effectiveConfig.videoMaxBytes : DEFAULT_VIDEO_MAX_BYTES,
  }))
  const { backendSearch, nestedSearchTools } = resolveNestedSearchTools(effectiveConfig)
  const searchPolicy = new SessionSearchPolicy()
  ctx.effect(() => () => searchPolicy.dispose(), 'dsh-grok-kit: session search lifecycle')
  const statefulResponses = resolveStatefulResponses(effectiveConfig)
  session.setWrapOptions({
    backendSearch,
    resolveBackendSearch: sessionId => searchPolicy.resolve(sessionId),
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
    // Advertise only after our adapter successfully owns this route.
    ctx.provide('grokSearchPolicy', searchPolicy)
  }
  ctx.inject(['webServer'], webCtx => registerXaiOAuthAuthRoutes(
    webCtx,
    session,
    config as unknown as Record<string, unknown>,
    () => {
      identityGeneration += 1
      quota.reset()
      capabilities.reset()
      capabilityIdentity = undefined
    },
    () => quota.reset(),
  ))

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
  if (media.imagineTool) {
    ctx.inject(['tools'], toolCtx => applyGrokImagineTool(toolCtx, {
      tokens,
      session,
      resolveAttachments: () => ctx.get('attachments'),
      enabled: () => mediaEnabled('imagineTool'),
    }))
  }
  if (media.editTool) {
    ctx.inject(['tools'], toolCtx => applyGrokImagineEditTool(toolCtx, {
      tokens,
      session,
      resolveAttachments: () => ctx.get('attachments'),
      enabled: () => mediaEnabled('editTool'),
      editModel: effectiveConfig.editModel,
      maxSourceImages: effectiveConfig.editMaxSourceImages,
      maxImageBytes: effectiveConfig.editMaxImageBytes,
    }))
  }
}
