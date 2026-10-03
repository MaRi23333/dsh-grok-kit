/**
 * Grok Imagine image-edit pure logic (image-to-image over POST /v1/images/edits).
 *
 * Source-image parsing (path / URL / data URI / DSH attachment handle) →
 * request-body building → response decoding. OAuth tokens and result saving
 * are injected by the caller, so this module stays dependency-free and can be
 * exercised offline with a fake fetch.
 *
 * Merged from the former standalone plugin `dsh-grok-imagine-edit` (v0.1.0).
 * @module dsh-grok-kit/imagine-edit-core
 */

import { extname } from 'node:path'
import type { XaiOAuthTokenSource } from './token-source.ts'

/** xAI image-edit endpoint (sibling of the generations endpoint in imagine.ts). */
export const XAI_IMAGES_EDIT_URL = 'https://api.x.ai/v1/images/edits'
/** Same default/fallback model choice as the generations path. */
export const DEFAULT_EDIT_MODEL = 'grok-imagine-image-2.0'
export const FALLBACK_EDIT_MODEL = 'grok-imagine-image'
/** The edits endpoint accepts exactly these raster types (no GIF). */
export const ACCEPTED_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
/** Per-request source-image cap (xAI accepts at most 5). */
export const MAX_SOURCE_IMAGES = 5
/** Default per-source byte cap. */
export const DEFAULT_MAX_IMAGE_BYTES = 20 * 1024 * 1024
/** xAI supports n; we keep only the first returned image. */
export const MAX_N = 4

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff])

function startsWith(bytes: Uint8Array, prefix: Uint8Array): boolean {
  if (bytes.length < prefix.length) return false
  return prefix.every((value, index) => bytes[index] === value)
}

/** Media-type sniffing by magic bytes, restricted to edit-accepted formats. */
export function sniffEditableImageMediaType(bytes: Uint8Array): 'image/png' | 'image/jpeg' | 'image/webp' | undefined {
  if (startsWith(bytes, PNG)) return 'image/png'
  if (startsWith(bytes, JPEG)) return 'image/jpeg'
  if (
    bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return 'image/webp'
  return undefined
}

/** File extension for a saved result. */
export function extensionFor(mediaType: 'image/png' | 'image/jpeg' | 'image/webp'): string {
  switch (mediaType) {
    case 'image/jpeg': return 'jpg'
    case 'image/webp': return 'webp'
    default: return 'png'
  }
}

/** Encode bytes into the data-URI form xAI accepts. */
export function dataUriFor(bytes: Uint8Array, mediaType: 'image/png' | 'image/jpeg' | 'image/webp'): string {
  return `data:${mediaType};base64,${Buffer.from(bytes).toString('base64')}`
}

/**
 * Keep the save-path extension truthful about the returned media type.
 * xAI edit results are often JPEG while the caller asked for `.png` — writing
 * as-is would produce a mislabeled file other tools refuse to open. Only the
 * extension changes; directory and stem stay untouched.
 */
export function alignExtension(target: string, mediaType: 'image/png' | 'image/jpeg' | 'image/webp'): { path: string; note?: string } {
  const expected = extensionFor(mediaType)
  const current = extname(target)
  const currentLower = current.slice(1).toLowerCase()
  const equivalent = currentLower === expected || (expected === 'jpg' && currentLower === 'jpeg')
  if (equivalent) return { path: target }
  const base = current.length === 0 ? target : target.slice(0, -current.length)
  return {
    path: `${base}.${expected}`,
    note: `Adjusted the save_path extension from ${current.length === 0 ? '(none)' : current} to .${expected} to match the returned ${mediaType}.`,
  }
}

export function isHttpUrl(value: string): boolean {
  return /^https?:\/\//iu.test(value)
}

/** Canonical `data:image/<png|jpeg|webp>;base64,…` form. */
export function normalizeDataImageUri(value: string): { url: string; origin: 'data-uri' } | undefined {
  const match = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=\s]+)$/iu.exec(value.trim())
  if (match === null) return undefined
  const raw = match[1].toLowerCase()
  const mediaType = raw === 'png' ? 'image/png' : raw === 'webp' ? 'image/webp' : 'image/jpeg'
  return { url: `data:${mediaType};base64,${match[2].replace(/\s+/gu, '')}`, origin: 'data-uri' }
}

const ATTACHMENT_ID = /sha256:[a-f0-9]{64}/u
const ATTACHMENT_ID_ONLY = /^sha256:[a-f0-9]{64}$/u

export interface EditAttachmentRef {
  attachmentId: string
  mediaType: string
  bytes: number
  width: number
  height: number
  name?: string
}

