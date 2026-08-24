//

// Derived from dsh-xai (https://github.com/MirDie/dsh-xai), Apache-2.0.

// Modified for dsh-grok-kit — see NOTICE for the full attribution.

//

/**
 * Account-specific Grok catalog: live GET /v1/models merged onto the installed
 * pi-ai descriptors. Failures keep the last good list, then the static catalog.
 * @module dsh-grok-kit/catalog
 */

import type { Api, Model } from '@earendil-works/pi-ai'
import { xaiProvider } from '@earendil-works/pi-ai/providers/xai'
import { DEFAULT_XAI_OAUTH_MODEL, PREFERRED_XAI_OAUTH_MODEL } from './ids.ts'

export const XAI_MODELS_URL = 'https://api.x.ai/v1/models'
const BODY_LIMIT_BYTES = 4 * 1024 * 1024

export type CatalogSource = 'live' | 'cache' | 'fallback'

const COMPOSER_ALLOWLIST = new Set([
  'grok-4.3',
  'grok-4.5',
  'grok-4.6',
])

/**
 * Hand-written grok-4.6 descriptor. pi-ai's installed xai.json does not ship
 * this id; live listings inherit from grok-4.5 unless this entry is first.
 * `asHarnessModels` rewrites `provider` to the harness route.
 */
