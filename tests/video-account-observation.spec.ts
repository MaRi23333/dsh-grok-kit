import { describe, expect, it, vi } from 'vitest'
import type { VideoTaskManagerOptions } from '../src/video-core.ts'
import type { CapabilityTracker } from '../src/capabilities.ts'

const captured = vi.hoisted(() => ({
  identity: 'account-a' as string | undefined,
  options: undefined as VideoTaskManagerOptions | undefined,
  tracker: undefined as CapabilityTracker | undefined,
}))

vi.mock('../src/token-source.ts', async importOriginal => ({
  ...await importOriginal<typeof import('../src/token-source.ts')>(),
  createXaiOAuthSearchTokenSource: () => ({
    identity: async () => captured.identity,
    available: () => false,
    resolve: async () => undefined,
  }),
}))
vi.mock('../src/video-core.ts', async importOriginal => {
  const original = await importOriginal<typeof import('../src/video-core.ts')>()
  return { ...original, VideoTaskManager: class extends original.VideoTaskManager {
    constructor(options: VideoTaskManagerOptions) {
      super(options)
      captured.options = options
    }
  } }
})
vi.mock('../src/capability-routes.ts', async importOriginal => ({
  ...await importOriginal<typeof import('../src/capability-routes.ts')>(),
  registerGrokCapabilityRoutes: (_ctx: unknown, options: { tracker: CapabilityTracker }) => {
    captured.tracker = options.tracker
  },
}))

import { apply } from '../src/index.ts'
import { XaiOAuthSession } from '../src/session.ts'

describe('video capability account isolation in apply()', () => {
  it('discards a late account-A observation after account B becomes active', async () => {
    const load = vi.spyOn(XaiOAuthSession.prototype, 'loadCachedCatalog').mockResolvedValue(undefined)
    const refresh = vi.spyOn(XaiOAuthSession.prototype, 'refreshLiveCatalog').mockResolvedValue(undefined)
    const scoped = {
      tools: { register: vi.fn() },
      systemPrompt: { section: vi.fn() },
      webServer: { register: vi.fn(() => ({})) },
      effect: vi.fn(),
    }
    const ctx = {
      provide: vi.fn(),
      emit: vi.fn(), get: vi.fn(), effect: vi.fn(),
      llm: { listProviders: () => [], registerAdapter: vi.fn() },
      inject: (_deps: unknown, callback: (context: typeof scoped) => void) => callback(scoped),
    }
    try {
      apply(ctx as never, { videoTool: true, mediaRiskAcknowledged: true, imagineTool: false, editTool: false })
      expect(captured.options).toBeDefined()
      const options = captured.options!
      const tracker = captured.tracker!
      await options.identity?.()
      const event = { identity: 'account-a', state: 'available' as const, checkedAt: '2026-10-13T00:00:00Z', model: 'test' }
      options.onCapability?.(event)
      expect(tracker.snapshot(true).features[0].state).toBe('available')
      captured.identity = 'account-b'
      await options.identity?.()
      options.onCapability?.(event)
      expect(tracker.snapshot(true).features[0].state).toBe('unverified')
      options.onCapability?.({ ...event, identity: 'account-b', state: 'restricted' })
      expect(tracker.snapshot(true).features[0].state).toBe('restricted')
    } finally {
      load.mockRestore()
      refresh.mockRestore()
    }
  })
})
