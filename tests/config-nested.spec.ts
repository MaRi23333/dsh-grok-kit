import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { restoreEnv } from './restore-env.ts'
import { apply, Config, resolveNestedSearchTools, resolveStatefulResponses } from '../src/index.ts'
import { XAI_SERVER_X_SEARCH_REJECT_NAMES } from '../src/responses.ts'
import { writeStoredOptions } from '../src/options.ts'

const originalHome = process.env.DSH_HOME
let dir: string | undefined

beforeEach(async () => {
  // apply() reads the stored options file from $DSH_HOME — isolate it so a
  // real user settings file cannot leak into these registration tests.
  dir = await mkdtemp(join(tmpdir(), 'dsh-grok-kit-config-nested-'))
  process.env.DSH_HOME = dir
})

afterEach(async () => {
  restoreEnv('DSH_HOME', originalHome)
  if (dir !== undefined) await rm(dir, { recursive: true, force: true })
  dir = undefined
})

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
    expect(parsed.imagineTool).toBe(false)
    expect(parsed.editTool).toBe(false)
    expect(parsed.videoTool).toBe(false)
    expect(parsed.mediaRiskAcknowledged).toBe(false)
    expect(parsed.videoModel).toBe('grok-imagine-video-1.5')
    expect(parsed.videoMaxBytes).toBe(104_857_600)
  })
})

describe('resolveStatefulResponses', () => {
  it('stays off unless explicitly enabled', () => {
    expect(resolveStatefulResponses({})).toBe(false)
    expect(resolveStatefulResponses({ backendSearch: true })).toBe(false)
    expect(resolveStatefulResponses({ backendSearch: true, statefulResponses: true })).toBe(true)
  })

  it('honors an explicit false while backendSearch stays on', () => {
    expect(resolveStatefulResponses({ backendSearch: true, statefulResponses: false })).toBe(false)
  })
})

describe('apply() registration', () => {
  type Tool = { name: string; execute: (args: unknown, exec: unknown) => Promise<unknown> }
  function applyCollecting(config: Parameters<typeof apply>[1], tools: Tool[] = []) {
    const names: string[] = []
    const ctx = {
      provide: vi.fn(),
      emit: vi.fn(),
      get: vi.fn(() => undefined),
      effect: vi.fn((callback: () => void | (() => void)) => {
        const dispose = callback()
        return dispose ?? (() => undefined)
      }),
      llm: {
        listProviders: () => [],
        registerAdapter: vi.fn(),
      },
      inject: (_deps: unknown, fn: (scoped: never) => void) => {
        fn({
          tools: {
            register: (definition: Tool) => {
              names.push(definition.name)
              tools.push(definition)
            },
          },
          systemPrompt: { section: vi.fn() },
          webServer: { register: vi.fn(() => ({})) },
          effect: vi.fn((callback: () => void | (() => void)) => {
            const dispose = callback()
            return dispose ?? (() => undefined)
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
    expect(names).not.toContain('grok_video_generate')
    expect(names).not.toContain('grok_video_status')
    expect(names).not.toContain('grok_video_resume')
    expect(names).not.toContain('grok_imagine')
    expect(names).not.toContain('grok_imagine_edit')
  })

  it('registers video tools only after explicit opt-in', () => {
    const names = applyCollecting({ videoTool: true, mediaRiskAcknowledged: true })
    expect(names).toContain('grok_video_generate')
    expect(names).toContain('grok_video_status')
    expect(names).toContain('grok_video_resume')
  })

  it('keeps legacy true media switches unregistered without explicit consent', () => {
    const names = applyCollecting({ imagineTool: true, editTool: true, videoTool: true })
    expect(names.filter(name => name.startsWith('grok_imagine') || name.startsWith('grok_video'))).toEqual([])
  })

  it('registers each selected image tool only after consent', () => {
    const both = applyCollecting({ imagineTool: true, editTool: true, mediaRiskAcknowledged: true })
    expect(both).toContain('grok_imagine')
    expect(both).toContain('grok_imagine_edit')
    const editOnly = applyCollecting({ editTool: true, mediaRiskAcknowledged: true })
    expect(editOnly).not.toContain('grok_imagine')
    expect(editOnly).toContain('grok_imagine_edit')
  })

  it('blocks old-card generation/edit and all video calls after a saved close, before attachment or upstream work', async () => {
    const tools: Tool[] = []
    const config = { imagineTool: true, editTool: true, videoTool: true, mediaRiskAcknowledged: true }
    applyCollecting(config, tools)
    await writeStoredOptions({ imagineTool: false, editTool: false, videoTool: false })
    const exec = { signal: new AbortController().signal }
    for (const name of ['grok_imagine', 'grok_imagine_edit', 'grok_video_generate', 'grok_video_status', 'grok_video_resume']) {
      const args = name.includes('status') || name.includes('resume') ? { task_id: 'old-task' } : { prompt: 'old-card prompt', image: 'old-input.png' }
      await expect(tools.find(tool => tool.name === name)!.execute(args, exec)).rejects.toThrow(/is disabled/)
    }
  })

  it('keeps registration off until restart even when a confirmed setting is saved', async () => {
    const names = applyCollecting({})
    await writeStoredOptions({ imagineTool: true, editTool: true, videoTool: true, mediaRiskAcknowledged: true })
    expect(names).not.toContain('grok_imagine')
    expect(names).not.toContain('grok_imagine_edit')
    expect(names).not.toContain('grok_video_generate')
    const restarted = applyCollecting({})
    expect(restarted).toContain('grok_imagine')
    expect(restarted).toContain('grok_imagine_edit')
    expect(restarted).toContain('grok_video_generate')
  })
})