/** Extract a valid DSH attachment reference from a candidate object. */
function attachmentRefFrom(value: unknown): { attachmentId: string; ref?: EditAttachmentRef } | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const id = typeof record.attachmentId === 'string' ? record.attachmentId.trim() : ''
  if (!ATTACHMENT_ID_ONLY.test(id)) return undefined
  const complete = typeof record.mediaType === 'string'
    && typeof record.bytes === 'number' && Number.isSafeInteger(record.bytes) && record.bytes > 0
    && typeof record.width === 'number' && Number.isSafeInteger(record.width) && record.width > 0
    && typeof record.height === 'number' && Number.isSafeInteger(record.height) && record.height > 0
  if (!complete) return { attachmentId: id }
  return {
    attachmentId: id,
    ref: {
      attachmentId: id,
      mediaType: record.mediaType as string,
      bytes: record.bytes as number,
      width: record.width as number,
      height: record.height as number,
      ...typeof record.name === 'string' ? { name: record.name } : {},
    },
  }
}

/**
 * Parse a session image handle into an attachment reference.
 *
 * Accepted shapes (everything the model actually sees):
 *   - full attachment JSON: `{"attachmentId":"sha256:…","mediaType":"image/png",…}`
 *   - handle-line fragment: `[Codex Connect image 1 … attachment={…}]`
 *   - labeled form: `attachmentId=sha256:…`
 *   - bare id: `sha256:…`
 *
 * Only a full reference carries `ref` — then the caller can use the attachment
 * service's `readImage` and let the store verify bytes; otherwise fall back to
 * reading the host object path by id.
 */
export function parseAttachmentSpec(value: string): { attachmentId: string; ref?: EditAttachmentRef } | undefined {
  const text = value.trim()
  if (text.length === 0) return undefined
  if (ATTACHMENT_ID_ONLY.test(text)) return { attachmentId: text }
  if (text.startsWith('{')) {
    try {
      const parsed = attachmentRefFrom(JSON.parse(text))
      if (parsed !== undefined) return parsed
    } catch {
      // Not valid JSON: keep going as handle-line text.
    }
  }
  const embedded = /attachment=(\{[^}]*\})/u.exec(text)
  if (embedded !== null) {
    try {
      const parsed = attachmentRefFrom(JSON.parse(embedded[1]))
      if (parsed !== undefined) return parsed
    } catch {
      // Ignore incomplete embedded JSON.
    }
  }
  const labeled = /attachmentId\s*=\s*(sha256:[a-f0-9]{64})/u.exec(text)
  if (labeled !== null) return { attachmentId: labeled[1] }
  const bare = ATTACHMENT_ID.exec(text)
  if (bare !== null && text.replace(ATTACHMENT_ID, '').replace(/attachmentId\s*=/u, '').trim().length === 0) {
    return { attachmentId: bare[0] }
  }
  return undefined
}

export interface ResolvedImageSource {
  url: string
  origin: 'url' | 'data-uri' | 'attachment' | 'file'
  mediaType?: 'image/png' | 'image/jpeg' | 'image/webp'
  bytes?: number
}

export interface ResolveImageSourcesOptions {
  cwd?: string
  maxBytes?: number
  maxSourceImages?: number
  readFile?: (path: string) => Promise<Uint8Array>
  readAttachmentBytes?: (attachment: { attachmentId: string; ref?: EditAttachmentRef }) => Promise<Uint8Array>
}

/**
 * Resolve each caller-provided source into an xAI-ready `{ url }`.
 * Public http(s) URLs, data URIs, and local file paths (absolute or relative
 * to the session cwd) are supported, plus DSH session attachments.
 */
