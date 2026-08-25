/**
 * DSH grok_imagine tool over POST /v1/images/generations.
 * Pixels enter the session as ImageBlock via saveImage; no server-side image_generation.
 * @module dsh-grok-kit/imagine
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { AttachmentStore, ImageAttachmentRef, ImageMediaType } from '@deepseek-ai/dsh-attachment'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { XaiOAuthSession } from './session.ts'
import type { XaiOAuthTokenSource } from './token-source.ts'
import { safeMessage } from './redact.ts'

export const XAI_IMAGES_URL = 'https://api.x.ai/v1/images/generations'
export const DEFAULT_IMAGINE_MODEL = 'grok-imagine-image-2.0'
const FALLBACK_IMAGINE_MODEL = 'grok-imagine-image'
const USER_AGENT = 'dsh-grok-kit/0.1.7'
/** v1 renders exactly one image per call (the API bills per n). */
const MAX_N = 1

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff])
const GIF87 = new TextEncoder().encode('GIF87a')
const GIF89 = new TextEncoder().encode('GIF89a')

export function sniffImageMediaType(bytes: Uint8Array): ImageMediaType | undefined {
  if (startsWith(bytes, PNG)) return 'image/png'
  if (startsWith(bytes, JPEG)) return 'image/jpeg'
  if (startsWith(bytes, GIF87) || startsWith(bytes, GIF89)) return 'image/gif'
  if (bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return 'image/webp'
  }
  return undefined
}

function startsWith(bytes: Uint8Array, prefix: Uint8Array): boolean {
  if (bytes.length < prefix.length) return false
  return prefix.every((value, index) => bytes[index] === value)
}

function extensionFor(mediaType: ImageMediaType): string {
  switch (mediaType) {
    case 'image/jpeg': return 'jpg'
    case 'image/webp': return 'webp'
    case 'image/gif': return 'gif'
    default: return 'png'
  }
}

export function imagineModelId(liveIds: readonly string[] | undefined): string {
  if (liveIds === undefined) return DEFAULT_IMAGINE_MODEL
  if (liveIds.includes(DEFAULT_IMAGINE_MODEL)) return DEFAULT_IMAGINE_MODEL
  if (liveIds.includes(FALLBACK_IMAGINE_MODEL)) return FALLBACK_IMAGINE_MODEL
  return DEFAULT_IMAGINE_MODEL
}

interface ImagineValue {
  text: string
  attachmentId?: string
  mediaType?: ImageMediaType
  bytes?: number
  width?: number
  height?: number
  name?: string
  path?: string
}

function attachmentFromValue(value: ImagineValue): ImageAttachmentRef | undefined {
  if (value.attachmentId === undefined || value.mediaType === undefined) return undefined
  if (value.bytes === undefined || value.width === undefined || value.height === undefined) return undefined
  return {
    attachmentId: value.attachmentId as ImageAttachmentRef['attachmentId'],
    mediaType: value.mediaType,
    bytes: value.bytes,
    width: value.width,
    height: value.height,
    ...value.name === undefined ? {} : { name: value.name },
  }
}

export interface GrokImagineOptions {
  tokens: XaiOAuthTokenSource
  session: XaiOAuthSession
  resolveAttachments: () => AttachmentStore | undefined
  fetch?: typeof fetch
}

