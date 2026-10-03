/**
 * Regression tests for the merged imagine views (formerly dsh-grok-imagine-ui).
 *
 * Components are invoked directly against a fake react and their element trees
 * are RECURSIVELY EXPANDED — calling a component once only yields an
 * unrendered element, which would make assertions pass vacuously (the lesson
 * recorded in the former plugin's FIX-null-render-save-path.md).
 *
 * Covers the two production fixes carried over during the merge:
 *   1. save_path calls (text-only result blocks) must NOT vanish — they fall
 *      back to a text card.
 *   2. both grok_imagine and grok_imagine_edit are rendered ("已生成"/"已编辑").
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('react', () => ({
  useCallback: (fn: unknown) => fn,
  useEffect: () => undefined,
  useMemo: (fn: () => unknown) => fn(),
  useRef: (initial: unknown) => ({ current: initial }),
  useState: (initial: unknown) => [typeof initial === 'function' ? (initial as () => unknown)() : initial, () => undefined],
  useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
}))
vi.mock('react/jsx-runtime', () => {
  const jsx = (type: unknown, props: Record<string, unknown> | null, key?: unknown) => ({ type, props: props ?? {}, key })
  return { jsx, jsxs: jsx, Fragment: Symbol.for('Fragment') }
})

import { applyImagineViews } from '../src/client/imagine-view.tsx'

interface Registration {
  spec: { name: string; key?: string; id?: string }
  component: (props: never) => unknown
}

function captureRegistrations(): Registration[] {
  const registrations: Registration[] = []
  const scope = {
    sessions: { binding: () => undefined },
    slots: {
      inject: (_name: string, setup: () => unknown) => { setup() },
      register: (spec: Registration['spec'], component: Registration['component']) => {
        registrations.push({ spec, component })
        return () => undefined
      },
      entries: () => [],
    },
  }
  applyImagineViews({ inject: (_deps: string[], cb: (s: typeof scope) => void) => { cb(scope) } } as never)
  return registrations
}

function toolViewFor(registrations: Registration[], key: string) {
  const found = registrations.find(entry => entry.spec.name === 'tool.call.toolview' && entry.spec.key === key)
  expect(found).toBeDefined()
  return found!.component as (props: Record<string, unknown>) => unknown
}

interface Expanded {
  texts: string[]
  tags: string[]
}

/** Recursively expand rendered elements down to DOM nodes and text. */
function renderDeep(node: unknown, out: Expanded = { texts: [], tags: [] }): Expanded {
  if (node === null || node === undefined || typeof node === 'boolean') return out
  if (Array.isArray(node)) {
    for (const child of node) renderDeep(child, out)
    return out
  }
  if (typeof node === 'string' || typeof node === 'number') {
    out.texts.push(String(node))
    return out
  }
  const element = node as { type: unknown; props: Record<string, unknown> }
  if (typeof element.type === 'function') {
    renderDeep((element.type as (props: Record<string, unknown>) => unknown)(element.props), out)
    return out
  }
  if (typeof element.type === 'string') out.tags.push(element.type)
  renderDeep(element.props.children, out)
  return out
}

/** Expand component elements to their final rendered value (null included). */
function expandValue(node: unknown): unknown {
  if (node !== null && typeof node === 'object' && !Array.isArray(node)) {
    const element = node as { type: unknown; props: Record<string, unknown> }
    if (typeof element.type === 'function') {
      return expandValue((element.type as (props: Record<string, unknown>) => unknown)(element.props))
    }
  }
  return node
}

const IMAGE_REF = {
  attachmentId: `sha256:${'a'.repeat(64)}`,
  mediaType: 'image/png',
  bytes: 1234,
  width: 2,
  height: 2,
  name: 'grok-imagine-edit.png',
}

function settledBlock(name: string, args: Record<string, unknown>, content: unknown[], isError = false): unknown {
  return { kind: 'call', call: { name, argsRaw: JSON.stringify(args) }, content, isError, callId: 'c1', seq: 1 }
}

const SESSIONS = { binding: () => undefined }