export async function resolveImageSources(specs: readonly string[], options: ResolveImageSourcesOptions = {}): Promise<ResolvedImageSource[]> {
  const {
    cwd,
    maxBytes = DEFAULT_MAX_IMAGE_BYTES,
    maxSourceImages = MAX_SOURCE_IMAGES,
    readFile,
    readAttachmentBytes,
  } = options
  const reader = readFile ?? (await import('node:fs/promises')).readFile
  const { isAbsolute, resolve } = await import('node:path')
  const list = specs.filter(value => typeof value === 'string' && value.trim().length > 0)
  if (list.length === 0) throw new Error('at least one source image is required (image or images)')
  if (list.length > maxSourceImages) {
    throw new Error(`too many source images: ${list.length} (xAI accepts at most ${maxSourceImages})`)
  }
  const resolved: ResolvedImageSource[] = []
  for (const spec of list) {
    const trimmed = spec.trim()
    if (isHttpUrl(trimmed)) {
      resolved.push({ url: trimmed, origin: 'url' })
      continue
    }
    if (/^data:/iu.test(trimmed)) {
      const normalized = normalizeDataImageUri(trimmed)
      if (normalized === undefined) {
        throw new Error('data URI must be a base64 image/png, image/jpeg or image/webp payload')
      }
      resolved.push(normalized)
      continue
    }
    // Session images arrive as attachments: test before treating as a path,
    // otherwise `sha256:…` would be parsed as a file name.
    const attachment = parseAttachmentSpec(trimmed)
    if (attachment !== undefined) {
      if (typeof readAttachmentBytes !== 'function') {
        throw new Error('attachment input needs the DSH attachment service, which is not mounted in this context')
      }
      const bytes = await readAttachmentBytes(attachment)
      if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
        throw new Error(`attachment ${attachment.attachmentId} could not be read as image bytes`)
      }
      if (bytes.byteLength > maxBytes) {
        throw new Error(`attachment ${attachment.attachmentId} is ${bytes.byteLength} bytes, over the ${maxBytes}-byte limit`)
      }
      const mediaType = sniffEditableImageMediaType(bytes)
      if (mediaType === undefined) {
        throw new Error(`attachment ${attachment.attachmentId} is not a PNG, JPEG or WebP image`)
      }
      resolved.push({
        url: dataUriFor(bytes, mediaType),
        origin: 'attachment',
        mediaType,
        bytes: bytes.byteLength,
      })
      continue
    }
    const path = isAbsolute(trimmed) ? trimmed : resolve(cwd ?? process.cwd(), trimmed)
    let bytes: Uint8Array
    try {
      bytes = await reader(path)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | null)?.code
      const codeText = code === undefined ? '' : ` (${code})`
      throw new Error(`cannot read source image ${JSON.stringify(trimmed)}${codeText}: ${(error as Error | null)?.message ?? String(error)}`)
    }
    if (bytes.byteLength > maxBytes) {
      throw new Error(`source image ${JSON.stringify(trimmed)} is ${bytes.byteLength} bytes, over the ${maxBytes}-byte limit`)
    }
    const mediaType = sniffEditableImageMediaType(bytes)
    if (mediaType === undefined) {
      throw new Error(`source image ${JSON.stringify(trimmed)} is not a PNG, JPEG or WebP image`)
    }
    resolved.push({ url: dataUriFor(bytes, mediaType), origin: 'file', mediaType, bytes: bytes.byteLength })
  }
  return resolved
}

export interface EditRequestBodyInput {
  model?: string
  prompt: string
  images: readonly ResolvedImageSource[]
  n?: number
  aspectRatio?: string
  resolution?: string
  responseFormat?: string
}

/**
 * Build the /v1/images/edits request body.
 * One image uses `image`, several use `images` (mutually exclusive per xAI).
 */
export function buildEditRequestBody(input: EditRequestBodyInput): Record<string, unknown> {
  const {
    model = DEFAULT_EDIT_MODEL,
    prompt,
    images,
    n = 1,
    aspectRatio,
    resolution,
    responseFormat = 'b64_json',
  } = input
  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    throw new Error('prompt must be a non-empty string')
  }
  if (!Array.isArray(images) || images.length === 0) {
    throw new Error('at least one source image is required')
  }
  const body: Record<string, unknown> = {
    model,
    prompt: prompt.trim(),
    n,
    response_format: responseFormat,
  }
  if (images.length === 1) {
    body.image = { url: images[0].url, type: 'image_url' }
  } else {
    body.images = images.map(image => ({ url: image.url, type: 'image_url' }))
  }
  if (typeof aspectRatio === 'string' && aspectRatio.length > 0) body.aspect_ratio = aspectRatio
  if (typeof resolution === 'string' && resolution.length > 0) body.resolution = resolution
  return body
}

/** Take the first returned image and sniff its real type. */
export function decodeFirstImage(parsed: { data?: Array<{ b64_json?: string }> }): { bytes: Uint8Array; mediaType: 'image/png' | 'image/jpeg' | 'image/webp'; returned: number } {
  const data = Array.isArray(parsed?.data) ? parsed.data : []
  const b64 = data[0]?.b64_json
  if (typeof b64 !== 'string' || b64.length === 0) {
    throw new Error('xAI image edit returned no b64_json')
  }
  const bytes = Uint8Array.from(Buffer.from(b64, 'base64'))
  const mediaType = sniffEditableImageMediaType(bytes)
  if (mediaType === undefined) throw new Error('xAI image edit returned unsupported image bytes')
  return { bytes, mediaType, returned: data.length }
}

/** Keep only the diagnostics-worthy fragment; never echo credentials. */
export function safeDetail(text: unknown): string {
  return String(text ?? '').replace(/\s+/gu, ' ').slice(0, 300)
}

