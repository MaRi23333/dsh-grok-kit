import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  applyXaiProxy,
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
})
