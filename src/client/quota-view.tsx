/** Account-only subscription quota. No credentials or upstream URLs enter the browser. */
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { XaiOAuthSettingsKey } from './locales.ts'
import type { PartialQuotaSnapshot, QuotaSnapshot } from '../quota.ts'

const QUOTA_PATH = '/plugins/dsh-grok-kit/quota'
type Translate = (key: XaiOAuthSettingsKey, params?: Record<string, unknown>) => string

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function timestamp(value: unknown): string | undefined {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : undefined
}

/** Whitelist the public contract, never render arbitrary error text or response fields. */
export function parseQuotaSnapshot(value: unknown): QuotaSnapshot {
  if (!record(value)) throw new Error('Invalid quota snapshot')
  if (value.state === 'signed-out' || value.state === 'unavailable' || value.state === 'error') {
    const reason = value.reason
    return {
      state: value.state,
      ...(reason === 'auth' || reason === 'restricted' || reason === 'temporary' || reason === 'invalid' ? { reason } : {}),
    }
  }
  const checkedAt = timestamp(value.checkedAt)
  if ((value.state !== 'available' && value.state !== 'partial') || checkedAt === undefined
    || (value.period !== 'week' && value.period !== 'month' && value.period !== 'subscription')) {
    throw new Error('Invalid quota snapshot')
  }
  const resetAt = timestamp(value.resetAt)
  const details: Omit<PartialQuotaSnapshot, 'state'> = {
    period: value.period, checkedAt,
    ...resetAt === undefined ? {} : { resetAt },
    ...typeof value.plan === 'string' && value.plan.trim() !== '' ? { plan: value.plan.slice(0, 100) } : {},
    ...typeof value.prepaidBalanceUsd === 'number' && Number.isFinite(value.prepaidBalanceUsd) && value.prepaidBalanceUsd >= 0
      ? { prepaidBalanceUsd: value.prepaidBalanceUsd } : {},
    ...typeof value.unifiedBilling === 'boolean' ? { unifiedBilling: value.unifiedBilling } : {},
  }
  if (value.state === 'partial') return { ...details, state: 'partial' }
  const used = value.usedPercent
  const remaining = value.remainingPercent
  if (typeof used !== 'number' || !Number.isFinite(used) || used < 0 || used > 100
    || typeof remaining !== 'number' || !Number.isFinite(remaining) || remaining < 0 || remaining > 100
    || Math.abs(used + remaining - 100) > 0.001) throw new Error('Invalid quota snapshot')
  return { ...details, state: 'available', usedPercent: used, remainingPercent: remaining }
}

const card: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 18, padding: '22px', border: '1px solid var(--gk-line, var(--dsw-alias-border-l2, #e5e5e5))', borderRadius: 20, background: 'var(--gk-surface, var(--dsw-alias-bg-module-platform, #fff))' }
const body: CSSProperties = { margin: 0, fontSize: 13, lineHeight: '21px', color: 'var(--gk-muted, var(--dsw-alias-label-secondary, #666))' }
const button: CSSProperties = { minHeight: 34, padding: '6px 14px', border: '1px solid var(--gk-line, var(--dsw-alias-border-l2, #e5e5e5))', borderRadius: 999, background: 'var(--gk-surface, var(--dsw-alias-bg-layer-1, #fff))', color: 'var(--gk-text, var(--dsw-alias-label-primary, #171717))', font: 'inherit', fontSize: 12, cursor: 'pointer' }
const row: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }
const numeric: CSSProperties = { fontFamily: 'Bahnschrift, Consolas, monospace', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }
const screenReader: CSSProperties = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap', border: 0 }
const detail: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }
const detailValue: CSSProperties = { margin: 0, color: 'var(--gk-text, var(--dsw-alias-label-primary, #171717))', overflowWrap: 'anywhere', fontSize: 13 }

