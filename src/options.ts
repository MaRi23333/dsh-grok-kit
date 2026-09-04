/**
 * Plugin-owned runtime options UI: persisted overrides for the optional
 * Config keys. Precedence per key: explicit stored value (settings page) >
 * Cordis config value > schema default. Keys left untouched keep following
 * the bundle/Cordis defaults — the file only holds deliberate choices.
 * @module dsh-grok-kit/options
 */

import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { DEFAULT_XAI_SEARCH_MODEL } from './search.ts'
import {
  DEFAULT_SEARCH_MAX_RESULTS,
  DEFAULT_WEB_SEARCH_TIMEOUT_MS,
  DEFAULT_X_SEARCH_TIMEOUT_MS,
} from './tools.ts'

const OPTIONS_VERSION = 1
const OPTIONS_FILENAME = '.dsh-grok-kit-options.json'
/** Bounded numeric ranges: anything outside is dropped, never persisted. */
const SEARCH_MAX_RESULTS_FLOOR = 1
const SEARCH_MAX_RESULTS_CEILING = 100
const TIMEOUT_FLOOR_MS = 1_000
const TIMEOUT_CEILING_MS = 600_000
const SEARCH_MODEL_MAX_LENGTH = 128

export interface StoredPluginOptions {
  backendSearch?: boolean
  nestedSearchTools?: boolean
  statefulResponses?: boolean
  imagineTool?: boolean
  searchModel?: string
  searchMaxResults?: number
  webSearchTimeoutMs?: number
  xSearchTimeoutMs?: number
}

export type OptionValueSource = 'stored' | 'cordis' | 'default'

const OPTION_SOURCE_KEYS = [
  'backendSearch',
  'nestedSearchTools',
  'statefulResponses',
  'imagineTool',
  'searchModel',
  'searchMaxResults',
  'webSearchTimeoutMs',
  'xSearchTimeoutMs',
] as const satisfies ReadonlyArray<keyof StoredPluginOptions>

export interface EffectivePluginOptions {
  backendSearch: boolean
  nestedSearchTools: boolean
  statefulResponses: boolean
  imagineTool: boolean
  searchModel: string
  searchMaxResults: number
  webSearchTimeoutMs: number
  xSearchTimeoutMs: number
}

export interface PresentedPluginOptions {
  stored: StoredPluginOptions
  effective: EffectivePluginOptions
  sources: Record<keyof StoredPluginOptions, OptionValueSource>
}

