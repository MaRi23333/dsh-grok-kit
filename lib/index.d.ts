import z from "@deepseek-ai/schemastery";
import { HarnessError } from "@deepseek-ai/dsh-llm";
import { PiAiAdapter } from "@deepseek-ai/dsh-llm-pi-ai";
import { Api, AssistantMessageEvent, AuthInteraction, Credential, CredentialInfo, CredentialStore, Model, MutableModels, OAuthCredential, Provider } from "@earendil-works/pi-ai";
import { Context } from "@deepseek-ai/cordis";
import { AttachmentStore, ImageMediaType } from "@deepseek-ai/dsh-attachment";
//#region src/catalog.d.ts
declare const XAI_MODELS_URL = "https://api.x.ai/v1/models";
type CatalogSource = 'live' | 'cache' | 'fallback';
/**
 * Hand-written grok-4.6 descriptor. pi-ai's installed xai.json does not ship
 * this id; live listings inherit from grok-4.5 unless this entry is first.
 * `asHarnessModels` rewrites `provider` to the harness route.
 */
declare const GROK_46_MODEL: Model<'openai-responses'>;
/** Pull model ids from an OpenAI-shaped or gateway-shaped listing body. */
declare function extractModelIds(body: unknown): string[];
/**
 * Composer / Settings picker filter: only mainline Grok chat models.
 * A mainline id is a plain `<major>[.<minor>]` version (grok-4.5, grok-4.6,
 * future grok-4.7 / grok-5, …); the allowlist keeps known ids explicit.
 * Variants — grok-build-0.1, grok-code-fast, Imagine / video / embedding /
 * TTS — are hidden from BOTH the composer and the Settings list, so the
 * picker stays a Grok-chat-model selector.
 */
declare function isComposerChatModel(id: string): boolean;
declare function catalogModels(baseline?: readonly Model<Api>[]): readonly Model<Api>[];
/** Turn a live id into a pi-ai model, inheriting catalog metadata when possible. */
declare function materializeLiveModel(id: string, catalog?: readonly Model<Api>[]): Model<Api>;
/**
 * If `liveIds` is missing or empty, serve the installed catalog.
 * Otherwise serve only the live ids, each materialized against the catalog.
 * Non-chat ids (Imagine / video / embedding / TTS) are dropped in both cases.
 */
declare function mergeLiveCatalog(catalog: readonly Model<Api>[], liveIds: readonly string[] | undefined): Model<Api>[];
declare function preferredXaiOAuthModelFrom(models: readonly {
  id: string;
}[]): string;
/** Drop non-chat ids from a saved picker selection. Empty → undefined (caller falls back). */
declare function filterSelectedChatModelIds(ids: readonly string[]): string[] | undefined;
/** Fetch the account-visible model ids. Throws a secret-free error on failure. */
declare function fetchLiveModelIds(accessToken: string, signal?: AbortSignal): Promise<string[]>;
//#endregion
//#region src/token-source.d.ts
/** OAuth-only token source shared by search, chat 401 retry, and Imagine. */
interface XaiOAuthTokenSource {
  /** Cheap local availability check. Must not refresh or make network calls. */
  available(): boolean;
  /** Resolve a current OAuth bearer. Implementations may refresh an expired token under their existing lock. */
  resolve(signal?: AbortSignal): Promise<string | undefined>;
  /** Force-refresh after a server-side 401. Must stay OAuth-only and serialize refresh-token rotation. */
  refresh?(rejectedAccessToken: string, signal?: AbortSignal): Promise<string | undefined>;
}
/**
 * Build a token source that is OAuth-only by construction, including forced
 * refresh after a server-side 401. In-process refreshes for the same rejected
 * bearer coalesce onto one `oauth.refresh` call.
 */
