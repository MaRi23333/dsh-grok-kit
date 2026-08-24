import { describe, expect, it } from 'vitest'
import { xaiProvider } from '@earendil-works/pi-ai/providers/xai'
import { preferredXaiOAuthModel } from '../src/adapter.ts'

describe('preferredXaiOAuthModel', () => {
  it('prefers grok-4.6 when the catalog ships it, otherwise grok-4.5', () => {
    expect(preferredXaiOAuthModel()).toBe('grok-4.6')
  })

  it('exposes the xAI catalog on the pi-ai provider, not the harness route id', () => {
    const provider = xaiProvider()
    expect(provider.id).toBe('xai')
    expect(provider.getModels().length).toBeGreaterThan(0)
  })
})

describe('XaiOAuthSession.provider', () => {
  it('registers models under the harness route so the picker can find them', async () => {
    const { createModels } = await import('@earendil-works/pi-ai')
    const { XAI_OAUTH_ROUTE } = await import('../src/ids.ts')
    const { XaiOAuthSession } = await import('../src/session.ts')
    const session = new XaiOAuthSession()
    const provider = session.provider()
    expect(provider.id).toBe(XAI_OAUTH_ROUTE)
    const models = createModels()
    models.setProvider(provider)
    const listed = models.getModels(XAI_OAUTH_ROUTE)
    expect(listed.length).toBeGreaterThan(0)
    expect(listed.every(model => model.provider === XAI_OAUTH_ROUTE)).toBe(true)
  })

  it('caches provider identity across provider() calls until wrapOptions change', async () => {
    const { XaiOAuthSession } = await import('../src/session.ts')
    const session = new XaiOAuthSession()
    const first = session.provider()
    const second = session.provider()
    expect(second).toBe(first)
    session.setWrapOptions({ backendSearch: true, retry401: false })
    expect(session.provider()).not.toBe(first)
  })
})
