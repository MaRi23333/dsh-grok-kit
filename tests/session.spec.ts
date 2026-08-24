import { describe, expect, it } from 'vitest'
import { XaiOAuthSession } from '../src/session.ts'
import type { XaiOAuthCredentialStore } from '../src/store.ts'

describe('XaiOAuthSession.refreshLiveCatalog', () => {
  it('does not reject when credential resolution hits a lock timeout', async () => {
    const store = {
      read: async () => {
        throw new Error('timed out waiting for lock on C:\\Users\\x\\.grok\\auth.json')
      },
      exists: () => true,
      filename: 'unused',
    } as unknown as XaiOAuthCredentialStore
    const session = new XaiOAuthSession(store)
    await expect(session.refreshLiveCatalog()).resolves.toBeUndefined()
    expect(session.catalogError).toMatch(/timed out waiting for lock/)
  })
})