declare function createXaiOAuthSearchTokenSource(session: XaiOAuthSession): XaiOAuthTokenSource;
//#endregion
//#region src/response-chain.d.ts
/**
 * Client-side bookkeeping for xAI stateful Responses (store + previous_response_id).
 * Fingerprints are hashes of client-originated input items; the search corpus
 * itself never lives here.
 * @module dsh-grok-kit/response-chain
 */
interface ResponseChainRecord {
  responseId: string;
  fingerprints: string[];
  model: string;
  updatedAt: number;
  /** Only `stop` may continue. `toolUse` means DSH will send tool results next. */
  stopReason: string;
}
interface ResponseChainStore {
  get(sessionId: string): ResponseChainRecord | undefined;
  set(sessionId: string, record: ResponseChainRecord): void;
  delete(sessionId: string): void;
}
declare function isToolOutputInputItem(item: unknown): boolean;
declare function isUserInputItem(item: unknown): boolean;
/** User / system messages and local tool results — not model output. */
declare function isClientOriginatedInputItem(item: unknown): boolean;
declare function extractClientInputItems(input: unknown): unknown[];
declare function fingerprintInputItem(item: unknown): string;
declare function clientInputDelta(previousFingerprints: readonly string[], currentItems: readonly unknown[]): {
  kind: 'reset';
} | {
  kind: 'delta';
  items: unknown[];
};
declare function applyStatefulContinuation(payload: Record<string, unknown>, options: {
  sessionId: string;
  modelId: string;
  store: ResponseChainStore;
  forceFullReplay?: boolean;
}): {
  payload: Record<string, unknown>;
  fingerprints: string[];
  usedPrevious: boolean;
};
/** File-backed chain store. Writes are fire-and-forget after the in-memory map updates. */
declare function createFileResponseChainStore(dshHome?: string): ResponseChainStore;
declare function createMemoryResponseChainStore(initial?: Record<string, ResponseChainRecord>): ResponseChainStore;
//#endregion
//#region src/responses.d.ts
declare const XAI_SERVER_X_SEARCH_REJECT_NAMES: readonly ["x_keyword_search", "x_semantic_search", "x_user_search", "x_thread_fetch"];
/**
 * Function tools that collide with xAI built-in server-side tool names.
 * Live OAuth probe 2026-08-24: `{type:function,name:"web_search"}` +
 * `{type:"web_search"}` → HTTP 400 `Duplicate tool names: web_search`.
 * Mixing a *different* function name with `{type:"web_search"}` is HTTP 200.
 */
declare const XAI_BUILTIN_SEARCH_FUNCTION_NAMES: readonly ["web_search", "x_search", "grok_web_search"];
interface XaiResponsesWrapOptions {
  backendSearch: boolean;
  /** When true, wrap the event stream and retry once on HTTP 401. */
  retry401: boolean;
  tokenSource?: XaiOAuthTokenSource;
  /** Set by wrap from streamSimple options.reasoning === "off" before inner mapping. */
  skipDefaultHigh?: boolean;
  /**
   * store:true + previous_response_id with only new client items.
   * Omit / false keeps pi-ai's store:false full replay.
   */
  statefulResponses?: boolean;
  chainStore?: ResponseChainStore;
}
declare function isPreviousResponseError(event: AssistantMessageEvent): boolean;
/**
 * Mutate a Responses payload. Never returns undefined (pi-ai only replaces
 * params when onPayload's result is defined). Completions models get the
 * same object reference back.
 */
declare function applyXaiResponsesPayload(payload: unknown, model: Pick<Model<Api>, 'api'>, options: XaiResponsesWrapOptions): unknown;
/** Wrap a provider's stream / streamSimple. Outer 401 retry, inner onPayload. */
declare function wrapXaiResponsesProvider(provider: Provider, options: XaiResponsesWrapOptions): Provider;
//#endregion
//#region src/store.d.ts
/** Resolve the legacy dsh-owned OAuth document path. */
declare function xaiOAuthAuthPath(dshHome?: string): string;
/**
 * Live credential path: prefer ~/.grok/auth.json so dsh and Grok CLI share
 * one refresh-token rotation. Fall back to the legacy dsh file only when that
 * exists and the Grok file does not. New logins land in the Grok file.
 */
