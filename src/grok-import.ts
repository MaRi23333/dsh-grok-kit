/**
 * Grok CLI auth.json: parse, probe, and write-in-place.
 * When the store points at this file, dsh login/refresh/logout mutate the
 * same document Grok CLI reads — one refresh-token rotation, not a copy.
 * @module dsh-grok-kit/grok-import
 */

import { readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import type { OAuthCredential } from '@earendil-works/pi-ai'
import { XAI_PI_PROVIDER } from './ids.ts'
import type { XaiOAuthCredentialStore } from './store.ts'

const DEFAULT_TOKEN_LIFETIME_MS = 60 * 60 * 1000
/** Same client id pi-ai / Grok CLI use for the device-code grant. */
export const GROK_XAI_CLIENT_ID = 'b1a00492-073a-47ea-816f-4c329264a828'
export const GROK_XAI_ISSUER = 'https://auth.x.ai'
export const GROK_XAI_SLOT_KEY = `${GROK_XAI_ISSUER}::${GROK_XAI_CLIENT_ID}`

export interface GrokImportProbe {
  available: boolean
  path: string
}

function isENOENT(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function firstString(record: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = nonEmptyString(record[key])
    if (value !== undefined) return value
  }
  return undefined
}

function parseTime(value: string): number {
  const parsed = Date.parse(value)
  if (Number.isFinite(parsed) && parsed > 0) return parsed
  const trimmed = value.replace(/(\.\d{3})\d+/, '$1')
  const again = Date.parse(trimmed)
  return Number.isFinite(again) && again > 0 ? again : Number.NaN
}

function parseExpires(record: Record<string, unknown>): number {
  const expiresAt = record['expires_at']
  if (typeof expiresAt === 'string' && expiresAt.length > 0) {
    const parsed = parseTime(expiresAt)
    if (Number.isFinite(parsed)) return parsed
  }
  if (typeof expiresAt === 'number' && Number.isFinite(expiresAt) && expiresAt > 0) {
    return expiresAt < 1_000_000_000_000 ? expiresAt * 1000 : expiresAt
  }
  const expires = record['expires']
  if (typeof expires === 'number' && Number.isFinite(expires) && expires > 0) {
    return expires < 1_000_000_000_000 ? expires * 1000 : expires
  }
  const expiresIn = record['expires_in']
  if (typeof expiresIn === 'number' && Number.isFinite(expiresIn) && expiresIn > 0) {
    return Date.now() + expiresIn * 1000
  }
  return Date.now() + DEFAULT_TOKEN_LIFETIME_MS
}

interface Candidate {
  credential: OAuthCredential
  preferred: boolean
}

function walk(value: unknown, key: string): Candidate[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => walk(item, `${key}[${index}]`))
  if (!isRecord(value)) return []
  const access = firstString(value, ['key', 'access', 'access_token'])
  const refresh = firstString(value, ['refresh_token', 'refresh'])
  if (access !== undefined && refresh !== undefined) {
    const issuer = firstString(value, ['oidc_issuer', 'issuer'])
    const preferred = key.includes('auth.x.ai')
      || (issuer !== undefined && issuer.includes('auth.x.ai'))
    const accountId = firstString(value, ['user_id', 'accountId', 'principal_id'])
    const credential: OAuthCredential = {
      type: 'oauth',
      access,
      refresh,
      expires: parseExpires(value),
      ...accountId === undefined ? {} : { accountId },
    }
    return [{ credential, preferred }]
  }
  return Object.entries(value).flatMap(([child, nested]) => walk(nested, child))
}

/** Resolve the Grok CLI auth document. */
export function grokAuthPath(home: string = homedir()): string {
  return resolve(join(home, '.grok', 'auth.json'))
}

/** True when `filename` is the Grok CLI auth document (`~/.grok/auth.json`). */
export function isGrokAuthPath(filename: string): boolean {
  const normalized = resolve(filename).replaceAll('\\', '/')
  return normalized.endsWith('/.grok/auth.json')
}

/** True when the JSON is a Grok CLI multi-slot document, not the dsh v1 envelope. */
export function isGrokAuthDocument(value: unknown): boolean {
  if (!isRecord(value) || ('version' in value && 'credential' in value)) return false
  if (Object.keys(value).length === 0) return true
  return walk(value, '').length > 0
}

function formatExpiresAt(expires: number): string {
  return new Date(expires).toISOString()
}

