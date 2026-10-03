import { createHash } from 'node:crypto'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  alignExtension,
  buildEditRequestBody,
  decodeFirstImage,
  parseAttachmentSpec,
  sniffEditableImageMediaType,
} from '../src/imagine-edit-core.ts'
import { applyGrokImagineEditTool } from '../src/imagine-edit.ts'
import type { XaiOAuthSession } from '../src/session.ts'
import type { XaiOAuthTokenSource } from '../src/token-source.ts'

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])
const GIF = new TextEncoder().encode('GIF89a\x01\x00\x01\x00')
const SHA = `sha256:${'a'.repeat(64)}`

describe('sniffEditableImageMediaType', () => {
  it('recognizes png/jpeg/webp and rejects gif (edits endpoint does not accept gif)', () => {
    expect(sniffEditableImageMediaType(PNG)).toBe('image/png')
    expect(sniffEditableImageMediaType(JPEG)).toBe('image/jpeg')
    expect(sniffEditableImageMediaType(GIF)).toBeUndefined()
    expect(sniffEditableImageMediaType(Uint8Array.from([1, 2, 3]))).toBeUndefined()
  })
})

describe('parseAttachmentSpec', () => {
  it('accepts the four handle shapes the model actually sees', () => {
    expect(parseAttachmentSpec(SHA)).toEqual({ attachmentId: SHA })
    expect(parseAttachmentSpec(`attachmentId=${SHA}`)).toEqual({ attachmentId: SHA })
    expect(parseAttachmentSpec(`[Codex Connect image 1 attachment={"attachmentId":"${SHA}","mediaType":"image/png","bytes":8,"width":1,"height":1}]`)).toEqual({
      attachmentId: SHA,
      ref: { attachmentId: SHA, mediaType: 'image/png', bytes: 8, width: 1, height: 1 },
    })
    expect(parseAttachmentSpec(JSON.stringify({ attachmentId: SHA, mediaType: 'image/png', bytes: 8, width: 1, height: 1 }))).toMatchObject({ attachmentId: SHA })
    expect(parseAttachmentSpec('not-a-handle.png')).toBeUndefined()
  })
})

describe('alignExtension', () => {
  it('rewrites a lying extension but keeps equivalent ones', () => {
    expect(alignExtension('out.png', 'image/jpeg')).toMatchObject({ path: 'out.jpg' })
    expect(alignExtension('out.jpeg', 'image/jpeg')).toEqual({ path: 'out.jpeg' })
    expect(alignExtension('out.png', 'image/png')).toEqual({ path: 'out.png' })
  })
})

describe('buildEditRequestBody', () => {
  it('uses image for one source and images for several (mutually exclusive)', () => {
    const one = buildEditRequestBody({ prompt: 'p', images: [{ url: 'u1', origin: 'url' }] })
    expect(one.image).toEqual({ url: 'u1', type: 'image_url' })
    expect(one.images).toBeUndefined()
    const two = buildEditRequestBody({ prompt: 'p', images: [{ url: 'u1', origin: 'url' }, { url: 'u2', origin: 'url' }], aspectRatio: '16:9' })
    expect(two.images).toEqual([{ url: 'u1', type: 'image_url' }, { url: 'u2', type: 'image_url' }])
    expect(two.image).toBeUndefined()
    expect(two.aspect_ratio).toBe('16:9')
  })
})

describe('decodeFirstImage', () => {
  it('returns the first image with its sniffed type and count', () => {
    const result = decodeFirstImage({ data: [{ b64_json: Buffer.from(PNG).toString('base64') }, { b64_json: Buffer.from(PNG).toString('base64') }] })
    expect(result.mediaType).toBe('image/png')
    expect(result.returned).toBe(2)
  })

  it('fails on a missing b64 payload', () => {
    expect(() => decodeFirstImage({ data: [{}] })).toThrow(/no b64_json/)
  })
})

