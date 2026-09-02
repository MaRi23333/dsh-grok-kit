//

// Derived from dsh-xai (https://github.com/MirDie/dsh-xai), Apache-2.0.

// Modified for dsh-grok-kit — see NOTICE for the full attribution.

//

/** Plugin-owned xAI Grok account page inside the dsh Settings shell. */

import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { XaiOAuthSettingsKey } from './locales.ts'

const STATUS_PATH = '/plugins/dsh-grok-kit/auth/status'
const LOGIN_PATH = '/plugins/dsh-grok-kit/auth/login'
const IMPORT_PATH = '/plugins/dsh-grok-kit/auth/import'
const LOGOUT_PATH = '/plugins/dsh-grok-kit/auth/logout'
const MODELS_PATH = '/plugins/dsh-grok-kit/auth/models'
const PROXY_PATH = '/plugins/dsh-grok-kit/auth/proxy'
const OPTIONS_PATH = '/plugins/dsh-grok-kit/auth/options'
const POLL_INTERVAL_MS = 1_000

type OptionKey =
  | 'backendSearch'
  | 'nestedSearchTools'
  | 'statefulResponses'
  | 'imagineTool'
  | 'searchModel'
  | 'searchMaxResults'
  | 'webSearchTimeoutMs'
  | 'xSearchTimeoutMs'

type OptionValue = boolean | number | string | undefined

const ALL_OPTION_KEYS: readonly OptionKey[] = [
  'backendSearch',
  'nestedSearchTools',
  'statefulResponses',
  'imagineTool',
  'searchModel',
  'searchMaxResults',
  'webSearchTimeoutMs',
  'xSearchTimeoutMs',
]

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
    grokImportAvailable?: boolean
    sharedGrokAuth?: boolean
  }
  | { status: 'error'; message: string; grokImportAvailable?: boolean; sharedGrokAuth?: boolean }

interface LoginChallenge {
  url: string
  userCode?: string
}

export interface XaiOAuthSettingsInjected {
  t: (key: XaiOAuthSettingsKey, params?: Record<string, unknown>) => string
}

export type XaiOAuthSettingsProps = Partial<XaiOAuthSettingsInjected>

/* ---- theme-aware styles (dsh `--dsw-alias-*` tokens; no external assets) ---- */

const pageStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 720 }
const headerStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 14 }
const logoStyle: CSSProperties = {
  flex: '0 0 auto',
  width: 40,
  height: 40,
  borderRadius: 12,
  display: 'grid',
  placeItems: 'center',
  background: 'linear-gradient(135deg, var(--dsw-alias-brand-primary, #1677ff), var(--dsw-alias-state-info-primary, #4f6bed))',
  color: 'white',
  fontSize: 22,
  fontWeight: 700,
  fontFamily: 'ui-sans-serif, system-ui, sans-serif',
  lineHeight: 1,
}
const titleStyle: CSSProperties = { margin: 0, fontSize: 20, lineHeight: '28px', fontWeight: 600, color: 'var(--dsw-alias-label-primary)' }
const bodyStyle: CSSProperties = { margin: 0, fontSize: 14, lineHeight: '22px', color: 'var(--dsw-alias-label-secondary)' }
const cardStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 14, padding: '18px 20px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 12, background: 'var(--dsw-alias-bg-module-platform)' }
const rowStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }
const statusStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 9, fontSize: 15, fontWeight: 500, color: 'var(--dsw-alias-label-primary)' }
const buttonStyle: CSSProperties = { boxSizing: 'border-box', minHeight: 34, padding: '6px 14px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 18, background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', font: 'inherit', fontSize: 14, cursor: 'pointer' }
const primaryButtonStyle: CSSProperties = { ...buttonStyle, borderColor: 'var(--dsw-alias-brand-primary)', background: 'var(--dsw-alias-brand-primary)', color: 'white' }
const errorStyle: CSSProperties = { ...bodyStyle, color: 'var(--dsw-alias-state-error-primary)' }
const codeBoxStyle: CSSProperties = { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, padding: '10px 14px', border: '1px dashed var(--dsw-alias-border-l2)', borderRadius: 10, background: 'var(--dsw-alias-bg-layer-1)' }
const codeStyle: CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 20, letterSpacing: '0.08em', fontWeight: 600, color: 'var(--dsw-alias-label-primary)' }
const linkStyle: CSSProperties = { color: 'var(--dsw-alias-brand-primary)', wordBreak: 'break-all' }
const listStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, margin: 0, padding: 0, listStyle: 'none' }
const modelRowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 8, color: 'var(--dsw-alias-label-primary)' }
const modelNameStyle: CSSProperties = { fontSize: 14, fontWeight: 500 }
const modelIdStyle: CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 12, color: 'var(--dsw-alias-label-dimmed)' }
const optionRowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--dsw-alias-label-primary)', flexWrap: 'wrap' }
const optionHintStyle: CSSProperties = { ...bodyStyle, fontSize: 12, margin: 0, color: 'var(--dsw-alias-label-dimmed)' }
const optionInputStyle: CSSProperties = {
  flex: '1 1 200px',
  minHeight: 30,
  padding: '4px 10px',
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 8,
  background: 'var(--dsw-alias-bg-layer-1)',
  color: 'var(--dsw-alias-label-primary)',
  font: 'inherit',
  fontSize: 13,
}
const badgeStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 999, border: '1px solid var(--dsw-alias-border-l2)', fontSize: 12, fontWeight: 500, color: 'var(--dsw-alias-label-secondary)', whiteSpace: 'nowrap' }
const sourceBadgeStyle: CSSProperties = { ...badgeStyle, fontWeight: 600 }