function slotRecord(document: Record<string, unknown>): { key: string; slot: Record<string, unknown> } | undefined {
  if (isRecord(document[GROK_XAI_SLOT_KEY])) {
    return { key: GROK_XAI_SLOT_KEY, slot: document[GROK_XAI_SLOT_KEY] }
  }
  for (const [key, nested] of Object.entries(document)) {
    if (!isRecord(nested)) continue
    const issuer = firstString(nested, ['oidc_issuer', 'issuer'])
    if (key.includes('auth.x.ai') || (issuer !== undefined && issuer.includes('auth.x.ai'))) {
      return { key, slot: nested }
    }
  }
  return undefined
}

/**
 * Write an OAuth credential back into a Grok CLI document, preserving every
 * unrelated slot and every extra field on the xAI slot (email, names, …).
 */
export function writeGrokAuthDocument(existingText: string | undefined, credential: OAuthCredential): string {
  let document: Record<string, unknown> = {}
  if (existingText !== undefined && existingText.trim().length > 0) {
    const parsed = JSON.parse(existingText) as unknown
    if (!isRecord(parsed)) throw new Error('xai-oauth: Grok CLI auth file must contain an object')
    document = { ...parsed }
  }
  const found = slotRecord(document)
  const key = found?.key ?? GROK_XAI_SLOT_KEY
  const previous = found?.slot ?? {}
  const slot: Record<string, unknown> = {
    ...previous,
    key: credential.access,
    refresh_token: credential.refresh,
    expires_at: formatExpiresAt(credential.expires),
    oidc_issuer: nonEmptyString(previous['oidc_issuer']) ?? GROK_XAI_ISSUER,
    oidc_client_id: nonEmptyString(previous['oidc_client_id']) ?? GROK_XAI_CLIENT_ID,
  }
  if (credential.accountId !== undefined) slot['user_id'] = credential.accountId
  document[key] = slot
  return `${JSON.stringify(document, null, 2)}\n`
}

/** Drop the xAI slot. Returns undefined when the document would be empty (caller should unlink). */
export function removeGrokAuthSlot(existingText: string): string | undefined {
  const parsed = JSON.parse(existingText) as unknown
  if (!isRecord(parsed)) return undefined
  const document = { ...parsed }
  const found = slotRecord(document)
  if (found !== undefined) delete document[found.key]
  return Object.keys(document).length === 0 ? undefined : `${JSON.stringify(document, null, 2)}\n`
}

/** Parse a Grok CLI / generic OAuth document into a pi-ai credential. */
export function parseGrokAuthDocument(text: string, filename: string): OAuthCredential {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error(`xai-oauth: ${filename} is not valid JSON`)
  }
  const candidates = walk(value, '')
  if (candidates.length === 0) {
    throw new Error(`xai-oauth: ${filename} does not contain a Grok OAuth refresh token`)
  }
  const preferred = candidates.find(candidate => candidate.preferred)
  if (preferred !== undefined) return preferred.credential
  // No auth.x.ai marker: accept only an unambiguous single-credential document.
  // Importing an arbitrary first pair from a multi-provider document would
  // write a foreign refresh token into the dsh store and POST it to auth.x.ai.
  if (candidates.length === 1) return candidates[0]!.credential
  throw new Error(
    `xai-oauth: ${filename} contains ${candidates.length} credential pairs and none marks auth.x.ai;`
    + ' re-run `grok login` to write the standard document, or export the xAI credential explicitly',
  )
}

/** Whether ~/.grok/auth.json exists and looks importable. Never returns secrets. */
export async function probeGrokAuth(filename: string = grokAuthPath()): Promise<GrokImportProbe> {
  try {
    await stat(filename)
    const text = await readFile(filename, 'utf8')
    parseGrokAuthDocument(text, filename)
    return { available: true, path: filename }
  } catch (error) {
    if (isENOENT(error)) return { available: false, path: filename }
    return { available: false, path: filename }
  }
}

/** Copy Grok CLI tokens into the store. No-op write when the store already is that file. */
export async function importGrokAuth(
  store: XaiOAuthCredentialStore,
  filename: string = grokAuthPath(),
): Promise<OAuthCredential> {
  let text: string
  try {
    text = await readFile(filename, 'utf8')
  } catch (error) {
    if (isENOENT(error)) throw new Error(`xai-oauth: Grok CLI auth file not found at ${filename}`)
    throw error
  }
  const credential = parseGrokAuthDocument(text, filename)
  const written = await store.modify(XAI_PI_PROVIDER, async () => credential)
  if (written === undefined || written.type !== 'oauth') {
    throw new Error('xai-oauth: failed to persist the imported Grok credential')
  }
  return written
}