declare function resolveXaiOAuthStorePath(options?: {
  dshHome?: string;
  userHome?: string;
}): string;
/** Writer lock lives next to a dsh-owned path, never as ~/.grok/auth.json.lock. */
declare function lockPathForAuthFile(filename: string): string;
/** File-backed pi-ai store scoped to the single xAI provider. */
declare class XaiOAuthCredentialStore implements CredentialStore {
  readonly filename: string;
  /** Path whose `.lock` sibling serializes writers. Separate from Grok CLI. */
  readonly lockFilename: string;
  constructor(filename?: string);
  /** Whether this store reads/writes the Grok CLI document. */
  get sharedWithGrokCli(): boolean;
  private readText;
  private readCurrent;
  /**
   * Accept both provider spellings reading this one credential document: the
   * pi-ai provider id (`xai`) used by login/refresh, and the harness route id
   * (`xai-oauth`) under which the adapter's pi-ai collection resolves auth.
   */
  private owns;
  /** Cheap synchronous file-existence check; never refreshes or reads secrets. */
  exists(): boolean;
  read(providerId: string): Promise<Credential | undefined>;
  list(): Promise<readonly CredentialInfo[]>;
  /**
   * Run a read-modify-write under the cross-process writer lock.
   * The lock's wait budget is a fixed 2s (dsh-atomic-write) and is sized for
   * pure file I/O: `fn` MUST NOT perform network work inside the lock.
   * Refresh-first-then-commit flows read + refresh outside and only run the
   * guarded compare-and-write here (see createXaiOAuthSearchTokenSource).
   * pi-ai's own OAuth refresh does run inside its `modify` call — host
   * behaviour, same as upstream dsh-xai; a single refresh round trip fits the
   * 2s deadline in practice.
   */
  modify(providerId: string, fn: (current: Credential | undefined) => Promise<Credential | undefined>): Promise<Credential | undefined>;
  delete(providerId: string): Promise<void>;
}
//#endregion
//#region src/session.d.ts
/** One process-local owner of the credential and the account model list. */
declare class XaiOAuthSession {
  readonly store: XaiOAuthCredentialStore;
  readonly models: MutableModels;
  wrapOptions: XaiResponsesWrapOptions;
  private readonly baseline;
  private liveIds;
  private selectedIds;
  private source;
  private listingError;
  private readonly cacheFile;
  private onCatalogChange;
  private cachedProvider;
  constructor(store?: XaiOAuthCredentialStore, onCatalogChange?: () => void);
  setWrapOptions(next: XaiResponsesWrapOptions): void;
  private invalidateProvider;
  /** Secret-free listing diagnostic from the last refresh. */
  get catalogError(): string | undefined;
  get catalogSource(): CatalogSource;
  availableModels(): Model<Api>[];
  /** Unfiltered live ids (includes Imagine models used by grok_imagine). */
  liveModelIds(): readonly string[] | undefined;
  selectedModelIds(): string[] | undefined;
  visibleModels(): Model<Api>[];
  /** Provider whose id matches the harness route so PiAiAdapter can list models. */
  provider(): Provider;
  loadCachedCatalog(): Promise<void>;
  refreshLiveCatalog(signal?: AbortSignal): Promise<void>;
  setSelectedModels(ids: readonly string[]): Promise<void>;
  logout(): Promise<void>;
  private writeCache;
}
//#endregion
//#region src/adapter.d.ts
/** Prefer grok-4.6 when the current (live or installed) list has it. */
declare function preferredXaiOAuthModel(models?: readonly {
  id: string;
}[]): string;
/**
 * Create the SuperGrok adapter without a dsh fork.
 * The public pi-ai adapter owns streaming, tools, reasoning, and compaction;
 * this plugin supplies the OAuth credential store/config and an account model
 * list. `resolveApiKey` deliberately returns undefined: authentication goes
 * through the profile's pi-ai provider, whose oauth channel reads the same
 * credential store pi-ai itself refreshes under its own lock — one auth source
 * for chat, model listing, and the search tools.
 */