export interface EditSaveResult {
  text?: string
  attachmentId?: string
  mediaType?: string
  bytes?: number
  width?: number
  height?: number
  name?: string
  path?: string
  note?: string
}

export interface RunImageEditOptions {
  tokens: XaiOAuthTokenSource
  prompt: string
  imageSpecs: readonly string[]
  cwd?: string
  fetchImpl?: typeof fetch
  save: (bytes: Uint8Array, mediaType: 'image/png' | 'image/jpeg' | 'image/webp', meta: { model: string; n: number; returned: number }) => Promise<EditSaveResult>
  signal?: AbortSignal
  model?: string
  n?: number
  aspectRatio?: string
  resolution?: string
  maxSourceImages?: number
  maxBytes?: number
  readFile?: (path: string) => Promise<Uint8Array>
  readAttachmentBytes?: ResolveImageSourcesOptions['readAttachmentBytes']
  logger?: (message: string) => void
}

/**
 * Run one image edit: parse sources → POST → decode → hand to `save`.
 *
 * The default fetch is the host-global one (already wrapped by dsh-grok-kit's
 * xAI proxy hook, which covers api.x.ai).
 */
export async function runImageEdit(options: RunImageEditOptions): Promise<EditSaveResult & { text: string; mediaType: 'image/png' | 'image/jpeg' | 'image/webp'; bytes: number; model: string; sourceCount: number; requestBodyKeys: string[] }> {
  const {
    tokens,
    prompt,
    imageSpecs,
    cwd,
    fetchImpl,
    save,
    signal,
    model = DEFAULT_EDIT_MODEL,
    n = 1,
    aspectRatio,
    resolution,
    maxSourceImages = MAX_SOURCE_IMAGES,
    maxBytes = DEFAULT_MAX_IMAGE_BYTES,
    readFile,
    readAttachmentBytes,
    logger,
  } = options
  if (save === undefined || typeof save !== 'function') throw new Error('save callback is required')
  const doFetch = fetchImpl ?? globalThis.fetch
  const images = await resolveImageSources(imageSpecs, { cwd, maxBytes, maxSourceImages, readFile, readAttachmentBytes })
  const body = buildEditRequestBody({ model, prompt, images, n, aspectRatio, resolution })

  const access = await tokens.resolve(signal)
  if (typeof access !== 'string' || access.length === 0) {
    throw new Error('grok_imagine_edit requires a SuperGrok/X OAuth sign-in (Settings → xAI Grok)')
  }
  const post = (bearer: string) => doFetch(XAI_IMAGES_EDIT_URL, {
    method: 'POST',
    redirect: 'error',
    headers: {
      authorization: `Bearer ${bearer}`,
      'content-type': 'application/json',
      accept: 'application/json',
      'user-agent': 'dsh-grok-kit/0.1.15',
    },
    body: JSON.stringify(body),
    ...signal === undefined ? {} : { signal },
  })
  let response = await post(access)
  if (response.status === 401 && tokens.refresh !== undefined) {
    const refreshed = await tokens.refresh(access, signal)
    if (typeof refreshed === 'string' && refreshed.length > 0 && refreshed !== access) {
      logger?.('grok_imagine_edit: retrying once after 401 with a refreshed token')
      response = await post(refreshed)
    }
  }
  if (!response.ok) {
    const detail = safeDetail(await response.text().catch(() => ''))
    throw new Error(`xAI image edit failed (HTTP ${response.status})${detail.length === 0 ? '' : `: ${detail}`}`)
  }
  const parsed = await response.json() as { data?: Array<{ b64_json?: string }> }
  const { bytes, mediaType, returned } = decodeFirstImage(parsed)
  const saved = await save(bytes, mediaType, { model: body.model as string, n, returned })
  const sources = images.map(image => image.origin === 'file' ? `file:${image.mediaType}` : image.origin)
  const lines = [
    `Edited with ${String(body.model)}${returned > 1 ? ` (kept 1 of ${returned} returned images)` : ''}.`,
    `Sources: ${images.length} (${sources.join(', ')}).`,
  ]
  if (saved.path !== undefined) lines.push(`Saved to ${saved.path}`)
  if (typeof saved.note === 'string' && saved.note.length > 0) lines.push(saved.note)
  if (saved.attachmentId !== undefined) lines.push(`attachmentId=${String(saved.attachmentId)}`)
  lines.push(`Image: ${mediaType}, ${bytes.byteLength} bytes.`)
  return {
    text: lines.join(' '),
    ...saved,
    mediaType,
    bytes: bytes.byteLength,
    model: body.model as string,
    sourceCount: images.length,
    requestBodyKeys: Object.keys(body),
  }
}
