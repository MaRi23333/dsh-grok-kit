//
// Part of dsh-grok-kit, Apache-2.0.
//
//

/**
 * Regression tests for the five-page settings section (account / models /
 * search / media / network) and its sticky shared header.
 *
 * Same discipline as tests/video-view.spec.ts: the component runs against a
 * stateful fake react (real useState slots, one effect pass per mount) and the
 * element tree is RECURSIVELY EXPANDED, so a page that never renders cannot
 * pass an assertion vacuously. The two account-scoped panels (QuotaView,
 * CapabilitiesView) are expanded as opaque leaves — they own their own hooks
 * and their own reads, which the sibling specs already cover.
 *
 * Covered here:
 *   1. the sticky header renders the shared title, the account status line and
 *      exactly five page buttons, with `aria-current` on the active one;
 *   2. only the active page is mounted — quota belongs to the account page,
 *      the capability / task panel to the media page, and neither page's reads
 *      happen before it is opened;
 *   3. switching pages issues no request of its own (status / proxy / options
 *      stay at exactly one each);
 *   4. drafts survive a page switch: an unsaved proxy URL and an unsaved option
 *      are still there when the user comes back, with nothing written;
 *   5. save / reset are scoped to the active page's keys and named after it,
 *      and saving one page never drops the other page's unsaved draft;
 *      Media reset also clears the read-only videoModel / videoMaxBytes
 *      overrides while Save still never writes those keys;
 *   6. a non-finite numeric edit is rejected instead of serialising to null,
 *      which would silently delete the stored override;
 *   7. the account key (status + generation) reaches both account-scoped
 *      panels, so an account switch remounts them and drops the old rows;
 *   8. each option field lives on exactly one page;
 *   9. the network page's quota request compatibility mode: off by default and
 *      off for a legacy response, read from the service, saved together with
 *      the proxy URL, kept across a late read or a failed save, and locked
 *      while a save is in flight or before the first read landed.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

const probe = vi.hoisted(() => ({
  calls: [] as string[],
  bodies: [] as unknown[],
  initialStatus: undefined as { status: string; grokImportAvailable?: boolean } | undefined,
  stateWrites: 0,
}))

vi.mock('react', () => {
  // A tiny stateful react: hooks are slots, effects run once per hook slot per
  // mount, and a setState re-renders. Enough to drive one controlled page
  // component without pulling in a renderer.
  let slots: unknown[] = []
  let cursor = 0
  let effectCursor = 0
  let effects: Array<[number, () => void | (() => void)]> = []
  const ranEffects = new Set<number>()
  let cleanups: Array<() => void> = []
  let draw: (() => void) | null = null
  let lastTree: unknown = undefined
  return {
    __harness: {
      reset(): void {
        for (const cleanup of cleanups) cleanup()
        cleanups = []
        slots = []
        cursor = 0
        effectCursor = 0
        effects = []
        ranEffects.clear()
        probe.stateWrites = 0
      },
      mount(component: (props: unknown) => unknown, props: unknown): void {
        draw = () => {
          cursor = 0
          effectCursor = 0
          effects = []
          lastTree = component(props)
          for (const [index, effect] of effects) {
            if (ranEffects.has(index)) continue
            ranEffects.add(index)
            const cleanup = effect()
            if (typeof cleanup === 'function') cleanups.push(cleanup)
          }
        }
        draw()
      },
      tree(): unknown {
        draw?.()
        return lastTree
      },
      unmount(): void {
        draw = null
        for (const cleanup of cleanups) cleanup()
        cleanups = []
      },
    },
    useCallback: (fn: unknown) => fn,
    useEffect: (effect: () => void | (() => void)) => {
      effects.push([effectCursor++, effect])
    },
    useMemo: (fn: () => unknown) => fn(),
    // Real ref semantics: one stable object per hook slot, kept across renders.
    useRef: (initial: unknown) => {
      const index = cursor++
      if (!(index in slots)) slots[index] = { current: initial }
      return slots[index]
    },
    useState: (initial: unknown) => {
      const index = cursor++
      if (index === 0 && !(index in slots) && probe.initialStatus !== undefined
        && typeof initial === 'object' && initial !== null && 'status' in initial) {
        slots[index] = probe.initialStatus
      }
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial
      const set = (next: unknown): void => {
        probe.stateWrites += 1
        slots[index] = typeof next === 'function' ? (next as (previous: unknown) => unknown)(slots[index]) : next
        draw?.()
      }
      return [slots[index], set]
    },
  }
})
vi.mock('react/jsx-runtime', () => {
  const jsx = (type: unknown, props: Record<string, unknown> | null, key?: unknown) => ({ type, props: props ?? {}, key })
  return { jsx, jsxs: jsx, Fragment: Symbol.for('Fragment') }
})

import * as React from 'react'
import { XaiSettings } from '../src/client/XaiSettings.tsx'
import { CapabilitiesView } from '../src/client/capabilities-view.tsx'
import { QuotaView } from '../src/client/quota-view.tsx'
import { en, zh } from '../src/client/locales.ts'

interface FakeElement {
  type: unknown
  props: Record<string, unknown>
  key?: unknown
}

/** Panels with their own hooks and reads: expanded as opaque leaves. */
const LEAF = new Set<unknown>([QuotaView, CapabilitiesView])

const harness = (React as unknown as {
  __harness: { reset(): void; mount(component: (props: unknown) => unknown, props: unknown): void; tree(): unknown; unmount(): void }
}).__harness

const t = (key: keyof typeof en): string => en[key]

const SIGNED_IN = {
  status: 'signed-in',
  models: ['grok-4.6'],
  available: ['grok-4.6', 'grok-3'],
  selected: ['grok-4.6'],
  catalogSource: 'live',
}

function asElement(node: unknown): FakeElement | undefined {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return undefined
  const element = node as FakeElement
  return typeof element.props === 'object' && element.props !== null ? element : undefined
}

/** Recursively expand every component into its final element tree. */
function expand(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(child => expand(child))
  const element = asElement(node)
  if (element === undefined) return node
  if (element.type === typeMarker) return { type: typeMarker, props: { ...element.props, children: [] } }
  if (typeof element.type === 'function') {
    if (LEAF.has(element.type)) return { type: typeMarker, props: { ...element.props, children: [] } }
    return expand((element.type as (props: Record<string, unknown>) => unknown)(element.props))
  }
  return { type: element.type, props: { ...element.props, children: expand(element.props.children) } }
}

const typeMarker = Symbol.for('dsh-grok-kit.tests.leaf')

function texts(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') return out
  if (Array.isArray(node)) {
    for (const child of node) texts(child, out)
    return out
  }
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node))
    return out
  }
  const element = node as FakeElement
  if (element.type === typeMarker) return out
  if (typeof element.type === 'function') {
    // Leaf panels own their own hooks and reads; their spec covers them.
    if (LEAF.has(element.type)) return out
    return texts((element.type as (props: Record<string, unknown>) => unknown)(element.props), out)
  }
  return texts(element.props.children, out)
}

function find(node: unknown, match: (element: FakeElement) => boolean, out: FakeElement[] = []): FakeElement[] {
  if (Array.isArray(node)) {
    for (const child of node) find(child, match, out)
    return out
  }
  const element = asElement(node)
  if (element === undefined) return out
  if (element.type === typeMarker) return out
  if (typeof element.type === 'function') {
    if (LEAF.has(element.type)) return out
    find((element.type as (props: Record<string, unknown>) => unknown)(element.props), match, out)
    return out
  }
  if (match(element)) out.push(element)
  find(element.props.children, match, out)
  return out
}