describe('applyGrokImagineEditTool', () => {
  const tokens: XaiOAuthTokenSource = { available: () => true, resolve: async () => 'tok' }
  const session = { liveModelIds: () => ['grok-imagine-image-2.0'] } as unknown as XaiOAuthSession

  function register(fetchImpl: typeof fetch, saveImage = vi.fn(async () => ({
    attachmentId: 'att_1',
    mediaType: 'image/png',
    bytes: PNG.byteLength,
    width: 1,
    height: 1,
    name: 'grok-imagine-edit.png',
  })), overrides: { tokens?: XaiOAuthTokenSource; resolveAttachments?: () => unknown } = {}) {
    let registered: { execute: Function; output: { render: Function }; presentResult: Function } | undefined
    applyGrokImagineEditTool({
      tools: { register: (definition: typeof registered) => { registered = definition } },
    } as never, {
      tokens: overrides.tokens ?? tokens,
      session,
      resolveAttachments: (overrides.resolveAttachments ?? (() => ({ saveImage }))) as never,
      fetch: fetchImpl,
    })
    return { registered, saveImage }
  }

  it('edits from a data-URI source and renders an ImageBlock via saveImage', async () => {
    const dataUri = `data:image/png;base64,${Buffer.from(PNG).toString('base64')}`
    const { registered, saveImage } = register(async () => new Response(
      JSON.stringify({ data: [{ b64_json: Buffer.from(PNG).toString('base64') }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ))
    const value = await registered!.execute(
      { prompt: 'sketch', image: dataUri },
      { signal: new AbortController().signal, agent: { session: { header: { cwd: '/tmp/ws' } } } },
    )
    expect(saveImage).toHaveBeenCalledOnce()
    const rendered = registered!.output.render({}, value)
    expect(rendered.some((block: { type: string }) => block.type === 'image')).toBe(true)
    // presentResult is schema-gated by defineTool: args must validate (image is required).
    expect(registered!.presentResult({ prompt: 'sketch', image: 'src' }, { isError: false, meta: value })).toMatchObject({ card: 'generic' })
  })

  it('rejects more than five sources before any network call', async () => {
    let called = false
    const { registered } = register(async () => { called = true; return new Response('{}', { status: 200 }) })
    await expect(registered!.execute(
      { prompt: 'x', image: 'a.png', images: ['b.png', 'c.png', 'd.png', 'e.png', 'f.png'] },
      { signal: new AbortController().signal },
    )).rejects.toThrow(/too many source images/)
    expect(called).toBe(false)
  })

  it('maps a non-OK edit response to an error with the status', async () => {
    const { registered } = register(async () => new Response('{"error":"bad"}', { status: 400 }))
    const dataUri = `data:image/png;base64,${Buffer.from(PNG).toString('base64')}`
    await expect(registered!.execute(
      { prompt: 'x', image: dataUri },
      { signal: new AbortController().signal },
    )).rejects.toThrow(/HTTP 400/)
  })

  it('aligns a lying save_path extension to the returned media type before writing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'grok-edit-'))
    const { registered } = register(async () => new Response(
      JSON.stringify({ data: [{ b64_json: Buffer.from(JPEG).toString('base64') }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ))
    const dataUri = `data:image/png;base64,${Buffer.from(PNG).toString('base64')}`
    const value = await registered!.execute(
      { prompt: 'x', image: dataUri, save_path: join(dir, 'out.png') },
      { signal: new AbortController().signal, agent: { session: { header: { cwd: dir } } } },
    )
    // xAI returned JPEG: the file must be out.jpg, not a .png that lies.
    expect(value.path).toBe(join(dir, 'out.jpg'))
    expect(value.text).toContain('Adjusted the save_path extension')
    expect(new Uint8Array(await readFile(value.path))).toEqual(JPEG)
  })

  it('retries once with a refreshed token after a 401', async () => {
    const seen: string[] = []
    const retryTokens: XaiOAuthTokenSource = {
      available: () => true,
      resolve: async () => 'tok1',
      refresh: async rejected => (rejected === 'tok1' ? 'tok2' : undefined),
    }
    const { registered } = register(async (_input: unknown, init?: RequestInit) => {
      seen.push(String((init?.headers as Record<string, string>).authorization))
      return seen.length === 1
        ? new Response('expired', { status: 401 })
        : new Response(JSON.stringify({ data: [{ b64_json: Buffer.from(PNG).toString('base64') }] }), { status: 200 })
    }, undefined, { tokens: retryTokens })
    const dataUri = `data:image/png;base64,${Buffer.from(PNG).toString('base64')}`
    await registered!.execute(
      { prompt: 'x', image: dataUri },
      { signal: new AbortController().signal, agent: { session: { header: { cwd: '/tmp/ws' } } } },
    )
    expect(seen).toEqual(['Bearer tok1', 'Bearer tok2'])
  })

  it('reads a full attachment reference through the store and sends it as a data URI', async () => {
    const readImage = vi.fn(async () => ({ data: PNG }))
    const saveImage = vi.fn(async () => ({ attachmentId: 'att_2', mediaType: 'image/png', bytes: 12, width: 1, height: 1, name: 'x.png' }))
    let sent: Record<string, unknown> | undefined
    const { registered } = register(async (_input: unknown, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body))
      return new Response(JSON.stringify({ data: [{ b64_json: Buffer.from(PNG).toString('base64') }] }), { status: 200 })
    }, saveImage, { resolveAttachments: () => ({ saveImage, readImage }) })
    const ref = JSON.stringify({ attachmentId: SHA, mediaType: 'image/png', bytes: 12, width: 1, height: 1 })
    await registered!.execute(
      { prompt: 'x', image: ref },
      { signal: new AbortController().signal, agent: { session: { header: { cwd: '/tmp/ws' } } } },
    )
    expect(readImage).toHaveBeenCalledOnce()
    expect(sent?.image).toEqual({ url: `data:image/png;base64,${Buffer.from(PNG).toString('base64')}`, type: 'image_url' })
  })

  it('verifies a bare attachmentId against the host object sha256 and rejects a mismatch', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'grok-edit-'))
    const hostPath = join(dir, 'obj.bin')
    await writeFile(hostPath, PNG)
    const goodId = `sha256:${createHash('sha256').update(PNG).digest('hex')}`
    const saveImage = vi.fn(async () => ({ attachmentId: 'att_3', mediaType: 'image/png', bytes: 12, width: 1, height: 1, name: 'x.png' }))
    const resolveAttachments = () => ({ saveImage, imageHostPath: () => hostPath })
    const { registered } = register(async () => new Response(
      JSON.stringify({ data: [{ b64_json: Buffer.from(PNG).toString('base64') }] }),
      { status: 200 },
    ), saveImage, { resolveAttachments })
    const exec = { signal: new AbortController().signal, agent: { session: { header: { cwd: dir } } } }
    await expect(registered!.execute({ prompt: 'x', image: SHA }, exec)).rejects.toThrow(/integrity verification/)
    await registered!.execute({ prompt: 'x', image: goodId }, exec)
    expect(saveImage).toHaveBeenCalledOnce()
  })
})
