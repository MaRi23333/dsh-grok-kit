import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { createXaiOAuthSearchTokenSource } from '../src/index.ts'
import type { XaiOAuthSession } from '../src/session.ts'

interface OAuthCredential {
  type: 'oauth'
  access: string
  refresh: string
  expires: number
}

function fakeSession(options: {
  credential?: OAuthCredential
  auth?: { source?: string; auth: { apiKey?: string } }
  refresh?: (credential: OAuthCredential, signal: AbortSignal) => Promise<OAuthCredential>
}) {
  let current = options.credential
  const getAuth = vi.fn(async () => options.auth)
  const refresh = vi.fn(options.refresh ?? (async (credential: OAuthCredential) => credential))
  const modify = vi.fn(async (_providerId: string, fn: (credential: OAuthCredential | undefined) => Promise<OAuthCredential | undefined>) => {
    const candidate = await fn(current)
    if (candidate !== undefined) current = candidate
    return current
  })
  const session = {
    store: {
      // available() is a cheap existence check; this spec file exists.
      filename: fileURLToPath(import.meta.url),
      exists: vi.fn(() => true),
      read: vi.fn(async () => current),
      modify,
    },
    models: {
      getAuth,
      getProvider: vi.fn(() => options.refresh === undefined ? { auth: {} } : { auth: { oauth: { refresh } } }),
    },
  } as unknown as XaiOAuthSession
  return { session, getAuth, refresh, modify, current: () => current }
}

describe('createXaiOAuthSearchTokenSource', () => {
  it('does not let ambient XAI_API_KEY become a fallback when OAuth is absent', async () => {
    const { session, getAuth } = fakeSession({
      auth: { source: 'XAI_API_KEY', auth: { apiKey: 'paid-key' } },
    })
    const source = createXaiOAuthSearchTokenSource(session)

    expect(source.available()).toBe(true)
    await expect(source.resolve()).resolves.toBeUndefined()
    expect(getAuth).not.toHaveBeenCalled()
  })

  it('accepts only an OAuth-authenticated bearer', async () => {
    const credential: OAuthCredential = {
      type: 'oauth', access: 'oauth-token', refresh: 'refresh-token', expires: Date.now() + 60_000,
    }
    const oauth = fakeSession({ credential, auth: { source: 'OAuth', auth: { apiKey: 'oauth-token' } } })
    await expect(createXaiOAuthSearchTokenSource(oauth.session).resolve()).resolves.toBe('oauth-token')

    const wrongSource = fakeSession({ credential, auth: { source: 'XAI_API_KEY', auth: { apiKey: 'paid-key' } } })
    await expect(createXaiOAuthSearchTokenSource(wrongSource.session).resolve()).resolves.toBeUndefined()
  })

  it('rotates an OAuth token under the credential-store modify lock', async () => {
    const credential: OAuthCredential = { type: 'oauth', access: 'old', refresh: 'refresh-old', expires: 1 }
    const fixture = fakeSession({
      credential,
      refresh: async current => ({ ...current, access: 'new', refresh: 'refresh-new', expires: Date.now() + 60_000 }),
    })
    const source = createXaiOAuthSearchTokenSource(fixture.session)

    await expect(source.refresh?.('old')).resolves.toBe('new')
    expect(fixture.refresh).toHaveBeenCalledOnce()
    expect(fixture.modify).toHaveBeenCalledOnce()
    expect(fixture.current()?.refresh).toBe('refresh-new')
  })

  it('reuses a bearer already rotated by another process instead of refreshing twice', async () => {
    const credential: OAuthCredential = {
      type: 'oauth', access: 'already-new', refresh: 'refresh-new', expires: Date.now() + 60_000,
    }
    const fixture = fakeSession({
      credential,
      refresh: async current => ({ ...current, access: 'should-not-run' }),
    })
    const source = createXaiOAuthSearchTokenSource(fixture.session)

    await expect(source.refresh?.('rejected-old')).resolves.toBe('already-new')
    expect(fixture.refresh).not.toHaveBeenCalled()
    expect(fixture.current()?.access).toBe('already-new')
  })

  it('coalesces concurrent refresh of the same rejected bearer', async () => {
    let resolveRefresh!: (value: OAuthCredential) => void
    const hang = new Promise<OAuthCredential>(resolve => {
      resolveRefresh = resolve
    })
    const credential: OAuthCredential = { type: 'oauth', access: 'old', refresh: 'r', expires: 1 }
    const fixture = fakeSession({
      credential,
      refresh: async () => hang,
    })
    const source = createXaiOAuthSearchTokenSource(fixture.session)
    const first = source.refresh?.('old')
    const second = source.refresh?.('old')
    resolveRefresh({ type: 'oauth', access: 'new', refresh: 'r2', expires: Date.now() + 60_000 })
    await expect(first).resolves.toBe('new')
    await expect(second).resolves.toBe('new')
    expect(fixture.refresh).toHaveBeenCalledOnce()
  })
})