declare function createXaiOAuthAdapter(session: XaiOAuthSession, resolveAttachments: () => AttachmentStore | undefined): PiAiAdapter;
//#endregion
//#region src/auth.d.ts
/** Non-secret login state shown by the launcher. */
interface XaiOAuthAuthStatus {
  authenticated: boolean;
  expiresAt?: Date;
}
/** Complete provider-native OAuth and persist the resulting credential. */
declare function loginXaiOAuth(interaction: AuthInteraction, store?: XaiOAuthCredentialStore): Promise<void>;
/** Copy ~/.grok/auth.json into the dsh store. Does not modify the Grok file. */
declare function importXaiOAuthFromGrok(store?: XaiOAuthCredentialStore, filename?: string): Promise<void>;
/** Remove the stored xAI OAuth credential. */
declare function logoutXaiOAuth(store?: XaiOAuthCredentialStore): Promise<void>;
/** Read non-secret login state without refreshing the token. */
declare function xaiOAuthAuthStatus(store?: XaiOAuthCredentialStore): Promise<XaiOAuthAuthStatus>;
/** Login then refresh the account model list when a session is available. */
declare function loginXaiOAuthSession(interaction: AuthInteraction, session: XaiOAuthSession): Promise<void>;
declare function importXaiOAuthSession(session: XaiOAuthSession, filename?: string): Promise<void>;
//#endregion
//#region src/auth-routes.d.ts
declare const XAI_OAUTH_AUTH_STATUS_PATH = "/plugins/dsh-grok-kit/auth/status";
declare const XAI_OAUTH_AUTH_LOGIN_PATH = "/plugins/dsh-grok-kit/auth/login";
declare const XAI_OAUTH_AUTH_IMPORT_PATH = "/plugins/dsh-grok-kit/auth/import";
declare const XAI_OAUTH_AUTH_LOGOUT_PATH = "/plugins/dsh-grok-kit/auth/logout";
declare const XAI_OAUTH_AUTH_MODELS_PATH = "/plugins/dsh-grok-kit/auth/models";
declare const XAI_OAUTH_AUTH_PROXY_PATH = "/plugins/dsh-grok-kit/auth/proxy";
type XaiOAuthWebAuthStatus = {
  status: 'signed-out';
  grokImportAvailable: boolean;
  sharedGrokAuth: boolean;
} | {
  status: 'signing-in';
  url?: string;
  userCode?: string;
  grokImportAvailable: boolean;
  sharedGrokAuth: boolean;
} | {
  status: 'signed-in';
  models: string[];
  available: string[];
  selected: string[];
  catalogSource: CatalogSource;
  catalogError?: string;
  grokImportAvailable: boolean;
  sharedGrokAuth: boolean;
} | {
  status: 'error';
  message: string;
  grokImportAvailable: boolean;
  sharedGrokAuth: boolean;
};
interface LoginChallenge {
  url: string;
  userCode?: string;
}
/** Register the plugin-owned OAuth routes when the Web server is composed. */
declare function registerXaiOAuthAuthRoutes(ctx: Context, session: XaiOAuthSession): void;
//#endregion
//#region src/grok-import.d.ts
/** Same client id pi-ai / Grok CLI use for the device-code grant. */
declare const GROK_XAI_CLIENT_ID = "b1a00492-073a-47ea-816f-4c329264a828";
declare const GROK_XAI_SLOT_KEY = "https://auth.x.ai::b1a00492-073a-47ea-816f-4c329264a828";
interface GrokImportProbe {
  available: boolean;
  path: string;
}
/** Resolve the Grok CLI auth document. */
declare function grokAuthPath(home?: string): string;
/** True when `filename` is the Grok CLI auth document (`~/.grok/auth.json`). */
declare function isGrokAuthPath(filename: string): boolean;
/** True when the JSON is a Grok CLI multi-slot document, not the dsh v1 envelope. */
declare function isGrokAuthDocument(value: unknown): boolean;
/**
 * Write an OAuth credential back into a Grok CLI document, preserving every
 * unrelated slot and every extra field on the xAI slot (email, names, …).
 */
