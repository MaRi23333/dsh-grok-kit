//

// Part of dsh-grok-kit, Apache-2.0.

//

/**
 * Capability snapshot and local video task panels for the xAI Grok settings
 * page (`XaiSettings` embeds {@link CapabilitiesView}).
 *
 * Contract rules honoured here:
 *   - reads only the frozen same-origin routes: `GET
 *     /plugins/dsh-grok-kit/capabilities` and `GET
 *     /plugins/dsh-grok-kit/video/tasks`; the query/resume and file-byte
 *     actions live inside the shared {@link VideoMediaCard} (same card, same
 *     visuals and the same state actions as the session toolview — the old
 *     debug-style row dump is gone);
 *   - no automatic probing, no timer polling of the upstream, no invented
 *     quota numbers. The snapshot payload still parses its `quota` field so
 *     the wire contract stays frozen, but nothing renders it here any more:
 *     the account page's own `QuotaView` owns the quota reading;
 *   - loading and error states are real, and every fetch is aborted when the
 *     component unmounts;
 *   - signed-out viewers receive the shape with all features `unverified`
 *     (the host clears its records on sign-out). The panel is remounted by the
 *     settings page on every account change (`key` = account status +
 *     generation, bumped by sign-in / import / sign-out), which aborts its
 *     in-flight requests, revokes any blob URL and drops every task row — so
 *     one account's tasks or diagnostics are never rendered for the next.
 *     The task list is not mounted at all while signed out.
 */

import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { XaiOAuthSettingsKey } from './locales.ts'
import { VideoMediaCard, parseVideoTasks } from './video-view.tsx'
import type { VideoTaskResult } from './video-view.tsx'

const CAPABILITIES_PATH = '/plugins/dsh-grok-kit/capabilities'
const VIDEO_TASKS_PATH = '/plugins/dsh-grok-kit/video/tasks'

/** Settings locale binder shape (injected by `XaiSettings`). */
export type SettingsTranslate = (key: XaiOAuthSettingsKey, params?: Record<string, unknown>) => string

// ---------------------------------------------------------------------------
// Capability snapshot contract
// ---------------------------------------------------------------------------

const FEATURE_IDS = ['video', 'voice', 'code', 'image-generation'] as const
export type CapabilityFeatureId = (typeof FEATURE_IDS)[number]

const FEATURE_STATES = ['unverified', 'available', 'restricted', 'temporary-error'] as const
export type CapabilityFeatureState = (typeof FEATURE_STATES)[number]

export interface CapabilityFeature {
  id: CapabilityFeatureId
  state: CapabilityFeatureState
  checkedAt?: string
  model?: string
  httpStatus?: number
  message?: string
}

