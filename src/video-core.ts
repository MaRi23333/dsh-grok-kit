/**
 * Grok Imagine video task core (image-to-video over POST /v1/videos/generations).
 *
 * Task lifecycle only: submit once → poll once per call → download the finished
 * MP4 into the DSH attachment store. Local JSON state (never tokens, never the
 * signed remote URL) survives restarts so `grok_video_status` can resume.
 *
 * Safety rules baked in here:
 *   - submission results that never reached the client are recorded as
 *     `submission-unknown` and are NEVER re-POSTed automatically (no double billing);
 *   - downloads use a separate token-free fetch against an exact official host
 *     allowlist, refuse redirects, enforce a streamed byte cap, and check the
 *     MP4 signature before anything is committed;
 *   - the remote signed URL is never persisted, returned, or echoed in errors;
 *   - tasks are partitioned by OAuth identity: switching accounts mid-operation
 *     aborts the operation instead of leaking results across accounts.
 *
 * Source images reuse imagine-edit-core's resolver (attachment handle / local
 * path / data URI). Local paths need a caller-provided reader (the tool layer
 * passes the sandboxed host fs); this module never falls back to bare node fs.
 * @module dsh-grok-kit/video-core
 */

import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import type { AttachmentStore, FileAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { fetchWithBearer } from './bearer-guard.ts'
import type { XaiOAuthTokenSource } from './token-source.ts'
import { safeMessage } from './redact.ts'
import { sanitizeDiagnosticMessage } from './capabilities.ts'
import {
  DEFAULT_MAX_IMAGE_BYTES,
  resolveImageSources,
  type EditAttachmentRef,
} from './imagine-edit-core.ts'
import {
  DEFAULT_VIDEO_MAX_BYTES,
  DEFAULT_VIDEO_MODEL,
  MAX_VIDEO_MAX_BYTES,
} from './video-config.ts'

/** xAI video submission endpoint (async: returns a request id for polling). */
export const XAI_VIDEO_GENERATIONS_URL = 'https://api.x.ai/v1/videos/generations'
/** xAI video status endpoint; the request id is an opaque remote handle, never a local path. */
export function xaiVideoStatusUrl(requestId: string): string {
  return `https://api.x.ai/v1/videos/${encodeURIComponent(requestId)}`
}

/** First-version supported durations (official contract allows 1–15s). */
export const SUPPORTED_VIDEO_DURATIONS = [6, 10] as const
/** First-version supported resolutions (official contract also offers 1080p). */
export const SUPPORTED_VIDEO_RESOLUTIONS = ['480p', '720p'] as const
/**
 * Exact https hosts whose signed video URLs may be downloaded. Anything else
 * is refused outright, which keeps the first version free of generic
 * DNS/SSRF handling; redirects are disabled below as the second layer.
 */
export const ALLOWED_VIDEO_DOWNLOAD_HOSTS = ['vidgen.x.ai'] as const

export const VIDEO_SUBMIT_TIMEOUT_MS = 120_000
export const VIDEO_POLL_TIMEOUT_MS = 30_000
export const VIDEO_DOWNLOAD_TIMEOUT_MS = 300_000

/** Bounded store read; a bigger file is treated as corruption, not silently truncated. */
const MAX_STORE_BYTES = 2 * 1024 * 1024
/** Retention: the newest tasks survive, older records are pruned on write. */
const MAX_STORE_TASKS = 50
/** Bounded JSON body read for submission/status responses. */
const MAX_JSON_RESPONSE_BYTES = 256 * 1024
const MAX_PROMPT_CHARS = 4000
const MAX_ERROR_CHARS = 1000

const STORE_VERSION = 1
const STORE_DIRNAME = 'dsh-grok-kit'
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u

export type VideoTaskState = 'pending' | 'downloading' | 'done' | 'failed' | 'interrupted' | 'submission-unknown'

const VIDEO_TASK_STATES: readonly VideoTaskState[] = ['pending', 'downloading', 'done', 'failed', 'interrupted', 'submission-unknown']

/** Safe-to-JSON task summary: no tokens, no remote URLs, no request ids. */
export interface VideoTaskResult {
  taskId: string
  state: VideoTaskState
  model: string
  createdAt: string
  updatedAt: string
  prompt: string
  duration?: number
  resolution?: string
  attachment?: FileAttachmentRef
  error?: string
}

/** Persisted record: the public result plus the identity partition and the internal remote handle. */
interface VideoTaskRecord extends VideoTaskResult {
  identity: string
  requestId?: string
}

export interface VideoCapabilityEvent {
  /** Identity captured by the originating operation, never the later active account. */
  identity: string
  state: 'available' | 'restricted' | 'temporary-error'
  checkedAt: string
  model: string
  httpStatus?: number
  message?: string
}

export interface VideoTaskManagerOptions {
  tokens: XaiOAuthTokenSource
  resolveAttachments: () => AttachmentStore | undefined
  /**
   * Stable OAuth account identity used to partition persisted tasks. Production
   * must supply it; without one every operation fails closed (list() returns []).
   */
  identity?: () => Promise<string | undefined>
  fetch?: typeof fetch
  /** Explicit store file; identities are still filtered per record. Default: DSH_HOME/dsh-grok-kit/. */
  storePath?: string
  model?: string
  maxVideoBytes?: number
  onCapability?: (event: VideoCapabilityEvent) => void
}

/** Optional caller-provided source-image context (the tool layer supplies the sandboxed host fs). */
export interface VideoSourceContext {
  cwd?: string
  readFile?: (path: string, signal?: AbortSignal) => Promise<Uint8Array>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function boundedString(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  return value.length > max ? value.slice(0, max) : value
}

/** Strip anything URL-shaped so signed remote links never reach disk or the UI. */
function redactRemoteUrls(text: string): string {
  return text.replace(/https?:\/\/\S+/giu, '[link redacted]')
}

function errorText(error: unknown): string {
  return redactRemoteUrls(sanitizeDiagnosticMessage(safeMessage(error))).slice(0, MAX_ERROR_CHARS)
}

function isVideoTaskState(value: unknown): value is VideoTaskState {
  return typeof value === 'string' && (VIDEO_TASK_STATES as readonly string[]).includes(value)
}

/** Accept only well-formed persisted records; anything else is skipped. */
function sanitizeRecord(value: unknown): VideoTaskRecord | undefined {
  if (!isRecord(value)) return undefined
  const taskId = boundedString(value.taskId, 128)
  const identity = boundedString(value.identity, 256)
  const state = value.state
  const model = boundedString(value.model, 128)
  const createdAt = boundedString(value.createdAt, 64)
  const updatedAt = boundedString(value.updatedAt, 64)
  const prompt = boundedString(value.prompt, MAX_PROMPT_CHARS + 16)
  if (
    taskId === undefined || taskId.length === 0
    || identity === undefined || identity.length === 0
    || !isVideoTaskState(state)
    || model === undefined || createdAt === undefined || updatedAt === undefined || prompt === undefined
  ) return undefined
  const record: VideoTaskRecord = { taskId, identity, state, model, createdAt, updatedAt, prompt }
  const requestId = boundedString(value.requestId, 256)
  if (requestId !== undefined && REQUEST_ID_PATTERN.test(requestId)) record.requestId = requestId
  if (typeof value.duration === 'number' && Number.isSafeInteger(value.duration)) record.duration = value.duration
  if (typeof value.resolution === 'string') record.resolution = value.resolution
  if (isRecord(value.attachment)) {
    const attachmentId = boundedString(value.attachment.attachmentId, 256)
    const name = boundedString(value.attachment.name, 256)
    if (attachmentId !== undefined && name !== undefined && typeof value.attachment.bytes === 'number' && Number.isSafeInteger(value.attachment.bytes)) {
      record.attachment = {
        attachmentId: attachmentId as FileAttachmentRef['attachmentId'],
        name,
        bytes: value.attachment.bytes,
      }
    }
  }
  const error = boundedString(value.error, MAX_ERROR_CHARS)
  if (error !== undefined) record.error = error
  return record
}

function toResult(record: VideoTaskRecord): VideoTaskResult {
  const result: VideoTaskResult = {
    taskId: record.taskId,
    state: record.state,
    model: record.model,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    prompt: record.prompt,
  }
  if (record.duration !== undefined) result.duration = record.duration
  if (record.resolution !== undefined) result.resolution = record.resolution
  if (record.attachment !== undefined) result.attachment = record.attachment
  if (record.error !== undefined) result.error = record.error
  return result
}

/** Structured timeout/abort bundle: one request = one timeout, no background timers. */
function withTimeout(signals: ReadonlyArray<AbortSignal | undefined>, ms: number, label: string): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error(`${label} timed out after ${String(ms)}ms`)), ms)
  const cleanups: Array<() => void> = [() => clearTimeout(timer)]
  for (const signal of signals) {
    if (signal === undefined) continue
    const onAbort = () => controller.abort(signal.reason)
    if (signal.aborted) controller.abort(signal.reason)
    else {
      signal.addEventListener('abort', onAbort, { once: true })
      cleanups.push(() => signal.removeEventListener('abort', onAbort))
    }
  }
  return { signal: controller.signal, cancel: () => { for (const cleanup of cleanups) cleanup() } }
}

