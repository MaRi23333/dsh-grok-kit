import { afterEach, describe, expect, it, vi } from 'vitest'

const hooks = vi.hoisted(() => ({
  values: [] as unknown[], cursor: 0, collectEffects: true, effects: [] as Array<() => unknown>,
  dependencies: [] as Array<readonly unknown[] | undefined>,
}))
vi.mock('react', () => ({
  useCallback: (fn: unknown) => fn,
  useEffect: (fn: () => unknown, dependencies?: readonly unknown[]) => {
    if (hooks.collectEffects) { hooks.effects.push(fn); hooks.dependencies.push(dependencies) }
  },
  useMemo: (fn: () => unknown) => fn(),
  useRef: (initial: unknown) => {
    const index = hooks.cursor++
    if (!(index in hooks.values)) hooks.values[index] = { current: initial }
    return hooks.values[index]
  },
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
  useState: (initial: unknown) => {
    const index = hooks.cursor++
    if (!(index in hooks.values)) hooks.values[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial
    return [hooks.values[index], (next: unknown) => {
      hooks.values[index] = typeof next === 'function' ? (next as (value: unknown) => unknown)(hooks.values[index]) : next
    }]
  },
}))
vi.mock('react/jsx-runtime', () => {
  const jsx = (type: unknown, props: Record<string, unknown> | null, key?: unknown) => ({ type, props: props ?? {}, key })
  return { jsx, jsxs: jsx, Fragment: Symbol.for('Fragment') }
})

import { XaiSettings } from '../src/client/XaiSettings.tsx'
import { en, zh } from '../src/client/locales.ts'
import { CapabilitiesView, VideoTasksView } from '../src/client/capabilities-view.tsx'

interface Element { type: unknown; props: Record<string, unknown>; key?: unknown }
function elements(node: unknown, predicate: (value: Element) => boolean): Element[] {
  if (Array.isArray(node)) return node.flatMap(child => elements(child, predicate))
  if (node === null || typeof node !== 'object' || !('props' in node)) return []
  const value = node as Element
  // The subject is XaiSettings, not its independent account capability panel.
  if (typeof value.type === 'function') return predicate(value) ? [value] : []
  return [...(predicate(value) ? [value] : []), ...elements(value.props.children, predicate)]
}
function text(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(text).join('')
  if (node === null || typeof node !== 'object' || !('props' in node)) return ''
  return text((node as Element).props.children)
}

afterEach(() => {
  hooks.values = []; hooks.cursor = 0; hooks.collectEffects = true; hooks.effects = []
  hooks.dependencies = []
  vi.unstubAllGlobals()
})

async function fixture(initial: Record<string, unknown> = {}) {
  const defaults = { imagineTool: false, editTool: false, videoTool: false, mediaRiskAcknowledged: false, backendSearch: false }
  let options: Record<string, unknown> = { ...defaults, ...initial }
  const posts: Record<string, unknown>[] = []
  const fetch = vi.fn(async (path: string, init?: RequestInit) => {
    if (path.endsWith('/options')) {
      if (init?.method === 'POST') {
        const patch = JSON.parse(String(init.body)) as Record<string, unknown>
        posts.push(patch)
        for (const [key, value] of Object.entries(patch)) options[key] = value === null ? defaults[key as keyof typeof defaults] : value
      }
      return new Response(JSON.stringify({ effective: options, stored: options }))
    }
    return new Response(JSON.stringify(path.endsWith('/proxy') ? { proxyUrl: '' } : { status: 'signed-out' }))
  })
  vi.stubGlobal('fetch', fetch)
  vi.stubGlobal('window', { confirm: vi.fn() })
  const render = () => { hooks.cursor = 0; return XaiSettings({ t: key => en[key] }) }
  render()
  hooks.collectEffects = false
  for (const effect of hooks.effects) effect()
  await vi.waitFor(() => expect(hooks.values.some(value => typeof value === 'object' && value !== null
    && 'imagineTool' in value && value.imagineTool === options.imagineTool)).toBe(true))
  const page = (label: string) => {
    const action = elements(render(), element => element.type === 'button' && String(element.props['aria-label'] ?? '').startsWith(label))[0]!
    expect(action).toBeDefined()
    if (action.props['aria-current'] !== 'page') (action.props.onClick as () => void)()
  }
  page(en.navMedia)
  const input = (label: string) => {
    page(label === en.backendSearch ? en.navSearch : en.navMedia)
    const row = elements(render(), element => element.type === 'label' && text(element.props.children).startsWith(label))[0]!
    expect(row).toBeDefined()
    return elements(row, element => element.type === 'input')[0]!
  }
  const change = (label: string, checked: boolean) => (input(label).props.onChange as (event: unknown) => void)({ target: { checked } })
  const buttonOf = (label: string) => elements(render(), element => element.type === 'button'
    && (text(element.props.children) === label || text(element.props.children).startsWith(`${label} ·`)))[0]
  const button = (label: string) => buttonOf(label)!
  const click = (label: string) => { (buttonOf(label)!.props.onClick as () => void)() }
  const save = async () => {
    const count = posts.length
    const saveButton = button(en.optionsSave)
    expect(saveButton.props.disabled).toBe(false)
    ;(saveButton.props.onClick as () => void)()
    await vi.waitFor(() => expect(posts).toHaveLength(count + 1))
    await vi.waitFor(() => expect(buttonOf(en.optionsSave)?.props.disabled).toBe(true))
  }
  return { render, input, change, button, hasButton: (label: string) => buttonOf(label) !== undefined, click, save, posts, page }
}

describe('settings-only media risk confirmation', () => {
  it('parks an enable behind the inline confirmation; cancelling changes nothing', async () => {
    const f = await fixture()
    f.change(en.imagineTool, true)
    expect(f.input(en.imagineTool).props.checked).toBe(false)
    expect(text(f.render())).toContain(en.mediaConfirmPrompt)
    expect(f.hasButton(en.mediaConfirmYes)).toBe(true)
    expect(f.hasButton(en.mediaConfirmNo)).toBe(true)
    f.click(en.mediaConfirmNo)
    expect(f.hasButton(en.mediaConfirmYes)).toBe(false)
    expect(f.input(en.imagineTool).props.checked).toBe(false)
    expect(f.button(en.optionsSave).props.disabled).toBe(true)
    expect(f.posts).toEqual([])
    f.change(en.backendSearch, true)
    await f.save()
    expect(f.posts[0]).toEqual({ backendSearch: true })
  })

  it('confirms both image tools, closes without a prompt, then asks again on reopening', async () => {
    const f = await fixture()
    f.change(en.imagineTool, true)
    expect(f.hasButton(en.mediaConfirmYes)).toBe(true)
    f.click(en.mediaConfirmYes)
    expect(f.hasButton(en.mediaConfirmYes)).toBe(false)
    await f.save()
    expect(f.posts[0]).toEqual({ imagineTool: true, editTool: true, videoTool: false, mediaRiskAcknowledged: true })
    expect(f.input(en.imagineTool).props.checked).toBe(true)
    f.change(en.imagineTool, false)
    expect(f.hasButton(en.mediaConfirmYes)).toBe(false)
    await f.save()
    expect(f.posts[1]).toEqual({ imagineTool: false, editTool: false })
    f.change(en.imagineTool, true)
    expect(f.hasButton(en.mediaConfirmYes)).toBe(true)
    f.click(en.mediaConfirmYes)
    await f.save()
    expect(f.posts[2].mediaRiskAcknowledged).toBe(true)
  })

  it('shows an edit-only advanced configuration and closes both flags with one switch', async () => {
    const f = await fixture({ editTool: true, mediaRiskAcknowledged: true })
    expect(f.input(en.imagineTool).props.checked).toBe(true)
    expect(text(f.render())).toContain(`${en.imageGenerationSwitch}: ${en.mediaOff} · ${en.imageEditingSwitch}: ${en.mediaOn}`)
    f.change(en.imagineTool, false)
    expect(f.hasButton(en.mediaConfirmYes)).toBe(false)
    await f.save()
    expect(f.posts[0]).toEqual({ imagineTool: false, editTool: false })
  })

  it('confirms video, leaves images off and resets consent without a prompt', async () => {
    const f = await fixture()
    f.change(en.videoTool, true)
    expect(f.hasButton(en.mediaConfirmYes)).toBe(true)
    f.click(en.mediaConfirmYes)
    await f.save()
    expect(f.posts[0]).toEqual({ imagineTool: false, editTool: false, videoTool: true, mediaRiskAcknowledged: true })
    ;(f.button(en.optionsReset).props.onClick as () => void)()
    await vi.waitFor(() => expect(f.posts).toHaveLength(2))
    expect(f.posts[1]).toEqual({
      imagineTool: null, editTool: null, videoTool: null, mediaRiskAcknowledged: false,
      videoModel: null, videoMaxBytes: null,
    })
    expect(f.hasButton(en.mediaConfirmYes)).toBe(false)
  })

  it('refreshes the local capability panel after a video close or reset, without remounting on unrelated saves', async () => {
    const f = await fixture({ videoTool: true, mediaRiskAcknowledged: true })
    const panelKey = () => {
      f.page(en.navMedia)
      return elements(f.render(), element => element.type === CapabilitiesView)[0]!.key
    }
    const initialKey = panelKey()
    f.change(en.videoTool, false)
    await f.save()
    const closedKey = panelKey()
    expect(closedKey).not.toBe(initialKey)
    f.change(en.backendSearch, true)
    await f.save()
    expect(panelKey()).toBe(closedKey)
    ;(f.button(en.optionsReset).props.onClick as () => void)()
    await vi.waitFor(() => expect(panelKey()).not.toBe(closedKey))
  })

  it('lets the video toggle replace a parked image confirmation, and only the confirmed group lands', async () => {
    const f = await fixture()
    f.change(en.imagineTool, true)
    f.change(en.videoTool, true)
    expect(text(f.render())).toContain(en.mediaConfirmPrompt)
    f.click(en.mediaConfirmYes)
    expect(f.hasButton(en.mediaConfirmYes)).toBe(false)
    await f.save()
    expect(f.posts[0]).toEqual({ imagineTool: false, editTool: false, videoTool: true, mediaRiskAcknowledged: true })
  })

  it('provides nonempty English and Chinese copies for the same media controls and risks', () => {
    for (const locale of [en, zh]) {
      for (const key of ['imagineTool', 'imagineToolHint', 'videoToolHint', 'mediaRiskHint', 'experimentalTag', 'mediaConfirmPrompt', 'mediaConfirmYes', 'mediaConfirmNo', 'optionsHint'] as const) {
        expect(locale[key].trim().length).toBeGreaterThan(0)
      }
    }
    expect(en.experimentalTag).toMatch(/experimental/i)
    expect(zh.experimentalTag).toMatch(/实验性/)
    expect(en.mediaConfirmPrompt).toMatch(/experimental/i)
    expect(en.mediaConfirmPrompt).toMatch(/xAI/i)
    expect(en.mediaConfirmPrompt).toMatch(/quota|charges/i)
    expect(en.mediaConfirmPrompt).toMatch(/restart/i)
    expect(zh.mediaConfirmPrompt).toMatch(/xAI/)
    expect(zh.mediaConfirmPrompt).toMatch(/额度|费用/)
    expect(zh.mediaConfirmPrompt).toMatch(/重启/)
  })
})

const OLD_TASK = {
  taskId: '123e4567-e89b-42d3-a456-426614174000', state: 'pending',
  model: 'grok-imagine-video-1.5', prompt: 'old task',
  createdAt: '2026-10-12T00:00:00.000Z', updatedAt: '2026-10-12T00:00:00.000Z',
}

/** Execute effect changes and cleanups like React, without mounting media cards. */
function taskFixture(initialEnabled: boolean) {
  let enabled = initialEnabled
  let dependencies: readonly unknown[] | undefined
  let cleanup: (() => void) | undefined
  const render = () => {
    hooks.cursor = 0; hooks.effects = []; hooks.dependencies = []; hooks.collectEffects = true
    const node = VideoTasksView({ t: key => en[key], videoEnabled: enabled })
    const nextDependencies = hooks.dependencies[0]!
    if (dependencies === undefined || nextDependencies.some((value, index) => value !== dependencies![index])) {
      cleanup?.()
      const returned = hooks.effects[0]!()
      cleanup = typeof returned === 'function' ? returned as () => void : undefined
      dependencies = nextDependencies
    }
    return node
  }
  return {
    render,
    setEnabled: (next: boolean) => { enabled = next; return render() },
    dispose: () => cleanup?.(),
  }
}

describe('disabled video task panel', () => {
  it('does not read tasks or show loading/error/empty when disabled, then loads only after enabling', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ tasks: [OLD_TASK] })))
    vi.stubGlobal('fetch', fetch)
    const f = taskFixture(false)
    const disabled = f.render()
    expect(fetch).not.toHaveBeenCalled()
    expect(text(disabled)).toContain(en.videoTasksDisabled)
    for (const label of [en.videoTasksLoading, en.videoTasksError, en.videoTasksEmpty]) expect(text(disabled)).not.toContain(label)
    const refresh = elements(disabled, element => element.type === 'button')[0]!
    expect(refresh.props.disabled).toBe(true)
    ;(refresh.props.onClick as () => void)()
    f.render()
    expect(fetch).not.toHaveBeenCalled()
    f.setEnabled(true)
    await vi.waitFor(() => expect(hooks.values[0]).toMatchObject({ kind: 'ready', tasks: [OLD_TASK] }))
    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch.mock.calls[0]).toEqual(expect.arrayContaining(['/plugins/dsh-grok-kit/video/tasks']))
    expect(elements(f.render(), element => element.type === 'li')).toHaveLength(1)
    f.setEnabled(false)
    expect(hooks.values[0]).toEqual({ kind: 'disabled' })
    expect(elements(f.render(), element => element.type === 'li')).toHaveLength(0)
    expect(fetch).toHaveBeenCalledOnce()
    f.dispose()
  })

  it('aborts an old task request on closing and ignores a late response from it', async () => {
    let resolve!: (response: Response) => void
    let signal: AbortSignal | undefined
    const json = vi.fn(async () => ({ tasks: [OLD_TASK] }))
    const fetch = vi.fn((_path: string, init?: RequestInit) => {
      signal = init?.signal as AbortSignal | undefined
      return new Promise<Response>(accept => { resolve = accept })
    })
    vi.stubGlobal('fetch', fetch)
    const f = taskFixture(true)
    f.render()
    expect(fetch).toHaveBeenCalledOnce()
    expect(signal?.aborted).toBe(false)
    const disabled = f.setEnabled(false)
    expect(signal?.aborted).toBe(true)
    expect(hooks.values[0]).toEqual({ kind: 'disabled' })
    expect(text(disabled)).toContain(en.videoTasksDisabled)
    resolve({ ok: true, json } as unknown as Response)
    await vi.waitFor(() => expect(json).toHaveBeenCalledOnce())
    for (let tick = 0; tick < 6; tick++) await Promise.resolve()
    expect(hooks.values[0]).toEqual({ kind: 'disabled' })
    expect(elements(f.render(), element => element.type === 'li')).toHaveLength(0)
    f.dispose()
  })
})
