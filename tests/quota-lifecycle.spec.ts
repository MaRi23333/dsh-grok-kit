import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const probe = vi.hoisted(() => ({ cleanups: [] as Array<() => void>, writes: [] as unknown[] }))
vi.mock('react', () => ({
  useState: (initial: unknown) => [initial, (next: unknown) => { probe.writes.push(next) }],
  useEffect: (setup: () => (() => void) | undefined) => { const cleanup = setup(); if (cleanup !== undefined) probe.cleanups.push(cleanup) },
}))
vi.mock('react/jsx-runtime', () => {
  const jsx = (type: unknown, props: Record<string, unknown> | null) => ({ type, props: props ?? {} })
  return { jsx, jsxs: jsx, Fragment: Symbol.for('Fragment') }
})
import { QuotaView } from '../src/client/quota-view.tsx'
const t = (key: string) => key
beforeEach(() => { probe.cleanups = []; probe.writes = [] })
afterEach(() => { for (const cleanup of probe.cleanups) cleanup(); vi.unstubAllGlobals() })

describe('quota view request lifecycle', () => {
  it.each([false, true])('shows account-loading feedback without fetching quota (signedIn=%s)', signedIn => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const tree = QuotaView({ t, signedIn, accountLoading: true }) as unknown as { props: Record<string, unknown> }
    expect(fetch).not.toHaveBeenCalled()
    expect(tree.props['aria-busy']).toBe(true)
    const children = tree.props.children as Array<{ type: unknown; props: Record<string, unknown> }>
    const message = children.find(child => child.props.role === 'status')
    expect(message).toMatchObject({ type: 'p', props: { children: 'loadingAccount' } })
    const header = children[0]!.props.children as Array<{ props: Record<string, unknown> }>
    expect(header[1]!.props.disabled).toBe(true)
  })
  it('does not request upstream-backed quota while signed out', () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    QuotaView({ t, signedIn: false })
    expect(fetch).not.toHaveBeenCalled()
    expect(probe.writes).toContainEqual({ state: 'signed-out' })
  })
  it('aborts an in-flight read on unmount and ignores its late result', async () => {
    let resolve!: (value: Response) => void
    const fetch = vi.fn((_path: string, _init: RequestInit) => new Promise<Response>(done => { resolve = done }))
    vi.stubGlobal('fetch', fetch)
    QuotaView({ t, signedIn: true })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0]?.[0]).toBe('/plugins/dsh-grok-kit/quota')
    expect(fetch.mock.calls[0]?.[1].credentials).toBe('same-origin')
    const signal = fetch.mock.calls[0]?.[1].signal
    expect(signal?.aborted).toBe(false)
    probe.cleanups[0]!()
    expect(signal?.aborted).toBe(true)
    const before = probe.writes.length
    resolve(new Response(JSON.stringify({ state: 'available', usedPercent: 42, remainingPercent: 58, period: 'week', checkedAt: '2026-10-13T06:00:00Z' })))
    await new Promise(done => setTimeout(done, 0))
    expect(probe.writes).toHaveLength(before)
  })
  it('maps HTTP/parse errors to fixed copy instead of echoing the response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('synthetic-token=private', { status: 500 })))
    QuotaView({ t, signedIn: true })
    await vi.waitFor(() => expect(probe.writes).toContainEqual({ state: 'error', reason: 'temporary' }))
    expect(JSON.stringify(probe.writes)).not.toContain('private')
  })
})