/** Await a shared task operation while still honouring a caller's own cancellation. */
function waitForOperation<T>(pending: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  signal?.throwIfAborted()
  if (signal === undefined) return pending
  return new Promise<T>((resolvePromise, rejectPromise) => {
    const onAbort = () => rejectPromise(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
    pending.then(resolvePromise, rejectPromise).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

interface ChunkReader {
  read(): Promise<{ done: boolean; value?: unknown }>
  cancel?(reason?: unknown): Promise<void>
  releaseLock?: () => void
}

function chunkReaderOf(body: unknown): ChunkReader | undefined {
  if (body === null || typeof body !== 'object') return undefined
  const getReader = (body as { getReader?: unknown }).getReader
  if (typeof getReader !== 'function') return undefined
  return (getReader as () => ChunkReader).call(body)
}

function chunkToBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  throw new Error('video download returned a non-binary chunk')
}

/**
 * Stream the body under a byte cap, checking the ISO-BMFF signature
 * (`ftyp`/`styp`/`moov` at offset 4) before yielding anything, so a non-MP4
 * payload never reaches the attachment store.
 */
function verifiedMp4Stream(reader: ChunkReader, maxBytes: number): {
  data: AsyncGenerator<Uint8Array>
  close: () => Promise<void>
} {
  const tooLarge = () => new Error(`video exceeds the ${String(maxBytes)}-byte download limit`)
  let completed = false
  let closed = false
  const close = async (): Promise<void> => {
    if (closed) return
    closed = true
    try {
      // Also called by the consumer boundary: an async generator's finally
      // does not run if the attachment store fails before its first read.
      if (!completed) await reader.cancel?.(new Error('video stream consumption ended early')).catch(() => undefined)
    } finally {
      reader.releaseLock?.()
    }
  }
  async function* chunks(): AsyncGenerator<Uint8Array> {
    try {
      const head: Uint8Array[] = []
      let headLength = 0
      let total = 0
      while (headLength < 12) {
        const { done, value } = await reader.read()
        if (done) { completed = true; break }
        const chunk = chunkToBytes(value)
        total += chunk.byteLength
        if (total > maxBytes) throw tooLarge()
        head.push(chunk)
        headLength += chunk.byteLength
      }
      const prefix = new Uint8Array(Math.min(headLength, 12))
      let offset = 0
      for (const chunk of head) {
        const take = Math.min(chunk.byteLength, prefix.byteLength - offset)
        prefix.set(chunk.subarray(0, take), offset)
        offset += take
        if (offset >= prefix.byteLength) break
      }
      const box = String.fromCharCode(...prefix.subarray(4, 8))
      if (prefix.byteLength < 12 || (box !== 'ftyp' && box !== 'styp' && box !== 'moov')) {
        throw new Error('downloaded video is not an MP4 file (missing ISO-BMFF signature)')
      }
      for (const chunk of head) yield chunk
      for (;;) {
        const { done, value } = await reader.read()
        if (done) { completed = true; return }
        const chunk = chunkToBytes(value)
        total += chunk.byteLength
        if (total > maxBytes) throw tooLarge()
        yield chunk
      }
    } finally {
      await close()
    }
  }
  return { data: chunks(), close }
}

/** Allowlist check for signed video download URLs (exact official https hosts only). */
export function isAllowedVideoDownloadUrl(raw: unknown): boolean {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return false
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  if (url.username.length > 0 || url.password.length > 0) return false
  const host = url.hostname.toLowerCase()
  if (!(ALLOWED_VIDEO_DOWNLOAD_HOSTS as readonly string[]).includes(host)) return false
  return url.port === '' || url.port === '443'
}

/**
 * Attachment bytes reader for source images, mirroring the imagine-edit tool:
 * a full reference goes through `readImage` (store-verified); a bare id falls
 * back to the host object path plus a sha256 self-check.
 */
export function createAttachmentBytesReader(
  resolveAttachments: () => AttachmentStore | undefined,
  label: string,
): (attachment: { attachmentId: string; ref?: EditAttachmentRef }) => Promise<Uint8Array> {
  return async attachment => {
    const attachments = resolveAttachments() as unknown as {
      readImage?(ref: unknown): Promise<{ data?: Uint8Array } | undefined>
      imageHostPath?(ref: { attachmentId: string }): string | undefined
    } | undefined
    if (attachments === undefined) {
      throw new Error(`${label}: the DSH attachment service is not mounted, so the source image cannot be read`)
    }
    if (attachment.ref !== undefined && typeof attachments.readImage === 'function') {
      const result = await attachments.readImage(attachment.ref)
      const data = result?.data
      if (data instanceof Uint8Array && data.byteLength > 0) return data
      throw new Error(`${label}: attachment ${attachment.attachmentId} returned no bytes`)
    }
    const hostPath = typeof attachments.imageHostPath === 'function'
      ? attachments.imageHostPath({ attachmentId: attachment.attachmentId })
      : undefined
    if (typeof hostPath !== 'string' || hostPath.length === 0) {
      throw new Error(`${label}: attachment ${attachment.attachmentId} is not backed by a readable host object`)
    }
    // Bounded read: refuse oversized host objects before touching their bytes.
    const info = await stat(hostPath)
    if (info.size > DEFAULT_MAX_IMAGE_BYTES) {
      throw new Error(`${label}: attachment ${attachment.attachmentId} is ${String(info.size)} bytes, over the ${String(DEFAULT_MAX_IMAGE_BYTES)}-byte limit`)
    }
    const bytes = new Uint8Array(await readFile(hostPath))
    const digest = createHash('sha256').update(bytes).digest('hex')
    if (`sha256:${digest}` !== attachment.attachmentId) {
      throw new Error(`${label}: attachment ${attachment.attachmentId} failed integrity verification`)
    }
    return bytes
  }
}

/** Drop an unread error body without buffering it (error text never echoes bodies). */
async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel()
  } catch {
    // Best effort: the connection is going away anyway.
  }
}

/** Stream a response body under a hard byte cap; overflow cancels the reader. */
async function readBoundedText(response: Response, what: string): Promise<string> {
  const overLimit = () => new Error(`${what} response body is over the ${String(MAX_JSON_RESPONSE_BYTES)}-byte limit`)
  const declared = response.headers?.get?.('content-length')
  if (declared !== null && declared !== undefined && Number(declared) > MAX_JSON_RESPONSE_BYTES) {
    await discardBody(response)
    throw overLimit()
  }
  const reader = chunkReaderOf(response.body)
  if (reader === undefined) {
    throw new Error(`${what} response body is not streamable; refusing unbounded buffering`)
  }
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = chunkToBytes(value)
      total += chunk.byteLength
      if (total > MAX_JSON_RESPONSE_BYTES) throw overLimit()
      chunks.push(chunk)
    }
  } catch (error) {
    await reader.cancel?.(error).catch(() => undefined)
    throw error
  } finally {
    reader.releaseLock?.()
  }
  return Buffer.concat(chunks.map(chunk => Buffer.from(chunk))).toString('utf8')
}