declare function writeGrokAuthDocument(existingText: string | undefined, credential: OAuthCredential): string;
/** Drop the xAI slot. Returns undefined when the document would be empty (caller should unlink). */
declare function removeGrokAuthSlot(existingText: string): string | undefined;
/** Parse a Grok CLI / generic OAuth document into a pi-ai credential. */
declare function parseGrokAuthDocument(text: string, filename: string): OAuthCredential;
/** Whether ~/.grok/auth.json exists and looks importable. Never returns secrets. */
declare function probeGrokAuth(filename?: string): Promise<GrokImportProbe>;
/** Copy Grok CLI tokens into the store. No-op write when the store already is that file. */
declare function importGrokAuth(store: XaiOAuthCredentialStore, filename?: string): Promise<OAuthCredential>;
//#endregion
//#region src/ids.d.ts
/** pi-ai provider id used by login, refresh, and the credential store. */
declare const XAI_PI_PROVIDER = "xai";
/** Harness LLM route. Distinct from the catalog `xai` API-key route. */
declare const XAI_OAUTH_ROUTE = "xai-oauth";
/** Basename of the OAuth document inside the Harness home. */
declare const XAI_OAUTH_AUTH_FILENAME = ".xai-oauth-auth.json";
/** Preferred chat model when the live or installed catalog includes it. */
declare const PREFERRED_XAI_OAUTH_MODEL = "grok-4.6";
/** Fallback model when the installed pi-ai catalog has no grok-4.6. */
declare const DEFAULT_XAI_OAUTH_MODEL = "grok-4.5";
/** Provider idle ceiling used by the composite route. */
declare const XAI_OAUTH_STREAM_IDLE_TIMEOUT_MS = 300000;
//#endregion
//#region src/imagine.d.ts
declare const XAI_IMAGES_URL = "https://api.x.ai/v1/images/generations";
declare const DEFAULT_IMAGINE_MODEL = "grok-imagine-image-2.0";
declare function sniffImageMediaType(bytes: Uint8Array): ImageMediaType | undefined;
declare function imagineModelId(liveIds: readonly string[] | undefined): string;
interface GrokImagineOptions {
  tokens: XaiOAuthTokenSource;
  session: XaiOAuthSession;
  resolveAttachments: () => AttachmentStore | undefined;
  fetch?: typeof fetch;
}
declare function applyGrokImagineTool(ctx: Context, options: GrokImagineOptions): void;
//#endregion
//#region src/redact.d.ts
/** Remove token-like strings from an external OAuth diagnostic. */
declare function safeMessage(error: unknown): string;
//#endregion
//#region src/proxy.d.ts
/** Absolute path of the plugin-owned proxy setting file. */
declare function xaiProxyPath(dshHome?: string): string;
/**
 * Read the plugin's own stored proxy URL ('' = off; invalid/userinfo values
 * are dropped AND the disk copy is scrubbed so credentials do not linger).
 */
declare function readStoredProxyUrl(): string;
/**
 * Persist the plugin's own proxy setting. Fail-closed: URLs with embedded
 * credentials or invalid proxies are rejected BEFORE anything hits disk.
 */
declare function writeStoredProxyUrl(url: string): Promise<void>;
/**
 * Point the xAI-only hook at a proxy URL; '' clears it (xAI goes direct too).
 * Invalid URLs are rejected and never throw — the plugin must not crash on a
 * bad stored/env value. Returns true when the value was applied.
 */
