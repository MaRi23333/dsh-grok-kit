import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { mergeStoredOptionsPatch } from '../src/auth-routes.ts'
import {
  mergePluginOptions,
  optionsPath,
  readStoredOptions,
  sanitizeStoredOptions,
  writeStoredOptions,
} from '../src/options.ts'

const originalHome = process.env.DSH_HOME
let dir: string | undefined

afterEach(async () => {
  process.env.DSH_HOME = originalHome
  if (dir !== undefined) await rm(dir, { recursive: true, force: true })
  dir = undefined
})

async function tempHome(): Promise<string> {
  dir = await mkdtemp(join(tmpdir(), 'dsh-grok-kit-options-'))
  process.env.DSH_HOME = dir
  return dir
}

describe('sanitizeStoredOptions', () => {
  it('keeps only known keys with valid types', () => {
    const parsed = sanitizeStoredOptions({
      version: 1,
      options: {
        backendSearch: true,
        statefulResponses: false,
        imagineTool: false,
        nestedSearchTools: true,
        searchModel: 'grok-4.5',
        searchMaxResults: 12,
        webSearchTimeoutMs: 45000,
        xSearchTimeoutMs: 180000,
        unknown: 'dropped',
      },
    })
    expect(parsed).toEqual({
      backendSearch: true,
      statefulResponses: false,
      imagineTool: false,
      nestedSearchTools: true,
      searchModel: 'grok-4.5',
      searchMaxResults: 12,
      webSearchTimeoutMs: 45000,
      xSearchTimeoutMs: 180000,
    })
  })

  it('drops wrong types and non-finite numbers, and rejects wrong versions', () => {
    expect(sanitizeStoredOptions({ version: 99, options: { backendSearch: true } })).toEqual({})
    expect(sanitizeStoredOptions({
      version: 1,
      options: { backendSearch: 'yes', searchMaxResults: -1, webSearchTimeoutMs: 0, searchModel: ' ' },
    })).toEqual({})
  })

  it('enforces numeric ceilings and model-id length', () => {
    expect(sanitizeStoredOptions({
      version: 1,
      options: {
        searchMaxResults: 101,
        webSearchTimeoutMs: 600_001,
        xSearchTimeoutMs: 999_999,
        searchModel: 'x'.repeat(200),
      },
    })).toEqual({})
    expect(sanitizeStoredOptions({
      version: 1,
      options: {
        searchMaxResults: 1,
        webSearchTimeoutMs: 1_000,
        xSearchTimeoutMs: 1_000,
      },
    })).toEqual({
      searchMaxResults: 1,
      webSearchTimeoutMs: 1_000,
      xSearchTimeoutMs: 1_000,
    })
    expect(sanitizeStoredOptions({
      version: 1,
      options: {
        searchMaxResults: 100,
        webSearchTimeoutMs: 600_000,
        xSearchTimeoutMs: 600_000,
        searchModel: 'grok-4.5',
      },
    })).toEqual({
      searchMaxResults: 100,
      webSearchTimeoutMs: 600_000,
      xSearchTimeoutMs: 600_000,
      searchModel: 'grok-4.5',
    })
  })

  it('drops fractional and below-floor numeric values instead of truncating them', () => {
    expect(sanitizeStoredOptions({
      version: 1,
      options: {
        searchMaxResults: 0.5,
        webSearchTimeoutMs: 999.9,
        xSearchTimeoutMs: 1,
      },
    })).toEqual({})
    expect(sanitizeStoredOptions({
      version: 1,
      options: {
        searchMaxResults: 0,
        webSearchTimeoutMs: 1,
        xSearchTimeoutMs: 600_001,
      },
    })).toEqual({})
  })
})

describe('mergePluginOptions', () => {
  it('explicit stored keys win over the Cordis config; others pass through', () => {
    const merged = mergePluginOptions(
      { backendSearch: true, nestedSearchTools: undefined, imagineTool: true, proxyUrl: 'x' },
      { backendSearch: false, statefulResponses: true },
    )
    expect(merged).toEqual({
      backendSearch: false,
      nestedSearchTools: undefined,
      imagineTool: true,
      proxyUrl: 'x',
      statefulResponses: true,
    })
  })
})

describe('mergeStoredOptionsPatch', () => {
  it('null / missing keys remove or keep overrides', () => {
    const current = { backendSearch: false, statefulResponses: true, searchModel: 'grok-4.5' }
    expect(mergeStoredOptionsPatch(current, { statefulResponses: null })).toEqual({
      backendSearch: false,
      searchModel: 'grok-4.5',
    })
    expect(mergeStoredOptionsPatch(current, { backendSearch: true })).toEqual({
      backendSearch: true,
      statefulResponses: true,
      searchModel: 'grok-4.5',
    })
    expect(mergeStoredOptionsPatch(current, { unknown: 1 })).toEqual(current)
    expect(mergeStoredOptionsPatch(current, 'nope')).toEqual(current)
  })

  it('POST-save path returns the same sanitized document it persists', async () => {
    const home = await tempHome()
    // An out-of-range value comes in: the merged doc drops it before write,
    // and the response must match what is on disk (GROK-OPTIONS-001).
    const patched = sanitizeStoredOptions({
      version: 1,
      options: mergeStoredOptionsPatch(readStoredOptions(), { backendSearch: false, searchMaxResults: 500 }),
    })
    await writeStoredOptions(patched)
    expect(readStoredOptions()).toEqual(patched)
    expect(patched).toEqual({ backendSearch: false })
  })
})

describe('file store round-trip', () => {
  it('writes the document and reads it back', async () => {
    const home = await tempHome()
    await writeStoredOptions({ backendSearch: false, searchMaxResults: 5 })
    const file = optionsPath(home)
    const text = await readFile(file, 'utf8')
    expect(JSON.parse(text)).toMatchObject({ version: 1, options: { backendSearch: false, searchMaxResults: 5 } })
    expect(readStoredOptions()).toEqual({ backendSearch: false, searchMaxResults: 5 })
  })

  it('yields empty options on a missing or corrupt file', async () => {
    const home = await tempHome()
    expect(readStoredOptions()).toEqual({})
    await writeFile(optionsPath(home), '{corrupt')
    expect(readStoredOptions()).toEqual({})
  })
})
