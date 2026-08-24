import { describe, expect, it } from 'vitest'
import { xaiProvider } from '@earendil-works/pi-ai/providers/xai'
import {
  catalogModels,
  extractModelIds,
  GROK_46_MODEL,
  isComposerChatModel,
  materializeLiveModel,
  mergeLiveCatalog,
  preferredXaiOAuthModelFrom,
} from '../src/catalog.ts'

const catalog = catalogModels()
const piCatalog = xaiProvider().getModels()

describe('extractModelIds', () => {
  it('reads OpenAI-shaped data arrays', () => {
    expect(extractModelIds({ data: [{ id: 'grok-4.6' }, { id: 'grok-4.5' }, { object: 'model' }] })).toEqual([
      'grok-4.6',
      'grok-4.5',
    ])
  })

  it('accepts a bare string list and a models field', () => {
    expect(extractModelIds(['grok-4.6', 'grok-4.6'])).toEqual(['grok-4.6'])
    expect(extractModelIds({ models: [{ id: 'grok-build-0.1' }] })).toEqual(['grok-build-0.1'])
  })
})

describe('GROK_46_MODEL', () => {
  it('declares xhigh and 500k context', () => {
    expect(GROK_46_MODEL.thinkingLevelMap?.xhigh).toBe('xhigh')
    expect(GROK_46_MODEL.contextWindow).toBe(500_000)
    expect(GROK_46_MODEL.cost).toEqual({ input: 2, output: 6, cacheRead: 0.3, cacheWrite: 0 })
  })
})

describe('mergeLiveCatalog', () => {
  it('keeps the installed catalog (chat models only) when live ids are missing', () => {
    const expected = catalog.filter(model => isComposerChatModel(model.id)).map(model => model.id)
    expect(mergeLiveCatalog(catalog, undefined).map(model => model.id)).toEqual(expected)
    expect(mergeLiveCatalog(catalog, []).map(model => model.id)).toEqual(expected)
    // variants (grok-build-0.1, imagine…) never reach the picker
    expect(expected).toContain('grok-4.6')
    expect(expected).not.toContain('grok-build-0.1')
  })

  it('narrows to live ids and inherits catalog metadata', () => {
    const merged = mergeLiveCatalog(catalog, ['grok-4.5', 'grok-4.6'])
    expect(merged.map(model => model.id)).toEqual(['grok-4.5', 'grok-4.6'])
    const known = merged.find(model => model.id === 'grok-4.5')
    const extra = merged.find(model => model.id === 'grok-4.6')
    expect(known?.api).toBe('openai-responses')
    expect(extra?.api).toBe('openai-responses')
    expect(extra?.name).toBe('Grok 4.6')
    expect(extra?.thinkingLevelMap?.xhigh).toBe('xhigh')
    expect(known?.thinkingLevelMap?.xhigh).toBeNull()
  })

  it('drops Imagine and video ids from live listings', () => {
    const merged = mergeLiveCatalog(catalog, ['grok-4.6', 'grok-imagine-image-2.0', 'grok-imagine-video-1.5'])
    expect(merged.map(model => model.id)).toEqual(['grok-4.6'])
  })
})

describe('materializeLiveModel', () => {
  it('uses the build template for code-fast ids', () => {
    const model = materializeLiveModel('grok-code-fast-1', catalog)
    expect(model.api).toBe(catalog.find(entry => entry.id === 'grok-build-0.1')?.api)
  })

  it('keeps exact grok-4.5 on the pi-ai descriptor (no xhigh)', () => {
    const model = materializeLiveModel('grok-4.5', catalog)
    expect(model.thinkingLevelMap?.xhigh).toBe(piCatalog.find(entry => entry.id === 'grok-4.5')?.thinkingLevelMap?.xhigh ?? null)
    expect(model.id).toBe('grok-4.5')
  })

  it('does not give grok-4.5 variants xhigh', () => {
    const model = materializeLiveModel('grok-4.5-foo', catalog)
    expect(model.thinkingLevelMap?.xhigh ?? null).toBeNull()
    expect(model.api).toBe('openai-responses')
  })

  it('uses the grok-4.6 template for 4.20 / reasoning ids', () => {
    const twenty = materializeLiveModel('grok-4.20-0309-reasoning', catalog)
    expect(twenty.thinkingLevelMap?.xhigh).toBe('xhigh')
    expect(twenty.api).toBe('openai-responses')
  })
})

describe('isComposerChatModel', () => {
  it('keeps mainline Grok chat models only', () => {
    expect(isComposerChatModel('grok-4.6')).toBe(true)
    expect(isComposerChatModel('grok-4.5')).toBe(true)
    expect(isComposerChatModel('grok-4.3')).toBe(true)
    // future mainline versions stay visible by shape, no allowlist edit needed
    expect(isComposerChatModel('grok-4.7')).toBe(true)
    expect(isComposerChatModel('grok-5')).toBe(true)
  })

  it('hides variants and non-chat models', () => {
    expect(isComposerChatModel('grok-build-0.1')).toBe(false)
    expect(isComposerChatModel('grok-code-fast-1')).toBe(false)
    expect(isComposerChatModel('grok-4.5-foo')).toBe(false)
    expect(isComposerChatModel('grok-imagine-image-2.0')).toBe(false)
    expect(isComposerChatModel('grok-imagine-video-1.5')).toBe(false)
    expect(isComposerChatModel('text-embedding-3')).toBe(false)
  })
})

describe('preferredXaiOAuthModelFrom', () => {
  it('prefers grok-4.6 over grok-4.5', () => {
    expect(preferredXaiOAuthModelFrom([{ id: 'grok-4.5' }, { id: 'grok-4.6' }])).toBe('grok-4.6')
  })
})
