//

// Derived from dsh-xai (https://github.com/MirDie/dsh-xai), Apache-2.0.

// Modified for dsh-grok-kit — see NOTICE for the full attribution.

//

/**
 * Shared OAuth store + live catalog for the host plugin and CLI.
 * @module dsh-grok-kit/session
 */

import { mkdir, readFile, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { createModels } from '@earendil-works/pi-ai'
import type { Api, Model, MutableModels, Provider } from '@earendil-works/pi-ai'
import { xaiProvider } from '@earendil-works/pi-ai/providers/xai'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import {
  catalogModels,
  fetchLiveModelIds,
  filterSelectedChatModelIds,
  isComposerChatModel,
  mergeLiveCatalog,
  preferredXaiOAuthModelFrom,
  type CatalogSource,
} from './catalog.ts'
import { materializeLiveModel } from './catalog.ts'
import { XAI_OAUTH_ROUTE, XAI_PI_PROVIDER } from './ids.ts'
import { safeMessage } from './redact.ts'
import { wrapXaiResponsesProvider, type XaiResponsesWrapOptions } from './responses.ts'
import { XaiOAuthCredentialStore } from './store.ts'

const MODELS_CACHE_VERSION = 2
const MODELS_CACHE_FILENAME = '.xai-oauth-models.json'

/**
 * Background retry cadence after a failed live-catalog refresh (credential
 * resolution or listing). The first retry exists for the leftover-writer-lock
 * incident: a leftover writer lock (including one whose owner cannot be
 * proven) wedges the startup refresh for its 2s wait budget, and the next try
 * may succeed once the lock is released or cleared. Sized to stay quiet:
 * three attempts over ~2.5 minutes, then give up until the next explicit
 * trigger.
 */
const CATALOG_RETRY_DELAYS_MS = [5_000, 30_000, 120_000]

interface ModelsCacheDocument {
  version: typeof MODELS_CACHE_VERSION
  ids: string[]
  selected?: string[]
  fetchedAt: number
}

interface ParsedCache {
  ids: string[]
  selected?: string[]
}

function isENOENT(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT'
}

function modelsCachePath(dshHome?: string): string {
  return resolve(join(resolveDshHome(dshHome), MODELS_CACHE_FILENAME))
}

function parseIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((id): id is string => typeof id === 'string' && id.length > 0))]
}

function parseCache(text: string): ParsedCache | undefined {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return undefined
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const document = value as Record<string, unknown>
  if (document['version'] !== 1 && document['version'] !== MODELS_CACHE_VERSION) return undefined
  const ids = parseIdList(document['ids'])
  const selected = parseIdList(document['selected'])
  if (ids.length === 0 && selected.length === 0) return undefined
  return {
    ids,
    ...selected.length === 0 ? {} : { selected },
  }
}

function asHarnessModels(models: readonly Model<Api>[]): Model<Api>[] {
  return models.map(model => model.provider === XAI_OAUTH_ROUTE ? model : { ...model, provider: XAI_OAUTH_ROUTE })
}

function requestProvider(provider: Provider): Provider {
  return {
    ...provider,
    auth: {
      ...provider.auth,
      apiKey: {
        name: 'xAI Grok OAuth bearer token',
        async resolve({ credential }) {
          const apiKey = credential?.key
          return apiKey === undefined || apiKey.length === 0
            ? undefined
            : { auth: { apiKey }, source: 'OAuth' }
        },
      },
    },
  }
}

/** One process-local owner of the credential and the account model list. */
export class XaiOAuthSession {
  readonly store: XaiOAuthCredentialStore
  readonly models: MutableModels
  wrapOptions: XaiResponsesWrapOptions = { backendSearch: false, retry401: false }
  private readonly baseline: Provider
  private liveIds: string[] | undefined
  private selectedIds: string[] | undefined
  private source: CatalogSource = 'fallback'
  private listingError: string | undefined
  private readonly cacheFile: string
  private onCatalogChange: (() => void) | undefined
  private cachedProvider: Provider | undefined
  private readonly catalogRetryDelaysMs: readonly number[]
  private catalogRetryTimer: ReturnType<typeof setTimeout> | undefined
  private catalogRetryAttempt = 0
  private disposed = false
  /** Bumped on every refresh start, logout, and dispose so in-flight work cannot commit. */
  private catalogGeneration = 0
  private catalogInFlight: AbortController | undefined