export interface CapabilitySnapshot {
  features: CapabilityFeature[]
  /**
   * Parsed but never rendered here: kept so the frozen route payload stays
   * compatible with callers that still read it (the account page's
   * `QuotaView` reads the quota from its own route).
   */
  quota: { state: 'unavailable'; message: string }
  videoEnabled: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Parse the frozen snapshot payload; throws on a structurally wrong body. */
export function parseCapabilitySnapshot(value: unknown): CapabilitySnapshot {
  if (!isRecord(value)) throw new Error('capability snapshot is not an object')
  const rawFeatures = value['features']
  if (!Array.isArray(rawFeatures)) throw new Error('capability snapshot has no feature list')
  const features: CapabilityFeature[] = []
  for (const raw of rawFeatures) {
    if (!isRecord(raw)) continue
    const id = raw['id']
    const state = raw['state']
    if (typeof id !== 'string' || !(FEATURE_IDS as readonly string[]).includes(id)) continue
    if (typeof state !== 'string' || !(FEATURE_STATES as readonly string[]).includes(state)) continue
    features.push({
      id: id as CapabilityFeatureId,
      state: state as CapabilityFeatureState,
      ...typeof raw['checkedAt'] === 'string' ? { checkedAt: raw['checkedAt'] } : {},
      ...typeof raw['model'] === 'string' ? { model: raw['model'] } : {},
      ...typeof raw['httpStatus'] === 'number' && Number.isInteger(raw['httpStatus']) ? { httpStatus: raw['httpStatus'] } : {},
      ...typeof raw['message'] === 'string' && raw['message'] !== '' ? { message: raw['message'] } : {},
    })
  }
  const quota = isRecord(value['quota']) ? value['quota'] : undefined
  return {
    features,
    quota: {
      state: 'unavailable',
      message: typeof quota?.['message'] === 'string' ? quota['message'] : '',
    },
    videoEnabled: value['videoEnabled'] === true,
  }
}

// ---------------------------------------------------------------------------
// Small request helper (same-origin JSON, abortable)
// ---------------------------------------------------------------------------

interface JsonRequestInit {
  method?: 'GET' | 'POST'
  body?: unknown
}

async function requestJson(path: string, init: JsonRequestInit, signal: AbortSignal): Promise<unknown> {
  const headers: Record<string, string> = { accept: 'application/json' }
  const request: RequestInit = { method: init.method ?? 'GET', credentials: 'same-origin', headers, signal }
  if (init.body !== undefined) {
    headers['content-type'] = 'application/json'
    request.body = JSON.stringify(init.body)
  }
  const response = await fetch(path, request)
  const value: unknown = await response.json().catch(() => undefined)
  if (!response.ok) {
    const detail = isRecord(value) && typeof value['error'] === 'string' ? `: ${value['error']}` : ''
    throw new Error(`HTTP ${String(response.status)}${detail}`)
  }
  return value
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : ''
}

// ---------------------------------------------------------------------------
// Settings theme tokens with standalone host fallbacks.
// ---------------------------------------------------------------------------

const cardStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 18, padding: 22, border: '1px solid var(--gk-line, var(--dsw-alias-border-l2, #e5e5e5))', borderRadius: 20, background: 'var(--gk-surface, var(--dsw-alias-bg-module-platform, #fff))' }
const titleStyle: CSSProperties = { margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--gk-text, var(--dsw-alias-label-primary, #171717))' }
const bodyStyle: CSSProperties = { margin: 0, fontSize: 13, lineHeight: '21px', color: 'var(--gk-muted, var(--dsw-alias-label-secondary, #666))' }
const hintStyle: CSSProperties = { ...bodyStyle, fontSize: 12 }
const errorStyle: CSSProperties = { ...bodyStyle, color: 'var(--gk-danger, var(--dsw-alias-state-error-primary, #c13b36))', overflowWrap: 'anywhere' }
const rowStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }
const listStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12, margin: 0, padding: 0, listStyle: 'none' }
const buttonStyle: CSSProperties = { boxSizing: 'border-box', minHeight: 34, padding: '6px 14px', border: '1px solid var(--gk-line, var(--dsw-alias-border-l2, #e5e5e5))', borderRadius: 999, background: 'var(--gk-surface, var(--dsw-alias-bg-layer-1, #fff))', color: 'var(--gk-text, var(--dsw-alias-label-primary, #171717))', font: 'inherit', fontSize: 12, cursor: 'pointer' }
const badgeStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 500, color: 'var(--gk-muted, var(--dsw-alias-label-secondary, #666))', whiteSpace: 'nowrap' }
const itemStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8, padding: '16px', minWidth: 0 }
const labelStyle: CSSProperties = { fontSize: 11, lineHeight: '18px', color: 'var(--gk-muted, var(--dsw-alias-label-tertiary, #81858c))', overflowWrap: 'anywhere' }
const dotStyle: CSSProperties = { width: 6, height: 6, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }
const emptyStyle: CSSProperties = { ...bodyStyle, padding: '20px 16px', borderRadius: 14, background: 'var(--gk-soft, var(--dsw-alias-bg-layer-1, #f5f5f5))' }

const STATE_TONE: Record<CapabilityFeatureState, string> = {
  unverified: 'var(--gk-muted, var(--dsw-alias-label-tertiary, #81858c))',
  available: 'var(--gk-success, var(--dsw-alias-state-success-primary, #21865a))',
  restricted: 'var(--gk-danger, var(--dsw-alias-state-error-primary, #c13b36))',
  'temporary-error': 'var(--gk-danger, var(--dsw-alias-state-error-primary, #c13b36))',
}

// ---------------------------------------------------------------------------
// Video task list
// ---------------------------------------------------------------------------

type TasksStatus =
  | { kind: 'disabled' }
  | { kind: 'loading' }
  | { kind: 'error'; detail: string }
  | { kind: 'ready'; tasks: VideoTaskResult[] }

