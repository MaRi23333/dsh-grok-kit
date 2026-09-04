import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { XaiOAuthSession } from '../src/session.ts'
import type { XaiOAuthCredentialStore } from '../src/store.ts'
import { restoreEnv } from './restore-env.ts'

const FUTURE = Date.now() + 3_600_000

function oauthCredential() {
  return { type: 'oauth' as const, access: 'access-token', refresh: 'refresh-token', expires: FUTURE }
}

function mockStore(impl: {
  read: () => Promise<unknown>
  exists?: () => boolean
  delete?: () => Promise<void>
}): XaiOAuthCredentialStore {
  return {
    read: impl.read,
    exists: impl.exists ?? (() => true),
    delete: impl.delete ?? (async () => undefined),
    filename: 'unused',
  } as unknown as XaiOAuthCredentialStore
}

/** Serve a minimal OpenAI-shaped /v1/models body without touching the network. */
function stubModelsFetch(): void {
  vi.stubGlobal('fetch', async () => new Response(
    JSON.stringify({ data: [{ id: 'grok-4.6' }, { id: 'grok-imagine-image' }] }),
    { status: 200 },
  ))
}

let realDshHome: string | undefined
let tempHome: string | undefined

/** Keep writeCache out of the real user home during retry tests. */
async function isolateDshHome(): Promise<void> {
  tempHome = await mkdtemp(join(tmpdir(), 'dsh-xai-session-'))
  realDshHome = process.env.DSH_HOME
  process.env.DSH_HOME = tempHome
}

afterEach(async () => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  if (tempHome !== undefined) restoreEnv('DSH_HOME', realDshHome)
  const home = tempHome
  realDshHome = undefined
  tempHome = undefined
  if (home !== undefined) await rm(home, { recursive: true, force: true })
})