describe('imagine views (merged from dsh-grok-imagine-ui)', () => {
  const registrations = captureRegistrations()

  it('registers toolview occupants for both grok tools and one turn tail', () => {
    const keys = registrations.filter(entry => entry.spec.name === 'tool.call.toolview').map(entry => entry.spec.key)
    expect(keys).toEqual(expect.arrayContaining(['grok_imagine', 'grok_imagine_edit']))
    expect(keys).toHaveLength(2)
    expect(registrations.some(entry => entry.spec.name === 'conversation.chat.turnTail')).toBe(true)
  })

  it('keeps save_path calls visible as a text card instead of returning null (FIX-null-render-save-path)', () => {
    const view = toolViewFor(registrations, 'grok_imagine_edit')
    const block = settledBlock('grok_imagine_edit', { prompt: 'sketch it', image: 'x', save_path: 'out.png' }, [
      { type: 'text', text: 'Saved to /tmp/ws/out.jpg' },
    ])
    const result = view({ block, sessionId: 's1', sessions: SESSIONS })
    expect(result).not.toBeNull()
    const out = renderDeep(result)
    expect(out.texts).toContain('图片未进会话，已直接落盘')
    expect(out.texts).toContain('Saved to /tmp/ws/out.jpg')
    expect(out.texts).toContain('sketch it')
    expect(out.texts).toContain('已编辑')
  })

  it('renders image results for both tools with the right title verb', () => {
    const editView = toolViewFor(registrations, 'grok_imagine_edit')
    const editOut = renderDeep(editView({
      block: settledBlock('grok_imagine_edit', { prompt: 'p', image: 'x' }, [{ type: 'image', attachment: IMAGE_REF }]),
      sessionId: 's1',
      sessions: SESSIONS,
    }))
    expect(editOut.texts).toContain('已编辑')

    const genView = toolViewFor(registrations, 'grok_imagine')
    const genOut = renderDeep(genView({
      block: settledBlock('grok_imagine', { prompt: 'p' }, [{ type: 'image', attachment: IMAGE_REF }]),
      sessionId: 's1',
      sessions: SESSIONS,
    }))
    expect(genOut.texts).toContain('已生成')
    // effects are stubbed out, so frames stay on their loading placeholder
    expect(genOut.texts).toContain('正在加载图片…')
  })

  it('returns null only when there are neither images nor text', () => {
    const view = toolViewFor(registrations, 'grok_imagine')
    const result = view({ block: settledBlock('grok_imagine', { prompt: 'p' }, []), sessionId: 's1', sessions: SESSIONS })
    // Expand to the final value: the wrapper returns an element whose inner
    // card returns null (asserting on the wrapper element would false-pass).
    expect(expandValue(result)).toBeNull()
  })

  it('shows a failure card for errored calls and a generating card for pending ones', () => {
    const view = toolViewFor(registrations, 'grok_imagine')
    const failed = renderDeep(view({ block: settledBlock('grok_imagine', { prompt: 'p' }, [], true), sessionId: 's1', sessions: SESSIONS }))
    expect(failed.texts).toContain('图片生成失败')
    const pending = renderDeep(view({ block: { phase: 'start', argsRaw: JSON.stringify({ prompt: 'p' }) }, sessionId: 's1', sessions: SESSIONS }))
    expect(pending.texts).toContain('正在生成图片…')
    expect(pending.texts).toContain('p')
  })

  it('turn tail aggregates the turn image results and falls back to null when empty', () => {
    const tail = registrations.find(entry => entry.spec.name === 'conversation.chat.turnTail')!.component as (props: Record<string, unknown>) => unknown
    const useChat = (selector: (chat: unknown) => unknown) => selector({
      nodes: { turnDataSource: () => ({ subscribe: () => () => undefined, getSnapshot: () => [{ root: settledBlock('grok_imagine', { prompt: 'turn' }, [{ type: 'image', attachment: IMAGE_REF }]) }] }) },
    })
    const out = renderDeep(tail({ turn: { turn: {} }, sessionId: 's1', sessions: SESSIONS, useChat }))
    expect(out.texts).toContain('已生成')
    expect(out.texts).toContain('turn')

    const emptyUseChat = (selector: (chat: unknown) => unknown) => selector({
      nodes: { turnDataSource: () => ({ subscribe: () => () => undefined, getSnapshot: () => [] }) },
    })
    expect(tail({ turn: { turn: {} }, sessionId: 's1', sessions: SESSIONS, useChat: emptyUseChat })).toBeNull()
  })
})
