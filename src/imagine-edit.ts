/**
 * DSH grok_imagine_edit tool over POST /v1/images/edits (image-to-image).
 *
 * Merged from the former standalone plugin `dsh-grok-imagine-edit` (v0.1.0).
 * Unlike the standalone version this reuses the host plugin's single OAuth
 * session, credential store, and token source instead of building a second
 * one against the same auth file.
 * @module dsh-grok-kit/imagine-edit
 */

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type {} from '@deepseek-ai/dsh-fs'
import type { Context } from '@deepseek-ai/cordis'
import type { AttachmentStore, ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { XaiOAuthSession } from './session.ts'
import type { XaiOAuthTokenSource } from './token-source.ts'
import { imagineModelId } from './imagine.ts'
import {
  DEFAULT_MAX_IMAGE_BYTES,
  MAX_N,
  MAX_SOURCE_IMAGES,
  extensionFor,
  runImageEdit,
  type EditSaveResult,
} from './imagine-edit-core.ts'

const TOOL_NAME = 'grok_imagine_edit'
const RESOLUTIONS = ['1k', '1.5k', '2k']

/** Minimal structural view of the attachment store used by this tool. */
interface EditAttachmentStore {
  saveImage(input: { data: Uint8Array; mediaType: 'image/png' | 'image/jpeg' | 'image/webp'; name: string }): Promise<{
    attachmentId: string
    mediaType: string
    bytes: number
    width: number
    height: number
    name?: string
  }>
  readImage?(ref: unknown): Promise<{ data?: Uint8Array } | undefined>
  imageHostPath?(ref: { attachmentId: string }): string | undefined
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export interface GrokImagineEditOptions {
  tokens: XaiOAuthTokenSource
  session: XaiOAuthSession
  resolveAttachments: () => AttachmentStore | undefined
  /** Pin the edit model; empty/undefined follows the live catalog. */
  editModel?: string
  /** 1..5, clamped. */
  maxSourceImages?: number
  /** Per-source byte cap. */
  maxImageBytes?: number
  fetch?: typeof fetch
}

interface ImagineEditValue {
  text: string
  attachmentId?: string
  mediaType?: string
  bytes?: number
  width?: number
  height?: number
  name?: string
  path?: string
}

function attachmentFromValue(value: ImagineEditValue | undefined): ImageAttachmentRef | undefined {
  if (value === undefined) return undefined
  if (value.attachmentId === undefined || value.mediaType === undefined) return undefined
  if (value.bytes === undefined || value.width === undefined || value.height === undefined) return undefined
  return {
    attachmentId: value.attachmentId as ImageAttachmentRef['attachmentId'],
    mediaType: value.mediaType as ImageAttachmentRef['mediaType'],
    bytes: value.bytes,
    width: value.width,
    height: value.height,
    ...value.name === undefined ? {} : { name: value.name },
  }
}

/** Register grok_imagine_edit. Independent of imagineTool: either may be off. */
export function applyGrokImagineEditTool(ctx: Context, options: GrokImagineEditOptions): void {
  const fetchImpl = options.fetch ?? globalThis.fetch
  const maxSourceImages = Number.isSafeInteger(options.maxSourceImages)
    ? Math.min(Math.max(options.maxSourceImages!, 1), MAX_SOURCE_IMAGES)
    : MAX_SOURCE_IMAGES
  const maxImageBytes = Number.isSafeInteger(options.maxImageBytes) && options.maxImageBytes! > 0
    ? options.maxImageBytes!
    : DEFAULT_MAX_IMAGE_BYTES
  const editModel = isNonEmptyString(options.editModel) ? options.editModel.trim() : undefined

  /**
   * Read a session image attachment into bytes (the handle the model holds
   * after read_image / view_image). Two paths, neither guesses paths:
   *   1. full reference → attachments.readImage(ref); the store verifies the
   *      digest and metadata itself;
   *   2. bare attachmentId → attachments.imageHostPath(ref), then a local
   *      sha256 self-check (the attachment id IS the content digest).
   */
  const readAttachmentBytes = async (attachment: { attachmentId: string; ref?: unknown }): Promise<Uint8Array> => {
    const attachments = options.resolveAttachments() as unknown as EditAttachmentStore | undefined
    if (attachments === undefined) {
      throw new Error('grok_imagine_edit: the DSH attachment service is not mounted, so the session image cannot be read')
    }
    if (attachment.ref !== undefined && typeof attachments.readImage === 'function') {
      const result = await attachments.readImage(attachment.ref)
      const data = result?.data
      if (data instanceof Uint8Array && data.byteLength > 0) return data
      throw new Error(`grok_imagine_edit: attachment ${attachment.attachmentId} returned no bytes`)
    }
    const hostPath = typeof attachments.imageHostPath === 'function'
      ? attachments.imageHostPath({ attachmentId: attachment.attachmentId })
      : undefined
    if (typeof hostPath !== 'string' || hostPath.length === 0) {
      throw new Error(`grok_imagine_edit: attachment ${attachment.attachmentId} is not backed by a readable host object`)
    }
    const bytes = new Uint8Array(await readFile(hostPath))
    const digest = createHash('sha256').update(bytes).digest('hex')
    if (`sha256:${digest}` !== attachment.attachmentId) {
      throw new Error(`grok_imagine_edit: attachment ${attachment.attachmentId} failed integrity verification`)
    }
    return bytes
  }

  /** Store results through the host; file exports belong to sandboxed host tools. */
  const makeSaver = (attachments: EditAttachmentStore) => async (
    bytes: Uint8Array,
    mediaType: 'image/png' | 'image/jpeg' | 'image/webp',
  ): Promise<EditSaveResult> => attachments.saveImage({
    data: bytes,
    mediaType,
    name: `grok-imagine-edit.${extensionFor(mediaType)}`,
  })

  // Schemastery descriptors via defineTool: same JSON-schema shape the tool
  // shipped with as a standalone plugin, but with inferred arg typing that
  // matches the rest of this package.
  ctx.tools.register(defineTool({
    name: TOOL_NAME,
    description: 'Edit or restyle an existing image with xAI Imagine (POST /v1/images/edits), using the SuperGrok / X Premium subscription. A source image may be a DSH attachment reference from this session (pass the attachmentId=sha256:... handle or the full attachment={...} JSON that read_image / view_image returns), a local file path, an http(s) URL, or a base64 data URI; up to 5 source images. Returns the image in the tool result.',
    parameters: {
      prompt: { type: 'string', required: true, description: 'Edit instruction, e.g. "render this as a pencil sketch" or "keep the character, move them into a snowy forest at dusk".' },
      image: { type: 'string', required: true, description: 'Source image: a session attachment from read_image / view_image (pass attachmentId=sha256:... or the whole attachment={...} JSON line), a local file path, an http(s) URL, or a base64 data URI (PNG/JPEG/WebP).' },
      images: { type: 'array', items: { type: 'string' }, description: 'Optional extra reference images (same accepted forms, session attachments included). image + images together: at most 5.' },
      aspect_ratio: { type: 'string', description: 'Optional output aspect ratio, e.g. 16:9 or 1:1 (default follows the first source image).' },
      resolution: { type: 'string', description: 'Optional output resolution: 1k, 1.5k or 2k.' },
      n: { type: 'number', description: `Number of edited images to request (1-${String(MAX_N)}). Default 1; only the first is kept.` },
      save_path: { type: 'string', description: 'Unsupported: results are saved to the DSH attachment library. Use the host file tools to export an attachment.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: { type: 'string' },
          attachmentId: { type: 'string' },
          mediaType: { type: 'string' },
          bytes: { type: 'number' },
          width: { type: 'number' },
          height: { type: 'number' },
          name: { type: 'string' },
          path: { type: 'string' },
        },
      },
      // Without this the runner never populates result.meta (meta is only set
      // when presentationMeta is declared), so presentResult below would always
      // fall back to a generic card without the image. Matches grok_imagine.
      presentationMeta: (_args, value) => ({ ...value }),
      render(_args, raw) {
        const value = raw as unknown as ImagineEditValue | undefined
        const attachment = attachmentFromValue(value)
        return attachment === undefined
          ? [{ type: 'text', text: String(value?.text ?? '') }]
          : [{ type: 'text', text: String(value?.text ?? '') }, { type: 'image', attachment }]
      },
    },
    isConcurrencySafe: () => true,
    presentCall: args => ({ card: 'generic', title: String(args?.prompt ?? TOOL_NAME), kind: 'other' }),
    presentResult: (args, result) => {
      if (result.isError) return undefined
      const attachment = attachmentFromValue(result?.meta as unknown as ImagineEditValue | undefined)
      if (attachment === undefined) return undefined
      return {
        card: 'generic',
        title: String(args?.prompt ?? TOOL_NAME),
        content: [{ type: 'image' as const, attachment }],
      }
    },
    async execute(args, exec) {
      const prompt = isNonEmptyString(args?.prompt) ? args.prompt.trim() : ''
      if (prompt.length === 0) throw new Error('prompt must be a non-empty string')
      const primary = isNonEmptyString(args?.image) ? args.image.trim() : ''
      if (primary.length === 0) throw new Error('image must be a non-empty source (file path, URL or data URI)')
      if (args?.save_path !== undefined) {
        throw new Error('grok_imagine_edit: save_path is unsupported; use the host file tools to export the saved attachment')
      }
      const attachments = options.resolveAttachments() as unknown as EditAttachmentStore | undefined
      if (attachments === undefined) throw new Error('grok_imagine_edit requires the DSH attachment service to save results')
      if (args?.images !== undefined && (!Array.isArray(args.images) || args.images.some(image => !isNonEmptyString(image)))) {
        throw new Error('images must be an array of non-empty source images')
      }
      const extra = args?.images ?? []
      const imageSpecs = [primary, ...extra]
      if (imageSpecs.length > maxSourceImages) {
        throw new Error(`too many source images: ${imageSpecs.length} (at most ${maxSourceImages})`)
      }
      const n = args?.n ?? 1
      if (!Number.isSafeInteger(n) || n < 1 || n > MAX_N) throw new Error(`n must be an integer between 1 and ${String(MAX_N)}`)
      const resolution = args?.resolution
      if (resolution !== undefined && !RESOLUTIONS.includes(resolution as string)) {
        throw new Error(`resolution must be one of ${RESOLUTIONS.join(', ')}`)
      }
      const aspectRatio = isNonEmptyString(args?.aspect_ratio) ? args.aspect_ratio.trim() : undefined
      const cwd = exec.agent?.session?.header?.cwd

      const result = await runImageEdit({
        tokens: options.tokens,
        prompt,
        imageSpecs,
        cwd,
        fetchImpl,
        model: editModel ?? imagineModelId(options.session.liveModelIds()),
        n,
        aspectRatio,
        resolution: typeof resolution === 'string' ? resolution : undefined,
        maxSourceImages,
        maxBytes: maxImageBytes,
        readAttachmentBytes,
        readFile: async path => {
          const fs = exec.agent?.ctx?.fs ?? ctx.fs
          if (fs === undefined) throw new Error('grok_imagine_edit: the DSH filesystem service is required for local source images')
          const target = await fs.resolve(path, { cwd, signal: exec.signal })
          return fs.readBytes(target, exec.signal, maxImageBytes)
        },
        save: makeSaver(attachments),
        logger: message => ctx.logger?.info?.(message),
        signal: exec?.signal,
      })
      ctx.logger?.info?.(`grok_imagine_edit: ${String(result.text)}`)
      // Only return fields declared by the output schema (extras are in text).
      return {
        text: String(result.text),
        ...result.attachmentId === undefined ? {} : { attachmentId: result.attachmentId },
        ...result.mediaType === undefined ? {} : { mediaType: result.mediaType },
        ...result.bytes === undefined ? {} : { bytes: result.bytes },
        ...result.width === undefined ? {} : { width: result.width },
        ...result.height === undefined ? {} : { height: result.height },
        ...result.name === undefined ? {} : { name: result.name },
        ...result.path === undefined ? {} : { path: result.path },
      }
    },
  }))

  ctx.logger?.info?.(`dsh-grok-kit: registered ${TOOL_NAME} (model ${editModel ?? 'auto'}, source-image cap ${String(maxSourceImages)})`)
}
