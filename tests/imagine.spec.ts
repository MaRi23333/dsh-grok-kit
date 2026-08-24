import { describe, expect, it, vi } from 'vitest'
import { sniffImageMediaType, imagineModelId, applyGrokImagineTool } from '../src/imagine.ts'
import type { XaiOAuthSession } from '../src/session.ts'
import type { XaiOAuthTokenSource } from '../src/token-source.ts'

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])

describe('sniffImageMediaType', () => {
  it('recognizes png and jpeg and rejects unknown bytes', () => {
    expect(sniffImageMediaType(PNG)).toBe('image/png')
    expect(sniffImageMediaType(JPEG)).toBe('image/jpeg')
    expect(sniffImageMediaType(Uint8Array.from([1, 2, 3]))).toBeUndefined()
  })
})

describe('imagineModelId', () => {
  it('prefers grok-imagine-image-2.0 from live ids', () => {
    expect(imagineModelId(['grok-imagine-image', 'grok-imagine-image-2.0'])).toBe('grok-imagine-image-2.0')
    expect(imagineModelId(['grok-imagine-image'])).toBe('grok-imagine-image')
    expect(imagineModelId(undefined)).toBe('grok-imagine-image-2.0')
  })
})

describe('applyGrokImagineTool', () => {
  it('saveImage path renders an ImageBlock; missing cwd fails without writing process.cwd', async () => {
    const saveImage = vi.fn(async () => ({
      attachmentId: 'att_1',
      mediaType: 'image/png' as const,
      bytes: PNG.byteLength,
      width: 1,
      height: 1,
      name: 'grok-imagine.png',
    }))
    const tokens: XaiOAuthTokenSource = {
      available: () => true,
      resolve: async () => 'tok',
    }
    const session = { liveModelIds: () => ['grok-imagine-image-2.0'] } as unknown as XaiOAuthSession
    let registered: { execute: Function; output: { render: Function }; presentResult: Function; presentCall: Function } | undefined
    applyGrokImagineTool({
      tools: { register: (definition: typeof registered) => { registered = definition } },
    } as never, {
      tokens,
      session,
      resolveAttachments: () => ({ saveImage } as never),
      fetch: async () => new Response(JSON.stringify({ data: [{ b64_json: Buffer.from(PNG).toString('base64') }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    })
    const value = await registered!.execute({ prompt: 'a cat' }, { signal: new AbortController().signal, agent: { session: { header: { cwd: '/tmp/ws' } } } })
    expect(saveImage).toHaveBeenCalledOnce()
    const rendered = registered!.output.render({}, value)
    expect(rendered.some((block: { type: string }) => block.type === 'image')).toBe(true)
    expect(registered!.presentCall({ prompt: 'a cat' })).toMatchObject({ card: 'generic', kind: 'other' })
    const presented = registered!.presentResult({ prompt: 'a cat' }, { isError: false, meta: value })
    expect(presented).not.toHaveProperty('kind')
  })

  it('fails with a text error when there is no attachment store and no session cwd', async () => {
    const tokens: XaiOAuthTokenSource = { available: () => true, resolve: async () => 'tok' }
    const session = { liveModelIds: () => undefined } as unknown as XaiOAuthSession
    let registered: { execute: Function } | undefined
    applyGrokImagineTool({
      tools: { register: (definition: typeof registered) => { registered = definition } },
    } as never, {
      tokens,
      session,
      resolveAttachments: () => undefined,
      fetch: async () => new Response(JSON.stringify({ data: [{ b64_json: Buffer.from(PNG).toString('base64') }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    })
    await expect(registered!.execute({ prompt: 'x' }, { signal: new AbortController().signal })).rejects.toThrow(/no session working directory/)
  })

  it('rejects n > 1 before any network call (billed per n, renders one)', async () => {
    const tokens: XaiOAuthTokenSource = { available: () => true, resolve: async () => 'tok' }
    const session = { liveModelIds: () => undefined } as unknown as XaiOAuthSession
    let registered: { execute: Function } | undefined
    let called = false
    applyGrokImagineTool({
      tools: { register: (definition: typeof registered) => { registered = definition } },
    } as never, {
      tokens,
      session,
      resolveAttachments: () => ({ saveImage: async () => ({}) } as never),
      fetch: async () => { called = true; return new Response('{}', { status: 200 }) },
    })
    await expect(registered!.execute({ prompt: 'x', n: 2 }, { signal: new AbortController().signal })).rejects.toThrow(/one image per call/)
    expect(called).toBe(false)
  })
})