  constructor(
    store: XaiOAuthCredentialStore = new XaiOAuthCredentialStore(),
    onCatalogChange?: () => void,
    options: { catalogRetryDelaysMs?: readonly number[] } = {},
  ) {
    this.store = store
    this.cacheFile = modelsCachePath()
    this.baseline = xaiProvider()
    this.models = createModels({ credentials: store })
    this.models.setProvider(this.baseline)
    this.onCatalogChange = onCatalogChange
    this.catalogRetryDelaysMs = options.catalogRetryDelaysMs ?? CATALOG_RETRY_DELAYS_MS
  }

  setWrapOptions(next: XaiResponsesWrapOptions): void {
    this.wrapOptions = next
    this.cachedProvider = undefined
    this.onCatalogChange?.()
  }

  private invalidateProvider(): void {
    this.cachedProvider = undefined
  }

  /**
   * Schedule the next background catalog retry after a failed refresh. Only
   * while a credential file exists — a logged-out store cannot succeed — and
   * with an unref'd timer so the CLI one-shots (bin.ts) still exit on time.
   * The retry reuses `refreshLiveCatalog`, so a transient lock timeout can be
   * retried after the lock is released or cleared. The store remains
   * fail-closed and never breaks a writer lock automatically.
   */
  private scheduleCatalogRetry(signal?: AbortSignal): void {
    if (this.disposed || signal?.aborted) return
    if (this.catalogRetryTimer !== undefined) return
    if (this.catalogRetryAttempt >= this.catalogRetryDelaysMs.length) return
    if (!this.store.exists()) return
    const delay = this.catalogRetryDelaysMs[this.catalogRetryAttempt]!
    this.catalogRetryAttempt += 1
    this.catalogRetryTimer = setTimeout(() => {
      this.catalogRetryTimer = undefined
      void this.refreshLiveCatalog(signal)
    }, delay)
    this.catalogRetryTimer.unref?.()
  }

  /** Cancel a pending retry and restart the backoff episode from zero. */
  private clearCatalogRetry(): void {
    if (this.catalogRetryTimer !== undefined) {
      clearTimeout(this.catalogRetryTimer)
      this.catalogRetryTimer = undefined
    }
    this.catalogRetryAttempt = 0
  }

  /** Stop background retries and invalidate every in-flight catalog refresh. */
  dispose(): void {
    this.disposed = true
    this.invalidateInFlightCatalog()
    this.clearCatalogRetry()
  }

  /** Drop timers and in-flight fetches so their results cannot commit. */
  private invalidateInFlightCatalog(): void {
    this.catalogGeneration += 1
    this.catalogInFlight?.abort()
    this.catalogInFlight = undefined
  }

  /** Secret-free listing diagnostic from the last refresh. */
  get catalogError(): string | undefined {
    return this.listingError
  }

  get catalogSource(): CatalogSource {
    return this.source
  }

  availableModels(): Model<Api>[] {
    return mergeLiveCatalog(catalogModels(this.baseline.getModels()), this.liveIds)
  }

  /** Unfiltered live ids (includes Imagine models used by grok_imagine). */
  liveModelIds(): readonly string[] | undefined {
    return this.liveIds
  }

  selectedModelIds(): string[] | undefined {
    return this.selectedIds
  }

  visibleModels(): Model<Api>[] {
    const available = this.availableModels()
    if (this.selectedIds === undefined || this.selectedIds.length === 0) return available
    const byId = new Map(available.map(model => [model.id, model]))
    const catalog = catalogModels(this.baseline.getModels())
    return this.selectedIds
      .filter(id => isComposerChatModel(id))
      .map(id => byId.get(id) ?? materializeLiveModel(id, catalog))
  }

  /** Provider whose id matches the harness route so PiAiAdapter can list models. */
  provider(): Provider {
    if (this.cachedProvider !== undefined) return this.cachedProvider
    const inner: Provider = {
      ...requestProvider(this.baseline),
      id: XAI_OAUTH_ROUTE,
      name: 'xAI Grok',
      getModels: () => asHarnessModels(this.visibleModels()),
    }
    this.cachedProvider = wrapXaiResponsesProvider(inner, this.wrapOptions)
    return this.cachedProvider
  }

  async loadCachedCatalog(): Promise<void> {
    try {
      const cache = parseCache(await readFile(this.cacheFile, 'utf8'))
      if (cache === undefined) return
      if (cache.ids.length > 0) {
        this.liveIds = cache.ids
        this.source = 'cache'
      }
      this.selectedIds = cache.selected === undefined
        ? undefined
        : filterSelectedChatModelIds(cache.selected)
          ?? [preferredXaiOAuthModelFrom(this.availableModels())]
      this.invalidateProvider()
    } catch (error) {
      if (!isENOENT(error)) throw error
    }
  }