declare function setXaiProxyUrl(url: string): boolean;
/**
 * Install a transparent global-fetch hook that routes ONLY x.ai origins
 * through this plugin's ProxyAgent; every other request goes to the
 * original fetch untouched. Reference counted: every install returns its
 * OWN idempotent disposer, and the original fetch is restored only after
 * the LAST owner releases — and only if our wrapper is still installed
 * (a later component that replaced fetch after us is never clobbered).
 */
declare function installXaiFetchHook(): () => void;
/** Effective proxy URL: stored setting > config `proxyUrl` > `DSH_XAI_PROXY`. Invalid/userinfo values resolve to ''. */
declare function resolveXaiProxyUrl(configUrl?: string): string;
/**
 * Apply the effective proxy URL (stored > config > env) to the already
 * installed hook. Callers own the hook lifecycle via installXaiFetchHook().
 * Returns the effective URL, '' when unset/invalid.
 */
declare function applyXaiProxy(configUrl?: string): string;
//#endregion
//#region src/search.d.ts
declare const XAI_SEARCH_TOOLS: readonly ["web_search", "x_search"];
type XaiSearchTool = typeof XAI_SEARCH_TOOLS[number];
declare const XAI_RESPONSES_URL = "https://api.x.ai/v1/responses";
/** OAuth-friendly Grok Build model; override via config `searchModel`. */
declare const DEFAULT_XAI_SEARCH_MODEL = "grok-build-0.1";
interface XaiOAuthSearchProviderOptions {
  model?: string;
  fetch?: typeof fetch;
}
interface XaiResponsesBody extends Record<string, unknown> {}
interface SearchSource {
  readonly url: string;
  readonly title?: string;
  readonly snippet?: string;
  readonly publishedAt?: string;
}
interface SearchResult {
  readonly content?: string;
  readonly sources: readonly SearchSource[];
  readonly truncated: boolean;
  /** xAI audit counters for one call (`server_side_tool_usage_details`). */
  readonly toolUsage?: Readonly<Record<string, number>>;
}
/** One already-validated search request. Filters map 1:1 onto the xAI tool payload. */
interface SearchRequest {
  readonly query: string;
  readonly allowedDomains?: readonly string[];
  readonly excludedDomains?: readonly string[];
  readonly allowedXHandles?: readonly string[];
  readonly excludedXHandles?: readonly string[];
  readonly fromDate?: string;
  readonly toDate?: string;
  readonly enableImageSearch?: boolean;
  readonly enableImageUnderstanding?: boolean;
  readonly enableVideoUnderstanding?: boolean;
}
/** Responses `include` values xAI actually accepts. `x_search_call.action.sources` is rejected with HTTP 400. */
declare function includeForSearchTool(tool: XaiSearchTool): readonly string[];
/**
 * Build the server-side tool object xAI expects. Only official filter keys
 * are forwarded; empty lists are omitted so a bare `{ type }` stays valid.
 */
declare function buildSearchToolPayload(tool: XaiSearchTool, request: SearchRequest): Record<string, unknown>;
/** Map an xAI Responses API envelope into DSH search result shape. */
declare function mapXaiSearchResponse(body: XaiResponsesBody): SearchResult;
declare class XaiOAuthSearchError extends HarnessError {}
/**
 * OAuth-only Grok search provider for one server-side xAI tool.
 * Deliberately NOT registered on `ctx.web`: tools call this class directly,
 * so the native `web_search` seam (provider selection) is never touched.
 */