/** Component elements (QuotaView / CapabilitiesView) before expansion. */
function panels(node: unknown, type: unknown, out: FakeElement[] = []): FakeElement[] {
  if (Array.isArray(node)) {
    for (const child of node) panels(child, type, out)
    return out
  }
  const element = asElement(node)
  if (element === undefined) return out
  if (element.type === type) {
    out.push(element)
    return out
  }
  panels(element.props.children, type, out)
  return out
}

function stubFetch(overrides: Record<string, unknown> = {}): void {
  probe.calls = []
  probe.bodies = []
  const defaults: Record<string, unknown> = {
    '/auth/status': SIGNED_IN,
    '/auth/proxy': { proxyUrl: '' },
    '/auth/options': {
      options: { backendSearch: false, imagineTool: true, videoTool: false },
      stored: {},
      effective: { backendSearch: false, imagineTool: true, videoTool: false },
    },
    '/capabilities': { features: [], quota: { state: 'unavailable', message: '' }, videoEnabled: true },
    '/video/tasks': [],
    '/quota': { state: 'unavailable' },
    '/auth/models': SIGNED_IN,
    '/auth/logout': { status: 'signed-out', grokImportAvailable: true },
  }
  const table = { ...defaults, ...overrides }
  vi.stubGlobal('fetch', vi.fn((path: string, init?: { body?: string }) => {
    probe.calls.push(path)
    if (init?.body !== undefined) probe.bodies.push(JSON.parse(init.body))
    const key = Object.keys(table).find(candidate => path.endsWith(candidate))
    const body = key === undefined ? {} : table[key]
    // The options route answers with the effective values plus the sanitized
    // stored document, so a POST echoes what it accepted and drops a cleared
    // override from `stored` entirely.
    const payload = key === '/auth/options' && init?.body !== undefined
      ? (() => {
          const patch = JSON.parse(init.body) as Record<string, unknown>
          const stored: Record<string, unknown> = { ...(defaults['/auth/options'] as { stored?: object }).stored }
          for (const [option, value] of Object.entries(patch)) if (value !== null) stored[option] = value
          for (const option of Object.keys(patch)) if (patch[option] === null) delete stored[option]
          return { ...(body as object), stored, effective: { ...(body as { effective?: object }).effective, ...stored } }
        })()
      : key === '/auth/proxy' && init?.body !== undefined
        ? (() => {
            // The service answers with the pair it stored: the normalized URL
            // and the compatibility flag. An old service leaves the flag out,
            // which the client reads as "off".
            const patch = JSON.parse(init.body) as { proxyUrl?: unknown; quotaCompatibilityMode?: unknown }
            return {
              proxyUrl: String(patch.proxyUrl ?? '').trim(),
              quotaCompatibilityMode: patch.quotaCompatibilityMode === true,
            }
          })()
        : body
    return Promise.resolve(new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
  }))
}

function mount(status: { status: string; grokImportAvailable?: boolean } = SIGNED_IN): void {
  harness.reset()
  probe.initialStatus = status
  harness.mount(XaiSettings as unknown as (props: unknown) => unknown, { t })
}

const view = (): unknown => expand(now())

/** Re-render and return the raw tree (child components not yet called). */
const now = (): unknown => harness.tree()

function clickPage(label: string): void {
  const button = find(now(), element => element.type === 'button' && (element.props['aria-label'] === label || String(element.props['aria-label'] ?? '').startsWith(`${label} — `)))[0]
  expect(button, `no page button ${label}`).toBeDefined()
  const onClick = button!.props.onClick as (() => void) | undefined
  expect(typeof onClick).toBe('function')
  onClick!()
}

function field(node: unknown, label: string): FakeElement {
  const row = find(node, element => element.type === 'label' && texts(element).includes(label))[0]
  const control = row === undefined
    ? undefined
    : find(row, element => element.type === 'input' || element.type === 'select')[0]
  if (control !== undefined) return control
  const byLabel = find(node, element => element.type === 'input' && element.props['aria-label'] === label)[0]
  expect(byLabel, `no control for ${label}`).toBeDefined()
  return byLabel!
}

function button(node: unknown, text: string): FakeElement {
  const found = find(node, element => element.type === 'button' && String(element.props.children ?? '').startsWith(text))[0]
  expect(found, `no button ${text}`).toBeDefined()
  return found!
}

const fire = (element: FakeElement, event: unknown): void =>
  (element.props.onChange as (value: unknown) => void)(event)

const countOf = (suffix: string): number => probe.calls.filter(call => call.endsWith(suffix)).length

/**
 * Wait until the first proxy read landed: the save button is enabled only
 * then, because before that the effective settings are unknown.
 */
const awaitProxyLoaded = async (): Promise<void> => {
  await vi.waitFor(() => expect(button(now(), en.proxySave).props.disabled).toBe(false))
}

const buttonText = (text: string): string =>
  String(find(now(), element => element.type === 'button' && String(element.props.children ?? '').startsWith(text))[0]?.props.children ?? '')

/**
 * Wait until an in-flight save / reset has settled. The save button is the only
 * busy indicator in the option row, so both operations are observed through it.
 */
const settled = async (): Promise<void> => {
  await vi.waitFor(() => expect(buttonText(en.optionsSave)).toContain(en.optionsSave))
}

afterEach(() => {
  harness.unmount()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  probe.initialStatus = undefined
})

describe('five-page settings section', () => {
  it('exposes the same official OAuth entry for new and legacy subscriptions', () => {
    stubFetch({ '/auth/status': { status: 'signed-out' } })
    mount({ status: 'signed-out' })
    expect(buttonText(en.login)).toContain('X Subscription')
    expect(texts(view())).toContain(en.subscriptionLoginHint)
    const link = find(view(), element => element.type === 'a' && element.props.href === 'https://grok.com/dashboard')[0]
    expect(link?.props.target).toBe('_blank')
    expect(link?.props.rel).toBe('noreferrer')
    expect(countOf('/auth/login')).toBe(0)
  })

  it.each([false, true])('asks before replacing a private account (accepted=%s)', async accepted => {
    stubFetch({ '/auth/login': { url: 'https://auth.x.ai/device' } })
    const confirm = vi.fn(() => accepted)
    const open = vi.fn(() => null)
    vi.stubGlobal('window', { open, confirm })
    mount()
    await new Promise(resolve => setTimeout(resolve, 0))
    const oldKey = panels(now(), QuotaView)[0]?.key
    ;(button(view(), en.loginAgain).props.onClick as () => void)()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(confirm).toHaveBeenCalledOnce()
    expect(confirm).toHaveBeenCalledWith(en.confirmLoginPrivate)
    expect(countOf('/auth/login')).toBe(accepted ? 1 : 0)
    expect(open).toHaveBeenCalledTimes(accepted ? 1 : 0)
    expect(countOf('/auth/logout')).toBe(0)
    if (!accepted) expect(panels(now(), QuotaView)[0]?.key).toBe(oldKey)
  })

  it('keeps the existing shared-credential replacement warning', async () => {
    const shared = { ...SIGNED_IN, sharedGrokAuth: true }
    stubFetch({ '/auth/status': shared })
    const confirm = vi.fn(() => false)
    const open = vi.fn(() => null)
    vi.stubGlobal('window', { open, confirm })
    mount(shared)
    await new Promise(resolve => setTimeout(resolve, 0))
    ;(button(view(), en.loginAgain).props.onClick as () => void)()
    expect(confirm).toHaveBeenCalledWith(en.confirmLoginShared)
    expect(countOf('/auth/login')).toBe(0)
    expect(open).not.toHaveBeenCalled()
  })

  it('displays the nonfatal login error while keeping the stored account panels active', () => {
    const restored = { ...SIGNED_IN, loginError: 'synthetic authorization denied' }
    stubFetch({ '/auth/status': restored })
    mount(restored)
    expect(texts(view())).toContain('synthetic authorization denied')
    expect(panels(now(), QuotaView)[0]?.props.signedIn).toBe(true)
    expect(buttonText(en.loginAgain)).toBe(en.loginAgain)
  })

  it('lets an authenticated user reauthorize without first deleting the shared credential', async () => {
    stubFetch({ '/auth/login': { url: 'https://auth.x.ai/device' } })
    vi.stubGlobal('window', { open: vi.fn(() => null), confirm: vi.fn(() => true) })
    mount()
    await vi.waitFor(() => expect(countOf('/auth/status')).toBe(1))
    const oldKey = panels(now(), QuotaView)[0]?.key
    const action = button(view(), en.loginAgain)
    expect(action.props.disabled).toBe(false)
    ;(action.props.onClick as () => void)()
    await vi.waitFor(() => expect(countOf('/auth/login')).toBe(1))
    expect(countOf('/auth/logout')).toBe(0)
    expect(panels(now(), QuotaView)[0]?.key).not.toBe(oldKey)
  })

  it('renders a sticky header with the shared title, status line and five pages', () => {
    stubFetch()
    mount()
    const tree = view()
    const sticky = find(tree, element => (element.props.style as Record<string, unknown> | undefined)?.position === 'sticky')[0]
    expect(sticky).toBeDefined()
    expect((sticky!.props.style as Record<string, unknown>).top).toBe(0)
    // Match the host Modal surface, not the elevated module/card fill.
    expect((sticky!.props.style as Record<string, unknown>).background).toBe('var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-base))')
    expect((sticky!.props.style as Record<string, unknown>).zIndex).toBe(1)
    expect(texts(sticky!)).toContain(en.title)
    expect(texts(sticky!)).toContain(en.statusLabel)
    expect(find(sticky!, element => element.props.role === 'status').length).toBeGreaterThan(0)

    const nav = find(sticky!, element => element.type === 'nav')[0]
    const buttons = find(nav!, element => element.type === 'button')
    expect(buttons.map(one => one.props['aria-label'])).toEqual([en.navAccount, en.navModels, en.navSearch, en.navMedia, en.navNetwork])
    expect(buttons.map(one => texts(one).join(''))).toEqual([en.navAccount, en.navModels, en.navSearchShort, en.navMediaShort, en.navNetwork])
    expect(buttons.map(one => one.props['aria-current'])).toEqual(['page', undefined, undefined, undefined, undefined])
  })

  it('mounts the quota panel on the account page and the capability panel on the media page', async () => {
    stubFetch()
    mount()
    expect(panels(now(), QuotaView)).toHaveLength(1)
    expect(panels(now(), CapabilitiesView)).toHaveLength(0)
    // The panel owns its own read; this spec only checks that it is mounted.
    expect(countOf('/quota')).toBe(0)
    expect(countOf('/capabilities')).toBe(0)
    expect(countOf('/video/tasks')).toBe(0)

    clickPage(en.navMedia)
    expect(panels(now(), QuotaView)).toHaveLength(0)
    expect(panels(now(), CapabilitiesView)).toHaveLength(1)
    // The panel is an opaque leaf here: its own reads (and its task list) are
    // covered by tests/video-view.spec.ts, this spec owns the mounting rule.

    clickPage(en.navAccount)
    expect(panels(now(), CapabilitiesView)).toHaveLength(0)
    expect(texts(harness.tree()).join(' ')).toContain(en.unofficialNotice)
  })

  it('does not infer automatic search availability from the main search switch when profile configuration can override it', async () => {
    stubFetch({ '/auth/options': {
      effective: { backendSearch: true, nestedSearchTools: true },
      stored: {},
      sources: { backendSearch: 'config', nestedSearchTools: 'config' },
    } })
    mount()
    clickPage(en.navSearch)
    await settled()
    expect(field(now(), en.nestedSearchTools).props.value).toBe('auto')
    expect(texts(now()).join(' ')).toContain(en.nestedDraftAuto)
    expect(texts(now()).join(' ')).not.toContain(en.nestedDraftOff)
  })

  it('issues no request of its own while switching pages', async () => {
    stubFetch()
    mount()
    await vi.waitFor(() => expect(countOf('/auth/options')).toBe(1))
    for (const label of [en.navModels, en.navSearch, en.navNetwork, en.navAccount, en.navSearch, en.navAccount]) clickPage(label)
    expect(countOf('/auth/status')).toBe(1)
    expect(countOf('/auth/proxy')).toBe(1)
    expect(countOf('/auth/options')).toBe(1)
    expect(countOf('/capabilities')).toBe(0)
    expect(probe.bodies).toEqual([])
  })

  it('keeps an unsaved proxy draft across a page switch and writes nothing', async () => {
    stubFetch()
    mount()
    await vi.waitFor(() => expect(countOf('/auth/proxy')).toBe(1))
    clickPage(en.navNetwork)
    fire(field(now(), en.proxyTitle), { target: { value: 'http://127.0.0.1:8080' } })
    clickPage(en.navModels)
    clickPage(en.navNetwork)
    expect(field(now(), en.proxyTitle).props.value as string).toBe('http://127.0.0.1:8080')
    expect(probe.bodies).toEqual([])
  })

  it('keeps an unsaved option draft across a page switch and writes nothing', async () => {
    stubFetch()
    mount()
    await vi.waitFor(() => expect(countOf('/auth/options')).toBe(1))
    clickPage(en.navSearch)
    fire(field(now(), en.searchModel), { target: { value: 'grok-build-9' } })
    clickPage(en.navMedia)
    clickPage(en.navSearch)
    expect(field(now(), en.searchModel).props.value as string).toBe('grok-build-9')
    expect(probe.bodies).toEqual([])
  })

  it('saves only the active page keys, named after that page', async () => {
    stubFetch()
    mount()
    await vi.waitFor(() => expect(countOf('/auth/options')).toBe(1))
    clickPage(en.navSearch)
    fire(field(now(), en.searchModel), { target: { value: 'grok-build-9' } })
    clickPage(en.navMedia)
    fire(field(now(), en.imagineTool), { target: { checked: false } })
    const save = button(now(), en.optionsSave)
    expect(String(save.props.children)).toContain(en.navMedia)
    ;(save.props.onClick as () => void)()
    await vi.waitFor(() => expect(probe.bodies).toHaveLength(1))
    await settled()
    expect(probe.bodies[0]).toEqual({ imagineTool: false, editTool: false })

    clickPage(en.navSearch)
    await settled()
    expect(field(now(), en.searchModel).props.value as string).toBe('grok-build-9')
    expect(button(now(), en.optionsSave).props.disabled as boolean).toBe(false)
  })

  it('resets only the active page keys', async () => {
    stubFetch()
    mount()
    await vi.waitFor(() => expect(countOf('/auth/options')).toBe(1))
    clickPage(en.navMedia)
    const reset = button(now(), en.optionsReset)
    expect(String(reset.props.children)).toContain(en.navMedia)
    ;(reset.props.onClick as () => void)()
    await vi.waitFor(() => expect(probe.bodies).toHaveLength(1))
    await settled()
    expect(probe.bodies[0]).toEqual({
      imagineTool: null, editTool: null, videoTool: null, mediaRiskAcknowledged: false,
      videoModel: null, videoMaxBytes: null,
    })
  })

  it('clears read-only video overrides on Media reset without making them saveable', async () => {
    stubFetch({
      '/auth/options': {
        options: { imagineTool: true, videoTool: false, videoModel: 'grok-imagine-video-1.5', videoMaxBytes: 1_048_576 },
        stored: { videoModel: 'grok-imagine-video-1.5', videoMaxBytes: 1_048_576 },
        effective: { imagineTool: true, videoTool: false, videoModel: 'grok-imagine-video-1.5', videoMaxBytes: 1_048_576 },
      },
    })
    mount()
    await vi.waitFor(() => expect(countOf('/auth/options')).toBe(1))
    clickPage(en.navMedia)
    await vi.waitFor(() => expect(texts(now()).join(' | ')).toContain('1048576'))
    const rendered = texts(now()).join(' | ')
    expect(rendered).toContain(en.videoModelLabel)
    expect(rendered).toContain(en.videoMaxBytesLabel)
    expect(find(now(), element => element.type === 'input' && element.props['aria-label'] === en.videoModelLabel)).toHaveLength(0)
    expect(find(now(), element => element.type === 'input' && element.props['aria-label'] === en.videoMaxBytesLabel)).toHaveLength(0)

    fire(field(now(), en.imagineTool), { target: { checked: false } })
    ;(button(now(), en.optionsSave).props.onClick as () => void)()
    await settled()
    expect(probe.bodies[0]).toEqual({ imagineTool: false, editTool: false })
    expect(probe.bodies[0]).not.toHaveProperty('videoModel')
    expect(probe.bodies[0]).not.toHaveProperty('videoMaxBytes')

    ;(button(now(), en.optionsReset).props.onClick as () => void)()
    await settled()
    expect(probe.bodies[1]).toEqual({
      imagineTool: null, editTool: null, videoTool: null, mediaRiskAcknowledged: false,
      videoModel: null, videoMaxBytes: null,
    })
  })

  it("keeps both pages' drafts when one page is saved, and saves the other later", async () => {
    stubFetch()
    mount()
    await vi.waitFor(() => expect(countOf('/auth/options')).toBe(1))
    clickPage(en.navSearch)
    fire(field(now(), en.searchModel), { target: { value: 'grok-build-9' } })
    clickPage(en.navMedia)
    fire(field(now(), en.imagineTool), { target: { checked: false } })

    ;(button(now(), en.optionsSave).props.onClick as () => void)()
    await settled()
    expect(probe.bodies[0]).toEqual({ imagineTool: false, editTool: false })

    // The media save did not touch the search draft: still unsaved, still there.
    clickPage(en.navSearch)
    await settled()
    expect(field(now(), en.searchModel).props.value as string).toBe('grok-build-9')
    const searchSave = button(now(), en.optionsSave)
    expect(searchSave.props.disabled as boolean).toBe(false)
    ;(searchSave.props.onClick as () => void)()
    await settled()
    expect(probe.bodies[1]).toEqual({ searchModel: 'grok-build-9' })
    expect(button(now(), en.optionsSave).props.disabled as boolean).toBe(true)
  })

  it("keeps the other page's draft when one page is reset", async () => {
    stubFetch()
    mount()
    await vi.waitFor(() => expect(countOf('/auth/options')).toBe(1))
    clickPage(en.navMedia)
    fire(field(now(), en.videoTool), { target: { checked: true } })
    clickPage(en.navSearch)
    fire(field(now(), en.backendSearch), { target: { checked: true } })

    clickPage(en.navMedia)
    ;(button(now(), en.optionsReset).props.onClick as () => void)()
    await settled()
    expect(probe.bodies[0]).toEqual({
      imagineTool: null, editTool: null, videoTool: null, mediaRiskAcknowledged: false,
      videoModel: null, videoMaxBytes: null,
    })

    clickPage(en.navSearch)
    await settled()
    expect(field(now(), en.backendSearch).props.checked as boolean).toBe(true)
    expect(button(now(), en.optionsSave).props.disabled as boolean).toBe(false)
  })

  it('drops a stored override the server no longer reports, so the select falls back to auto', async () => {
    stubFetch()
    mount()
    await vi.waitFor(() => expect(countOf('/auth/options')).toBe(1))
    clickPage(en.navSearch)
    const select = field(now(), en.nestedSearchTools)
    expect(select.props.value as string).toBe('auto')
    fire(select, { target: { value: 'true' } })
    ;(button(now(), en.optionsSave).props.onClick as () => void)()
    await settled()
    expect(probe.bodies[0]).toEqual({ nestedSearchTools: true })
    expect(field(now(), en.nestedSearchTools).props.value as string).toBe('true')

    ;(button(now(), en.optionsReset).props.onClick as () => void)()
    await settled()
    expect(probe.bodies[1]).toEqual({
      backendSearch: null, statefulResponses: null, nestedSearchTools: null,
      searchModel: null, searchMaxResults: null, webSearchTimeoutMs: null, xSearchTimeoutMs: null,
    })
    expect(field(now(), en.nestedSearchTools).props.value as string).toBe('auto')
  })

  it('rejects a non-finite numeric edit instead of clearing the override', async () => {
    stubFetch()
    mount()
    await vi.waitFor(() => expect(countOf('/auth/options')).toBe(1))
    clickPage(en.navSearch)
    fire(field(now(), en.searchMaxResults), { target: { value: '1e999' } })
    clickPage(en.navModels)
    clickPage(en.navSearch)
    // Rejected: nothing became dirty, so the page stays un-saveable and empty.
    expect(field(now(), en.searchMaxResults).props.value as string).toBe('')
    expect(button(now(), en.optionsSave).props.disabled as boolean).toBe(true)
    expect(probe.bodies).toEqual([])
  })

  it('scopes the account key to both account-scoped panels', async () => {
    stubFetch({ '/auth/import': { status: 'signed-in', models: ['grok-4.6'] } })
    mount({ status: 'signed-out', grokImportAvailable: true })
    expect(panels(now(), QuotaView)[0]!.key).toBe('signed-out:0')
    const importButton = find(now(), element => element.type === 'button' && element.props.children === en.importGrok)[0]
    expect(importButton).toBeDefined()
    ;(importButton!.props.onClick as () => void)()
    await vi.waitFor(() => expect(panels(now(), QuotaView)[0]!.key).toBe('signed-in:2'))
    clickPage(en.navMedia)
    expect(panels(now(), CapabilitiesView)[0]!.key).toBe('signed-in:2:0')
  })

  it('hides the outgoing account before sign-out completes, then recovers', async () => {
    stubFetch()
    mount(SIGNED_IN)
    clickPage(en.navMedia)
    expect(panels(now(), CapabilitiesView)[0]!.key).toBe('signed-in:0:0')
    expect(panels(now(), CapabilitiesView)[0]!.props.signedIn).toBe(true)

    clickPage(en.navAccount)
    const logout = find(now(), element => element.type === 'button' && element.props.children === en.logout)[0]
    expect(logout).toBeDefined()
    ;(logout!.props.onClick as () => void)()

    // Still in flight: the account reads as gone, so nothing re-reads it.
    expect(panels(now(), QuotaView)[0]!.key).toMatch(/^loading:/)
    expect(panels(now(), QuotaView)[0]!.props.signedIn).toBe(false)
    expect(panels(now(), QuotaView)[0]!.props.accountLoading).toBe(true)
    clickPage(en.navMedia)
    expect(panels(now(), CapabilitiesView)[0]!.props.signedIn).toBe(false)

    // The account page is the one that owns the quota panel; go back to it.
    clickPage(en.navAccount)
    await vi.waitFor(() => expect(panels(now(), QuotaView)[0]!.key).toMatch(/^signed-out:/))
    expect(texts(now()).join(' ')).toContain(en.signedOut)
  })

  it('ignores a stale initial account read after sign-out commits', async () => {
    stubFetch()
    const originalFetch = globalThis.fetch
    let resolveStatus!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn((path: string, init?: RequestInit) => {
      if (path.endsWith('/auth/status')) {
        return new Promise<Response>(resolve => { resolveStatus = resolve })
      }
      return originalFetch(path, init)
    }))
    mount(SIGNED_IN)
    ;(button(now(), en.logout).props.onClick as () => void)()
    await vi.waitFor(() => expect(panels(now(), QuotaView)[0]!.key).toMatch(/^signed-out:/))
    resolveStatus(new Response(JSON.stringify(SIGNED_IN), { status: 200 }))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(panels(now(), QuotaView)[0]!.props.signedIn).toBe(false)
    expect(panels(now(), QuotaView)[0]!.key).toMatch(/^signed-out:/)
  })

  it('ignores a stale account-read failure after an import commits', async () => {
    stubFetch({ '/auth/import': SIGNED_IN })
    const originalFetch = globalThis.fetch
    let rejectStatus!: (error: Error) => void
    vi.stubGlobal('fetch', vi.fn((path: string, init?: RequestInit) => {
      if (path.endsWith('/auth/status')) {
        return new Promise<Response>((_resolve, reject) => { rejectStatus = reject })
      }
      return originalFetch(path, init)
    }))
    mount({ status: 'signed-out', grokImportAvailable: true })
    ;(button(now(), en.importGrok).props.onClick as () => void)()
    await vi.waitFor(() => expect(panels(now(), QuotaView)[0]!.key).toBe('signed-in:2'))
    rejectStatus(new Error('late status failure'))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(panels(now(), QuotaView)[0]!.props.signedIn).toBe(true)
    expect(panels(now(), QuotaView)[0]!.key).toBe('signed-in:2')
  })

  it('restores the real account state when sign-out fails', async () => {
    stubFetch({ '/auth/logout': { error: 'boom' } })
    vi.stubGlobal('fetch', vi.fn((path: string, init?: { body?: string }) => {
      probe.calls.push(path)
      if (init?.body !== undefined) probe.bodies.push(JSON.parse(init.body))
      if (path.endsWith('/auth/logout')) {
        return Promise.resolve(new Response(JSON.stringify({ error: 'boom' }), { status: 500, headers: { 'content-type': 'application/json' } }))
      }
      const body = path.endsWith('/auth/status') ? SIGNED_IN
        : path.endsWith('/auth/proxy') ? { proxyUrl: '' }
          : path.endsWith('/auth/options') ? { options: {}, stored: {}, effective: {} }
            : {}
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }))
    }))
    mount(SIGNED_IN)
    const logout = find(now(), element => element.type === 'button' && element.props.children === en.logout)[0]
    ;(logout!.props.onClick as () => void)()
    expect(panels(now(), QuotaView)[0]!.key).toMatch(/^loading:/)
    // The refresh put the still-signed-in account back.
    // The generation stays bumped; the refreshed status is the still-signed-in one.
    await vi.waitFor(() => expect(panels(now(), QuotaView)[0]!.key).toBe('signed-in:1'))
    expect(panels(now(), QuotaView)[0]!.props.signedIn).toBe(true)
    expect(countOf('/auth/status')).toBeGreaterThan(1)
  })

  it('serializes auth-status polls so a slow endpoint cannot wedge signing-in', async () => {
    stubFetch()
    const originalFetch = globalThis.fetch
    const intervals: Array<() => void> = []
    vi.stubGlobal('window', {
      open: vi.fn(() => null),
      confirm: vi.fn(() => true),
      setInterval: vi.fn((handler: () => void) => { intervals.push(handler); return intervals.length }),
      clearInterval: vi.fn(),
    })
    // Every /auth/status read hangs until the test resolves it, FIFO.
    const pending: Array<(response: Response) => void> = []
    vi.stubGlobal('fetch', vi.fn((path: string, init?: RequestInit) => {
      if (path.endsWith('/auth/status')) {
        return new Promise<Response>(resolve => { pending.push(resolve) })
      }
      return (originalFetch as (path: string, init?: RequestInit) => Promise<Response>)(path, init)
    }))
    mount({ status: 'signing-in' })
    // The mount read is in flight; a poll tick must not stack a second one.
    // Overlapping reads used to doom every completion (each tick bumped the
    // sequence) and left the UI in signing-in forever.
    expect(pending.length).toBe(1)
    intervals[0]!()
    await new Promise(resolve => { setTimeout(resolve, 0) })
    expect(pending.length).toBe(1)
    // Still signing in: the completing poll keeps the poller alive.
    pending[0]!(new Response(JSON.stringify({ status: 'signing-in' }), { status: 200, headers: { 'content-type': 'application/json' } }))
    await vi.waitFor(() => expect(texts(now()).join(' ')).toContain(en.signingIn))
    // A macro-task boundary lets the completed read settle fully (in-flight
    // flag cleared) before the next tick is allowed to poll again.
    await new Promise(resolve => { setTimeout(resolve, 0) })
    // Only with no read in flight does the next tick issue a fresh poll.
    intervals[0]!()
    await new Promise(resolve => { setTimeout(resolve, 0) })
    expect(pending.length).toBe(2)
    // Authorization completed while polling was serialized: it lands this time.
    pending[1]!(new Response(JSON.stringify(SIGNED_IN), { status: 200, headers: { 'content-type': 'application/json' } }))
    await vi.waitFor(() => expect(texts(now()).join(' ')).toContain(en.signedIn))
  })

  it.each(['fetch', 'body'] as const)('recovers from a stalled auth-status %s without losing the login challenge', async phase => {
    vi.useFakeTimers()
    stubFetch()
    const originalFetch = globalThis.fetch
    const intervals: Array<() => void> = []
    vi.stubGlobal('window', {
      setInterval: vi.fn((handler: () => void) => { intervals.push(handler); return intervals.length }),
      clearInterval: vi.fn(),
    })
    const signals: Array<AbortSignal | null | undefined> = []
    let finishLate!: () => void
    vi.stubGlobal('fetch', vi.fn((path: string, init?: RequestInit) => {
      if (!path.endsWith('/auth/status')) return originalFetch(path, init)
      signals.push(init?.signal)
      if (signals.length > 1) return Promise.resolve(new Response(JSON.stringify(SIGNED_IN)))
      // Deliberately ignore abort: the deadline must cover both fetch and JSON
      // decoding, and a late old result must not overwrite a newer poll.
      if (phase === 'fetch') return new Promise<Response>(resolve => {
        finishLate = () => resolve(new Response(JSON.stringify({ status: 'signed-out' })))
      })
      return Promise.resolve({ ok: true, json: () => new Promise(resolve => {
        finishLate = () => resolve({ status: 'signed-out' })
      }) } as Response)
    }))
    mount({ status: 'signing-in', url: 'https://example.invalid/device', userCode: 'TEST-CODE' } as { status: string })
    await vi.advanceTimersByTimeAsync(0)
    intervals[0]!()
    expect(signals).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(signals[0]?.aborted).toBe(true)
    expect(texts(now()).join(' ')).toContain('TEST-CODE')
    expect(texts(now()).join(' ')).toContain(en.signingIn)
    intervals[0]!()
    await vi.advanceTimersByTimeAsync(0)
    expect(signals).toHaveLength(2)
    expect(texts(now()).join(' ')).toContain(en.signedIn)
    finishLate()
    await vi.advanceTimersByTimeAsync(0)
    expect(texts(now()).join(' ')).toContain(en.signedIn)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('aborts a stalled status read on unmount and ignores its late failure', async () => {
    vi.useFakeTimers()
    stubFetch()
    const originalFetch = globalThis.fetch
    let signal: AbortSignal | null | undefined
    let rejectLate!: (error: Error) => void
    vi.stubGlobal('fetch', vi.fn((path: string, init?: RequestInit) => {
      if (!path.endsWith('/auth/status')) return originalFetch(path, init)
      signal = init?.signal
      return new Promise<Response>((_resolve, reject) => { rejectLate = reject })
    }))
    mount()
    await vi.advanceTimersByTimeAsync(0)
    harness.unmount()
    const writes = probe.stateWrites
    expect(signal?.aborted).toBe(true)
    rejectLate(new Error('late status failure'))
    await vi.advanceTimersByTimeAsync(10_000)
    expect(probe.stateWrites).toBe(writes)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels an obsolete read when login starts and ignores its late result', async () => {
    vi.useFakeTimers()
    stubFetch({ '/auth/login': { url: 'https://example.invalid/device', userCode: 'NEW-CODE' } })
    const originalFetch = globalThis.fetch
    vi.stubGlobal('window', {
      open: vi.fn(() => null),
      confirm: vi.fn(() => true),
      setInterval: vi.fn(),
      clearInterval: vi.fn(),
    })
    const signals: Array<AbortSignal | null | undefined> = []
    const pending: Array<(response: Response) => void> = []
    vi.stubGlobal('fetch', vi.fn((path: string, init?: RequestInit) => {
      if (!path.endsWith('/auth/status')) return originalFetch(path, init)
      signals.push(init?.signal)
      return new Promise<Response>(resolve => { pending.push(resolve) })
    }))
    mount({ status: 'signed-out' })
    ;(button(now(), en.login).props.onClick as () => void)()
    expect(signals[0]?.aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(texts(now()).join(' ')).toContain('NEW-CODE')
    pending[0]!(new Response(JSON.stringify({ status: 'signed-out' })))
    await vi.advanceTimersByTimeAsync(0)
    expect(texts(now()).join(' ')).toContain(en.signingIn)
    expect(texts(now()).join(' ')).toContain('NEW-CODE')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('gives every option field exactly one page', () => {
    stubFetch()
    mount()
    const pages: Array<[string, string[]]> = [
      [en.navAccount, []],
      [en.navModels, []],
      [en.navSearch, [en.backendSearch, en.statefulResponses, en.nestedSearchTools, en.searchModel, en.searchMaxResults, en.webSearchTimeoutMs, en.xSearchTimeoutMs]],
      [en.navMedia, [en.imagineTool, en.videoTool]],
      [en.navNetwork, []],
    ]
    const owners = new Map<string, string>()
    for (const [page, labels] of pages) {
      clickPage(page)
      const rendered = texts(now()).join(' | ')
      for (const label of labels) {
        expect(rendered, `${label} missing on ${page}`).toContain(label)
        expect(owners.has(label), `${label} is also owned by ${String(owners.get(label))}`).toBe(false)
        owners.set(label, page)
      }
    }
    for (const [page] of pages) {
      clickPage(page)
      const rendered = texts(now()).join(' | ')
      for (const [other, labels] of pages) {
        if (other === page) continue
        for (const label of labels) expect(rendered.includes(label), `${label} leaked onto ${page}`).toBe(false)
      }
    }
    expect(owners.size).toBe(9)
  })

  it('marks each unsaved page in navigation and clears only the saved page', async () => {
    stubFetch()
    mount()
    await new Promise(resolve => setTimeout(resolve, 0))
    const navLabel = (label: string) => find(now(), element => element.type === 'button' && String(element.props['aria-label'] ?? '').startsWith(label))[0]!.props['aria-label']
    clickPage(en.navSearch)
    fire(field(now(), en.searchModel), { target: { value: 'draft-model' } })
    clickPage(en.navMedia)
    fire(field(now(), en.videoTool), { target: { checked: true } })
    ;(button(now(), en.mediaConfirmYes).props.onClick as () => void)()
    expect(navLabel(en.navSearch)).toContain(en.unsavedChanges)
    expect(navLabel(en.navMedia)).toContain(en.unsavedChanges)
    expect(texts(view())).toContain(en.unsavedChangesHint)
    ;(button(now(), en.optionsSave).props.onClick as () => void)()
    await settled()
    expect(navLabel(en.navMedia)).toBe(en.navMedia)
    expect(navLabel(en.navSearch)).toContain(en.unsavedChanges)
    expect(find(now(), node => node.props.role === 'status' && texts(node).includes(en.optionsSaved))).toHaveLength(1)
  })

  it('keeps the network marker until a successful normalized proxy save', async () => {
    stubFetch()
    mount()
    await new Promise(resolve => setTimeout(resolve, 0))
    clickPage(en.navNetwork)
    fire(field(now(), en.proxyTitle), { target: { value: ' http://127.0.0.1:8080 ' } })
    expect(texts(view())).toContain(en.unsavedChangesHint)
    clickPage(en.navSearch)
    expect(find(now(), node => node.type === 'button' && node.props['aria-label'] === `${en.navNetwork} — ${en.unsavedChanges}`)).toHaveLength(1)
    clickPage(en.navNetwork)
    ;(button(now(), en.proxySave).props.onClick as () => void)()
    await vi.waitFor(() => expect(texts(view())).toContain(en.proxySaved))
    expect(field(now(), en.proxyTitle).props.value).toBe('http://127.0.0.1:8080')
    expect(find(now(), node => node.type === 'button' && node.props['aria-label'] === en.navNetwork)).toHaveLength(1)
    expect(texts(view())).not.toContain(en.unsavedChangesHint)
  })

  it('keeps proxy edits when the initial read arrives late', async () => {
    stubFetch()
    const originalFetch = globalThis.fetch
    let finish!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => url.endsWith('/auth/proxy') && init?.method !== 'POST'
      ? new Promise<Response>(resolve => { finish = resolve }) : originalFetch(url, init)))
    mount()
    clickPage(en.navNetwork)
    fire(field(now(), en.proxyTitle), { target: { value: 'http://127.0.0.1:8080' } })
    finish(new Response(JSON.stringify({ proxyUrl: 'http://127.0.0.1:9090' })))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(field(now(), en.proxyTitle).props.value).toBe('http://127.0.0.1:8080')
    expect(probe.bodies).toEqual([])
    fire(field(now(), en.proxyTitle), { target: { value: 'http://127.0.0.1:9090' } })
    expect(find(now(), node => node.type === 'button' && node.props['aria-label'] === en.navNetwork)).toHaveLength(1)
  })

  it('does not restore an old proxy baseline after a newer save commits', async () => {
    stubFetch()
    const originalFetch = globalThis.fetch
    let finish!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => url.endsWith('/auth/proxy') && init?.method !== 'POST'
      ? new Promise<Response>(resolve => { finish = resolve }) : originalFetch(url, init)))
    mount()
    clickPage(en.navNetwork)
    fire(field(now(), en.proxyTitle), { target: { value: 'http://127.0.0.1:8080' } })
    ;(button(now(), en.proxySave).props.onClick as () => void)()
    await vi.waitFor(() => expect(texts(view())).toContain(en.proxySaved))
    finish(new Response(JSON.stringify({ proxyUrl: 'http://127.0.0.1:9090' })))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(field(now(), en.proxyTitle).props.value).toBe('http://127.0.0.1:8080')
    expect(find(now(), node => node.type === 'button' && node.props['aria-label'] === en.navNetwork)).toHaveLength(1)
  })

  it.each(['save', 'reset'] as const)('does not roll committed options back when initial loading completes after %s', async action => {
    stubFetch()
    const originalFetch = globalThis.fetch
    let finish!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => url.endsWith('/auth/options') && init?.method !== 'POST'
      ? new Promise<Response>(resolve => { finish = resolve }) : originalFetch(url, init)))
    mount()
    clickPage(en.navSearch)
    fire(field(now(), en.searchModel), { target: { value: 'saved-model' } })
    ;(button(now(), action === 'save' ? en.optionsSave : en.optionsReset).props.onClick as () => void)()
    await settled()
    finish(new Response(JSON.stringify({ effective: { searchModel: 'stale-model', nestedSearchTools: true }, stored: { searchModel: 'stale-model', nestedSearchTools: true } })))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(field(now(), en.searchModel).props.value).toBe(action === 'save' ? 'saved-model' : '')
    if (action === 'reset') expect(field(now(), en.nestedSearchTools).props.value).toBe('auto')
    expect(button(now(), en.optionsSave).props.disabled).toBe(true)
  })

  it.each([en.navSearch, en.navMedia])('keeps experimental badges beside their switches on %s', async page => {
    stubFetch()
    mount()
    clickPage(page)
    await settled()
    const tree = now()
    const badges = find(tree, node => node.type === 'span' && texts(node).join('') === en.experimentalTag)
    expect(badges).toHaveLength(2)
    for (const badge of badges) {
      const parents = find(tree, node => {
        const children = node.props.children
        return (Array.isArray(children) ? children : [children]).includes(badge)
      })
      expect(parents).toHaveLength(1)
      expect(parents[0]?.type).toBe('span')
      expect(badge.props.className).toBe('gk-tag')
      const labels = find(tree, node => node.type === 'label' && find(node, child => child === badge).length === 1)
      expect(labels).toHaveLength(1)
      expect(find(labels[0], node => node.type === 'input' && node.props.type === 'checkbox')).toHaveLength(1)
    }
  })

  it('announces a failed save without dropping the draft or its marker', async () => {
    stubFetch()
    const originalFetch = globalThis.fetch
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => url.endsWith('/auth/options') && init?.method === 'POST'
      ? Promise.resolve(new Response('{}', { status: 500 })) : originalFetch(url, init)))
    mount()
    await new Promise(resolve => setTimeout(resolve, 0))
    clickPage(en.navSearch)
    fire(field(now(), en.searchModel), { target: { value: 'keep-me' } })
    ;(button(now(), en.optionsSave).props.onClick as () => void)()
    await vi.waitFor(() => expect(find(now(), node => node.props.role === 'alert' && texts(node).includes(en.optionsError))).toHaveLength(1))
    expect(field(now(), en.searchModel).props.value).toBe('keep-me')
    expect(button(now(), en.optionsSave).props.disabled).toBe(false)
    expect(find(now(), node => node.type === 'button' && node.props['aria-label'] === `${en.navSearch} — ${en.unsavedChanges}`)).toHaveLength(1)
  })

  /* ---- quota request compatibility mode (network page) ---- */

  it('keeps the quota compatibility mode off when the service reports no flag', async () => {
    // A legacy service answers without the field at all.
    stubFetch({ '/auth/proxy': { proxyUrl: '' } })
    mount()
    clickPage(en.navNetwork)
    await awaitProxyLoaded()
    expect(field(now(), en.quotaCompatibilityMode).props.checked).toBe(false)
    // The read succeeded, so the pair may be saved.
    expect(button(now(), en.proxySave).props.disabled).toBe(false)
  })

  it('reads the quota compatibility mode the service reports', async () => {
    stubFetch({ '/auth/proxy': { proxyUrl: 'http://127.0.0.1:8080', quotaCompatibilityMode: true } })
    mount()
    clickPage(en.navNetwork)
    await awaitProxyLoaded()
    expect(field(now(), en.quotaCompatibilityMode).props.checked).toBe(true)
    expect(field(now(), en.proxyTitle).props.value).toBe('http://127.0.0.1:8080')
  })

  it('does not read a truthy non-boolean flag as "on"', async () => {
    stubFetch({ '/auth/proxy': { proxyUrl: '', quotaCompatibilityMode: 'true' } })
    mount()
    clickPage(en.navNetwork)
    await awaitProxyLoaded()
    expect(field(now(), en.quotaCompatibilityMode).props.checked).toBe(false)
  })

  it('marks the network page dirty when only the compatibility mode changes', async () => {
    stubFetch()
    mount()
    clickPage(en.navNetwork)
    await awaitProxyLoaded()
    fire(field(now(), en.quotaCompatibilityMode), { target: { checked: true } })
    expect(texts(view())).toContain(en.unsavedChangesHint)
    // The hint names the switch, not only the URL.
    expect(texts(view())).toContain(en.quotaCompatibilityUnsaved)
    expect(find(now(), node => node.type === 'button' && node.props['aria-label'] === `${en.navNetwork} — ${en.unsavedChanges}`)).toHaveLength(1)
    expect(probe.bodies).toEqual([])
  })

  it('saves the proxy URL and the compatibility mode in one request', async () => {
    stubFetch()
    mount()
    clickPage(en.navNetwork)
    await awaitProxyLoaded()
    fire(field(now(), en.proxyTitle), { target: { value: 'http://127.0.0.1:8080' } })
    fire(field(now(), en.quotaCompatibilityMode), { target: { checked: true } })
    ;(button(now(), en.proxySave).props.onClick as () => void)()
    await vi.waitFor(() => expect(probe.bodies).toHaveLength(1))
    expect(probe.bodies[0]).toEqual({ proxyUrl: 'http://127.0.0.1:8080', quotaCompatibilityMode: true })
    await vi.waitFor(() => expect(texts(view())).toContain(en.proxySaved))
    // The saved pair is the new baseline: nothing is left unsaved.
    expect(texts(view())).not.toContain(en.unsavedChangesHint)
    expect(find(now(), node => node.type === 'button' && node.props['aria-label'] === en.navNetwork)).toHaveLength(1)
    expect(field(now(), en.quotaCompatibilityMode).props.checked).toBe(true)
  })

  it('keeps the compatibility mode draft and the unsaved marker when the save fails', async () => {
    stubFetch()
    const originalFetch = globalThis.fetch
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => url.endsWith('/auth/proxy') && init?.method === 'POST'
      ? Promise.resolve(new Response('{}', { status: 500 })) : originalFetch(url, init)))
    mount()
    clickPage(en.navNetwork)
    await awaitProxyLoaded()
    fire(field(now(), en.quotaCompatibilityMode), { target: { checked: true } })
    ;(button(now(), en.proxySave).props.onClick as () => void)()
    await vi.waitFor(() => expect(find(now(), node => node.props.role === 'alert' && texts(node).includes(en.proxyError))).toHaveLength(1))
    expect(field(now(), en.quotaCompatibilityMode).props.checked).toBe(true)
    expect(texts(view())).not.toContain(en.proxySaved)
    expect(find(now(), node => node.type === 'button' && node.props['aria-label'] === `${en.navNetwork} — ${en.unsavedChanges}`)).toHaveLength(1)
  })

  it('loads the proxy URL even when the compatibility mode was toggled before the read lands', async () => {
    stubFetch()
    const originalFetch = globalThis.fetch
    let finish!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => url.endsWith('/auth/proxy') && init?.method !== 'POST'
      ? new Promise<Response>(resolve => { finish = resolve }) : originalFetch(url, init)))
    mount()
    clickPage(en.navNetwork)
    fire(field(now(), en.quotaCompatibilityMode), { target: { checked: true } })
    // The effective settings are unknown yet, so the pair cannot be saved.
    expect(button(now(), en.proxySave).props.disabled).toBe(true)
    // Editing stays allowed while the read is in flight.
    expect(field(now(), en.quotaCompatibilityMode).props.disabled).toBe(false)
    finish(new Response(JSON.stringify({ proxyUrl: 'http://127.0.0.1:9090', quotaCompatibilityMode: false })))
    await new Promise(resolve => setTimeout(resolve, 0))
    // The URL the user never edited is filled in …
    expect(field(now(), en.proxyTitle).props.value).toBe('http://127.0.0.1:9090')
    // … and the toggle the user edited is not overwritten.
    expect(field(now(), en.quotaCompatibilityMode).props.checked).toBe(true)
    expect(find(now(), node => node.type === 'button' && node.props['aria-label'] === `${en.navNetwork} — ${en.unsavedChanges}`)).toHaveLength(1)
    expect(probe.bodies).toEqual([])
  })

  it('shows a load error and keeps the save disabled when the first read fails', async () => {
    stubFetch()
    const originalFetch = globalThis.fetch
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => url.endsWith('/auth/proxy') && init?.method !== 'POST'
      ? Promise.resolve(new Response('{}', { status: 500 })) : originalFetch(url, init)))
    mount()
    clickPage(en.navNetwork)
    await vi.waitFor(() => expect(find(now(), node => node.props.role === 'alert' && texts(node).includes(en.proxyLoadError))).toHaveLength(1))
    // The effective settings are unknown, so the pair must not be written back.
    expect(button(now(), en.proxySave).props.disabled).toBe(true)
    // Editing stays allowed while the error is on screen.
    expect(field(now(), en.quotaCompatibilityMode).props.disabled).toBe(false)
    expect(probe.bodies).toEqual([])
  })

  it('retries a failed settings read without dropping edited URL or mode drafts', async () => {
    stubFetch()
    const originalFetch = globalThis.fetch
    let reads = 0
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith('/auth/proxy') && init?.method !== 'POST') {
        reads += 1
        return Promise.resolve(new Response(JSON.stringify({ proxyUrl: 'http://127.0.0.1:9090', quotaCompatibilityMode: false }), { status: reads === 1 ? 500 : 200 }))
      }
      return originalFetch(url, init)
    }))
    mount()
    clickPage(en.navNetwork)
    await vi.waitFor(() => expect(texts(now())).toContain(en.proxyLoadError))
    fire(field(now(), en.proxyTitle), { target: { value: 'http://127.0.0.1:8080' } })
    fire(field(now(), en.quotaCompatibilityMode), { target: { checked: true } })
    ;(button(now(), en.proxyRetry).props.onClick as () => void)()
    await awaitProxyLoaded()
    expect(reads).toBe(2)
    expect(texts(now())).not.toContain(en.proxyLoadError)
    expect(field(now(), en.proxyTitle).props.value).toBe('http://127.0.0.1:8080')
    expect(field(now(), en.quotaCompatibilityMode).props.checked).toBe(true)
    expect(texts(now())).toContain(en.unsavedChangesHint)
    ;(button(now(), en.proxySave).props.onClick as () => void)()
    await vi.waitFor(() => expect(probe.bodies).toEqual([{ proxyUrl: 'http://127.0.0.1:8080', quotaCompatibilityMode: true }]))
  })

  it('deduplicates retry clicks and allows another retry after a second failure', async () => {
    stubFetch()
    const originalFetch = globalThis.fetch
    let reads = 0
    let finish!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith('/auth/proxy') && init?.method !== 'POST') {
        reads += 1
        if (reads === 2) return new Promise<Response>(resolve => { finish = resolve })
        return Promise.resolve(new Response(JSON.stringify({ proxyUrl: '', quotaCompatibilityMode: false }), { status: reads === 1 ? 500 : 200 }))
      }
      return originalFetch(url, init)
    }))
    mount()
    clickPage(en.navNetwork)
    await vi.waitFor(() => expect(texts(now())).toContain(en.proxyLoadError))
    const retry = button(now(), en.proxyRetry).props.onClick as () => void
    retry()
    retry()
    expect(reads).toBe(2)
    expect(find(now(), node => node.type === 'button' && node.props['aria-label'] === en.proxyRetry)[0]?.props.disabled).toBe(true)
    expect(button(now(), en.proxySave).props.disabled).toBe(true)
    finish(new Response('{}', { status: 500 }))
    await vi.waitFor(() => expect(button(now(), en.proxyRetry).props.disabled).toBe(false))
    expect(button(now(), en.proxySave).props.disabled).toBe(true)
    ;(button(now(), en.proxyRetry).props.onClick as () => void)()
    await awaitProxyLoaded()
    expect(reads).toBe(3)
    expect(texts(now())).not.toContain(en.proxyLoadError)
    expect(probe.bodies).toEqual([])
  })

  it('keeps the saved pair when a late read arrives after the save commits', async () => {
    stubFetch()
    const originalFetch = globalThis.fetch
    let finish!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => url.endsWith('/auth/proxy') && init?.method !== 'POST'
      ? new Promise<Response>(resolve => { finish = resolve }) : originalFetch(url, init)))
    mount()
    clickPage(en.navNetwork)
    fire(field(now(), en.proxyTitle), { target: { value: 'http://127.0.0.1:8080' } })
    fire(field(now(), en.quotaCompatibilityMode), { target: { checked: true } })
    ;(button(now(), en.proxySave).props.onClick as () => void)()
    await vi.waitFor(() => expect(texts(view())).toContain(en.proxySaved))
    finish(new Response(JSON.stringify({ proxyUrl: 'http://127.0.0.1:9090', quotaCompatibilityMode: false })))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(field(now(), en.proxyTitle).props.value).toBe('http://127.0.0.1:8080')
    expect(field(now(), en.quotaCompatibilityMode).props.checked).toBe(true)
    expect(find(now(), node => node.type === 'button' && node.props['aria-label'] === en.navNetwork)).toHaveLength(1)
  })

  it('disables both network fields while the save is in flight', async () => {
    stubFetch()
    const originalFetch = globalThis.fetch
    let finish!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith('/auth/proxy') && init?.method === 'POST') {
        if (typeof init.body === 'string') probe.bodies.push(JSON.parse(init.body))
        return new Promise<Response>(resolve => { finish = resolve })
      }
      return originalFetch(url, init)
    }))
    mount()
    clickPage(en.navNetwork)
    await awaitProxyLoaded()
    fire(field(now(), en.quotaCompatibilityMode), { target: { checked: true } })
    ;(button(now(), en.proxySave).props.onClick as () => void)()
    await vi.waitFor(() => expect(probe.bodies).toHaveLength(1))
    expect(field(now(), en.proxyTitle).props.disabled).toBe(true)
    expect(field(now(), en.quotaCompatibilityMode).props.disabled).toBe(true)
    finish(new Response(JSON.stringify({ proxyUrl: '', quotaCompatibilityMode: true })))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(field(now(), en.proxyTitle).props.disabled).toBe(false)
    expect(field(now(), en.quotaCompatibilityMode).props.disabled).toBe(false)
  })

  it('keeps the network draft across a page switch', async () => {
    stubFetch()
    mount()
    clickPage(en.navNetwork)
    await awaitProxyLoaded()
    fire(field(now(), en.quotaCompatibilityMode), { target: { checked: true } })
    clickPage(en.navModels)
    clickPage(en.navNetwork)
    expect(field(now(), en.quotaCompatibilityMode).props.checked).toBe(true)
    expect(texts(view())).toContain(en.unsavedChangesHint)
    expect(probe.bodies).toEqual([])
  })

  it('describes the compatibility mode in English and Chinese', () => {
    expect(en.quotaCompatibilityMode).toBe('Quota request compatibility mode')
    expect(zh.quotaCompatibilityMode).toBe('配额请求兼容模式')
    expect(en.quotaCompatibilityModeHint).toContain('immediately')
    expect(en.quotaCompatibilityModeHint).toContain('no restart')
    expect(zh.quotaCompatibilityModeHint).toContain('立即生效')
    expect(zh.quotaCompatibilityModeHint).toContain('无需重启')
    expect(en.quotaCompatibilityWarning).toContain('Do not enable')
    expect(en.quotaCompatibilityWarning).toContain('DLP')
    expect(zh.quotaCompatibilityWarning).toContain('不要开启')
    expect(zh.quotaCompatibilityWarning).toContain('不能恢复')

    stubFetch()
    harness.reset()
    probe.initialStatus = SIGNED_IN
    harness.mount(XaiSettings as unknown as (props: unknown) => unknown, { t: (key: keyof typeof zh) => zh[key] })
    clickPage(zh.navNetwork)
    const rendered = texts(now()).join(' | ')
    expect(rendered).toContain('配额请求兼容模式')
    expect(rendered).toContain('立即生效')
    expect(rendered).toContain(zh.quotaCompatibilityWarning)
  })
})