function sourceBadge(source: CatalogSource | undefined): { text: string; color: string } {
  switch (source) {
    case 'live': return { text: 'Live', color: 'var(--dsw-alias-state-success-primary, #22a06b)' }
    case 'cache': return { text: 'Cached', color: 'var(--dsw-alias-state-info-primary, #4f6bed)' }
    case 'fallback': return { text: 'Fallback', color: 'var(--dsw-alias-label-dimmed, #9aa0a6)' }
    default: return { text: '—', color: 'var(--dsw-alias-label-dimmed, #9aa0a6)' }
  }
}

function dotStyle(status: AccountStatus['status']): CSSProperties {
  const color = status === 'signed-in'
    ? 'var(--dsw-alias-state-success-primary, #22a06b)'
    : status === 'error'
      ? 'var(--dsw-alias-state-error-primary, #d92d20)'
      : status === 'signing-in' || status === 'loading'
        ? 'var(--dsw-alias-brand-primary, #1677ff)'
        : 'var(--dsw-alias-label-dimmed, #9aa0a6)'
  return { width: 9, height: 9, borderRadius: '50%', flex: '0 0 auto', background: color }
}

/** grok-4.6 → "Grok 4.6"; only used for display, never sent to the API. */
function displayName(id: string): string {
  return id
    .split(/[-_]/g)
    .map(part => part.length === 0 ? part : part[0]!.toUpperCase() + part.slice(1))
    .join(' ')
}