declare class XaiOAuthSearchProvider {
  private readonly tokens;
  readonly tool: XaiSearchTool;
  readonly id: string;
  private readonly model;
  private readonly fetchImpl;
  constructor(tokens: XaiOAuthTokenSource, tool: XaiSearchTool, options?: XaiOAuthSearchProviderOptions);
  available(): boolean;
  private request;
  search(request: SearchRequest, signal?: AbortSignal): Promise<SearchResult>;
}
//#endregion
//#region src/tools.d.ts
/** Default upper bound on returned sources per call. */
declare const DEFAULT_SEARCH_MAX_RESULTS = 8;
/** Cooperative budget for `grok_web_search` (xAI web_search measured ~5-12s). */
declare const DEFAULT_WEB_SEARCH_TIMEOUT_MS = 60000;
/** Cooperative budget for `x_search` (xAI x_search measured ~24-45s; docs advise >=120s). */
declare const DEFAULT_X_SEARCH_TIMEOUT_MS = 120000;
/** Validate model-facing `grok_web_search` args into a provider request. */
declare function parseGrokWebSearchArgs(args: unknown): SearchRequest;
/** Validate model-facing `x_search` args into a provider request. */
declare function parseXSearchArgs(args: unknown): SearchRequest;
/** Format a search result as one model-facing text block (web and X posts alike). */
declare function formatGrokSearchOutput(result: SearchResult): string;
interface GrokSearchToolOptions {
  web: XaiOAuthSearchProvider;
  x: XaiOAuthSearchProvider;
  maxResults: number;
  webTimeoutMs: number;
  xTimeoutMs: number;
  /** When true, add the backend-search prompt that demotes nested tools. */
  backendSearch?: boolean;
}
/**
 * Register `grok_web_search` and `x_search` plus their system-prompt guidance.
 * Both stay visible when the OAuth login is missing and fail with a clear
 * structured error at execution time — the standard dsh tool contract.
 */
declare function applyGrokSearchTools(ctx: Context, options: GrokSearchToolOptions): void;
/** Register execute-only reject tools. Callers must strip them from Responses params.tools. */
declare function applyXaiServerSearchRejectTools(ctx: Context): void;
/** Enforce the consumer-side source cap, mirroring the ctx.web seam contract. */
declare function capSources(result: SearchResult, maxResults: number): SearchResult;
//#endregion
//#region src/index.d.ts
/**
 * Stable Cordis plugin name. Deliberately UNIQUE vs the old dsh-xai bundle:
 * dsh-xai also inserts `id: llm-xai-oauth`, so sharing that id would make the
 * loader reject a profile that still has both installed. The LLM route id
 * below (`xai-oauth`) is what keeps saved model settings compatible.
 */
