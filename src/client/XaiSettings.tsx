//

// Derived from dsh-xai (https://github.com/MirDie/dsh-xai), Apache-2.0.

// Modified for dsh-grok-kit — see NOTICE for the full attribution.

//

/** Plugin-owned xAI Grok account page inside the dsh Settings shell. */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { XaiOAuthSettingsKey } from './locales.ts'
import { CapabilitiesView } from './capabilities-view.tsx'
import { QuotaView } from './quota-view.tsx'
import { mediaTogglePatch } from './media-options.ts'
import { SettingsStyles } from './settings-ui.tsx'

const STATUS_PATH = '/plugins/dsh-grok-kit/auth/status'
const LOGIN_PATH = '/plugins/dsh-grok-kit/auth/login'
const IMPORT_PATH = '/plugins/dsh-grok-kit/auth/import'
const LOGOUT_PATH = '/plugins/dsh-grok-kit/auth/logout'
const MODELS_PATH = '/plugins/dsh-grok-kit/auth/models'
const PROXY_PATH = '/plugins/dsh-grok-kit/auth/proxy'
const OPTIONS_PATH = '/plugins/dsh-grok-kit/auth/options'
const POLL_INTERVAL_MS = 1_000
const STATUS_TIMEOUT_MS = 10_000

type OptionKey =
  | 'backendSearch'
  | 'nestedSearchTools'
  | 'statefulResponses'
  | 'imagineTool'
  | 'editTool'
  | 'videoTool'
  | 'mediaRiskAcknowledged'
  | 'videoModel'
  | 'videoMaxBytes'
  | 'searchModel'
  | 'searchMaxResults'
  | 'webSearchTimeoutMs'
  | 'xSearchTimeoutMs'

type OptionValue = boolean | number | string | undefined

/**
 * The five pages of this settings section. Only the active page is mounted, so
 * a backgrounded page never keeps a video download or a capability read
 * running; every draft it owns lives in this component instead of in the page
 * body, so switching pages keeps unsaved options and proxy edits.
 */
const SETTINGS_PAGES = ['account', 'models', 'search', 'media', 'network'] as const

type SettingsPageId = (typeof SETTINGS_PAGES)[number]

/** Page label, doubled as the sticky header's navigation button text. */
const PAGE_LABEL_KEYS: Record<SettingsPageId, XaiOAuthSettingsKey> = {
  account: 'navAccount',
  models: 'navModels',
  search: 'navSearch',
  media: 'navMedia',
  network: 'navNetwork',
}

/**
 * Which option keys each page owns for ordinary edits. Save is scoped to the
 * active page's dirty keys from this list, so one page can never write another
 * page's overrides and a draft left unsaved elsewhere is never dropped by
 * this page's save.
 */
const PAGE_OPTION_KEYS: Record<SettingsPageId, readonly OptionKey[]> = {
  account: [],
  models: [],
  network: [],
  search: ['backendSearch', 'statefulResponses', 'nestedSearchTools', 'searchModel', 'searchMaxResults', 'webSearchTimeoutMs', 'xSearchTimeoutMs'],
  media: ['imagineTool', 'editTool', 'videoTool', 'mediaRiskAcknowledged'],
}

/**
 * Extra keys Reset may clear even though the form does not edit them.
 * Media still displays videoModel / videoMaxBytes as read-only; a stale
 * stored videoMaxBytes would keep interrupting downloads after the user
 * believes this page was reset.
 */
const PAGE_RESET_ONLY_KEYS: Partial<Record<SettingsPageId, readonly OptionKey[]>> = {
  media: ['videoModel', 'videoMaxBytes'],
}

function pageResetKeys(pageId: SettingsPageId): readonly OptionKey[] {
  return [...PAGE_OPTION_KEYS[pageId], ...(PAGE_RESET_ONLY_KEYS[pageId] ?? [])]
}

function optBool(value: OptionValue | undefined, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

type CatalogSource = 'live' | 'cache' | 'fallback'

type AccountStatus =
  | { status: 'loading' }
  | { status: 'signed-out'; grokImportAvailable?: boolean; sharedGrokAuth?: boolean }
  | { status: 'signing-in'; url?: string; userCode?: string; grokImportAvailable?: boolean; sharedGrokAuth?: boolean }
  | {
    status: 'signed-in'
    models?: string[]
    available?: string[]
    selected?: string[]
    catalogSource?: CatalogSource
    catalogError?: string
    loginError?: string
    grokImportAvailable?: boolean
    sharedGrokAuth?: boolean
  }
  | { status: 'error'; message: string; grokImportAvailable?: boolean; sharedGrokAuth?: boolean }

interface LoginChallenge {
  url: string
  userCode?: string
}

/**
 * The proxy route's payload. Both fields are read defensively: an older
 * service answers without the compatibility flag, and a flag that is not a
 * real boolean (a truthy string) must never be read as "on".
 */
interface ProxyPayload {
  proxyUrl?: unknown
  quotaCompatibilityMode?: unknown
}

export interface XaiOAuthSettingsInjected {
  t: (key: XaiOAuthSettingsKey, params?: Record<string, unknown>) => string
}

export type XaiOAuthSettingsProps = Partial<XaiOAuthSettingsInjected>

/* Match the host scroll surface; keep navigation above page content. */
const stickyBarStyle: CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 1,
  background: 'var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-base))',
}

function sourceBadge(source: CatalogSource | undefined): { text: string; color: string } {
  switch (source) {
    case 'live': return { text: 'Live', color: 'var(--dsw-alias-state-success-primary, #22a06b)' }
    case 'cache': return { text: 'Cached', color: 'var(--gk-muted)' }
    case 'fallback': return { text: 'Fallback', color: 'var(--dsw-alias-label-tertiary, #81858c)' }
    case undefined: return { text: '—', color: 'var(--dsw-alias-label-tertiary, #81858c)' }
    default: return { text: '—', color: 'var(--dsw-alias-label-tertiary, #81858c)' }
  }
}

