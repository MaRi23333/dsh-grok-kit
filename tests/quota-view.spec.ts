import { describe, expect, it, vi } from 'vitest'

vi.mock('react/jsx-runtime', () => {
  const jsx = (type: unknown, props: Record<string, unknown> | null) => ({ type, props: props ?? {} })
  return { jsx, jsxs: jsx, Fragment: Symbol.for('Fragment') }
})
import { parseQuotaSnapshot, QuotaDetails } from '../src/client/quota-view.tsx'

interface Node { type: unknown; props: Record<string, unknown> }
function nodes(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes)
  if (typeof value !== 'object' || value === null || !('props' in value)) return []
  const node = value as Node
  return [node, ...nodes(node.props.children)]
}
function text(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).join(' ').replace(/\s+/g, ' ').trim()
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (typeof value === 'object' && value !== null && 'props' in value) return text((value as Node).props.children)
  return ''
}
const valid = { state: 'available', usedPercent: 42, remainingPercent: 58, period: 'week', checkedAt: '2026-10-13T06:00:00Z' }
const t = (key: string) => key

describe('account quota presentation', () => {
  it('keeps a whitelist and displays used and remaining without reversing semantics', () => {
    const parsed = parseQuotaSnapshot({ ...valid, access: 'synthetic-secret', rawBody: 'private', plan: 'SuperGrok', prepaidBalanceUsd: 0 })
    expect(parsed).toEqual({ ...valid, checkedAt: '2026-10-13T06:00:00.000Z', plan: 'SuperGrok', prepaidBalanceUsd: 0 })
    const tree = QuotaDetails({ quota: parsed, t })
    expect(text(tree)).toContain('quotaRemaining : 58%')
    expect(text(tree)).toContain('quotaUsed : 42%')
    expect(text(tree)).toContain('0.00 USD')
    expect(nodes(tree).find(node => node.props.role === 'progressbar')?.props['aria-valuenow']).toBe(42)
    expect(text(tree)).not.toContain('synthetic-secret')
  })
  it('renders a verified zero as available usage with a 0% progress bar and 100% remaining', () => {
    const parsed = parseQuotaSnapshot({ ...valid, usedPercent: 0, remainingPercent: 100 })
    const tree = QuotaDetails({ quota: parsed, t })
    expect(text(tree)).toContain('quotaRemaining : 100%')
    expect(text(tree)).toContain('quotaUsed : 0%')
    expect(text(tree)).not.toContain('quotaPartial')
    expect(nodes(tree).find(node => node.props.role === 'progressbar')?.props['aria-valuenow']).toBe(0)
  })
  it('shows partial subscription details without a fabricated progress bar or remaining percentage', () => {
    const parsed = parseQuotaSnapshot({ state: 'partial', period: 'week', checkedAt: valid.checkedAt,
      plan: 'Ultra', prepaidBalanceUsd: 0, unifiedBilling: true, resetAt: '2026-10-19T00:00:00Z',
      access: 'synthetic-secret', usedPercent: 0, remainingPercent: 100 })
    expect(parsed).not.toHaveProperty('usedPercent')
    expect(parsed).not.toHaveProperty('remainingPercent')
    expect(parsed).not.toHaveProperty('access')
    expect(parsed).toHaveProperty('unifiedBilling', true)
    const tree = QuotaDetails({ quota: parsed, t })
    expect(text(tree)).toContain('quotaPartial')
    expect(text(tree)).not.toContain('quotaUnified')
    expect(text(tree)).toContain('Ultra')
    expect(text(tree)).toContain('0.00 USD')
    expect(text(tree)).toContain('quotaResetAt')
    expect(text(tree)).not.toContain('quotaRemaining')
    expect(nodes(tree).some(node => node.props.role === 'progressbar')).toBe(false)
  })
  it('does not infer unified billing from the plan name or a truthy string', () => {
    expect(parseQuotaSnapshot({ ...valid, plan: 'Ultra' })).not.toHaveProperty('unifiedBilling')
    expect(parseQuotaSnapshot({ ...valid, plan: 'Ultra', unifiedBilling: 'true' })).not.toHaveProperty('unifiedBilling')
  })
  it('still validates partial timestamps and period contracts', () => {
    expect(() => parseQuotaSnapshot({ state: 'partial', period: 'daily', checkedAt: valid.checkedAt })).toThrow()
    expect(() => parseQuotaSnapshot({ state: 'partial', period: 'week', checkedAt: 'bad' })).toThrow()
  })
  it('does not invent unreported plan, reset or balance', () => {
    const tree = QuotaDetails({ quota: parseQuotaSnapshot(valid), t })
    expect(text(tree)).not.toContain('quotaPlan')
    expect(text(tree)).not.toContain('quotaBalance')
    expect(text(tree)).not.toContain('quotaResetAt')
  })
  it.each([
    { ...valid, usedPercent: -1 }, { ...valid, usedPercent: 101 }, { ...valid, remainingPercent: NaN },
    { ...valid, remainingPercent: 42 }, { ...valid, checkedAt: 'bad' }, { ...valid, period: 'daily' }, {}, null,
  ])('rejects malformed quota instead of showing a fabricated number', value => {
    expect(() => parseQuotaSnapshot(value)).toThrow('Invalid quota snapshot')
  })
  it.each([
    ['signed-out', undefined, 'quotaSignedOut'], ['unavailable', undefined, 'quotaUnavailable'],
    ['error', 'auth', 'quotaAuthError'], ['error', 'restricted', 'quotaRestricted'], ['error', 'temporary', 'quotaError'],
  ])('renders fixed actionable copy for %s/%s', (state, reason, expected) => {
    const tree = QuotaDetails({ quota: parseQuotaSnapshot({ state, reason, message: 'https://example.invalid/?token=synthetic-secret' }), t })
    expect(text(tree)).toBe(expected)
  })
  it('only accepts finite nonnegative balances and valid dates', () => {
    expect(parseQuotaSnapshot({ ...valid, prepaidBalanceUsd: -2, resetAt: 'not-date' })).toEqual({ ...valid, checkedAt: '2026-10-13T06:00:00.000Z' })
  })
})
