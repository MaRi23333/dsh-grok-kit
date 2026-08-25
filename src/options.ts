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

const OPTIONS_VERSION = 1
const OPTIONS_FILENAME = '.dsh-grok-kit-options.json'

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function positiveFinite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
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
  if (typeof raw['searchModel'] === 'string' && raw['searchModel'].trim().length > 0) {
    out['searchModel'] = raw['searchModel'].trim()
  }
  const maxResults = positiveFinite(raw['searchMaxResults'])
  if (maxResults !== undefined) out['searchMaxResults'] = Math.trunc(maxResults)
  const webTimeout = positiveFinite(raw['webSearchTimeoutMs'])
  if (webTimeout !== undefined) out['webSearchTimeoutMs'] = Math.trunc(webTimeout)
  const xTimeout = positiveFinite(raw['xSearchTimeoutMs'])
  if (xTimeout !== undefined) out['xSearchTimeoutMs'] = Math.trunc(xTimeout)
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