function optionSource(
  key: keyof StoredPluginOptions,
  stored: StoredPluginOptions,
  cordis: Record<string, unknown>,
): OptionValueSource {
  if (stored[key] !== undefined) return 'stored'
  if (cordis[key] !== undefined) return 'cordis'
  return 'default'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function boundedInteger(value: unknown, floor: number, ceiling: number): number | undefined {
  return typeof value === 'number'
    && Number.isInteger(value)
    && value >= floor
    && value <= ceiling
    ? value
    : undefined
}

/**
 * Fail-closed parsing: unknown keys are dropped, wrong types are dropped,
 * out-of-range numbers are dropped. Never throws.
 */
export function sanitizeStoredOptions(value: unknown): StoredPluginOptions {
  if (!isRecord(value) || value['version'] !== OPTIONS_VERSION) return {}
  const raw = isRecord(value['options']) ? value['options'] : {}
  const out: StoredPluginOptions = {}
  for (const key of ['backendSearch', 'nestedSearchTools', 'statefulResponses', 'imagineTool'] as const) {
    if (typeof raw[key] === 'boolean') out[key] = raw[key]
  }
  if (
    typeof raw['searchModel'] === 'string'
    && raw['searchModel'].trim().length > 0
    && raw['searchModel'].trim().length <= SEARCH_MODEL_MAX_LENGTH
  ) {
    out['searchModel'] = raw['searchModel'].trim()
  }
  const maxResults = boundedInteger(raw['searchMaxResults'], SEARCH_MAX_RESULTS_FLOOR, SEARCH_MAX_RESULTS_CEILING)
  if (maxResults !== undefined) out['searchMaxResults'] = maxResults
  const webTimeout = boundedInteger(raw['webSearchTimeoutMs'], TIMEOUT_FLOOR_MS, TIMEOUT_CEILING_MS)
  if (webTimeout !== undefined) out['webSearchTimeoutMs'] = webTimeout
  const xTimeout = boundedInteger(raw['xSearchTimeoutMs'], TIMEOUT_FLOOR_MS, TIMEOUT_CEILING_MS)
  if (xTimeout !== undefined) out['xSearchTimeoutMs'] = xTimeout
  return out
}

export function optionsPath(dshHome?: string): string {
  return resolve(join(resolveDshHome(dshHome), OPTIONS_FILENAME))
}

/** Read the stored overrides; corrupt/missing files yield empty options. */
export function readStoredOptions(): StoredPluginOptions {
  try {
    return sanitizeStoredOptions(JSON.parse(readFileSync(optionsPath(), 'utf8')))
  } catch {
    return {}
  }
}

/** Persist the whole overrides document (merge decisions happen in the UI). */
export async function writeStoredOptions(options: StoredPluginOptions): Promise<void> {
  const file = optionsPath()
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  await writeFileAtomic(file, `${JSON.stringify(
    { version: OPTIONS_VERSION, options: sanitizeStoredOptions({ version: OPTIONS_VERSION, options }) },
    null,
    2,
  )}\n`, { mode: 0o600, dirMode: 0o700 })
}

/** Apply stored overrides on top of the Cordis config (explicit keys win). */
export function mergePluginOptions(
  config: Record<string, unknown>,
  stored: StoredPluginOptions,
): Record<string, unknown> {
  return {
    ...config,
    ...stored.backendSearch === undefined ? {} : { backendSearch: stored.backendSearch },
    ...stored.nestedSearchTools === undefined ? {} : { nestedSearchTools: stored.nestedSearchTools },
    ...stored.statefulResponses === undefined ? {} : { statefulResponses: stored.statefulResponses },
    ...stored.imagineTool === undefined ? {} : { imagineTool: stored.imagineTool },
    ...stored.searchModel === undefined ? {} : { searchModel: stored.searchModel },
    ...stored.searchMaxResults === undefined ? {} : { searchMaxResults: stored.searchMaxResults },
    ...stored.webSearchTimeoutMs === undefined ? {} : { webSearchTimeoutMs: stored.webSearchTimeoutMs },
    ...stored.xSearchTimeoutMs === undefined ? {} : { xSearchTimeoutMs: stored.xSearchTimeoutMs },
  }
}

/**
 * Values the settings page should show: stored override, else Cordis/profile,
 * else schema defaults (including nestedSearchTools = !backendSearch).
 */
export function presentPluginOptions(
  cordis: Record<string, unknown>,
  stored: StoredPluginOptions,
): PresentedPluginOptions {
  const merged = mergePluginOptions(cordis, stored)
  const backendSearch = typeof merged['backendSearch'] === 'boolean' ? merged['backendSearch'] : false
  const nestedSearchTools = typeof merged['nestedSearchTools'] === 'boolean'
    ? merged['nestedSearchTools']
    : !backendSearch
  const sources = {} as Record<keyof StoredPluginOptions, OptionValueSource>
  for (const key of OPTION_SOURCE_KEYS) sources[key] = optionSource(key, stored, cordis)
  return {
    stored,
    effective: {
      backendSearch,
      nestedSearchTools,
      statefulResponses: typeof merged['statefulResponses'] === 'boolean' ? merged['statefulResponses'] : false,
      imagineTool: typeof merged['imagineTool'] === 'boolean' ? merged['imagineTool'] : true,
      searchModel: typeof merged['searchModel'] === 'string' && merged['searchModel'].trim().length > 0
        ? merged['searchModel']
        : DEFAULT_XAI_SEARCH_MODEL,
      searchMaxResults: typeof merged['searchMaxResults'] === 'number'
        ? merged['searchMaxResults']
        : DEFAULT_SEARCH_MAX_RESULTS,
      webSearchTimeoutMs: typeof merged['webSearchTimeoutMs'] === 'number'
        ? merged['webSearchTimeoutMs']
        : DEFAULT_WEB_SEARCH_TIMEOUT_MS,
      xSearchTimeoutMs: typeof merged['xSearchTimeoutMs'] === 'number'
        ? merged['xSearchTimeoutMs']
        : DEFAULT_X_SEARCH_TIMEOUT_MS,
    },
    sources,
  }
}