/**
 * Local video task list: one read per mount/refresh. Each row renders the same
 * {@link VideoMediaCard} as the session toolview (query/resume/download/play
 * actions included), keyed by `resetToken` so a refreshed list wins over a
 * locally applied query/resume result.
 */
export function VideoTasksView({ t, videoEnabled }: { t: SettingsTranslate; videoEnabled: boolean }) {
  const [status, setStatus] = useState<TasksStatus>({ kind: videoEnabled ? 'loading' : 'disabled' })
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!videoEnabled) {
      setStatus({ kind: 'disabled' })
      return
    }
    const abort = new AbortController()
    let live = true
    setStatus({ kind: 'loading' })
    requestJson(VIDEO_TASKS_PATH, {}, abort.signal)
      .then(value => parseVideoTasks(value))
      .then(tasks => { if (live) setStatus({ kind: 'ready', tasks }) })
      .catch((error: unknown) => {
        if (!live || abort.signal.aborted) return
        setStatus({ kind: 'error', detail: errorDetail(error) })
      })
    return () => {
      live = false
      abort.abort()
    }
  }, [reloadKey, videoEnabled])

  return (
    <section aria-label={t('videoTasksTitle')} aria-busy={videoEnabled && status.kind === 'loading'} style={{ display: 'flex', flexDirection: 'column', gap: 12, borderTop: '1px solid var(--gk-line, var(--dsw-alias-border-l2, #e5e5e5))', paddingTop: 20, minWidth: 0 }}>
      <div style={rowStyle}>
        <h4 className="gk-title" style={{ ...titleStyle, fontSize: 14 }}>{t('videoTasksTitle')}</h4>
        <button className="gk-button" type="button" style={buttonStyle} disabled={!videoEnabled || status.kind === 'loading'} onClick={() => { if (videoEnabled) setReloadKey(key => key + 1) }}>
          {t('videoTasksRefresh')}
        </button>
      </div>
      {videoEnabled ? <p style={hintStyle}>{t('videoTasksIntro')}</p> : null}
      {videoEnabled ? null : <p className="gk-empty" style={emptyStyle}>{t('videoTasksDisabled')}</p>}
      {videoEnabled ? <p style={hintStyle}>{t('resumeHint')}</p> : null}
      {videoEnabled && status.kind === 'loading' ? <p role="status" style={emptyStyle}>{t('videoTasksLoading')}</p> : null}
      {videoEnabled && status.kind === 'error' ? (
        <>
          <p style={errorStyle}>{t('videoTasksError')}</p>
          {status.detail === '' ? null : <p style={errorStyle}>{status.detail}</p>}
        </>
      ) : null}
      {videoEnabled && status.kind === 'ready' && status.tasks.length === 0 ? <p className="gk-empty" style={emptyStyle}>{t('videoTasksEmpty')}</p> : null}
      {videoEnabled && status.kind === 'ready' && status.tasks.length > 0 ? (
        <ul style={listStyle}>
          {status.tasks.map(task => (
            <li key={task.taskId} style={{ listStyle: 'none' }}>
              <VideoMediaCard
                task={task}
                t={t}
                resetToken={task}
                continueEnabled={videoEnabled}
                testId="grok-video-task"
              />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Capability snapshot panel
// ---------------------------------------------------------------------------

type CapabilitiesStatus =
  | { kind: 'loading' }
  | { kind: 'error'; detail: string }
  | { kind: 'ready'; data: CapabilitySnapshot }

function featureLabel(t: SettingsTranslate, id: CapabilityFeatureId): string {
  switch (id) {
    case 'video': return t('featureVideo')
    case 'voice': return t('featureVoice')
    case 'code': return t('featureCode')
    case 'image-generation': return t('featureImageGeneration')
    default: return t('featureImageGeneration')
  }
}

function featureStateLabel(t: SettingsTranslate, state: CapabilityFeatureState): string {
  switch (state) {
    case 'available': return t('stateAvailable')
    case 'restricted': return t('stateRestricted')
    case 'temporary-error': return t('stateTemporaryError')
    case 'unverified': return t('stateUnverified')
    default: return t('stateUnverified')
  }
}

/**
 * Capability panel: features, the video gate and the local video task list.
 * One read on mount plus explicit refresh — no polling. Mounted only while its
 * page is active, so re-entering the page re-reads the host's local record.
 */
export function CapabilitiesView({ t, signedIn }: { t: SettingsTranslate; signedIn: boolean }) {
  const [status, setStatus] = useState<CapabilitiesStatus>({ kind: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const abort = new AbortController()
    let live = true
    setStatus({ kind: 'loading' })
    requestJson(CAPABILITIES_PATH, {}, abort.signal)
      .then(value => parseCapabilitySnapshot(value))
      .then(data => { if (live) setStatus({ kind: 'ready', data }) })
      .catch((error: unknown) => {
        if (!live || abort.signal.aborted) return
        setStatus({ kind: 'error', detail: errorDetail(error) })
      })
    return () => {
      live = false
      abort.abort()
    }
  }, [reloadKey])

  return (
    <section className="gk-panel" aria-labelledby="grok-capabilities-title" aria-busy={status.kind === 'loading'} style={cardStyle}>
      <div style={rowStyle}>
        <h3 className="gk-title" id="grok-capabilities-title" style={titleStyle}>{t('capabilitiesTitle')}</h3>
        <button className="gk-button" type="button" style={buttonStyle} disabled={status.kind === 'loading'} onClick={() => { setReloadKey(key => key + 1) }}>
          {t('capabilitiesRefresh')}
        </button>
      </div>
      <p style={bodyStyle}>{t('capabilitiesIntro')}</p>

      {status.kind === 'loading' ? <p role="status" style={emptyStyle}>{t('capabilitiesLoading')}</p> : null}
      {status.kind === 'error' ? (
        <>
          <p style={errorStyle}>{t('capabilitiesError')}</p>
          {status.detail === '' ? null : <p style={errorStyle}>{status.detail}</p>}
        </>
      ) : null}

      {status.kind === 'ready' ? (
        <>
          <div style={{ ...rowStyle, padding: '12px 16px', borderRadius: 14, background: 'var(--gk-soft, var(--dsw-alias-bg-layer-1, #f5f5f5))' }}>
            <span className="gk-status" style={{ ...badgeStyle, color: status.data.videoEnabled ? STATE_TONE.available : STATE_TONE.unverified }}>
              <span aria-hidden="true" style={dotStyle} />
              {status.data.videoEnabled ? t('videoOn') : t('videoOff')}
            </span>
            <span style={hintStyle}>{t('videoRestartHint')}</span>
          </div>

          <ul style={{ ...listStyle, gap: 0, border: '1px solid var(--gk-line, var(--dsw-alias-border-l2, #e5e5e5))', borderRadius: 14, overflow: 'hidden' }}>
            {status.data.features.map((feature, index) => (
              <li key={feature.id} style={{ ...itemStyle, ...(index > 0 ? { borderTop: '1px solid var(--gk-line, var(--dsw-alias-border-l2, #e5e5e5))' } : {}) }}>
                <div style={rowStyle}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--gk-text, var(--dsw-alias-label-primary, #171717))' }}>{featureLabel(t, feature.id)}</span>
                  <span className="gk-status" style={{ ...badgeStyle, color: STATE_TONE[feature.state] }}><span aria-hidden="true" style={dotStyle} />{featureStateLabel(t, feature.state)}</span>
                </div>
                {feature.checkedAt === undefined && feature.model === undefined && feature.httpStatus === undefined ? null : <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontFamily: 'Bahnschrift, Consolas, monospace', fontVariantNumeric: 'tabular-nums' }}>
                  {feature.checkedAt === undefined ? null : <span style={labelStyle}>{`${t('capabilityCheckedAt')}: ${feature.checkedAt}`}</span>}
                  {feature.model === undefined ? null : <span style={labelStyle}>{`${t('capabilityModel')}: ${feature.model}`}</span>}
                  {feature.httpStatus === undefined ? null : <span style={labelStyle}>{`${t('capabilityHttp')}: ${String(feature.httpStatus)}`}</span>}
                </div>}
                {feature.message === undefined ? null : <p style={{ ...bodyStyle, fontSize: 13, margin: 0, overflowWrap: 'anywhere' }}>{feature.message}</p>}
              </li>
            ))}
          </ul>

          {/* Task history is account-scoped: never mounted for a signed-out
              viewer, and dropped together with this subtree on any account
              change (the settings page remounts us with a new key). */}
          {signedIn ? <VideoTasksView t={t} videoEnabled={status.data.videoEnabled} /> : null}
        </>
      ) : null}
    </section>
  )
}