describe('XaiOAuthSession.refreshLiveCatalog', () => {
  it('does not reject when credential resolution hits a lock timeout', async () => {
    const store = mockStore({
      read: async () => {
        throw new Error('timed out waiting for lock on C:\\Users\\x\\.grok\\auth.json')
      },
    })
    // Empty retry schedule keeps this unit test free of background timers.
    const session = new XaiOAuthSession(store, undefined, { catalogRetryDelaysMs: [] })
    await expect(session.refreshLiveCatalog()).resolves.toBeUndefined()
    expect(session.catalogError).toMatch(/timed out waiting for lock/)
  })

  it('retries in the background after a failure and recovers to the live catalog', async () => {
    vi.useFakeTimers()
    await isolateDshHome()
    let reads = 0
    const store = mockStore({
      read: async () => {
        reads += 1
        if (reads < 2) throw new Error('atomic-write: timed out waiting for the writer lock at X.lock')
        return oauthCredential()
      },
    })
    const changes: number[] = []
    const session = new XaiOAuthSession(store, () => { changes.push(1) })
    stubModelsFetch()
    await session.refreshLiveCatalog()
    expect(session.catalogSource).toBe('fallback')
    expect(reads).toBe(1)
    await vi.runAllTimersAsync()
    expect(reads).toBe(2)
    expect(session.catalogSource).toBe('live')
    expect(session.catalogError).toBeUndefined()
    // The retry runs detached (void), so its success tail — writeCache + the
    // change notification — settles on real fs IO after the timer queue
    // drains. waitFor bridges that last hop.
    await vi.waitFor(() => expect(changes.length).toBeGreaterThanOrEqual(1))
    session.dispose()
  })

  it('does not schedule a retry when no credential file exists', async () => {
    vi.useFakeTimers()
    const store = mockStore({
      read: async () => {
        throw new Error('atomic-write: timed out waiting for the writer lock at X.lock')
      },
      exists: () => false,
    })
    const session = new XaiOAuthSession(store)
    await session.refreshLiveCatalog()
    await vi.runAllTimersAsync()
    expect(session.catalogSource).toBe('fallback')
    expect(session.catalogError).toMatch(/timed out waiting for the writer lock/)
    session.dispose()
  })

  it('gives up after exhausting the retry schedule', async () => {
    vi.useFakeTimers()
    let reads = 0
    const store = mockStore({
      read: async () => {
        reads += 1
        throw new Error('atomic-write: timed out waiting for the writer lock at X.lock')
      },
    })
    const session = new XaiOAuthSession(store, undefined, { catalogRetryDelaysMs: [10, 20] })
    await session.refreshLiveCatalog()
    await vi.runAllTimersAsync()
    expect(reads).toBe(3)
    expect(session.catalogError).toMatch(/timed out waiting for the writer lock/)
    session.dispose()
  })

  it('dispose cancels a pending background retry', async () => {
    vi.useFakeTimers()
    let reads = 0
    const store = mockStore({
      read: async () => {
        reads += 1
        throw new Error('atomic-write: timed out waiting for the writer lock at X.lock')
      },
    })
    const session = new XaiOAuthSession(store, undefined, { catalogRetryDelaysMs: [60_000] })
    await session.refreshLiveCatalog()
    session.dispose()
    await vi.runAllTimersAsync()
    expect(reads).toBe(1)
  })

  it('does not commit an in-flight listing after logout', async () => {
    await isolateDshHome()
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    vi.stubGlobal('fetch', async (_url: string, init?: { signal?: AbortSignal }) => {
      await gate
      if (init?.signal?.aborted) {
        const error = new Error('aborted')
        error.name = 'AbortError'
        throw error
      }
      return new Response(
        JSON.stringify({ data: [{ id: 'grok-4.6' }] }),
        { status: 200 },
      )
    })
    const session = new XaiOAuthSession(
      mockStore({ read: async () => oauthCredential() }),
      undefined,
      { catalogRetryDelaysMs: [] },
    )
    const pending = session.refreshLiveCatalog()
    await session.logout()
    release()
    await pending
    expect(session.catalogSource).toBe('fallback')
    expect(session.liveModelIds()).toBeUndefined()
  })

  it('does not commit an in-flight listing after dispose', async () => {
    await isolateDshHome()
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    vi.stubGlobal('fetch', async (_url: string, init?: { signal?: AbortSignal }) => {
      await gate
      if (init?.signal?.aborted) {
        const error = new Error('aborted')
        error.name = 'AbortError'
        throw error
      }
      return new Response(
        JSON.stringify({ data: [{ id: 'grok-4.6' }] }),
        { status: 200 },
      )
    })
    const session = new XaiOAuthSession(
      mockStore({ read: async () => oauthCredential() }),
      undefined,
      { catalogRetryDelaysMs: [] },
    )
    const pending = session.refreshLiveCatalog()
    session.dispose()
    release()
    await pending
    expect(session.catalogSource).toBe('fallback')
    expect(session.liveModelIds()).toBeUndefined()
  })

  it('only the latest concurrent refresh may commit when completions finish out of order', async () => {
    await isolateDshHome()
    const gates: Array<() => void> = []
    let started = 0
    vi.stubGlobal('fetch', async (_url: string, init?: { signal?: AbortSignal }) => {
      const index = started
      started += 1
      await new Promise<void>(resolve => { gates[index] = resolve })
      if (init?.signal?.aborted) {
        const error = new Error('aborted')
        error.name = 'AbortError'
        throw error
      }
      const id = index === 0 ? 'grok-old' : 'grok-new'
      return new Response(JSON.stringify({ data: [{ id }] }), { status: 200 })
    })
    const session = new XaiOAuthSession(
      mockStore({ read: async () => oauthCredential() }),
      undefined,
      { catalogRetryDelaysMs: [] },
    )
    const first = session.refreshLiveCatalog()
    await vi.waitFor(() => expect(gates[0]).toBeTypeOf('function'))
    const second = session.refreshLiveCatalog()
    await vi.waitFor(() => expect(gates[1]).toBeTypeOf('function'))
    gates[1]!()
    await second
    expect(session.liveModelIds()).toEqual(['grok-new'])
    expect(session.catalogSource).toBe('live')
    gates[0]!()
    await first
    expect(session.liveModelIds()).toEqual(['grok-new'])
    expect(session.catalogSource).toBe('live')
    session.dispose()
  })
})