async function requestImage(
  tokens: XaiOAuthTokenSource,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<Response> {
  let access = await tokens.resolve(signal)
  if (access === undefined || access.length === 0) {
    throw new Error('grok_imagine requires a SuperGrok/X OAuth sign-in (Settings → xAI Grok)')
  }
  const post = (bearer: string) => fetchImpl(XAI_IMAGES_URL, {
    method: 'POST',
    redirect: 'error',
    headers: {
      authorization: `Bearer ${bearer}`,
      'content-type': 'application/json',
      accept: 'application/json',
      'user-agent': USER_AGENT,
    },
    body: JSON.stringify(body),
    ...signal !== undefined ? { signal } : {},
  })
  let response = await post(access)
  if (response.status === 401 && tokens.refresh !== undefined) {
    const refreshed = await tokens.refresh(access, signal)
    if (refreshed !== undefined && refreshed.length > 0 && refreshed !== access) {
      response = await post(refreshed)
    }
  }
  return response
}

export function applyGrokImagineTool(ctx: Context, options: GrokImagineOptions): void {
  const fetchImpl = options.fetch ?? globalThis.fetch
  ctx.tools.register(defineTool({
    name: 'grok_imagine',
    description: 'Generate an image with xAI Imagine using the SuperGrok / X Premium subscription. Returns the image in the tool result.',
    parameters: {
      prompt: { type: 'string', required: true, description: 'Image generation prompt.' },
      aspect_ratio: { type: 'string', description: 'Optional aspect ratio, e.g. 16:9.' },
      resolution: { type: 'string', description: 'Optional resolution: 1k or 2k.' },
      n: { type: 'number', description: 'Number of images (1-4). Default 1.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: { type: 'string', required: true },
          attachmentId: { type: 'string' },
          mediaType: { type: 'string' },
          bytes: { type: 'number' },
          width: { type: 'number' },
          height: { type: 'number' },
          name: { type: 'string' },
          path: { type: 'string' },
        },
      },
      presentationMeta: (_args, value) => ({ ...value }),
      render(_args, raw) {
        const value = raw as ImagineValue
        const attachment = attachmentFromValue(value)
        return attachment === undefined
          ? [{ type: 'text', text: value.text }]
          : [{ type: 'text', text: value.text }, { type: 'image', attachment }]
      },
    },
    isConcurrencySafe: () => true,
    presentCall: (args) => ({ card: 'generic', title: args.prompt, kind: 'other' }),
    presentResult: (args, result) => {
      if (result.isError) return undefined
      const value = result.meta as ImagineValue | undefined
      const attachment = value === undefined ? undefined : attachmentFromValue(value)
      return {
        card: 'generic',
        title: args.prompt,
        ...attachment === undefined ? {} : { content: [{ type: 'image' as const, attachment }] },
      }
    },
    async execute(args, exec) {
      const prompt = typeof args.prompt === 'string' ? args.prompt.trim() : ''
      if (prompt.length === 0) throw new Error('prompt must be a non-empty string')
      const n = typeof args.n === 'number' && Number.isFinite(args.n) ? Math.trunc(args.n) : 1
      if (n < 1 || n > MAX_N) throw new Error('n must be 1: this plugin renders one image per call (the API bills per n)')
      const resolution = args.resolution
      if (resolution !== undefined && resolution !== '1k' && resolution !== '2k') {
        throw new Error('resolution must be 1k or 2k')
      }
      const body: Record<string, unknown> = {
        model: imagineModelId(options.session.liveModelIds()),
        prompt,
        n,
        response_format: 'b64_json',
        ...typeof args.aspect_ratio === 'string' && args.aspect_ratio.length > 0
          ? { aspect_ratio: args.aspect_ratio }
          : {},
        ...resolution !== undefined ? { resolution } : {},
      }
      const response = await requestImage(options.tokens, body, fetchImpl, exec.signal)
      if (!response.ok) {
        const detail = safeMessage((await response.text().catch(() => '')).slice(0, 300))
        throw new Error(`xAI image generation failed (HTTP ${response.status})${detail.length === 0 ? '' : `: ${detail}`}`)
      }
      const parsed = await response.json() as { data?: Array<{ b64_json?: string }> }
      const b64 = parsed.data?.[0]?.b64_json
      if (typeof b64 !== 'string' || b64.length === 0) {
        throw new Error('xAI image generation returned no b64_json')
      }
      const bytes = Uint8Array.from(Buffer.from(b64, 'base64'))
      const mediaType = sniffImageMediaType(bytes)
      if (mediaType === undefined) throw new Error('grok_imagine: generated bytes are not a supported image type')
      const attachments = options.resolveAttachments()
      if (attachments !== undefined) {
        const ref = await attachments.saveImage({
          data: bytes,
          mediaType,
          name: `grok-imagine.${extensionFor(mediaType)}`,
        })
        return {
          text: 'Generated image.',
          attachmentId: ref.attachmentId,
          mediaType: ref.mediaType,
          bytes: ref.bytes,
          width: ref.width,
          height: ref.height,
          ...ref.name === undefined ? {} : { name: ref.name },
        } satisfies ImagineValue
      }
      const cwd = exec.agent?.session.header.cwd
      if (cwd === undefined || cwd.length === 0) {
        throw new Error('grok_imagine: no session working directory; enable the attachment service or run from a workspace')
      }
      const stamp = new Date().toISOString().replaceAll(':', '').replaceAll('.', '-')
      const relative = join('.dsh-grok-kit', `imagine-${stamp}-1.${extensionFor(mediaType)}`)
      const absolute = join(cwd, relative)
      await mkdir(join(cwd, '.dsh-grok-kit'), { recursive: true })
      await writeFile(absolute, bytes)
      return { text: `Saved to ${absolute}`, path: absolute } satisfies ImagineValue
    },
  }))
}