  async refreshLiveCatalog(signal?: AbortSignal): Promise<void> {
    // Never throw: boot calls this in the background, and getAuth may take the
    // credential lock (or time out on a leftover .lock). A listing failure
    // must not take the host process down.
    if (this.disposed) return
    const generation = ++this.catalogGeneration
    this.catalogInFlight?.abort()
    const local = new AbortController()
    this.catalogInFlight = local
    const onOuterAbort = () => local.abort()
    if (signal !== undefined) {
      if (signal.aborted) local.abort()
      else signal.addEventListener('abort', onOuterAbort, { once: true })
    }
    const combined = signal === undefined ? local.signal : AbortSignal.any([local.signal, signal])
    const isStale = (): boolean => this.disposed || generation !== this.catalogGeneration || local.signal.aborted

    try {
      let access: string | undefined
      try {
        const stored = await this.store.read(XAI_PI_PROVIDER)
        if (stored?.type === 'oauth' && stored.access.length > 0) access = stored.access
        const expired = stored?.type === 'oauth' && Date.now() >= stored.expires
        if (expired || access === undefined) {
          const auth = await this.models.getAuth(XAI_PI_PROVIDER)
          const refreshed = auth?.auth.apiKey
          if (refreshed !== undefined && refreshed.length > 0) access = refreshed
        }
      } catch (error) {
        if (isStale()) return
        this.listingError = safeMessage(error instanceof Error ? error.message : String(error))
        if (this.liveIds === undefined) this.source = 'fallback'
        this.scheduleCatalogRetry(signal)
        if (access === undefined) return
      }
      if (isStale()) return
      if (access === undefined || access.length === 0) {
        // Nothing to refresh (logged out, or an empty Grok document): stop any
        // retry episode started earlier instead of spinning on a store that
        // cannot succeed.
        this.clearCatalogRetry()
        this.listingError = undefined
        return
      }
      try {
        const ids = await fetchLiveModelIds(access, combined)
        if (isStale()) return
        this.liveIds = ids
        this.source = 'live'
        this.listingError = undefined
        await this.writeCache()
        if (isStale()) {
          if (this.liveIds === undefined || this.liveIds === ids) {
            this.liveIds = undefined
            this.source = 'fallback'
            this.invalidateProvider()
            try {
              await rm(this.cacheFile, { force: true })
            } catch {
              // Best-effort: logout/dispose also remove the cache.
            }
          }
          return
        }
        this.invalidateProvider()
        this.clearCatalogRetry()
        this.onCatalogChange?.()
      } catch (error) {
        if (isStale()) return
        this.listingError = safeMessage(error instanceof Error ? error.message : String(error))
        if (this.liveIds === undefined) this.source = 'fallback'
        this.scheduleCatalogRetry(signal)
      }
    } finally {
      signal?.removeEventListener('abort', onOuterAbort)
      if (this.catalogInFlight === local) this.catalogInFlight = undefined
    }
  }

  async setSelectedModels(ids: readonly string[]): Promise<void> {
    this.selectedIds = filterSelectedChatModelIds(ids)
      ?? [preferredXaiOAuthModelFrom(this.availableModels())]
    this.invalidateProvider()
    await this.writeCache()
    this.onCatalogChange?.()
  }

  async logout(): Promise<void> {
    this.invalidateInFlightCatalog()
    this.clearCatalogRetry()
    await this.store.delete(XAI_PI_PROVIDER)
    this.liveIds = undefined
    this.selectedIds = undefined
    this.source = 'fallback'
    this.listingError = undefined
    this.invalidateProvider()
    await mkdir(dirname(this.cacheFile), { recursive: true, mode: 0o700 })
    await rm(this.cacheFile, { force: true })
    this.onCatalogChange?.()
  }

  private async writeCache(): Promise<void> {
    const document: ModelsCacheDocument = {
      version: MODELS_CACHE_VERSION,
      ids: this.liveIds === undefined ? [] : [...this.liveIds],
      fetchedAt: Date.now(),
      ...this.selectedIds === undefined ? {} : { selected: [...this.selectedIds] },
    }
    await mkdir(dirname(this.cacheFile), { recursive: true, mode: 0o700 })
    await writeFileAtomic(this.cacheFile, `${JSON.stringify(document)}\n`, {
      mode: 0o600,
      dirMode: 0o700,
    })
  }
}