function dotStyle(status: AccountStatus['status']): CSSProperties {
  const color = status === 'signed-in'
    ? 'var(--dsw-alias-state-success-primary, #22a06b)'
    : status === 'error'
      ? 'var(--dsw-alias-state-error-primary, #d92d20)'
      : status === 'signing-in' || status === 'loading'
        ? 'var(--gk-muted)'
        : 'var(--dsw-alias-label-tertiary, #81858c)'
  return { width: 9, height: 9, borderRadius: '50%', flex: '0 0 auto', background: color }
}

/** grok-4.6 → "Grok 4.6"; only used for display, never sent to the API. */
function displayName(id: string): string {
  return id
    .split(/[-_]/g)
    .map(part => part.length === 0 ? part : part[0]!.toUpperCase() + part.slice(1))
    .join(' ')
}

async function jsonRequest<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { accept: 'application/json', ...body === undefined ? {} : { 'content-type': 'application/json' } },
    credentials: 'same-origin',
    ...signal === undefined ? {} : { signal },
    ...body === undefined ? {} : { body: JSON.stringify(body) },
  })
  const value: unknown = await response.json().catch(() => undefined)
  if (!response.ok) {
    const message = typeof value === 'object' && value !== null && 'error' in value && typeof value.error === 'string'
      ? value.error
      : `HTTP ${response.status}`
    throw new Error(message)
  }
  return value as T
}

