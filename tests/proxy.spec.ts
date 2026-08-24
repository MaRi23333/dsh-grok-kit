import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  applyXaiProxy,
  installXaiFetchHook,
  readStoredProxyUrl,
  resolveXaiProxyUrl,
  setXaiProxyUrl,
  validProxyUrl,
  writeStoredProxyUrl,
  xaiProxyPath,
} from '../src/proxy.ts'

const originalHome = process.env.DSH_HOME
const originalEnv = process.env.DSH_XAI_PROXY
let dir: string | undefined

afterEach(async () => {
  process.env.DSH_HOME = originalHome
  process.env.DSH_XAI_PROXY = originalEnv
  setXaiProxyUrl('')
  if (dir !== undefined) await rm(dir, { recursive: true, force: true })
  dir = undefined
})

async function tempHome(): Promise<string> {
  dir = await mkdtemp(join(tmpdir(), 'dsh-grok-kit-proxy-'))
  process.env.DSH_HOME = dir
  return dir
}

describe('proxy settings', () => {
  it('resolves precedence: stored setting > config > DSH_XAI_PROXY env', async () => {
    const home = await tempHome()
    process.env.DSH_XAI_PROXY = 'http://env.example:7897'
    expect(resolveXaiProxyUrl('http://config.example:7897')).toBe('http://config.example:7897')

    await writeStoredProxyUrl('http://stored.example:7897')
    expect(resolveXaiProxyUrl('http://config.example:7897')).toBe('http://stored.example:7897')

    // Cleared stored setting falls back to config.
    await writeStoredProxyUrl('')
    expect(resolveXaiProxyUrl('http://config.example:7897')).toBe('http://config.example:7897')

    // Config cleared: env.
    expect(resolveXaiProxyUrl('')).toBe('http://env.example:7897')

    // Everything cleared: direct.
    process.env.DSH_XAI_PROXY = ''
    expect(resolveXaiProxyUrl('')).toBe('')
    expect(readStoredProxyUrl()).toBe('')
    expect(await readFile(xaiProxyPath(home), 'utf8')).toContain('"version": 1')
  })

  it('treats an unsupported stored version as unset', async () => {
    const home = await tempHome()
    await writeFile(xaiProxyPath(home), `${JSON.stringify({ version: 99, proxyUrl: 'http://evil.example:9' })}\n`)
    expect(readStoredProxyUrl()).toBe('')
    expect(resolveXaiProxyUrl('')).toBe('')
  })

  it('trims whitespace around the stored URL', async () => {
    await tempHome()
    await writeStoredProxyUrl('  http://a.example:7897  ')
    expect(resolveXaiProxyUrl('')).toBe('http://a.example:7897')
    await writeStoredProxyUrl('https://socks5wontwork.example:1080')
    expect(resolveXaiProxyUrl('')).toBe('https://socks5wontwork.example:1080')
    await writeStoredProxyUrl('')
  })

  it('applyXaiProxy returns the effective URL and clears cleanly', async () => {
    await tempHome()
    expect(applyXaiProxy('')).toBe('')
    expect(applyXaiProxy('http://127.0.0.1:8080')).toBe('http://127.0.0.1:8080')
    expect(applyXaiProxy('')).toBe('')
  })

  it('treats the literal "undefined"/"null" env spellings as unset and never throws on a bad URL', async () => {
    await tempHome()
    process.env.DSH_XAI_PROXY = 'undefined'
    expect(resolveXaiProxyUrl('')).toBe('')
    expect(applyXaiProxy('')).toBe('')
    process.env.DSH_XAI_PROXY = 'null'
    expect(resolveXaiProxyUrl('')).toBe('')
    // Invalid values are rejected, not crash-on-apply.
    expect(validProxyUrl('not a url')).toBeUndefined()
    expect(validProxyUrl('ftp://example:21')).toBeUndefined()
    expect(setXaiProxyUrl('not a url')).toBe(false)
    expect(setXaiProxyUrl('http://127.0.0.1:8080')).toBe(true)
    expect(setXaiProxyUrl('')).toBe(true)
  })

  it('refuses proxy URLs with embedded credentials and never persists them', async () => {
    const home = await tempHome()
    expect(validProxyUrl('http://user:pass@example.com:8080')).toBeUndefined()
    expect(validProxyUrl('http://user@example.com:8080')).toBeUndefined()
    expect(validProxyUrl('http://example.com:8080')).toBe('http://example.com:8080')
    expect(setXaiProxyUrl('http://user:pass@example.com:8080')).toBe(false)

    // Direct write of credentials is fail-closed: nothing hits the disk.
    await expect(writeStoredProxyUrl('http://user:pass@example.com:8080')).rejects.toThrow(/credentials/)
    expect(await readFile(xaiProxyPath(home), 'utf8').catch(() => '')).not.toContain('user')

    // A legacy file that already contains credentials is scrubbed ON DISK.
    await writeFile(xaiProxyPath(home), `${JSON.stringify({
      version: 1,
      proxyUrl: 'http://user:pass@example.com:8080',
    })}\n`)
    expect(readStoredProxyUrl()).toBe('')
    const disk = await readFile(xaiProxyPath(home), 'utf8')
    expect(disk).not.toContain('user')
    expect(disk).not.toContain('pass')
    expect(JSON.parse(disk)).toMatchObject({ version: 1, proxyUrl: '' })

    // env/config with credentials resolve to '' (nothing is routed).
    process.env.DSH_XAI_PROXY = 'http://user:pass@example.com:8080'
    expect(resolveXaiProxyUrl('')).toBe('')
    process.env.DSH_XAI_PROXY = ''
  })

  it('install/dispose restores the original fetch', async () => {
    await tempHome()
    const original = globalThis.fetch
    const d1 = installXaiFetchHook()
    applyXaiProxy('http://127.0.0.1:8080')
    expect(globalThis.fetch).not.toBe(original)
    d1()
    expect(globalThis.fetch).toBe(original)
    // Install again after dispose works (idempotent cycles).
    const d2 = installXaiFetchHook()
    applyXaiProxy('')
    expect(globalThis.fetch).not.toBe(original)
    d2()
    expect(globalThis.fetch).toBe(original)
  })

  it('reference counts owners: one release keeps the hook, the last restores it', async () => {
    const original = globalThis.fetch
    const d1 = installXaiFetchHook()
    const d2 = installXaiFetchHook()
    d1()
    expect(globalThis.fetch).not.toBe(original) // nestedStillHooked: true
    d2()
    expect(globalThis.fetch).toBe(original)
    // Released disposers are idempotent.
    d1()
    expect(globalThis.fetch).toBe(original)
  })

  it('never clobbers a fetch installed by a later component', async () => {
    const later = ((_input: unknown) => Promise.resolve(new Response('later'))) as typeof fetch
    const d1 = installXaiFetchHook()
    globalThis.fetch = later
    d1()
    expect(globalThis.fetch).toBe(later) // preservesLaterHook: true
    globalThis.fetch = later
  })
})