export function QuotaDetails({ quota, t }: { quota: QuotaSnapshot; t: Translate }) {
  if (quota.state !== 'available' && quota.state !== 'partial') {
    const key: XaiOAuthSettingsKey = quota.state === 'signed-out' ? 'quotaSignedOut'
      : quota.reason === 'auth' ? 'quotaAuthError'
        : quota.reason === 'restricted' ? 'quotaRestricted'
          : quota.state === 'error' ? 'quotaError' : 'quotaUnavailable'
    return <p role="status" className="gk-empty" style={{ ...body, padding: '18px 0' }}>{t(key)}</p>
  }
  const percent = (value: number) => `${Number(value.toFixed(1))}%`
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={row}>
        {quota.state === 'available' ? (
          <div>
            <span style={screenReader}>{`${t('quotaRemaining')} : ${percent(quota.remainingPercent)}`}</span>
            <span aria-hidden="true" style={{ ...body, display: 'block', marginBottom: 5 }}>{t('quotaRemaining')}</span>
            <span aria-hidden="true" className="gk-numeric" style={{ ...numeric, display: 'inline-flex', alignItems: 'baseline', gap: 5, fontSize: 44, lineHeight: 1.1, letterSpacing: '-1.5px', color: 'var(--gk-text, var(--dsw-alias-label-primary, #171717))' }}>
              {Number(quota.remainingPercent.toFixed(1))}<small style={{ fontSize: 18, letterSpacing: 0 }}>%</small>
            </span>
          </div>
        ) : <p role="status" style={{ ...body, maxWidth: 520 }}>{t('quotaPartial')}</p>}
        <span className="gk-status" style={{ ...body, fontSize: 12, padding: '5px 10px', borderRadius: 999, background: 'var(--gk-soft, var(--dsw-alias-bg-layer-1, #f5f5f5))' }}>{t(quota.period === 'week' ? 'quotaWeek' : quota.period === 'month' ? 'quotaMonth' : 'quotaSubscription')}</span>
      </div>
      {quota.state === 'available'
        ? <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ ...body, ...numeric, fontSize: 12 }}>{t('quotaUsed')}: {percent(quota.usedPercent)}</p>
            <div role="progressbar" aria-label={t('quotaUsed')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={quota.usedPercent}
              style={{ height: 5, borderRadius: 8, background: 'var(--gk-line, var(--dsw-alias-border-l2, #e5e5e5))', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${quota.usedPercent}%`, borderRadius: 8, background: 'var(--gk-strong, var(--dsw-alias-label-primary, #171717))' }} />
            </div>
          </div>
        : null}
      {quota.unifiedBilling === true ? <p className="gk-hint" style={body}>{t('quotaUnified')}</p> : null}
      <dl style={{ ...body, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: '18px 24px', paddingTop: 16, borderTop: '1px solid var(--gk-line, var(--dsw-alias-border-l2, #e5e5e5))' }}>
        {quota.plan === undefined ? null : <div style={detail}><dt>{t('quotaPlan')}</dt><dd style={detailValue}>{quota.plan}</dd></div>}
        {quota.prepaidBalanceUsd === undefined ? null : <div style={detail}><dt>{t('quotaBalance')}</dt><dd className="gk-numeric" style={{ ...detailValue, ...numeric }}>{quota.prepaidBalanceUsd.toFixed(2)} USD</dd></div>}
        {quota.resetAt === undefined ? null : <div style={detail}><dt>{t('quotaResetAt')}</dt><dd style={{ ...detailValue, ...numeric }}>{new Date(quota.resetAt).toLocaleString()}</dd></div>}
        <div style={detail}><dt>{t('quotaCheckedAt')}</dt><dd style={{ ...detailValue, ...numeric }}>{new Date(quota.checkedAt).toLocaleString()}</dd></div>
      </dl>
    </div>
  )
}

export function QuotaView({ t, signedIn, accountLoading = false }: { t: Translate; signedIn: boolean; accountLoading?: boolean }) {
  const [quota, setQuota] = useState<QuotaSnapshot | undefined>()
  const [loading, setLoading] = useState(signedIn)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    if (!signedIn || accountLoading) { setQuota({ state: 'signed-out' }); setLoading(false); return }
    const abort = new AbortController()
    let live = true
    setQuota(undefined)
    setLoading(true)
    void fetch(QUOTA_PATH, { credentials: 'same-origin', headers: { accept: 'application/json' }, signal: abort.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Quota request failed')
        return parseQuotaSnapshot(await response.json())
      })
      .then(value => { if (live) setQuota(value) })
      .catch(() => { if (live && !abort.signal.aborted) setQuota({ state: 'error', reason: 'temporary' }) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false; abort.abort() }
  }, [signedIn, accountLoading, reload])
  return (
    <section className="gk-panel" aria-label={t('quotaTitle')} aria-busy={accountLoading || loading} style={card}>
      <div style={row}>
        <h3 className="gk-title" style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--gk-text, var(--dsw-alias-label-primary, #171717))' }}>{t('quotaTitle')}</h3>
        <button className="gk-button" type="button" style={button} disabled={!signedIn || accountLoading || loading} onClick={() => setReload(value => value + 1)}>{t('quotaRefresh')}</button>
      </div>
      <p style={body}>{t('quotaIntro')}</p>
      {accountLoading || loading ? <p role="status" style={body}>{t(accountLoading ? 'loadingAccount' : 'quotaLoading')}</p> : <QuotaDetails quota={signedIn ? quota ?? { state: 'unavailable' } : { state: 'signed-out' }} t={t} />}
    </section>
  )
}