declare const name = "dsh-grok-kit";
/** LLM registry required before the subscription route can register. */
declare const inject: string[];
interface Config {
  /** Optional outbound HTTP/HTTPS proxy for xAI traffic, e.g. http://127.0.0.1:8080; '' = stored/env default. */
  proxyUrl?: string;
  /** Model used for nested xAI search. Defaults to grok-build-0.1. */
  searchModel?: string;
  /** Upper bound on sources returned by one search call. Defaults to 8. */
  searchMaxResults?: number;
  /** Cooperative budget (ms) for grok_web_search. Defaults to 60000. */
  webSearchTimeoutMs?: number;
  /** Cooperative budget (ms) for x_search. Defaults to 120000. */
  xSearchTimeoutMs?: number;
  /**
   * Mix server-side web_search / x_search into the main chat request.
   * Schema default is false; this bundle's composition sets true.
   */
  backendSearch?: boolean;
  /**
   * Register nested grok_web_search / x_search. No schema default: omit means
   * `!backendSearch` at apply() time.
   */
  nestedSearchTools?: boolean;
  /**
   * store:true + previous_response_id continuation. No schema default:
   * omit means false. Do not enable while DSH is still in a toolUse step.
   */
  statefulResponses?: boolean;
  /** Register grok_imagine. Default true. */
  imagineTool?: boolean;
}
declare const Config: z<Config>;
/** Resolve nested-tool registration. `nestedSearchTools` omit stays undefined until here. */
declare function resolveNestedSearchTools(config: Config): {
  backendSearch: boolean;
  nestedSearchTools: boolean;
};
/** Opt-in only. Default off: DSH multi-step tool loops reprint search text if chained. */
declare function resolveStatefulResponses(config: Config): boolean;
/** Register the xai-oauth LLM route, OAuth routes, Imagine, and search wiring. */
declare function apply(ctx: Context, config: Config): void;
//#endregion
export { type CatalogSource, Config, DEFAULT_IMAGINE_MODEL, DEFAULT_SEARCH_MAX_RESULTS, DEFAULT_WEB_SEARCH_TIMEOUT_MS, DEFAULT_XAI_OAUTH_MODEL, DEFAULT_XAI_SEARCH_MODEL, DEFAULT_X_SEARCH_TIMEOUT_MS, GROK_46_MODEL, GROK_XAI_CLIENT_ID, GROK_XAI_SLOT_KEY, type GrokImportProbe, type LoginChallenge, PREFERRED_XAI_OAUTH_MODEL, type ResponseChainRecord, type ResponseChainStore, type SearchRequest, type SearchResult, type SearchSource, XAI_BUILTIN_SEARCH_FUNCTION_NAMES, XAI_IMAGES_URL, XAI_MODELS_URL, XAI_OAUTH_AUTH_FILENAME, XAI_OAUTH_AUTH_IMPORT_PATH, XAI_OAUTH_AUTH_LOGIN_PATH, XAI_OAUTH_AUTH_LOGOUT_PATH, XAI_OAUTH_AUTH_MODELS_PATH, XAI_OAUTH_AUTH_PROXY_PATH, XAI_OAUTH_AUTH_STATUS_PATH, XAI_OAUTH_ROUTE, XAI_OAUTH_STREAM_IDLE_TIMEOUT_MS, XAI_PI_PROVIDER, XAI_RESPONSES_URL, XAI_SERVER_X_SEARCH_REJECT_NAMES, type XaiOAuthAuthStatus, XaiOAuthCredentialStore, XaiOAuthSearchError, XaiOAuthSearchProvider, XaiOAuthSession, type XaiOAuthTokenSource, type XaiOAuthWebAuthStatus, type XaiResponsesWrapOptions, type XaiSearchTool, apply, applyGrokImagineTool, applyGrokSearchTools, applyStatefulContinuation, applyXaiProxy, applyXaiResponsesPayload, applyXaiServerSearchRejectTools, buildSearchToolPayload, capSources, catalogModels, clientInputDelta, createFileResponseChainStore, createMemoryResponseChainStore, createXaiOAuthAdapter, createXaiOAuthSearchTokenSource, extractClientInputItems, extractModelIds, fetchLiveModelIds, filterSelectedChatModelIds, fingerprintInputItem, formatGrokSearchOutput, grokAuthPath, imagineModelId, importGrokAuth, importXaiOAuthFromGrok, importXaiOAuthSession, includeForSearchTool, inject, installXaiFetchHook, isClientOriginatedInputItem, isComposerChatModel, isGrokAuthDocument, isGrokAuthPath, isPreviousResponseError, isToolOutputInputItem, isUserInputItem, lockPathForAuthFile, loginXaiOAuth, loginXaiOAuthSession, logoutXaiOAuth, mapXaiSearchResponse, materializeLiveModel, mergeLiveCatalog, name, parseGrokAuthDocument, parseGrokWebSearchArgs, parseXSearchArgs, preferredXaiOAuthModel, preferredXaiOAuthModelFrom, probeGrokAuth, readStoredProxyUrl, registerXaiOAuthAuthRoutes, removeGrokAuthSlot, resolveNestedSearchTools, resolveStatefulResponses, resolveXaiOAuthStorePath, resolveXaiProxyUrl, safeMessage, setXaiProxyUrl, sniffImageMediaType, wrapXaiResponsesProvider, writeGrokAuthDocument, writeStoredProxyUrl, xaiOAuthAuthPath, xaiOAuthAuthStatus, xaiProxyPath };