async function readBoundedJson(response: Response, what: string): Promise<Record<string, unknown>> {
  const text = await readBoundedText(response, what)
  let parsed: unknown
  try {
    parsed = text.length === 0 ? {} : JSON.parse(text)
  } catch {
    throw new Error(`${what} response was not valid JSON`)
  }
  if (!isRecord(parsed)) throw new Error(`${what} response was not a JSON object`)
  return parsed
}

export class VideoTaskManager {
  private readonly options: VideoTaskManagerOptions
  private readonly fetchImpl: typeof fetch
  private readonly model: string
  private readonly maxVideoBytes: number
  private readonly disposeController = new AbortController()
  private readonly polls = new Map<string, {
    promise: Promise<VideoTaskResult>
    controller: AbortController
    waiters: number
    settled: boolean
  }>()
  private disposed = false

  constructor(options: VideoTaskManagerOptions) {
    if (!isRecord(options)) throw new TypeError('VideoTaskManager requires an options object')
    if (typeof options.tokens?.resolve !== 'function') throw new TypeError('VideoTaskManager requires a tokens source')
    if (typeof options.resolveAttachments !== 'function') throw new TypeError('VideoTaskManager requires resolveAttachments')
    if (options.identity !== undefined && typeof options.identity !== 'function') {
      throw new TypeError('VideoTaskManager identity must be a function')
    }
    if (options.storePath !== undefined && (typeof options.storePath !== 'string' || options.storePath.trim().length === 0)) {
      throw new TypeError('VideoTaskManager storePath must be a non-empty string')
    }
    this.model = typeof options.model === 'string' && options.model.trim().length > 0 ? options.model.trim() : DEFAULT_VIDEO_MODEL
    const maxVideoBytes = options.maxVideoBytes ?? DEFAULT_VIDEO_MAX_BYTES
    if (!Number.isSafeInteger(maxVideoBytes) || maxVideoBytes <= 0 || maxVideoBytes > MAX_VIDEO_MAX_BYTES) {
      throw new TypeError(`VideoTaskManager maxVideoBytes must be an integer between 1 and ${String(MAX_VIDEO_MAX_BYTES)}`)
    }
    this.maxVideoBytes = maxVideoBytes
    this.fetchImpl = options.fetch ?? globalThis.fetch
    this.options = options
  }