export const GROK_46_MODEL: Model<'openai-responses'> = {
  id: 'grok-4.6',
  name: 'Grok 4.6',
  api: 'openai-responses',
  provider: 'xai',
  baseUrl: 'https://api.x.ai/v1',
  reasoning: true,
  input: ['text', 'image'],
  cost: { input: 2, output: 6, cacheRead: 0.3, cacheWrite: 0 },
  contextWindow: 500_000,
  maxTokens: 500_000,
  thinkingLevelMap: {
    off: null,
    minimal: null,
    low: 'low',
    medium: 'medium',
    high: 'high',
    xhigh: 'xhigh',
    max: null,
  },
  compat: { supportsLongCacheRetention: false },
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Pull model ids from an OpenAI-shaped or gateway-shaped listing body. */
export function extractModelIds(body: unknown): string[] {
  const rows = Array.isArray(body)
    ? body
    : isRecord(body) && Array.isArray(body['data'])
      ? body['data']
      : isRecord(body) && Array.isArray(body['models'])
        ? body['models']
        : []
  const ids: string[] = []
  for (const row of rows) {
    if (typeof row === 'string' && row.length > 0) ids.push(row)
    else if (isRecord(row) && typeof row['id'] === 'string' && row['id'].length > 0) ids.push(row['id'])
  }
  return [...new Set(ids)]
}

function titleCaseId(id: string): string {
  return id
    .split(/[-_]/g)
    .map(part => part.length === 0 ? part : part[0]!.toUpperCase() + part.slice(1))
    .join(' ')
}

/**
 * Composer / Settings picker filter: only mainline Grok chat models.
 * A mainline id is a plain `<major>[.<minor>]` version (grok-4.5, grok-4.6,
 * future grok-4.7 / grok-5, …); the allowlist keeps known ids explicit.
 * Variants — grok-build-0.1, grok-code-fast, Imagine / video / embedding /
 * TTS — are hidden from BOTH the composer and the Settings list, so the
 * picker stays a Grok-chat-model selector.
 */
export function isComposerChatModel(id: string): boolean {
  if (COMPOSER_ALLOWLIST.has(id)) return true
  return /^grok-\d+(\.\d+)?$/i.test(id)
}

export function catalogModels(baseline: readonly Model<Api>[] = xaiProvider().getModels()): readonly Model<Api>[] {
  const rest = baseline.filter(model => model.id !== GROK_46_MODEL.id)
  return [GROK_46_MODEL, ...rest]
}

function templateFor(id: string, catalog: readonly Model<Api>[]): Model<Api> {
  const exact = catalog.find(model => model.id === id)
  if (exact !== undefined) return exact
  const lower = id.toLowerCase()
  const fallback = catalog.find(model => model.id === DEFAULT_XAI_OAUTH_MODEL) ?? catalog[0]
  if (fallback === undefined) throw new Error('xai-oauth: installed xAI catalog is empty')
  if (lower.includes('build') || lower.includes('code-fast')) {
    return catalog.find(model => model.id === 'grok-build-0.1') ?? fallback
  }
  if (/^grok-\d+(\.\d+)?$/i.test(lower) || lower.includes('reasoning')) {
    return catalog.find(model => model.id === PREFERRED_XAI_OAUTH_MODEL) ?? GROK_46_MODEL
  }
  if (/grok-4\.5/.test(lower)) {
    return catalog.find(model => model.id === DEFAULT_XAI_OAUTH_MODEL) ?? fallback
  }
  return fallback
}

/** Turn a live id into a pi-ai model, inheriting catalog metadata when possible. */
export function materializeLiveModel(id: string, catalog: readonly Model<Api>[] = catalogModels()): Model<Api> {
  const template = templateFor(id, catalog)
  if (template.id === id) return template
  return { ...template, id, name: titleCaseId(id) }
}

/**
 * If `liveIds` is missing or empty, serve the installed catalog.
 * Otherwise serve only the live ids, each materialized against the catalog.
 * Non-chat ids (Imagine / video / embedding / TTS) are dropped in both cases.
 */
export function mergeLiveCatalog(
  catalog: readonly Model<Api>[],
  liveIds: readonly string[] | undefined,
): Model<Api>[] {
  const source = liveIds === undefined || liveIds.length === 0
    ? [...catalog]
    : liveIds.map(id => materializeLiveModel(id, catalog))
  return source.filter(model => isComposerChatModel(model.id))
}

export function preferredXaiOAuthModelFrom(models: readonly { id: string }[]): string {
  const ids = new Set(models.map(model => model.id))
  if (ids.has(PREFERRED_XAI_OAUTH_MODEL)) return PREFERRED_XAI_OAUTH_MODEL
  if (ids.has(DEFAULT_XAI_OAUTH_MODEL)) return DEFAULT_XAI_OAUTH_MODEL
  return models[0]?.id ?? DEFAULT_XAI_OAUTH_MODEL
}

/** Drop non-chat ids from a saved picker selection. Empty → undefined (caller falls back). */
export function filterSelectedChatModelIds(ids: readonly string[]): string[] | undefined {
  const selected = [...new Set(ids.filter(id => id.length > 0 && isComposerChatModel(id)))]
  return selected.length === 0 ? undefined : selected
}

/** Fetch the account-visible model ids. Throws a secret-free error on failure. */
export async function fetchLiveModelIds(
  accessToken: string,
  signal?: AbortSignal,
): Promise<string[]> {
  let response: Response
  try {
    response = await fetch(XAI_MODELS_URL, {
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${accessToken}`,
      },
      signal,
    })
  } catch (error) {
    if (signal?.aborted) throw new Error('Live model listing was cancelled')
    throw new Error('xAI model listing is unreachable')
  }
  const raw = Buffer.from(await response.arrayBuffer())
  if (raw.byteLength > BODY_LIMIT_BYTES) {
    throw new Error('xAI model listing exceeded the 4 MiB read ceiling')
  }
  let body: unknown
  try {
    body = JSON.parse(raw.toString('utf8'))
  } catch {
    throw new Error(`xAI model listing returned invalid JSON (HTTP ${response.status})`)
  }
  if (!response.ok) {
    const code = isRecord(body) && typeof body['error'] === 'string' ? body['error'] : undefined
    throw new Error(`xAI model listing failed (HTTP ${response.status})${code === undefined ? '' : `: ${code}`}`)
  }
  const ids = extractModelIds(body)
  if (ids.length === 0) throw new Error('xAI model listing contained no model ids')
  return ids
}
