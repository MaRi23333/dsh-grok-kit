/**
 * Client-side bookkeeping for xAI stateful Responses (store + previous_response_id).
 * Fingerprints are hashes of client-originated input items; the search corpus
 * itself never lives here.
 * @module dsh-grok-kit/response-chain
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'

const CHAINS_VERSION = 1
const CHAINS_FILENAME = '.dsh-grok-kit-chains.json'
const MAX_CHAINS = 64

export interface ResponseChainRecord {
  responseId: string
  fingerprints: string[]
  model: string
  updatedAt: number
  /** Only `stop` may continue. `toolUse` means DSH will send tool results next. */
  stopReason: string
}

export interface ResponseChainStore {
  get(sessionId: string): ResponseChainRecord | undefined
  set(sessionId: string, record: ResponseChainRecord): void
  delete(sessionId: string): void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isENOENT(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT'
}

function itemRole(item: Record<string, unknown>): string | undefined {
  return typeof item['role'] === 'string' ? item['role'] : undefined
}

export function isToolOutputInputItem(item: unknown): boolean {
  if (!isRecord(item)) return false
  const type = item['type']
  return type === 'function_call_output' || type === 'custom_tool_call_output'
}

export function isUserInputItem(item: unknown): boolean {
  if (!isRecord(item)) return false
  const role = itemRole(item)
  if (role === 'user') return true
  return item['type'] === 'message' && role === 'user'
}

/** User / system messages and local tool results — not model output. */
export function isClientOriginatedInputItem(item: unknown): boolean {
  if (!isRecord(item)) return false
  if (isToolOutputInputItem(item)) return true
  const role = itemRole(item)
  if (role === 'user' || role === 'system' || role === 'developer') return true
  if (item['type'] === 'message' && (role === 'user' || role === 'system' || role === 'developer')) return true
  return false
}

export function extractClientInputItems(input: unknown): unknown[] {
  if (!Array.isArray(input)) return []
  return input.filter(isClientOriginatedInputItem)
}

export function fingerprintInputItem(item: unknown): string {
  return createHash('sha256').update(JSON.stringify(item)).digest('hex')
}

export function clientInputDelta(
  previousFingerprints: readonly string[],
  currentItems: readonly unknown[],
): { kind: 'reset' } | { kind: 'delta'; items: unknown[] } {
  const currentFingerprints = currentItems.map(fingerprintInputItem)
  if (currentFingerprints.length < previousFingerprints.length) return { kind: 'reset' }
  for (let index = 0; index < previousFingerprints.length; index += 1) {
    if (currentFingerprints[index] !== previousFingerprints[index]) return { kind: 'reset' }
  }
  const items = currentItems.slice(previousFingerprints.length)
  if (items.length === 0) return { kind: 'reset' }
  return { kind: 'delta', items }
}

export function applyStatefulContinuation(
  payload: Record<string, unknown>,
  options: {
    sessionId: string
    modelId: string
    store: ResponseChainStore
    forceFullReplay?: boolean
  },
): { payload: Record<string, unknown>; fingerprints: string[]; usedPrevious: boolean } {
  const params: Record<string, unknown> = { ...payload, store: true }
  const currentItems = extractClientInputItems(params['input'])
  const fingerprints = currentItems.map(fingerprintInputItem)
  if (options.forceFullReplay === true) {
    delete params['previous_response_id']
    return { payload: params, fingerprints, usedPrevious: false }
  }
  const previous = options.store.get(options.sessionId)
  if (previous === undefined || previous.model !== options.modelId || previous.stopReason !== 'stop') {
    delete params['previous_response_id']
    return { payload: params, fingerprints, usedPrevious: false }
  }
  const delta = clientInputDelta(previous.fingerprints, currentItems)
  if (delta.kind === 'reset') {
    delete params['previous_response_id']
    return { payload: params, fingerprints, usedPrevious: false }
  }
  // Same-turn tool follow-up (x_keyword_search stub, bash, …): the stored
  // response already has the assistant writeup. Chaining previous_response_id
  // makes xAI emit a *new* message, so Grok reprints the search text.
  // DSH also injects snapshot user messages; only chain on a completed stop
  // plus a real new user item in the delta.
  if (!delta.items.some(isUserInputItem)) {
    delete params['previous_response_id']
    return { payload: params, fingerprints, usedPrevious: false }
  }
  params['previous_response_id'] = previous.responseId
  params['input'] = delta.items
  return { payload: params, fingerprints, usedPrevious: true }
}

function chainsPath(dshHome?: string): string {
  return resolve(join(resolveDshHome(dshHome), CHAINS_FILENAME))
}

function parseDocument(text: string): Record<string, ResponseChainRecord> {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return {}
  }
  if (!isRecord(value) || value['version'] !== CHAINS_VERSION || !isRecord(value['sessions'])) return {}
  const sessions = value['sessions']
  const out: Record<string, ResponseChainRecord> = {}
  for (const [sessionId, raw] of Object.entries(sessions)) {
    if (!isRecord(raw) || typeof raw['responseId'] !== 'string' || typeof raw['model'] !== 'string') continue
    if (!Array.isArray(raw['fingerprints']) || raw['fingerprints'].some(item => typeof item !== 'string')) continue
    const updatedAt = typeof raw['updatedAt'] === 'number' ? raw['updatedAt'] : 0
    const stopReason = typeof raw['stopReason'] === 'string' ? raw['stopReason'] : ''
    out[sessionId] = {
      responseId: raw['responseId'],
      fingerprints: [...raw['fingerprints']],
      model: raw['model'],
      updatedAt,
      stopReason,
    }
  }
  return out
}

/** File-backed chain store. Writes are fire-and-forget after the in-memory map updates. */
export function createFileResponseChainStore(dshHome?: string): ResponseChainStore {
  const file = chainsPath(dshHome)
  let sessions: Record<string, ResponseChainRecord> = {}
  try {
    sessions = parseDocument(readFileSync(file, 'utf8'))
  } catch (error) {
    if (!isENOENT(error)) sessions = {}
  }

  const persist = (): void => {
    const entries = Object.entries(sessions).sort((left, right) => right[1].updatedAt - left[1].updatedAt)
    if (entries.length > MAX_CHAINS) {
      sessions = Object.fromEntries(entries.slice(0, MAX_CHAINS))
    }
    void writeFileAtomic(file, `${JSON.stringify({ version: CHAINS_VERSION, sessions }, null, 2)}\n`, { mode: 0o600 })
      .catch(() => undefined)
  }

  return {
    get(sessionId) {
      return sessions[sessionId]
    },
    set(sessionId, record) {
      sessions[sessionId] = record
      persist()
    },
    delete(sessionId) {
      if (sessions[sessionId] === undefined) return
      delete sessions[sessionId]
      persist()
    },
  }
}

export function createMemoryResponseChainStore(
  initial: Record<string, ResponseChainRecord> = {},
): ResponseChainStore {
  const sessions = { ...initial }
  return {
    get(sessionId) {
      return sessions[sessionId]
    },
    set(sessionId, record) {
      sessions[sessionId] = record
    },
    delete(sessionId) {
      delete sessions[sessionId]
    },
  }
}