  /** Submit one image-to-video task. POSTs exactly once; never re-POSTs an unknown outcome. */
  async generate(
    input: { prompt: string; image: string; duration?: number; resolution?: string },
    signal?: AbortSignal,
    source?: VideoSourceContext,
  ): Promise<VideoTaskResult> {
    this.assertNotDisposed()
    if (!isRecord(input)) throw new TypeError('generate requires an input object')
    const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : ''
    if (prompt.length === 0) throw new Error('prompt must be a non-empty string')
    if (prompt.length > MAX_PROMPT_CHARS) throw new Error(`prompt must be at most ${String(MAX_PROMPT_CHARS)} characters`)
    const imageSpec = typeof input.image === 'string' ? input.image.trim() : ''
    if (imageSpec.length === 0) throw new Error('image must be a non-empty source (attachment handle, local path or data URI)')
    const duration = input.duration ?? undefined
    if (duration !== undefined && !(SUPPORTED_VIDEO_DURATIONS as readonly number[]).includes(duration)) {
      throw new Error(`duration must be one of ${SUPPORTED_VIDEO_DURATIONS.join(', ')}`)
    }
    const resolution = input.resolution ?? undefined
    if (resolution !== undefined && !(SUPPORTED_VIDEO_RESOLUTIONS as readonly string[]).includes(resolution)) {
      throw new Error(`resolution must be one of ${SUPPORTED_VIDEO_RESOLUTIONS.join(', ')}`)
    }
    signal?.throwIfAborted()

    const identity = await this.requireIdentity()
    const outputStore = this.options.resolveAttachments()
    if (outputStore === undefined || typeof outputStore.saveFileStream !== 'function') {
      throw new Error('video generation requires file attachment storage before submitting a paid request')
    }
    const readAttachmentBytes = createAttachmentBytesReader(this.options.resolveAttachments, 'grok_video')
    const rejectLocalPaths = async (): Promise<Uint8Array> => {
      throw new Error('local source-image paths need the host filesystem; none was provided to grok_video')
    }
    const images = await resolveImageSources([imageSpec], {
      ...source?.cwd === undefined ? {} : { cwd: source.cwd },
      maxBytes: DEFAULT_MAX_IMAGE_BYTES,
      maxSourceImages: 1,
      readFile: source?.readFile ?? rejectLocalPaths,
      readAttachmentBytes,
    })
    if (images[0].origin === 'url') {
      throw new Error('remote source-image URLs are not accepted in this version; use a session attachment, a local path or a data URI')
    }

    const body: Record<string, unknown> = {
      model: this.model,
      prompt,
      image: { url: images[0].url },
    }
    if (duration !== undefined) body.duration = duration
    if (resolution !== undefined) body.resolution = resolution

    // Identity is re-checked around credential resolution AND again right
    // before every wire request, so a task can never be submitted under a
    // different account than it is filed under.
    await this.assertIdentity(identity)
    const timed = withTimeout([signal, this.disposeController.signal], VIDEO_SUBMIT_TIMEOUT_MS, 'video submission')
    try {
      // getAuth may continue a shared credential rotation; stop waiting without cancelling it.
      const access = await waitForOperation(this.options.tokens.resolve(timed.signal), timed.signal)
      if (typeof access !== 'string' || access.length === 0) {
        throw new Error('grok_video_generate requires a SuperGrok/X OAuth sign-in (Settings → xAI Grok)')
      }
      timed.signal.throwIfAborted()
      const post = (bearer: string) => fetchWithBearer(this.fetchImpl, XAI_VIDEO_GENERATIONS_URL, bearer, {
        method: 'POST',
        redirect: 'error',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          'user-agent': 'dsh-grok-kit/0.2.12',
        },
        body: JSON.stringify(body),
        signal: timed.signal,
      })

      const now = () => new Date().toISOString()
      const startedAt = now()
      const base: VideoTaskRecord = {
        taskId: randomUUID(),
        identity,
        state: 'submission-unknown',
        model: this.model,
        createdAt: startedAt,
        updatedAt: startedAt,
        prompt,
        ...duration === undefined ? {} : { duration },
        ...resolution === undefined ? {} : { resolution },
        error: 'submission started; outcome not recorded yet (never re-POSTed automatically)',
      }
      // Billing-context placeholder written BEFORE the POST: every later outcome
      // updates this same task, so an unknown/cancelled submission is never lost
      // and never silently retried.
      await this.assertIdentity(identity)
      await this.persistRecord(identity, base)
      const update = async (patch: Partial<VideoTaskRecord> & Pick<VideoTaskRecord, 'state'>): Promise<VideoTaskResult> => {
        const record: VideoTaskRecord = { ...base, ...patch, updatedAt: now() }
        // The pre-submit uncertainty is no longer an error once xAI accepted an id.
        if (record.state === 'pending') delete record.error
        await this.assertIdentity(identity)
        await this.persistRecord(identity, record)
        return toResult(record)
      }
      try {
        await this.assertIdentity(identity)
        let response = await post(access)
        if (response.status === 401 && this.options.tokens.refresh !== undefined) {
          // A 401 is an explicit rejection before generation starts, so exactly
          // one refreshed retry is safe; 403/429 must never be treated as token faults.
          const refreshed = await this.options.tokens.refresh(access, timed.signal)
          if (typeof refreshed === 'string' && refreshed.length > 0 && refreshed !== access) {
            await this.assertIdentity(identity)
            response = await post(refreshed)
          }
        }
        if (!response.ok) {
          // A server error may follow queued work: preserve uncertainty to avoid double billing.
          // Publish status only, never the upstream error body.
          await discardBody(response)
          const detail = `HTTP ${String(response.status)}`
          if (response.status === 403) this.emitCapability(identity, 'restricted', response.status, detail)
          else this.emitCapability(identity, 'temporary-error', response.status, detail)
          if (response.status >= 500) {
            return await update({
              state: 'submission-unknown',
              error: `submission result unknown (${detail}); never re-POSTed automatically to avoid double billing`,
            })
          }
          return await update({ state: 'failed', error: `xAI video submission failed (${detail})` })
        }
        const parsed = await readBoundedJson(response, 'video submission')
        const requestId = typeof parsed.request_id === 'string' ? parsed.request_id.trim() : ''
        if (!REQUEST_ID_PATTERN.test(requestId)) {
          this.emitCapability(identity, 'available', 200, undefined)
          return await update({
            state: 'submission-unknown',
            error: 'submission response carried no usable request id; never re-POSTed automatically to avoid double billing',
          })
        }
        this.emitCapability(identity, 'available', 200, undefined)
        return await update({ state: 'pending', requestId })
      } catch (error) {
        // The request may have reached xAI: keep the unknown outcome on the SAME
        // task and never re-POST. A caller abort is rethrown only after the
        // record is safe on disk.
        const record = await update({
          state: 'submission-unknown',
          error: `submission result unknown (${errorText(error)}); never re-POSTed automatically to avoid double billing`,
        })
        this.emitCapability(identity, 'temporary-error', undefined, 'video submission outcome unknown')
        if (signal?.aborted === true) throw signal.reason
        return record
      }
    } finally {
      timed.cancel()
    }
  }

  /** One status poll (concurrent calls for one task merge into a single poll/download). */
  async status(taskId: string, signal?: AbortSignal): Promise<VideoTaskResult> {
    this.assertNotDisposed()
    const id = typeof taskId === 'string' ? taskId.trim() : ''
    if (id.length === 0 || id.length > 128) throw new Error('task_id must be a non-empty task id')
    // Identity resolves BEFORE the merge and keys it, so two accounts can never
    // share one in-flight poll or see each other's result.
    const identity = await this.requireIdentity()
    const key = `${identity}:${id}`
    signal?.throwIfAborted()
    let operation = this.polls.get(key)
    if (operation === undefined) {
      const controller = new AbortController()
      const promise = this.runStatus(identity, id, controller.signal).finally(() => {
        created.settled = true
        if (this.polls.get(key) === created) this.polls.delete(key)
      })
      const created = { controller, waiters: 0, settled: false, promise }
      this.polls.set(key, created)
      operation = created
    }
    // Cancellation belongs to the shared operation, not its first caller.
    // Keep work alive while any waiter remains; cancel local work when all leave.
    operation.waiters += 1
    try {
      const result = await waitForOperation(operation.promise, signal)
      await this.assertIdentity(identity)
      return result
    } finally {
      operation.waiters -= 1
      if (operation.waiters === 0 && !operation.settled) {
        operation.controller.abort(new Error('All video status waiters cancelled'))
      }
    }
  }

  /** Resume is the same single-poll continuation as status (frozen contract). */
  async resume(taskId: string, signal?: AbortSignal): Promise<VideoTaskResult> {
    return this.status(taskId, signal)
  }

  /** Local-only listing: reads the store, never the network. */
  async list(): Promise<VideoTaskResult[]> {
    this.assertNotDisposed()
    const identity = await this.optionalIdentity()
    if (identity === undefined) return []
    const mine = await this.readRecordsFor(identity)
    // Re-check before handing results out: a mid-read account switch must not
    // surface another account's panel.
    await this.assertIdentity(identity)
    return mine
      .map(toResult)
      .sort((a, b) => (a.createdAt === b.createdAt ? a.taskId.localeCompare(b.taskId) : b.createdAt.localeCompare(a.createdAt)))
  }

  /**
   * Cancel local operations only. The remote generation is NOT cancelled and
   * may still complete and bill the account; persisted tasks stay for restart.
   */
  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    this.disposeController.abort(new Error('VideoTaskManager was disposed'))
    this.polls.clear()
  }

  private assertNotDisposed(): void {
    if (this.disposed) throw new Error('VideoTaskManager is disposed')
  }

  private async optionalIdentity(): Promise<string | undefined> {
    if (this.options.identity === undefined) return undefined
    const identity = await this.options.identity()
    if (typeof identity !== 'string' || identity.trim().length === 0) return undefined
    return identity
  }

  /** Fail closed: without a stable account identity no task data may be touched. */
  private async requireIdentity(): Promise<string> {
    const identity = await this.optionalIdentity()
    if (identity === undefined) {
      throw new Error('video tasks require a stable OAuth identity; none is available (fail closed)')
    }
    return identity
  }

  /** Re-check the identity; a mid-operation account switch aborts the operation. */
  private async assertIdentity(expected: string): Promise<void> {
    const current = await this.requireIdentity()
    if (current !== expected) {
      throw new Error('video task identity changed during the operation; aborted to keep accounts isolated')
    }
  }

  private emitCapability(identity: string, state: VideoCapabilityEvent['state'], httpStatus: number | undefined, message: string | undefined): void {
    const onCapability = this.options.onCapability
    if (typeof onCapability !== 'function') return
    // No cross-event dedupe: an account switch must re-observe the capability
    // for the new identity instead of being swallowed as a repeat.
    const event: VideoCapabilityEvent = {
      identity,
      state,
      checkedAt: new Date().toISOString(),
      model: this.model,
      ...httpStatus === undefined ? {} : { httpStatus },
      ...message === undefined || message.length === 0 ? {} : { message: errorText(message) },
    }
    try {
      onCapability(event)
    } catch {
      // Capability reporting must never break task work.
    }
  }

  private async storeFileFor(identity: string): Promise<string> {
    const explicit = this.options.storePath
    if (explicit !== undefined && explicit.trim().length > 0) return resolve(explicit)
    const digest = createHash('sha256').update(identity).digest('hex').slice(0, 16)
    return resolve(join(resolveDshHome(), STORE_DIRNAME, `video-tasks-${digest}.json`))
  }

  /** Bounded, lock-free read of one identity's records (others' records are never returned). */
  private async readRecordsFor(identity: string): Promise<VideoTaskRecord[]> {
    const file = await this.storeFileFor(identity)
    let text: string
    try {
      const info = await stat(file)
      if (info.size > MAX_STORE_BYTES) {
        throw new Error(`video task store exceeds the ${String(MAX_STORE_BYTES)}-byte read limit (${file})`)
      }
      text = await readFile(file, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') return []
      throw error
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new Error(`video task store is corrupt JSON (${file})`)
    }
    if (!isRecord(parsed) || parsed.version !== STORE_VERSION || !Array.isArray(parsed.tasks)) {
      throw new Error(`video task store has an unsupported shape (${file})`)
    }
    return parsed.tasks
      .map(sanitizeRecord)
      .filter((record): record is VideoTaskRecord => record !== undefined && record.identity === identity)
  }

  /** Read-modify-write under the cross-process lock, with identity partitioning and retention. */
  private async persistRecord(identity: string, record: VideoTaskRecord): Promise<void> {
    const file = await this.storeFileFor(identity)
    // withFileLock needs its parent directory to exist before the lock lands.
    await mkdir(dirname(file), { recursive: true, mode: 0o700 })
    await withFileLock(file, async () => {
      const all = await this.readAllRecords(file)
      const others = all.filter(candidate => candidate.identity !== identity)
      const mine = all.filter(candidate => candidate.identity === identity)
      const replaced = mine.filter(candidate => candidate.taskId !== record.taskId)
      // Stable sort ties must favor this write, not evict a just-submitted task.
      replaced.unshift(record)
      // A shared explicit storePath must not let one account evict another's tasks.
      const newest = replaced.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, MAX_STORE_TASKS)
      const pruned = [...others, ...newest]
      const serialized = `${JSON.stringify({ version: STORE_VERSION, tasks: pruned }, null, 2)}\n`
      if (Buffer.byteLength(serialized, 'utf8') > MAX_STORE_BYTES) {
        throw new Error(`video task store would exceed the ${String(MAX_STORE_BYTES)}-byte limit`)
      }
      await writeFileAtomic(file, serialized, {
        mode: 0o600,
        dirMode: 0o700,
      })
    }, { waitMs: 10_000 })
  }

  private async readAllRecords(file: string): Promise<VideoTaskRecord[]> {
    try {
      const info = await stat(file)
      if (info.size > MAX_STORE_BYTES) {
        throw new Error(`video task store exceeds the ${String(MAX_STORE_BYTES)}-byte read limit (${file})`)
      }
      const text = await readFile(file, 'utf8')
      const parsed: unknown = JSON.parse(text)
      if (!isRecord(parsed) || parsed.version !== STORE_VERSION || !Array.isArray(parsed.tasks)) {
        throw new Error(`video task store has an unsupported shape (${file})`)
      }
      return parsed.tasks.map(sanitizeRecord).filter((record): record is VideoTaskRecord => record !== undefined)
    } catch (error) {
      if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') return []
      if (error instanceof SyntaxError) throw new Error(`video task store is corrupt JSON (${file})`)
      throw error
    }
  }

  private async runStatus(identity: string, taskId: string, signal: AbortSignal | undefined): Promise<VideoTaskResult> {
    await this.assertIdentity(identity)
    const records = await this.readRecordsFor(identity)
    const record = records.find(candidate => candidate.taskId === taskId)
    if (record === undefined) throw new Error(`unknown video task ${JSON.stringify(taskId)}`)
    // Terminal states never touch the network again: no re-download, no re-POST.
    if (record.state === 'done' || record.state === 'failed' || record.state === 'submission-unknown') {
      return toResult(record)
    }
    if (record.requestId === undefined) {
      const updated: VideoTaskRecord = {
        ...record,
        state: 'interrupted',
        updatedAt: new Date().toISOString(),
        error: 'task has no usable remote request id; resume cannot continue',
      }
      await this.assertIdentity(identity)
      await this.persistRecord(identity, updated)
      return toResult(updated)
    }

    const pollTimed = withTimeout([signal, this.disposeController.signal], VIDEO_POLL_TIMEOUT_MS, 'video status check')
    let parsed: Record<string, unknown>
    try {
      await this.assertIdentity(identity)
      const access = await waitForOperation(this.options.tokens.resolve(pollTimed.signal), pollTimed.signal)
      if (typeof access !== 'string' || access.length === 0) {
        throw new Error('grok_video_status requires a SuperGrok/X OAuth sign-in (Settings → xAI Grok)')
      }
      const get = (bearer: string) => fetchWithBearer(this.fetchImpl, xaiVideoStatusUrl(record.requestId as string), bearer, {
        method: 'GET',
        redirect: 'error',
        headers: {
          accept: 'application/json',
          'user-agent': 'dsh-grok-kit/0.2.12',
        },
        signal: pollTimed.signal,
      })
      // Right before each wire request the identity is proven once more, so a
      // mid-operation account switch cannot poll with the wrong credential.
      await this.assertIdentity(identity)
      let response = await get(access)
      if (response.status === 401 && this.options.tokens.refresh !== undefined) {
        // GET is idempotent: one refreshed retry after a 401 is always safe.
        const refreshed = await this.options.tokens.refresh(access, pollTimed.signal)
        if (typeof refreshed === 'string' && refreshed.length > 0 && refreshed !== access) {
          await this.assertIdentity(identity)
          response = await get(refreshed)
        }
      }
      if (!response.ok) {
        // Stable status-only message: the error body is discarded, never echoed.
        await discardBody(response)
        const detail = `HTTP ${String(response.status)}`
        if (response.status === 403) this.emitCapability(identity, 'restricted', response.status, detail)
        else this.emitCapability(identity, 'temporary-error', response.status, detail)
        const updated: VideoTaskRecord = {
          ...record,
          state: 'interrupted',
          updatedAt: new Date().toISOString(),
          error: `status check failed (${detail}); call resume to retry`,
        }
        await this.assertIdentity(identity)
        await this.persistRecord(identity, updated)
        return toResult(updated)
      }
      parsed = await readBoundedJson(response, 'video status')
    } catch (error) {
      if (signal?.aborted === true || this.disposeController.signal.aborted) {
        await this.markInterruptedQuietly(identity, record, `cancelled locally (${errorText(error)}); the remote generation is NOT cancelled`)
        throw signal?.aborted ? signal.reason : this.disposeController.signal.reason
      }
      this.emitCapability(identity, 'temporary-error', undefined, 'video status check failed')
      const updated: VideoTaskRecord = {
        ...record,
        state: 'interrupted',
        updatedAt: new Date().toISOString(),
        error: `${errorText(error)}; call resume to retry`,
      }
      await this.assertIdentity(identity)
      await this.persistRecord(identity, updated)
      return toResult(updated)
    } finally {
      pollTimed.cancel()
    }

    const remoteStatus = typeof parsed.status === 'string' ? parsed.status.trim() : ''
    if (remoteStatus === 'failed' || remoteStatus === 'expired') {
      this.emitCapability(identity, 'available', 200, undefined)
      const updated: VideoTaskRecord = {
        ...record,
        state: 'failed',
        updatedAt: new Date().toISOString(),
        error: `video generation ${remoteStatus}`,
      }
      await this.assertIdentity(identity)
      await this.persistRecord(identity, updated)
      return toResult(updated)
    }
    if (remoteStatus !== 'done') {
      if (remoteStatus === 'pending') {
        this.emitCapability(identity, 'available', 200, undefined)
        const updated: VideoTaskRecord = { ...record, state: 'pending', updatedAt: new Date().toISOString() }
        delete updated.error
        await this.assertIdentity(identity)
        await this.persistRecord(identity, updated)
        return toResult(updated)
      }
      this.emitCapability(identity, 'temporary-error', undefined, 'unexpected video status')
      const updated: VideoTaskRecord = {
        ...record,
        state: 'interrupted',
        updatedAt: new Date().toISOString(),
        error: 'unexpected video status; call resume to retry',
      }
      await this.assertIdentity(identity)
      await this.persistRecord(identity, updated)
      return toResult(updated)
    }

    this.emitCapability(identity, 'available', 200, undefined)
    return this.downloadCompleted(identity, record, parsed, signal)
  }

  /** Download the finished MP4 (token-free, allowlisted host, bounded, signature-checked) and store it. */
  private async downloadCompleted(identity: string, record: VideoTaskRecord, parsed: Record<string, unknown>, signal: AbortSignal | undefined): Promise<VideoTaskResult> {
    const video = isRecord(parsed.video) ? parsed.video : undefined
    const remoteUrl = typeof video?.url === 'string' ? video.url : ''
    const startedAt = new Date().toISOString()
    if (!isAllowedVideoDownloadUrl(remoteUrl)) {
      const updated: VideoTaskRecord = {
        ...record,
        state: 'interrupted',
        updatedAt: startedAt,
        error: 'completed video URL is missing or not on the allowed official host; call resume to retry',
      }
      await this.assertIdentity(identity)
      await this.persistRecord(identity, updated)
      return toResult(updated)
    }
    // Mark the download phase before any byte moves so a crash mid-download is
    // visible in the store and recoverable via resume.
    const downloading: VideoTaskRecord = { ...record, state: 'downloading', updatedAt: startedAt }
    await this.assertIdentity(identity)
    await this.persistRecord(identity, downloading)

    const attachments = this.options.resolveAttachments()
    if (attachments === undefined || typeof attachments.saveFileStream !== 'function') {
      const updated: VideoTaskRecord = {
        ...downloading,
        state: 'interrupted',
        updatedAt: new Date().toISOString(),
        error: 'the DSH attachment service cannot store the finished video; call resume to retry',
      }
      await this.assertIdentity(identity)
      await this.persistRecord(identity, updated)
      return toResult(updated)
    }

    // The caller's signal rides along so a dropped client cancels the download
    // instead of leaving it running on the manager's account.
    const timed = withTimeout([signal, this.disposeController.signal], VIDEO_DOWNLOAD_TIMEOUT_MS, 'video download')
    let stream: ReturnType<typeof verifiedMp4Stream> | undefined
    try {
      // Token-free fetch on purpose: the signed URL must not travel with the
      // OAuth bearer, and redirects stay disabled (redirect: 'error').
      const response = await this.fetchImpl(remoteUrl, {
        method: 'GET',
        redirect: 'error',
        headers: { accept: 'video/mp4', 'user-agent': 'dsh-grok-kit/0.2.12' },
        signal: timed.signal,
      })
      if (!response.ok) {
        await discardBody(response)
        throw new Error(`video download failed (HTTP ${String(response.status)})`)
      }
      const reader = chunkReaderOf(response.body)
      if (reader === undefined) {
        // No stream means no honest byte cap: refuse instead of buffering blind.
        await discardBody(response)
        throw new Error('video download body is not streamable; refusing unbounded buffering')
      }
      stream = verifiedMp4Stream(reader, this.maxVideoBytes)
      const attachment = await attachments.saveFileStream({
        data: stream.data,
        name: `grok-video-${record.taskId.slice(0, 8)}.mp4`,
        ...timed.signal === undefined ? {} : { signal: timed.signal },
      })
      await this.assertIdentity(identity)
      const updated: VideoTaskRecord = {
        ...downloading,
        state: 'done',
        updatedAt: new Date().toISOString(),
        attachment,
      }
      delete updated.error
      await this.persistRecord(identity, updated)
      return toResult(updated)
    } catch (error) {
      if (signal?.aborted === true) {
        await this.markInterruptedQuietly(identity, downloading, `cancelled locally (${errorText(error)}); the remote generation is NOT cancelled`)
        throw signal.reason
      }
      if (this.disposeController.signal.aborted) {
        await this.markInterruptedQuietly(identity, downloading, `manager disposed mid-download (${errorText(error)}); call resume after restart to retry`)
        throw this.disposeController.signal.reason
      }
      const updated: VideoTaskRecord = {
        ...downloading,
        state: 'interrupted',
        updatedAt: new Date().toISOString(),
        error: `${errorText(error)}; call resume to retry`,
      }
      await this.assertIdentity(identity)
      await this.persistRecord(identity, updated)
      return toResult(updated)
    } finally {
      try { await stream?.close() } finally { timed.cancel() }
    }
  }

  /** Best-effort interrupted mark used on cancellation paths (an identity switch just drops it). */
  private async markInterruptedQuietly(identity: string, record: VideoTaskRecord, message: string): Promise<void> {
    try {
      await this.assertIdentity(identity)
      await this.persistRecord(identity, {
        ...record,
        state: 'interrupted',
        updatedAt: new Date().toISOString(),
        error: message.slice(0, MAX_ERROR_CHARS),
      })
    } catch {
      // Cancellation paths must not mask the caller's abort reason.
    }
  }
}