async function jsonRequest<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { accept: 'application/json', ...body === undefined ? {} : { 'content-type': 'application/json' } },
    credentials: 'same-origin',
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
  const [busy, setBusy] = useState(false)
  const [proxyUrl, setProxyUrl] = useState('')
  const [proxyBusy, setProxyBusy] = useState(false)
  const [proxyFeedback, setProxyFeedback] = useState<'idle' | 'saved' | 'error'>('idle')
  const [popupBlocked, setPopupBlocked] = useState(false)
  const [options, setOptions] = useState<Partial<Record<OptionKey, OptionValue>>>({})
  const [optionsDirty, setOptionsDirty] = useState<ReadonlySet<OptionKey>>(new Set())
  const [optionsBusy, setOptionsBusy] = useState(false)
  const [optionsFeedback, setOptionsFeedback] = useState<'idle' | 'saved' | 'error'>('idle')

  const markOption = (key: OptionKey, value: OptionValue): void => {
    setOptions(previous => ({ ...previous, [key]: value }))
    setOptionsDirty(previous => new Set(previous).add(key))
    setOptionsFeedback('idle')
  }

  const loadOptions = useCallback(async () => {
    try {
      const value = await jsonRequest<{ options: Partial<Record<OptionKey, OptionValue>> }>(OPTIONS_PATH)
      setOptions(value.options ?? {})
      setOptionsDirty(new Set())
    } catch {
      setOptionsFeedback('error')
    }
  }, [])

  const saveOptions = async (): Promise<void> => {
    setOptionsBusy(true)
    try {
      const patch: Record<string, unknown> = {}
      for (const key of optionsDirty) patch[key] = options[key] ?? null
      const value = await jsonRequest<{ options: Partial<Record<OptionKey, OptionValue>> }>(OPTIONS_PATH, 'POST', patch)
      setOptions(value.options ?? {})
      setOptionsDirty(new Set())
      setOptionsFeedback('saved')
    } catch {
      setOptionsFeedback('error')
    } finally {
      setOptionsBusy(false)
    }
  }

  const resetOptions = async (): Promise<void> => {
    setOptionsBusy(true)
    try {
      const patch: Record<string, unknown> = {}
      for (const key of ALL_OPTION_KEYS) patch[key] = null
      const value = await jsonRequest<{ options: Partial<Record<OptionKey, OptionValue>> }>(OPTIONS_PATH, 'POST', patch)
      setOptions(value.options ?? {})
      setOptionsDirty(new Set())
      setOptionsFeedback('saved')
    } catch {
      setOptionsFeedback('error')
    } finally {
      setOptionsBusy(false)
    }
  }

  const loadProxy = useCallback(async () => {
    try {
      const value = await jsonRequest<{ proxyUrl: string }>(PROXY_PATH)
      setProxyUrl(value.proxyUrl ?? '')
    } catch {
      setProxyFeedback('error')
    }
  }, [])

  const saveProxy = async (): Promise<void> => {
    setProxyBusy(true)
    try {
      await jsonRequest<{ proxyUrl: string }>(PROXY_PATH, 'POST', { proxyUrl })
      setProxyFeedback('saved')
    } catch {
      setProxyFeedback('error')
    } finally {
      setProxyBusy(false)
    }
  }

  const refresh = useCallback(async () => {
    try {
      setStatus(await jsonRequest<AccountStatus>(STATUS_PATH))
    } catch (error: unknown) {
      setStatus({ status: 'error', message: error instanceof Error ? error.message : t('requestFailed') })
    }
  }, [t])

  useEffect(() => { void refresh() }, [refresh])
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
    }
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
    setBusy(true)
    try {
      setStatus(await jsonRequest<AccountStatus>(IMPORT_PATH, 'POST'))
    } catch (error: unknown) {
      setStatus({ status: 'error', message: error instanceof Error ? error.message : t('requestFailed') })
    } finally {
      setBusy(false)
    }
  }

  const saveModels = async (selected: string[]): Promise<void> => {
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
    setBusy(true)
    try {
      // The route returns the full signed-out status (incl. grokImportAvailable),
      // so the Grok CLI import button stays available right after sign-out.
      setStatus(await jsonRequest<AccountStatus>(LOGOUT_PATH, 'POST'))
    } catch (error: unknown) {
      setStatus({ status: 'error', message: error instanceof Error ? error.message : t('requestFailed') })
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

  return (
    <section style={pageStyle} aria-labelledby="xai-oauth-settings-title">
      <header style={headerStyle}>
        <div style={logoStyle} aria-hidden="true">ɡ</div>
        <div style={{ minWidth: 0 }}>
          <h2 id="xai-oauth-settings-title" style={titleStyle}>{t('title')}</h2>
          <p style={{ ...bodyStyle, marginTop: 4 }}>{t('intro')}</p>
        </div>
      </header>

      {/* Account card */}
      <div style={cardStyle}>
        <div style={rowStyle}>
          <div style={statusStyle} role="status">
            <span aria-hidden="true" style={dotStyle(status.status)} />
            <span>{label}</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {status.status === 'loading'
              ? null
              : status.status === 'signed-in'
                ? <button type="button" style={buttonStyle} disabled={busy} onClick={() => { void signOut() }}>{busy ? t('working') : t(shared ? 'logoutShared' : 'logout')}</button>
                : (
                    <>
                      <button type="button" style={primaryButtonStyle} disabled={busy || status.status === 'signing-in'} onClick={() => { void signIn() }}>{busy ? t('working') : status.status === 'error' ? t('loginAgain') : t(shared ? 'loginShared' : 'login')}</button>
                      {status.grokImportAvailable === true
                        ? <button type="button" style={buttonStyle} disabled={busy} onClick={() => { void importGrok() }}>{t('importGrok')}</button>
                        : null}
                    </>
                  )}
          </div>
        </div>

        <p style={{ ...bodyStyle, fontSize: 12, color: 'var(--dsw-alias-label-dimmed)' }}>{t('unofficialNotice')}</p>

        {status.status === 'error' ? <p style={errorStyle}>{status.message}</p> : null}
        {status.status !== 'loading' && status.sharedGrokAuth === true
          ? <p style={bodyStyle}>{t('sharedGrok')}</p>
          : null}
        {status.status !== 'signed-in' && status.status !== 'loading' && status.grokImportAvailable === true
          ? <p style={bodyStyle}>{t('importHint')}</p>
          : null}

        {status.status === 'signing-in' && status.userCode !== undefined
          ? (
              <div style={codeBoxStyle}>
                <span style={bodyStyle}>{t('userCode')}</span>
                <span style={codeStyle}>{status.userCode}</span>
              </div>
            )
          : null}
        {status.status === 'signing-in' && status.url !== undefined
          ? (
              <p style={bodyStyle}>
                {t(popupBlocked ? 'popupBlocked' : 'openUrl')}
                {' '}
                <a href={status.url} target="_blank" rel="noreferrer" style={linkStyle}>{status.url}</a>
              </p>
            )
          : null}
      </div>

      {/* Models card */}
      {status.status === 'signed-in'
        ? (
            <div style={cardStyle}>
              <div style={rowStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 style={{ ...titleStyle, fontSize: 14 }}>{t('models')}</h3>
                  <span style={badgeStyle}>{String(modelIds.length)}</span>
                  {source === null ? null : <span style={{ ...sourceBadgeStyle, color: source.color }}>{source.text}</span>}
                </div>
                <button type="button" style={buttonStyle} disabled={busy} onClick={() => { void saveModels([]) }}>{t('selectAll')}</button>
              </div>
              <p style={bodyStyle}>
                {status.catalogSource === 'live' ? t('catalogLive')
                  : status.catalogSource === 'cache' ? t('catalogCache')
                    : t('catalogFallback')}
              </p>
              <p style={bodyStyle}>{t('modelHint')}</p>
              <ul style={listStyle}>
                {modelIds.map(id => {
                  const checked = selectedIds.includes(id)
                  return (
                    <li key={id}>
                      <label style={modelRowStyle}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={busy}
                          onChange={() => {
                            const current = new Set(selectedIds)
                            if (checked) current.delete(id)
                            else current.add(id)
                            void saveModels([...current])
                          }}
                        />
                        <span style={modelNameStyle}>{displayName(id)}</span>
                        <span style={modelIdStyle}>{id}</span>
                      </label>
                    </li>
                  )
                })}
              </ul>
              {status.catalogError === undefined ? null : <p style={errorStyle}>{t('catalogError')}</p>}
            </div>
          )
        : null}

      {/* Proxy card */}
      <div style={cardStyle}>
        <h3 style={{ ...titleStyle, fontSize: 14 }}>{t('proxyTitle')}</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <input
            type="text"
            value={proxyUrl}
            placeholder={t('proxyPlaceholder')}
            disabled={proxyBusy}
            aria-label={t('proxyTitle')}
            onChange={(event) => {
              setProxyUrl(event.target.value)
              setProxyFeedback('idle')
            }}
            style={{
              flex: '1 1 260px',
              minHeight: 34,
              padding: '6px 12px',
              border: '1px solid var(--dsw-alias-border-l2)',
              borderRadius: 10,
              background: 'var(--dsw-alias-bg-layer-1)',
              color: 'var(--dsw-alias-label-primary)',
              font: 'inherit',
              fontSize: 14,
            }}
          />
          <button type="button" style={buttonStyle} disabled={proxyBusy} onClick={() => { void saveProxy() }}>
            {proxyBusy ? t('working') : t('proxySave')}
          </button>
        </div>
        <p style={bodyStyle}>{t('proxyHint')}</p>
        {proxyFeedback === 'saved'
          ? <p style={{ ...bodyStyle, color: 'var(--dsw-alias-state-success-primary, #22a06b)' }}>{t('proxySaved')}</p>
          : null}
        {proxyFeedback === 'error' ? <p style={errorStyle}>{t('proxyError')}</p> : null}
      </div>

      {/* Search & feature options card */}
      <div style={cardStyle}>
        <div style={rowStyle}>
          <h3 style={{ ...titleStyle, fontSize: 14 }}>{t('optionsTitle')}</h3>
          <button type="button" style={buttonStyle} disabled={optionsBusy} onClick={() => { void resetOptions() }}>
            {t('optionsReset')}
          </button>
        </div>
        <p style={bodyStyle}>{t('optionsHint')}</p>

        <label style={optionRowStyle}>
          <input
            type="checkbox"
            checked={optBool(options.backendSearch, false)}
            disabled={optionsBusy}
            onChange={(event) => markOption('backendSearch', event.target.checked)}
          />
          <span>{t('backendSearch')}</span>
        </label>
        <p style={optionHintStyle}>{t('backendSearchHint')}</p>

        <label style={optionRowStyle}>
          <input
            type="checkbox"
            checked={optBool(options.statefulResponses, false)}
            disabled={optionsBusy}
            onChange={(event) => markOption('statefulResponses', event.target.checked)}
          />
          <span>{t('statefulResponses')}</span>
        </label>
        <p style={optionHintStyle}>{t('statefulResponsesHint')}</p>

        <label style={optionRowStyle}>
          <input
            type="checkbox"
            checked={optBool(options.imagineTool, true)}
            disabled={optionsBusy}
            onChange={(event) => markOption('imagineTool', event.target.checked)}
          />
          <span>{t('imagineTool')}</span>
        </label>
        <p style={optionHintStyle}>{t('imagineToolHint')}</p>

        <label style={optionRowStyle}>
          <span>{t('nestedSearchTools')}</span>
          <select
            value={options.nestedSearchTools === undefined ? 'auto' : String(options.nestedSearchTools)}
            disabled={optionsBusy}
            onChange={(event) => markOption(
              'nestedSearchTools',
              event.target.value === 'auto' ? undefined : event.target.value === 'true',
            )}
            style={{ ...optionInputStyle, flex: '0 1 auto' }}
          >
            <option value="auto">{t('nestedSearchToolsAuto')}</option>
            <option value="true">on</option>
            <option value="false">off</option>
          </select>
        </label>
        <p style={optionHintStyle}>{t('nestedSearchToolsHint')}</p>

        <label style={optionRowStyle}>
          <span>{t('searchModel')}</span>
          <input
            type="text"
            value={String(options.searchModel ?? '')}
            placeholder="grok-build-0.1"
            disabled={optionsBusy}
            onChange={(event) => markOption('searchModel', event.target.value.trim() === '' ? undefined : event.target.value)}
            style={optionInputStyle}
          />
        </label>
        <p style={optionHintStyle}>{t('searchModelHint')}</p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
          <label style={optionRowStyle}>
            <span>{t('searchMaxResults')}</span>
            <input
              type="number"
              min={1}
              value={String(options.searchMaxResults ?? '')}
              placeholder="8"
              disabled={optionsBusy}
              onChange={(event) => markOption('searchMaxResults', event.target.value === '' ? undefined : Number(event.target.value))}
              style={optionInputStyle}
            />
          </label>
          <label style={optionRowStyle}>
            <span>{t('webSearchTimeoutMs')}</span>
            <input
              type="number"
              min={1000}
              value={String(options.webSearchTimeoutMs ?? '')}
              placeholder="60000"
              disabled={optionsBusy}
              onChange={(event) => markOption('webSearchTimeoutMs', event.target.value === '' ? undefined : Number(event.target.value))}
              style={optionInputStyle}
            />
          </label>
          <label style={optionRowStyle}>
            <span>{t('xSearchTimeoutMs')}</span>
            <input
              type="number"
              min={1000}
              value={String(options.xSearchTimeoutMs ?? '')}
              placeholder="120000"
              disabled={optionsBusy}
              onChange={(event) => markOption('xSearchTimeoutMs', event.target.value === '' ? undefined : Number(event.target.value))}
              style={optionInputStyle}
            />
          </label>
        </div>
        <p style={optionHintStyle}>{t('searchMaxResultsHint')} · {t('webSearchTimeoutHint')} · {t('xSearchTimeoutHint')}</p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <button type="button" style={buttonStyle} disabled={optionsBusy || optionsDirty.size === 0} onClick={() => { void saveOptions() }}>
            {optionsBusy ? t('working') : t('optionsSave')}
          </button>
          {optionsFeedback === 'saved'
            ? <p style={{ ...bodyStyle, margin: 0, color: 'var(--dsw-alias-state-success-primary, #22a06b)' }}>{t('optionsSaved')}</p>
            : null}
          {optionsFeedback === 'error' ? <p style={{ ...errorStyle, margin: 0 }}>{t('optionsError')}</p> : null}
        </div>
      </div>
    </section>
  )
}
