import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SuperGrokQuotaClient } from '../src/quota.ts'
import type { GrokCapabilityRouteOptions } from '../src/capability-routes.ts'
import type { VideoTaskManager, VideoTaskManagerOptions } from '../src/video-core.ts'
import type { VideoFileRouteOptions } from '../src/video-file-route.ts'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { EventEmitter } from 'node:events'
const captured = vi.hoisted(() => ({
  notify: undefined as (() => void) | undefined,
  authChanged: undefined as (() => void) | undefined,
  networkChanged: undefined as (() => void) | undefined,
  quota: undefined as SuperGrokQuotaClient | undefined,
  capabilities: undefined as GrokCapabilityRouteOptions | undefined,
  video: undefined as VideoTaskManager | undefined,
  files: undefined as VideoFileRouteOptions | undefined,
  identity: 'account-a' as string | undefined,
  identityFn: undefined as (() => Promise<string | undefined>) | undefined,
}))
vi.mock('../src/session.ts', async importOriginal => {
  const original = await importOriginal<typeof import('../src/session.ts')>()
  return { ...original, XaiOAuthSession: class extends original.XaiOAuthSession {
    constructor(...args: ConstructorParameters<typeof original.XaiOAuthSession>) { super(...args); captured.notify = args[1] }
  } }
})
vi.mock('../src/token-source.ts', async importOriginal => ({
  ...await importOriginal<typeof import('../src/token-source.ts')>(),
  createXaiOAuthSearchTokenSource: () => ({
    available: () => true,
    identity: async () => captured.identityFn ? captured.identityFn() : captured.identity,
    resolve: async () => 'synthetic-access',
  }),
}))
vi.mock('../src/options.ts', async importOriginal => ({
  ...await importOriginal<typeof import('../src/options.ts')>(), readStoredOptions: () => ({}),
}))
vi.mock('../src/quota-routes.ts', async importOriginal => ({
  ...await importOriginal<typeof import('../src/quota-routes.ts')>(),
  registerGrokQuotaRoute: (_ctx: unknown, quota: SuperGrokQuotaClient) => { captured.quota = quota },
}))
vi.mock('../src/auth-routes.ts', async importOriginal => ({
  ...await importOriginal<typeof import('../src/auth-routes.ts')>(),
  registerXaiOAuthAuthRoutes: (_ctx: unknown, _session: unknown, _config: unknown, onAccountChange?: () => void, onNetworkChange?: () => void) => {
    captured.authChanged = onAccountChange
    captured.networkChanged = onNetworkChange
  },
}))
vi.mock('../src/capability-routes.ts', async importOriginal => ({
  ...await importOriginal<typeof import('../src/capability-routes.ts')>(),
  registerGrokCapabilityRoutes: (_ctx: unknown, options: GrokCapabilityRouteOptions) => { captured.capabilities = options },
}))
vi.mock('../src/video-core.ts', async importOriginal => {
  const original = await importOriginal<typeof import('../src/video-core.ts')>()
  return { ...original, VideoTaskManager: class extends original.VideoTaskManager {
    constructor(options: VideoTaskManagerOptions) { super(options); captured.video = this }
  } }
})
vi.mock('../src/video-file-route.ts', async importOriginal => ({
  ...await importOriginal<typeof import('../src/video-file-route.ts')>(),
  registerGrokVideoFileRoute: (_ctx: unknown, options: VideoFileRouteOptions) => { captured.files = options },
}))
vi.mock('../src/proxy.ts', async importOriginal => {
  const original = await importOriginal<typeof import('../src/proxy.ts')>()
  return { ...original, fetchGrokQuota: vi.fn(original.fetchGrokQuota) }
})
import { fetchGrokQuota } from '../src/proxy.ts'
import { apply } from '../src/index.ts'
import { XaiOAuthSession } from '../src/session.ts'
beforeEach(() => {
  captured.identity = 'account-a'; captured.identityFn = undefined; captured.video = undefined
  vi.mocked(fetchGrokQuota).mockClear()
})
afterEach(async () => { captured.quota?.dispose(); await captured.video?.dispose(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

function fixture(videoTool = false) {
  vi.spyOn(XaiOAuthSession.prototype, 'loadCachedCatalog').mockResolvedValue(undefined)
  vi.spyOn(XaiOAuthSession.prototype, 'refreshLiveCatalog').mockResolvedValue(undefined)
  const fetch = vi.fn(async (input: Parameters<typeof globalThis.fetch>[0]) => new Response(JSON.stringify(
    String(input).includes('/billing?') ? { config: { creditUsagePercent: 42 } } : { subscription_tier_display: 'SuperGrok' },
  )))
  vi.stubGlobal('fetch', fetch)
  const scoped = { tools: { register: vi.fn() }, systemPrompt: { section: vi.fn() }, webServer: { register: vi.fn(() => () => undefined) }, effect: vi.fn() }
  const ctx = {
    provide: vi.fn(),
    emit: vi.fn(), get: vi.fn(), effect: vi.fn(),
    llm: { listProviders: () => [], registerAdapter: vi.fn() },
    inject: (_deps: unknown, callback: (context: typeof scoped) => void) => callback(scoped),
  }
  apply(ctx as never, { imagineTool: false, editTool: false, videoTool, mediaRiskAcknowledged: videoTool })
  return { quota: captured.quota!, capabilities: captured.capabilities!, fetch, ctx }
}

describe('quota account lifecycle integration', () => {
  it('wires the plugin-owned quota fetch rather than relying on the constructor default', async () => {
    const { quota } = fixture()
    expect(await quota.get()).toMatchObject({ state: 'available', usedPercent: 42 })
    expect(fetchGrokQuota).toHaveBeenCalledTimes(2)
  })

  it('invalidates cached quota after saving network settings without an account change', async () => {
    const { quota, fetch } = fixture()
    const first = await quota.get()
    captured.networkChanged!()
    expect(await quota.get()).not.toBe(first)
    expect(fetch).toHaveBeenCalledTimes(4)
  })
  it('preserves quota cache on same-account model selection and catalog notifications', async () => {
    const { quota, fetch, ctx } = fixture()
    const cached = await quota.get()
    expect(cached).toMatchObject({ state: 'available', usedPercent: 42 })
    fetch.mockRejectedValue(new Error('synthetic network failure after caching'))
    captured.notify!()
    captured.notify!()
    expect(ctx.emit).toHaveBeenCalledWith('llm/adapters-updated')
    expect(await quota.get()).toBe(cached)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('invalidates on explicit auth changes even before media is visited', async () => {
    const { quota, fetch } = fixture()
    const cached = await quota.get()
    captured.authChanged!()
    expect(await quota.get()).not.toBe(cached)
    expect(fetch).toHaveBeenCalledTimes(4)
  })

  it('keeps the cached account quota through first media identity initialization', async () => {
    const { quota, capabilities, fetch } = fixture()
    const cached = await quota.get()
    fetch.mockRejectedValue(new Error('synthetic network failure after caching'))
    expect(await capabilities.identity!()).toBe('account-a')
    expect(await capabilities.identity!()).toBe('account-a')
    expect(await quota.get()).toBe(cached)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('still resets quota on a known account change and unknown identity', async () => {
    const { quota, capabilities } = fixture()
    await quota.get()
    await capabilities.identity!()
    const reset = vi.spyOn(quota, 'reset')
    captured.identity = 'account-b'
    await capabilities.identity!()
    expect(reset).toHaveBeenCalledTimes(1)
    captured.identity = undefined
    await capabilities.identity!()
    expect(reset).toHaveBeenCalledTimes(2)
    expect(await quota.get()).toMatchObject({ state: 'unavailable', reason: 'auth' })
  })

  it('discards a stale identity completion instead of resetting the new account quota', async () => {
    const { quota, capabilities, fetch } = fixture()
    expect(await capabilities.identity!()).toBe('account-a')
    const cachedA = await quota.get()
    expect(cachedA).toMatchObject({ state: 'available', usedPercent: 42 })

    let resolveStale!: (value: string | undefined) => void
    let calls = 0
    captured.identityFn = () => {
      calls += 1
      if (calls === 1) return new Promise(resolve => { resolveStale = resolve })
      return Promise.resolve(captured.identity)
    }
    captured.identity = 'account-b'
    const reset = vi.spyOn(quota, 'reset')
    const stale = capabilities.identity!()
    expect(await capabilities.identity!()).toBe('account-b')
    expect(reset).toHaveBeenCalledTimes(1)
    reset.mockClear()
    const cachedB = await quota.get()
    expect(cachedB).not.toBe(cachedA)
    expect(cachedB).toMatchObject({ state: 'available', usedPercent: 42 })

    fetch.mockRejectedValue(new Error('synthetic network failure after caching B'))
    expect(await quota.get()).toBe(cachedB)
    resolveStale('account-a')
    expect(await stale).toBeUndefined()
    expect(reset).not.toHaveBeenCalled()
    expect(await quota.get()).toBe(cachedB)
  })

  it('does not let a superseded video list read the old account partition', async () => {
    const { capabilities } = fixture(true)
    const video = captured.video!
    const readRecords = vi.spyOn(video as unknown as {
      readRecordsFor: (identity: string) => Promise<never[]>
    }, 'readRecordsFor').mockResolvedValue([])
    let resolveStale!: (identity: string) => void
    captured.identityFn = () => new Promise(resolve => { resolveStale = resolve })
    const listing = video.list()
    captured.identityFn = undefined
    captured.identity = 'account-b'
    expect(await capabilities.identity!()).toBe('account-b')
    resolveStale('account-a')
    expect(await listing).toEqual([])
    expect(readRecords).not.toHaveBeenCalled()
  })

  it.each([false, true])('allows concurrent same-account reads when the newer read finishes first: %s', async newerFirst => {
    const { capabilities, quota } = fixture()
    const reset = vi.spyOn(quota, 'reset')
    const completions: Array<(identity: string) => void> = []
    captured.identityFn = () => new Promise(resolve => { completions.push(resolve) })
    const first = capabilities.identity!()
    const second = capabilities.identity!()
    const order = newerFirst ? [1, 0] : [0, 1]
    completions[order[0]!]!('account-a')
    expect(await (newerFirst ? second : first)).toBe('account-a')
    completions[order[1]!]!('account-a')
    expect(await (newerFirst ? first : second)).toBe('account-a')
    expect(reset).not.toHaveBeenCalled()
  })

  it('refuses an identity read started before an auth transition even if the same account signs back in', async () => {
    const { capabilities, quota } = fixture()
    expect(await capabilities.identity!()).toBe('account-a')
    let resolveStale!: (identity: string) => void
    captured.identityFn = () => new Promise(resolve => { resolveStale = resolve })
    const stale = capabilities.identity!()
    captured.authChanged!()
    captured.identityFn = undefined
    expect(await capabilities.identity!()).toBe('account-a')
    const cached = await quota.get()
    const reset = vi.spyOn(quota, 'reset')
    resolveStale('account-a')
    expect(await stale).toBeUndefined()
    expect(reset).not.toHaveBeenCalled()
    expect(await quota.get()).toBe(cached)
  })

  it('refuses a superseded file-route identity before looking up any tasks or files', async () => {
    const { capabilities } = fixture(true)
    const { registerGrokVideoFileRoute } = await vi.importActual<typeof import('../src/video-file-route.ts')>('../src/video-file-route.ts')
    let handler!: (req: IncomingMessage, res: ServerResponse) => Promise<void>
    let dispose!: () => void
    const tasks = vi.fn(async () => [])
    const resolveAttachments = vi.fn()
    const context = {
      effect: (setup: () => () => void) => { dispose = setup() },
      webServer: { register: (route: { handler: typeof handler }) => { handler = route.handler; return () => undefined } },
    }
    registerGrokVideoFileRoute(context as never, { ...captured.files!, tasks, resolveAttachments })
    const response = Object.assign(new EventEmitter(), {
      destroyed: false, headersSent: false, writableEnded: false,
      writeHead: vi.fn(), end: vi.fn(),
    })
    const request = {
      method: 'GET', socket: { remoteAddress: '127.0.0.1' }, headers: { host: 'localhost' },
      url: '/?taskId=a067d873-d64a-4e67-a9d5-d80c3e7a56b3',
    }
    let resolveStale!: (identity: string) => void
    captured.identityFn = () => new Promise(resolve => { resolveStale = resolve })
    try {
      const pending = handler(request as IncomingMessage, response as unknown as ServerResponse)
      captured.identityFn = undefined
      captured.identity = 'account-b'
      expect(await capabilities.identity!()).toBe('account-b')
      resolveStale('account-a')
      await pending
      expect(response.writeHead).toHaveBeenCalledWith(403, expect.any(Object))
      expect(tasks).not.toHaveBeenCalled()
      expect(resolveAttachments).not.toHaveBeenCalled()
    } finally {
      dispose()
    }
  })
})
