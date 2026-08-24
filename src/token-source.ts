/**
 * OAuth-only bearer source for search, chat 401 retry, and Imagine.
 * Refresh runs outside the 2s file lock; compare-and-write is inside it.
 * @module dsh-grok-kit/token-source
 */

import { XAI_PI_PROVIDER } from './ids.ts'
import type { XaiOAuthSession } from './session.ts'

/** OAuth-only token source shared by search, chat 401 retry, and Imagine. */
export interface XaiOAuthTokenSource {
  /** Cheap local availability check. Must not refresh or make network calls. */
  available(): boolean
  /** Resolve a current OAuth bearer. Implementations may refresh an expired token under their existing lock. */
  resolve(signal?: AbortSignal): Promise<string | undefined>
  /** Force-refresh after a server-side 401. Must stay OAuth-only and serialize refresh-token rotation. */
  refresh?(rejectedAccessToken: string, signal?: AbortSignal): Promise<string | undefined>
}

const inFlightRefresh = new Map<string, Promise<string | undefined>>()

/**
 * Build a token source that is OAuth-only by construction, including forced
 * refresh after a server-side 401. In-process refreshes for the same rejected
 * bearer coalesce onto one `oauth.refresh` call.
 */
export function createXaiOAuthSearchTokenSource(session: XaiOAuthSession): XaiOAuthTokenSource {
  return {
    available: () => session.store.exists(),
    async resolve(signal?: AbortSignal): Promise<string | undefined> {
      signal?.throwIfAborted()
      const credential = await session.store.read(XAI_PI_PROVIDER)
      signal?.throwIfAborted()
      if (credential?.type !== 'oauth') return undefined
      const auth = await session.models.getAuth(XAI_PI_PROVIDER)
      signal?.throwIfAborted()
      if (auth?.source !== 'OAuth') return undefined
      const accessToken = auth.auth.apiKey
      return accessToken === undefined || accessToken.length === 0 ? undefined : accessToken
    },
    async refresh(rejectedAccessToken: string, signal?: AbortSignal): Promise<string | undefined> {
      const existing = inFlightRefresh.get(rejectedAccessToken)
      if (existing !== undefined) return existing
      const pending = refreshRejected(session, rejectedAccessToken, signal).finally(() => {
        if (inFlightRefresh.get(rejectedAccessToken) === pending) inFlightRefresh.delete(rejectedAccessToken)
      })
      inFlightRefresh.set(rejectedAccessToken, pending)
      return pending
    },
  }
}

async function refreshRejected(
  session: XaiOAuthSession,
  rejectedAccessToken: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  signal?.throwIfAborted()
  const oauth = session.models.getProvider(XAI_PI_PROVIDER)?.auth.oauth
  if (oauth === undefined) return undefined
  const refreshSignal = signal ?? new AbortController().signal
  const current = await session.store.read(XAI_PI_PROVIDER)
  refreshSignal.throwIfAborted()
  if (current?.type !== 'oauth') return undefined
  if (current.access !== rejectedAccessToken) return current.access
  const rotated = await oauth.refresh(current, refreshSignal)
  refreshSignal.throwIfAborted()
  const credential = await session.store.modify(XAI_PI_PROVIDER, async candidate => {
    refreshSignal.throwIfAborted()
    if (candidate?.type !== 'oauth') return undefined
    if (candidate.access !== rejectedAccessToken) return undefined
    return rotated
  })
  refreshSignal.throwIfAborted()
  if (credential?.type !== 'oauth') return undefined
  return credential.access.length === 0 ? undefined : credential.access
}