/** xAI Grok account status and OAuth actions. */
export function XaiSettings({ t }: XaiOAuthSettingsProps) {
  if (t === undefined) throw new Error('xAI Grok settings requires its translation function')
  const [status, setStatus] = useState<AccountStatus>({ status: 'loading' })
  // Account mutations invalidate older status reads, including login polling.
  const statusRequestRef = useRef(0)
  const statusAbortRef = useRef<AbortController | undefined>(undefined)
  const invalidateStatusRead = useCallback(() => {
    ++statusRequestRef.current
    const pending = statusAbortRef.current
    statusAbortRef.current = undefined
    pending?.abort()
  }, [])
  const [busy, setBusy] = useState(false)
  const [proxyUrl, setProxyUrl] = useState('')
  const [savedProxyUrl, setSavedProxyUrl] = useState('')
  // Quota request compatibility mode. Off by default, so the existing
  // behaviour (quota requests follow the host's global fetch) is kept until
  // the user opts in.
  const [quotaCompatibilityMode, setQuotaCompatibilityMode] = useState(false)
  const [savedQuotaCompatibilityMode, setSavedQuotaCompatibilityMode] = useState(false)
  // The first read has not succeeded yet, so the effective proxy URL is
  // unknown. Saving then could store an empty URL over a real one, so the
  // save button stays disabled until the read lands. Editing stays allowed.
  const [proxyLoaded, setProxyLoaded] = useState(false)
  const [proxyLoading, setProxyLoading] = useState(false)
  const proxyLoadingRef = useRef(false)
  // Each field owns its edit flag: toggling the compatibility mode must not
  // stop a late read from filling in the proxy URL the user never touched.
  const proxyUrlEditedRef = useRef(false)
  const quotaEditedRef = useRef(false)
  // A committed save owns both baselines: a late read must not roll them back.
  const proxySavedRef = useRef(false)
  const [proxyBusy, setProxyBusy] = useState(false)
  const [proxyFeedback, setProxyFeedback] = useState<'idle' | 'saved' | 'error' | 'loadError'>('idle')
  const [popupBlocked, setPopupBlocked] = useState(false)
  const [options, setOptions] = useState<Partial<Record<OptionKey, OptionValue>>>({})
  const [storedOptions, setStoredOptions] = useState<Partial<Record<OptionKey, OptionValue>>>({})
  const [optionsDirty, setOptionsDirty] = useState<ReadonlySet<OptionKey>>(new Set())
  // Mirror of the dirty set: the initial load lands asynchronously and must not
  // overwrite a field the user already edited while it was in flight.
  const optionsDirtyRef = useRef<ReadonlySet<OptionKey>>(new Set())
  // Keep touched keys after saving/resetting as well: a late initial GET must
  // not roll a committed value back to the snapshot from before that write.
  const optionsTouchedRef = useRef<ReadonlySet<OptionKey>>(new Set())
  const [optionsBusy, setOptionsBusy] = useState(false)
  // Feedback is bound to the page whose request produced it: a late 'saved'
  // from the media page can never be shown on the search page while that
  // page is still dirty.
  // A missing `page` means the failure belongs to the initial load, not to one
  // page's save, so both option pages may show it.
  const [optionsFeedback, setOptionsFeedback] = useState<{ page?: SettingsPageId; state: 'saved' | 'error' } | undefined>()
  // An off→on media toggle parks here for the inline risk confirmation; the
  // switch does not move until the user confirms inside the card.
  const [pendingMediaGroup, setPendingMediaGroup] = useState<'images' | 'video' | null>(null)
  const mediaConfirmRef = useRef<HTMLDivElement | null>(null)
  const mediaImageRef = useRef<HTMLInputElement | null>(null)
  const mediaVideoRef = useRef<HTMLInputElement | null>(null)
  // Bumped by every account-changing action (sign-in, Grok import, sign-out).
  // Together with the account status it keys <CapabilitiesView/> so the panel
  // remounts: fresh fetches, aborted in-flight work, revoked blob URLs, and no
  // task rows or diagnostics carried over from the previous account — even an
  // A→B import that stays "signed-in" gets a new key.
  const [accountGeneration, setAccountGeneration] = useState(0)
  // Active page. Only the active page body is mounted; every draft it owns
  // still lives here, so switching pages never discards an unsaved edit.
  const [page, setPage] = useState<SettingsPageId>('account')
  useEffect(() => {
    if (page !== 'media' || pendingMediaGroup === null) return
    // Bring the whole inline confirmation into view, including for keyboard
    // users. Focus returns to the initiating switch after either decision.
    mediaConfirmRef.current?.focus({ preventScroll: true })
    mediaConfirmRef.current?.scrollIntoView({ block: 'center' })
  }, [page, pendingMediaGroup])
  // A saved video choice/revocation also invalidates the local runtime
  // capability snapshot, without probing upstream or reloading the account.
  const [capabilityGeneration, setCapabilityGeneration] = useState(0)

  type OptionsPayload = {
    options?: Partial<Record<OptionKey, OptionValue>>
    effective?: Partial<Record<OptionKey, OptionValue>>
    stored?: Partial<Record<OptionKey, OptionValue>>
  }

  /**
   * Apply a server payload.
   *
   * The initial load replaces untouched fields. A page-scoped save or reset passes
   * `clearedKeys` and then moves ONLY those keys: another page's unsaved draft
   * is never overwritten by a response that did not cover it, its dirty flag
   * survives, and a key the server no longer reports as an override is dropped
   * from the stored view so the form falls back to auto / default.
   */
  const applyOptionsPayload = (value: OptionsPayload, clearedKeys?: readonly OptionKey[]): void => {
    const effective = value.effective ?? value.options ?? {}
    const stored = value.stored ?? {}
    if (clearedKeys === undefined) {
      const drafts = optionsDirtyRef.current
      const protectedKeys = optionsTouchedRef.current
      setOptions(previous => {
        const next = { ...effective }
        for (const key of protectedKeys) {
          if (key in previous) next[key] = previous[key]
          else delete next[key]
        }
        return next
      })
      setStoredOptions(previous => {
        const next = { ...stored }
        for (const key of protectedKeys) {
          if (key in previous) next[key] = previous[key]
          else delete next[key]
        }
        return next
      })
      setOptionsDirty(new Set(drafts))
      return
    }
    optionsTouchedRef.current = new Set([...optionsTouchedRef.current, ...clearedKeys])
    setOptions(previous => {
      const next = { ...previous }
      for (const key of clearedKeys) {
        if (key in effective) next[key] = effective[key]
        else delete next[key]
      }
      return next
    })
    setStoredOptions(previous => {
      const next = { ...previous }
      for (const key of clearedKeys) {
        if (key in stored) next[key] = stored[key]
        else delete next[key]
      }
      return next
    })
    setOptionsDirty(previous => {
      const next = new Set(previous)
      for (const key of clearedKeys) next.delete(key)
      return next
    })
  }

  const markOption = (key: OptionKey, value: OptionValue): void => {
    setOptions(previous => ({ ...previous, [key]: value }))
    setOptionsDirty(previous => new Set(previous).add(key))
    optionsDirtyRef.current = new Set(optionsDirtyRef.current).add(key)
    optionsTouchedRef.current = new Set(optionsTouchedRef.current).add(key)
    const owner = SETTINGS_PAGES.find(pageId => PAGE_OPTION_KEYS[pageId].includes(key))
    setOptionsFeedback(previous => previous?.page === owner ? undefined : previous)
  }

  /**
   * Numeric option edit. An empty field is an explicit "clear my override".
   * Anything else that is not a finite number ('1e999', a pasted non-number)
   * is rejected outright: JSON.stringify(NaN) is `null`, so writing it would
   * silently delete the stored override instead of applying what was typed.
   */
  const markOptionNumber = (key: OptionKey, raw: string): void => {
    if (raw.trim() === '') {
      markOption(key, undefined)
      return
    }
    const value = Number(raw)
    if (!Number.isFinite(value)) return
    markOption(key, value)
  }

  const pageHasDraft = (pageId: SettingsPageId): boolean =>
    pageId === 'network'
      ? proxyUrl.trim() !== savedProxyUrl || quotaCompatibilityMode !== savedQuotaCompatibilityMode
      : PAGE_OPTION_KEYS[pageId].some(key => optionsDirty.has(key))

  /** Feedback visible on one page: its own, or a page-independent load error. */
  const feedbackFor = (pageId: SettingsPageId): 'saved' | 'error' | undefined =>
    optionsFeedback === undefined
      ? undefined
      : optionsFeedback.page === undefined || optionsFeedback.page === pageId ? optionsFeedback.state : undefined
  const applyMediaPatch = (patch: Record<string, boolean>): void => {
    for (const [key, value] of Object.entries(patch)) markOption(key as OptionKey, value)
  }

  const markMedia = (group: 'images' | 'video', enabled: boolean): void => {
    if (enabled) {
      // Park the toggle: the switch stays off until the inline confirmation
      // below the media rows is accepted.
      setPendingMediaGroup(group)
      setOptionsFeedback(previous => previous?.page === 'media' ? undefined : previous)
      return
    }
    const patch = mediaTogglePatch(options, group, false)
    if (patch === undefined) return
    applyMediaPatch(patch)
  }

  const confirmPendingMedia = (): void => {
    if (pendingMediaGroup === null) return
    const patch = mediaTogglePatch(options, pendingMediaGroup, true)
    setPendingMediaGroup(null)
    if (patch === undefined) return
    applyMediaPatch(patch)
  }

  const cancelPendingMedia = (): void => {
    setPendingMediaGroup(null)
    setOptionsFeedback(previous => previous?.page === 'media' ? undefined : previous)
  }

  const restoreMediaFocus = (): void => {
    // Actual input refs update on remount if a pending confirmation survived
    // a page switch; an event-captured DOM node could already be detached.
    const input = pendingMediaGroup === 'images' ? mediaImageRef.current : mediaVideoRef.current
    input?.focus()
  }

  const loadOptions = useCallback(async () => {
    try {
      applyOptionsPayload(await jsonRequest<OptionsPayload>(OPTIONS_PATH))
    } catch {
      setOptionsFeedback({ state: 'error' })
    }
  }, [])

  /** Save only the active page's dirty keys; every other page keeps its draft. */
  const saveOptions = async (pageId: SettingsPageId): Promise<void> => {
    const keys = PAGE_OPTION_KEYS[pageId].filter(key => optionsDirty.has(key))
    if (keys.length === 0) return
    setOptionsBusy(true)
    try {
      const patch: Record<string, unknown> = {}
      for (const key of keys) patch[key] = options[key] ?? null
      applyOptionsPayload(await jsonRequest<OptionsPayload>(OPTIONS_PATH, 'POST', patch), keys)
      const remaining = new Set(optionsDirtyRef.current)
      for (const key of keys) remaining.delete(key)
      optionsDirtyRef.current = remaining
      setOptionsFeedback({ page: pageId, state: 'saved' })
      if (keys.includes('videoTool') || keys.includes('mediaRiskAcknowledged')) setCapabilityGeneration(generation => generation + 1)
    } catch {
      setOptionsFeedback({ page: pageId, state: 'error' })
    } finally {
      setOptionsBusy(false)
    }
  }

  /** Reset only the active page's overrides back to the defaults. */
  const resetOptions = async (pageId: SettingsPageId): Promise<void> => {
    const keys = pageResetKeys(pageId)
    if (keys.length === 0) return
    setOptionsBusy(true)
    try {
      const patch: Record<string, unknown> = {}
      for (const key of keys) patch[key] = null
      if (pageId === 'media') {
        patch.mediaRiskAcknowledged = false
        setPendingMediaGroup(null)
      }
      applyOptionsPayload(await jsonRequest<OptionsPayload>(OPTIONS_PATH, 'POST', patch), keys)
      const remaining = new Set(optionsDirtyRef.current)
      for (const key of keys) remaining.delete(key)
      optionsDirtyRef.current = remaining
      setOptionsFeedback({ page: pageId, state: 'saved' })
      if (pageId === 'media') setCapabilityGeneration(generation => generation + 1)
    } catch {
      setOptionsFeedback({ page: pageId, state: 'error' })
    } finally {
      setOptionsBusy(false)
    }
  }

  /**
   * Read the effective proxy settings.
   *
   * The URL and the compatibility mode have their own edit flags, so a read
   * that arrives late still fills in the field the user has not touched
   * (toggling the mode must not hide the proxy URL, whose empty draft would
   * otherwise be written back over a real proxy) and never overwrites a field
   * the user has edited or a baseline a save has already committed.
   */
  const loadProxy = useCallback(async () => {
    if (proxyLoadingRef.current) return
    proxyLoadingRef.current = true
    setProxyLoading(true)
    try {
      const value = await jsonRequest<ProxyPayload>(PROXY_PATH)
      const url = typeof value.proxyUrl === 'string' ? value.proxyUrl : ''
      // An older service has no compatibility flag: the mode is off. A flag
      // that is not a real boolean is not "on" either.
      const mode = value.quotaCompatibilityMode === true
      setProxyLoaded(true)
      if (!proxyUrlEditedRef.current) setProxyUrl(url)
      if (!quotaEditedRef.current) setQuotaCompatibilityMode(mode)
      if (!proxySavedRef.current) {
        setSavedProxyUrl(url)
        setSavedQuotaCompatibilityMode(mode)
      }
      setProxyFeedback(previous => previous === 'loadError' ? 'idle' : previous)
    } catch {
      // Unknown settings must not be saved; retry keeps any local edits.
      setProxyLoaded(false)
      setProxyFeedback('loadError')
    } finally {
      proxyLoadingRef.current = false
      setProxyLoading(false)
    }
  }, [])

  /**
   * Save the proxy URL and the compatibility mode in one request: the server
   * needs both, and a half-saved pair would leave the page describing a
   * state the server never stored.
   */
  const saveProxy = async (): Promise<void> => {
    // A failed read leaves the effective settings unknown; writing them back
    // would store guesses. Wait for a successful load/retry instead.
    if (proxyFeedback === 'loadError') return
    setProxyBusy(true)
    try {
      const value = await jsonRequest<ProxyPayload>(PROXY_PATH, 'POST', {
        proxyUrl,
        quotaCompatibilityMode,
      })
      const url = typeof value.proxyUrl === 'string' ? value.proxyUrl : proxyUrl
      // A missing flag means the service did not report the mode: it stays
      // off instead of being read as "on" from a truthy string.
      const mode = value.quotaCompatibilityMode === true
      proxyUrlEditedRef.current = true
      quotaEditedRef.current = true
      proxySavedRef.current = true
      setProxyUrl(url)
      setSavedProxyUrl(url)
      setQuotaCompatibilityMode(mode)
      setSavedQuotaCompatibilityMode(mode)
      setProxyLoaded(true)
      setProxyFeedback('saved')
    } catch {
      // The save failed, so nothing was stored: keep the draft and the
      // unsaved marker instead of pretending the pair was committed.
      setProxyFeedback('error')
    } finally {
      setProxyBusy(false)
    }
  }

  /** A new edit clears a stale save result, but not a failed read. */
  const resetProxyFeedback = (): void => {
    setProxyFeedback(previous => previous === 'loadError' ? previous : 'idle')
  }

  const refresh = useCallback(async () => {
    // Serialize polls: if /auth/status is slower than the 1-second interval,
    // every tick used to bump the sequence and doom every completion, leaving
    // the UI in signing-in forever while requests kept stacking up. A tick
    // that finds a read in flight just skips; the next one runs after it.
    if (statusAbortRef.current !== undefined) return
    const abort = new AbortController()
    statusAbortRef.current = abort
    const request = ++statusRequestRef.current
    let rejectAborted!: (reason?: unknown) => void
    const aborted = new Promise<never>((_resolve, reject) => { rejectAborted = reject })
    const onAbort = () => rejectAborted(abort.signal.reason)
    abort.signal.addEventListener('abort', onAbort, { once: true })
    const timer = setTimeout(() => { abort.abort(new Error(t('requestFailed'))) }, STATUS_TIMEOUT_MS)
    try {
      // Cover both fetch and body decoding, even if a transport ignores abort.
      const value = await Promise.race([jsonRequest<AccountStatus>(STATUS_PATH, 'GET', undefined, abort.signal), aborted])
      if (request === statusRequestRef.current) setStatus(value)
    } catch (error: unknown) {
      if (request === statusRequestRef.current) {
        // A transient read failure must not stop OAuth polling or hide the
        // device code. The next tick can observe server-side completion.
        setStatus(previous => previous.status === 'signing-in'
          ? previous
          : { status: 'error', message: error instanceof Error ? error.message : t('requestFailed') })
      }
    } finally {
      clearTimeout(timer)
      abort.signal.removeEventListener('abort', onAbort)
      if (statusAbortRef.current === abort) statusAbortRef.current = undefined
    }
  }, [t])

  useEffect(() => {
    void refresh()
    return invalidateStatusRead
  }, [refresh, invalidateStatusRead])
  useEffect(() => { void loadProxy() }, [loadProxy])
  useEffect(() => { void loadOptions() }, [loadOptions])
  useEffect(() => {
    if (status.status !== 'signing-in') return
    const timer = window.setInterval(() => { void refresh() }, POLL_INTERVAL_MS)
    return () => { window.clearInterval(timer) }
  }, [refresh, status.status])

  const signIn = async (): Promise<void> => {
    // The device-code flow is one-shot: re-entering clears the challenge and
    // can hide the user code the user must enter.
    if (status.status === 'signing-in') return
    if (status.status !== 'loading' && status.sharedGrokAuth === true) {
      if (!window.confirm(t('confirmLoginShared'))) return
    } else if (status.status === 'signed-in') {
      if (!window.confirm(t('confirmLoginPrivate'))) return
    }
    // Only once the user actually committed to a sign-in.
    invalidateStatusRead()
    setAccountGeneration(generation => generation + 1)
    const popup = window.open('about:blank', '_blank')
    if (popup !== null) popup.opener = null
    setPopupBlocked(popup === null)
    setBusy(true)
    setStatus({ status: 'signing-in' })
    try {
      const challenge = await jsonRequest<LoginChallenge>(LOGIN_PATH, 'POST')
      if (popup === null) {
        setStatus({ status: 'signing-in', url: challenge.url, ...challenge.userCode === undefined ? {} : { userCode: challenge.userCode } })
        return
      }
      popup.location.replace(challenge.url)
      setStatus({ status: 'signing-in', url: challenge.url, ...challenge.userCode === undefined ? {} : { userCode: challenge.userCode } })
    } catch (error: unknown) {
      popup?.close()
      // The server-side login may still be running; keep polling state instead
      // of dropping to error (which stops the poller). Preserve any challenge
      // we already received.
      setStatus(previous => previous.status === 'signing-in'
        ? previous
        : { status: 'error', message: error instanceof Error ? error.message : t('requestFailed') })
    } finally {
      setBusy(false)
    }
  }

  const importGrok = async (): Promise<void> => {
    // Hide old account data during import and remount again after it commits.
    // A pre-request bump alone could mount a panel that fetches the old account.
    invalidateStatusRead()
    setAccountGeneration(generation => generation + 1)
    setStatus({ status: 'loading' })
    setBusy(true)
    try {
      const imported = await jsonRequest<AccountStatus>(IMPORT_PATH, 'POST')
      invalidateStatusRead()
      setAccountGeneration(generation => generation + 1)
      setStatus(imported)
    } catch (error: unknown) {
      setStatus({ status: 'error', message: error instanceof Error ? error.message : t('requestFailed') })
    } finally {
      setBusy(false)
    }
  }

  const saveModels = async (selected: string[]): Promise<void> => {
    invalidateStatusRead()
    setBusy(true)
    try {
      setStatus(await jsonRequest<AccountStatus>(MODELS_PATH, 'POST', { selected }))
    } catch (error: unknown) {
      setStatus({ status: 'error', message: error instanceof Error ? error.message : t('requestFailed') })
    } finally {
      setBusy(false)
    }
  }

  const signOut = async (): Promise<void> => {
    if (status.status === 'signed-in' && status.sharedGrokAuth === true) {
      if (!window.confirm(t('confirmLogoutShared'))) return
    }
    // Hide the outgoing account BEFORE the bump remounts the quota, capability
    // and task panels: while the sign-out is still in flight they would
    // otherwise re-read the account that is on its way out.
    setStatus({ status: 'loading' })
    invalidateStatusRead()
    setAccountGeneration(generation => generation + 1)
    setBusy(true)
    try {
      // The route returns the full signed-out status (incl. grokImportAvailable),
      // so the Grok CLI import button stays available right after sign-out.
      setStatus(await jsonRequest<AccountStatus>(LOGOUT_PATH, 'POST'))
    } catch {
      // Sign-out failed, so the account is unchanged: re-read its real status
      // instead of guessing, which also surfaces a transport error.
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const shared = status.status !== 'loading' && status.sharedGrokAuth === true
  const label = status.status === 'signed-in'
    ? t(shared ? 'signedInShared' : 'signedIn')
    : status.status === 'loading'
      ? t('loadingAccount')
      : status.status === 'signing-in'
        ? t('signingIn')
        : status.status === 'error'
          ? t('requestFailed')
          : t(shared ? 'signedOutShared' : 'signedOut')

  const modelIds = status.status === 'signed-in' ? status.available ?? status.models ?? [] : []
  const selectedIds = status.status === 'signed-in' ? status.selected ?? status.models ?? [] : []
  const source = status.status === 'signed-in' ? sourceBadge(status.catalogSource) : null

  /** Remount key: every account-changing action drops the previous account's
   *  quota reading, capability record and task rows. */
  const accountKey = `${status.status}:${String(accountGeneration)}`

  /** Saves stay scoped to the active page. The stage strip describes the
   *  draft, never guesses whether the host has already reloaded its tools. */
  const optionActions = (pageId: SettingsPageId) => (
    <footer className="gk-footer">
      <div className="gk-stages" aria-hidden="true">
        <span className={pageHasDraft(pageId) ? 'gk-stage-current' : undefined}><i className="gk-stage-dot" />{t('stageEdit')}</span>
        <span className={optionsBusy || feedbackFor(pageId) === 'saved' ? 'gk-stage-current' : undefined}><i className="gk-stage-dot" />{optionsBusy ? t('working') : t('stageSave')}</span>
        <span><i className="gk-stage-dot" />{t('stageRestart')}</span>
      </div>
      {pageHasDraft(pageId) ? <p role="status" className="gk-feedback">{t('unsavedChangesHint')}</p> : null}
      <div className="gk-actions">
        <button type="button" className="gk-button gk-button--primary" disabled={optionsBusy || !pageHasDraft(pageId)} onClick={() => { void saveOptions(pageId) }}>
          {optionsBusy ? t('working') : `${t('optionsSave')} · ${t(PAGE_LABEL_KEYS[pageId])}`}
        </button>
        <button type="button" className="gk-button" disabled={optionsBusy} onClick={() => { void resetOptions(pageId) }}>
          {`${t('optionsReset')} · ${t(PAGE_LABEL_KEYS[pageId])}`}
        </button>
      </div>
      {feedbackFor(pageId) === 'saved' ? <p role="status" className="gk-feedback gk-success">{t('optionsSaved')}</p> : null}
      {feedbackFor(pageId) === 'error' ? <p role="alert" className="gk-feedback gk-error">{t('optionsError')}</p> : null}
    </footer>
  )

  const nestedMode = optionsDirty.has('nestedSearchTools')
    ? options.nestedSearchTools === undefined ? 'auto' : String(options.nestedSearchTools)
    : storedOptions.nestedSearchTools === undefined ? 'auto' : String(storedOptions.nestedSearchTools)
  const compactStatus = status.status === 'signed-in' ? t('signedIn') : status.status === 'signed-out' ? t('signedOut') : label

  return (
    <section className="grok-settings" aria-labelledby="xai-oauth-settings-title">
      <SettingsStyles />
      <div className="gk-header" style={stickyBarStyle}>
        <header className="gk-brand-row">
          <h2 id="xai-oauth-settings-title"><span className="gk-wordmark" aria-hidden="true">GROK<small>KIT</small></span><span className="gk-sr-only">{t('title')}</span></h2>
          <div className={`gk-status${status.status === 'signed-in' ? ' gk-status--success' : ''}`} role="status" title={label}>
            <span aria-hidden="true" style={dotStyle(status.status)} />
            <span aria-hidden="true">{compactStatus}</span><span className="gk-sr-only">{t('statusLabel')}: {label}</span>
          </div>
        </header>
        <nav aria-label={t('nav')} className="gk-nav">
          {SETTINGS_PAGES.map(id => (
            <button key={id} type="button" aria-current={page === id ? 'page' : undefined}
              aria-label={pageHasDraft(id) ? `${t(PAGE_LABEL_KEYS[id])} — ${t('unsavedChanges')}` : t(PAGE_LABEL_KEYS[id])}
              title={pageHasDraft(id) ? t('unsavedChangesHint') : undefined} onClick={() => { setPage(id) }}>
              {t(id === 'search' ? 'navSearchShort' : id === 'media' ? 'navMediaShort' : PAGE_LABEL_KEYS[id])}
              {pageHasDraft(id) ? <span className="gk-nav-dirty" aria-hidden="true" /> : null}
            </button>
          ))}
        </nav>
      </div>

      {page === 'account' ? (
        <div className="gk-page" role="region" aria-label={t('navAccount')}>
          <QuotaView key={accountKey} t={t} signedIn={status.status === 'signed-in'} accountLoading={status.status === 'loading' || status.status === 'signing-in'} />
          <div className="gk-stack">
            <div className="gk-actions">
              {status.status === 'loading' ? null : status.status === 'signed-in' ? <>
                <button type="button" className="gk-button gk-button--primary" disabled={busy} onClick={() => { void signIn() }}>{busy ? t('working') : t('loginAgain')}</button>
                <button type="button" className="gk-button" disabled={busy} onClick={() => { void signOut() }}>{busy ? t('working') : t(shared ? 'logoutShared' : 'logout')}</button>
              </> : <>
                <button type="button" className="gk-button gk-button--primary" disabled={busy || status.status === 'signing-in'} onClick={() => { void signIn() }}>{busy ? t('working') : status.status === 'error' ? t('loginAgain') : t(shared ? 'loginShared' : 'login')}</button>
                {status.grokImportAvailable === true ? <button type="button" className="gk-button" disabled={busy} onClick={() => { void importGrok() }}>{t('importGrok')}</button> : null}
              </>}
            </div>
            {status.status === 'error' ? <p role="alert" className="gk-feedback gk-error">{status.message}</p> : null}
            {status.status === 'signed-in' && status.loginError !== undefined ? <p role="status" className="gk-feedback gk-error">{t('loginFailedStoredAccount')} {status.loginError}</p> : null}
            {shared ? <p className="gk-hint">{t('sharedGrok')}</p> : null}
            {status.status !== 'signed-in' && status.status !== 'loading' && status.grokImportAvailable === true ? <p className="gk-hint">{t('importHint')}</p> : null}
            {status.status === 'signing-in' && status.userCode !== undefined ? <div className="gk-panel gk-stack"><p className="gk-hint">{t('userCode')}</p><p className="gk-code">{status.userCode}</p></div> : null}
            {status.status === 'signing-in' && status.url !== undefined ? <p className="gk-hint">{t(popupBlocked ? 'popupBlocked' : 'openUrl')} <a href={status.url} target="_blank" rel="noreferrer">{status.url}</a></p> : null}
            <a className="gk-hint" href="https://grok.com/dashboard" target="_blank" rel="noreferrer">{t('subscriptionDashboard')} ↗</a>
            <details className="gk-details"><summary>{t('accountDetails')}</summary><div className="gk-stack"><p className="gk-hint">{t('intro')}</p><p className="gk-hint">{t('subscriptionLoginHint')}</p></div></details>
            <p className="gk-hint">{t('unofficialNotice')}</p>
          </div>
        </div>
      ) : null}

      {page === 'models' ? (
        <div className="gk-page" role="region" aria-label={t('navModels')}>
          {status.status === 'signed-in' ? <>
            <div className="gk-brand-row">
              <div className="gk-model-count"><span className="gk-numeric">{String(selectedIds.length).padStart(2, '0')}</span><span className="gk-hint">/ {modelIds.length} · {t('modelsSelected')}</span></div>
              <button type="button" className="gk-button" disabled={busy} onClick={() => { void saveModels([]) }}>{t('selectAll')}</button>
            </div>
            <p className="gk-hint">{t('modelHint')}</p>
            <div className="gk-status">{source === null ? null : <span style={{ color: source.color }}>{source.text}</span>}<span className="gk-hint">{status.catalogSource === 'live' ? t('catalogLive') : status.catalogSource === 'cache' ? t('catalogCache') : t('catalogFallback')}</span></div>
            <ul className="gk-models">{modelIds.map(id => {
              const checked = selectedIds.includes(id)
              return <li key={id}><label className="gk-model-row"><span><b>{displayName(id)}</b><span className="gk-model-id">{id}</span></span><input type="checkbox" checked={checked} disabled={busy} onChange={() => {
                const current = new Set(selectedIds)
                if (checked) current.delete(id)
                else current.add(id)
                void saveModels([...current])
              }} /></label></li>
            })}</ul>
            <p className="gk-hint">{t('modelsImmediate')}</p>
            {status.catalogError === undefined ? null : <p className="gk-feedback gk-error">{t('catalogError')}</p>}
          </> : <div className="gk-panel gk-stack"><p className="gk-empty">{status.status === 'loading' || status.status === 'signing-in' ? t('loadingAccount') : t('modelsSignIn')}</p><button type="button" className="gk-button" onClick={() => { setPage('account') }}>{t('navAccount')}</button></div>}
        </div>
      ) : null}

      {page === 'search' ? (
        <div className="gk-page" role="region" aria-label={t('navSearch')}>
          <div className="gk-feature">
            <div className="gk-setting">
              <label className="gk-setting-label"><span><b>{t('backendSearch')}</b><span className="gk-tag">{t('experimentalTag')}</span></span><input className="gk-switch" type="checkbox" checked={optBool(options.backendSearch, false)} disabled={optionsBusy} onChange={event => markOption('backendSearch', event.target.checked)} /></label>
              <p className="gk-hint">{t('backendSearchHint')}</p>
            </div>
            <div className="gk-setting">
              <label className="gk-setting-label"><span><b>{t('statefulResponses')}</b><span className="gk-tag">{t('experimentalTag')}</span></span><input className="gk-switch" type="checkbox" checked={optBool(options.statefulResponses, false)} disabled={optionsBusy} onChange={event => markOption('statefulResponses', event.target.checked)} /></label>
              <p className="gk-hint">{t('statefulResponsesHint')}</p>
            </div>
          </div>
          <div className="gk-stack">
            <label className="gk-setting-label"><b>{t('nestedSearchTools')}</b><select className="gk-input gk-select" value={nestedMode} disabled={optionsBusy} onChange={event => markOption('nestedSearchTools', event.target.value === 'auto' ? undefined : event.target.value === 'true')}><option value="auto">{t('nestedSearchToolsAuto')}</option><option value="true">{t('mediaOn')}</option><option value="false">{t('mediaOff')}</option></select></label>
            <p className="gk-hint">{t('nestedSearchToolsHint')}</p>
            <p className="gk-status"><span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />{t(nestedMode === 'auto' ? 'nestedDraftAuto' : nestedMode === 'true' ? 'nestedDraftOn' : 'nestedDraftOff')}</p>
            <div className="gk-telemetry" aria-label={t('searchParameters')}>
              <div><div className="gk-reading"><span className="gk-numeric">{options.searchMaxResults === undefined ? '—' : String(options.searchMaxResults).padStart(2, '0')}</span></div><p className="gk-telemetry-label">{t('searchMaxResults')}</p></div>
              <div><div className="gk-reading"><span className="gk-numeric">{options.webSearchTimeoutMs === undefined ? '—' : Number(options.webSearchTimeoutMs) / 1000}</span><small>s</small></div><p className="gk-telemetry-label">{t('webTimeoutShort')}</p></div>
              <div><div className="gk-reading"><span className="gk-numeric">{options.xSearchTimeoutMs === undefined ? '—' : Number(options.xSearchTimeoutMs) / 1000}</span><small>s</small></div><p className="gk-telemetry-label">{t('xTimeoutShort')}</p></div>
            </div>
            <details className="gk-details"><summary>{t('searchParameters')}</summary><div className="gk-stack">
              <label className="gk-field"><span>{t('searchModel')}</span><input className="gk-input" type="text" value={String(options.searchModel ?? '')} placeholder="grok-build-0.1" disabled={optionsBusy} onChange={event => markOption('searchModel', event.target.value.trim() === '' ? undefined : event.target.value)} /></label>
              <p className="gk-hint">{t('searchModelHint')}</p>
              <div className="gk-fields">
                <label className="gk-field"><span>{t('searchMaxResults')}</span><input className="gk-input" type="number" min={1} value={String(options.searchMaxResults ?? '')} placeholder="8" disabled={optionsBusy} onChange={event => markOptionNumber('searchMaxResults', event.target.value)} /></label>
                <label className="gk-field"><span>{t('webSearchTimeoutMs')}</span><input className="gk-input" type="number" min={1000} value={String(options.webSearchTimeoutMs ?? '')} placeholder="60000" disabled={optionsBusy} onChange={event => markOptionNumber('webSearchTimeoutMs', event.target.value)} /></label>
                <label className="gk-field"><span>{t('xSearchTimeoutMs')}</span><input className="gk-input" type="number" min={1000} value={String(options.xSearchTimeoutMs ?? '')} placeholder="120000" disabled={optionsBusy} onChange={event => markOptionNumber('xSearchTimeoutMs', event.target.value)} /></label>
              </div>
              <p className="gk-hint">{t('searchMaxResultsHint')} · {t('webSearchTimeoutHint')} · {t('xSearchTimeoutHint')}</p>
            </div></details>
            <details className="gk-details"><summary>{t('optionsHowTo')}</summary><p className="gk-hint">{t('optionsHint')}</p></details>
          </div>
        </div>
      ) : null}

      {page === 'media' ? (
        <div className="gk-page" role="region" aria-label={t('navMedia')}>
          <div className="gk-feature">
            <div className="gk-setting">
              <label className="gk-setting-label"><span><b>{t('imagineTool')}</b><span className="gk-tag">{t('experimentalTag')}</span></span><input className="gk-switch" type="checkbox" checked={optBool(options.imagineTool, false) || optBool(options.editTool, false)} disabled={optionsBusy} ref={mediaImageRef} onChange={event => markMedia('images', event.target.checked)} /></label>
              <p className="gk-hint">{t('imagineToolHint')}</p>
              <p className="gk-hint">{`${t('imageGenerationSwitch')}: ${t(optBool(options.imagineTool, false) ? 'mediaOn' : 'mediaOff')} · ${t('imageEditingSwitch')}: ${t(optBool(options.editTool, false) ? 'mediaOn' : 'mediaOff')}`}</p>
            </div>
            <div className="gk-setting">
              <label className="gk-setting-label"><span><b>{t('videoTool')}</b><span className="gk-tag">{t('experimentalTag')}</span></span><input className="gk-switch" type="checkbox" checked={optBool(options.videoTool, false)} disabled={optionsBusy} ref={mediaVideoRef} onChange={event => markMedia('video', event.target.checked)} /></label>
              <p className="gk-hint">{t('videoToolHint')}</p>
            </div>
          </div>
          {pendingMediaGroup !== null ? (
            <div className="gk-confirm" ref={mediaConfirmRef} tabIndex={-1} role="region" aria-label={t('mediaConfirmTitle')}>
              <p className="gk-eyebrow gk-error">{t('mediaConfirmTitle')}</p>
              <h4 className="gk-title gk-error">{pendingMediaGroup === 'images' ? t('imagineTool') : t('videoTool')}</h4>
              <p className="gk-hint">{t('mediaConfirmPrompt')}</p>
              <div className="gk-actions"><button type="button" className="gk-button gk-button--danger" disabled={optionsBusy} onClick={() => { restoreMediaFocus(); confirmPendingMedia() }}>{t('mediaConfirmYes')}</button><button type="button" className="gk-button" disabled={optionsBusy} onClick={() => { restoreMediaFocus(); cancelPendingMedia() }}>{t('mediaConfirmNo')}</button></div>
            </div>
          ) : null}
          <p className="gk-hint">{t('mediaRiskHint')}</p>
          <details className="gk-details"><summary>{t('optionsHowTo')}</summary><div className="gk-stack"><p className="gk-hint">{t('optionsHint')}</p><p className="gk-hint">{`${t('videoModelLabel')}: ${String(options.videoModel ?? '—')}`}</p><p className="gk-hint">{`${t('videoMaxBytesLabel')}: ${String(options.videoMaxBytes ?? '—')}`}</p></div></details>
          <CapabilitiesView key={`${accountKey}:${String(capabilityGeneration)}`} t={t} signedIn={status.status === 'signed-in'} />
        </div>
      ) : null}

      {page === 'network' ? (
        <div className="gk-page" role="region" aria-label={t('navNetwork')}>
          <div className="gk-panel gk-stack">
            <label className="gk-field"><b className="gk-title">{t('proxyTitle')}</b><input className="gk-input" type="text" value={proxyUrl} placeholder={t('proxyPlaceholder')} disabled={proxyBusy} aria-label={t('proxyTitle')} onChange={event => {
              proxyUrlEditedRef.current = true
              setProxyUrl(event.target.value)
              resetProxyFeedback()
            }} /></label>
            <p className="gk-hint">{t('proxyHint')}</p>
          </div>
          <div className="gk-stack">
            <label className="gk-setting-label"><b>{t('quotaCompatibilityMode')}</b><input className="gk-switch" type="checkbox" checked={quotaCompatibilityMode} disabled={proxyBusy} onChange={event => {
              quotaEditedRef.current = true
              setQuotaCompatibilityMode(event.target.checked)
              resetProxyFeedback()
            }} /></label>
            <p className="gk-hint">{t('quotaCompatibilityModeHint')}</p>
            <p role="note" className="gk-hint gk-error">{t('quotaCompatibilityWarning')}</p>
          </div>
        </div>
      ) : null}

      {page === 'search' || page === 'media' ? optionActions(page) : null}
      {page === 'network' ? <footer className="gk-footer">
        {pageHasDraft('network') ? <p role="status" className="gk-feedback">{t('unsavedChangesHint')} {t('networkUnsavedChangesHint')} {quotaCompatibilityMode !== savedQuotaCompatibilityMode ? t('quotaCompatibilityUnsaved') : ''}</p> : null}
        <div className="gk-actions"><button type="button" className="gk-button gk-button--primary" disabled={proxyBusy || !proxyLoaded} onClick={() => { void saveProxy() }}>{proxyBusy ? t('working') : t('proxySave')}</button><span className="gk-hint">{t('networkImmediate')}</span></div>
        {proxyFeedback === 'saved' ? <p role="status" className="gk-feedback gk-success">{t('proxySaved')}</p> : null}
        {proxyFeedback === 'error' ? <p role="alert" className="gk-feedback gk-error">{t('proxyError')}</p> : null}
        {proxyFeedback === 'loadError' ? <><p role="alert" className="gk-feedback gk-error">{t('proxyLoadError')}</p><button type="button" className="gk-button" disabled={proxyLoading} aria-label={t('proxyRetry')} onClick={() => { void loadProxy() }}>{proxyLoading ? t('working') : t('proxyRetry')}</button></> : null}
      </footer> : null}
    </section>
  )
}
