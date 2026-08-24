import { describe, expect, it, vi } from 'vitest'
import { apply, Config, resolveNestedSearchTools } from '../src/index.ts'
import { XAI_SERVER_X_SEARCH_REJECT_NAMES } from '../src/responses.ts'

describe('resolveNestedSearchTools', () => {
  it('registers nested tools when config is empty (backend default false)', () => {
    expect(resolveNestedSearchTools({})).toEqual({ backendSearch: false, nestedSearchTools: true })
  })

  it('does not register nested tools when only backendSearch is true', () => {
    expect(resolveNestedSearchTools({ backendSearch: true })).toEqual({
      backendSearch: true,
      nestedSearchTools: false,
    })
  })

  it('allows both when nestedSearchTools is explicit true', () => {
    expect(resolveNestedSearchTools({ backendSearch: true, nestedSearchTools: true })).toEqual({
      backendSearch: true,
      nestedSearchTools: true,
    })
  })
})

describe('Config schema nestedSearchTools has no default', () => {
  it('keeps nestedSearchTools undefined when the key is absent', () => {
    const parsed = Config({ backendSearch: true } as never)
    expect(parsed.nestedSearchTools).toBeUndefined()
    expect(parsed.backendSearch).toBe(true)
  })
})

describe('apply() registration', () => {
  function applyCollecting(config: Parameters<typeof apply>[1]) {
    const names: string[] = []
    const ctx = {
      emit: vi.fn(),
      get: vi.fn(() => undefined),
      llm: {
        listProviders: () => [],
        registerAdapter: vi.fn(),
      },
      inject: (_deps: unknown, fn: (scoped: never) => void) => {
        fn({
          tools: {
            register: (definition: { name: string }) => {
              names.push(definition.name)
            },
          },
          systemPrompt: { section: vi.fn() },
          webServer: { register: vi.fn(() => ({})) },
          effect: vi.fn((callback: () => void) => {
            callback()
            return () => undefined
          }),
        } as never)
      },
    }
    apply(ctx as never, config)
    return names
  }

  it('does not register nested or reject tools when backendSearch is true and nested key is absent', () => {
    const names = applyCollecting({ backendSearch: true })
    expect(names).not.toContain('grok_web_search')
    expect(names).not.toContain('x_search')
    for (const name of XAI_SERVER_X_SEARCH_REJECT_NAMES) expect(names).toContain(name)
  })

  it('registers nested tools on an empty config and does not register reject names', () => {
    const names = applyCollecting({})
    expect(names).toContain('grok_web_search')
    expect(names).toContain('x_search')
    for (const name of XAI_SERVER_X_SEARCH_REJECT_NAMES) expect(names).not.toContain(name)
  })
})
