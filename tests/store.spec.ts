import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { XAI_OAUTH_ROUTE, XAI_PI_PROVIDER } from '../src/ids.ts'
import { lockPathForAuthFile, resolveXaiOAuthStorePath, XaiOAuthCredentialStore } from '../src/store.ts'

const files: string[] = []

afterEach(async () => {
  files.length = 0
})

async function tempStore(): Promise<XaiOAuthCredentialStore> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-xai-'))
  const filename = join(dir, 'auth.json')
  files.push(filename)
  return new XaiOAuthCredentialStore(filename)
}

describe('XaiOAuthCredentialStore', () => {
  it('round-trips an oauth credential', async () => {
    const store = await tempStore()
    const written = await store.modify(XAI_PI_PROVIDER, async () => ({
      type: 'oauth',
      access: 'access-token',
      refresh: 'refresh-token',
      expires: 1_700_000_000_000,
    }))
    expect(written).toMatchObject({ type: 'oauth', access: 'access-token', refresh: 'refresh-token' })
    const read = await store.read(XAI_PI_PROVIDER)
    expect(read).toEqual(written)
    expect(await store.list()).toEqual([{ providerId: XAI_PI_PROVIDER, type: 'oauth' }])
    const text = await readFile(store.filename, 'utf8')
    expect(text).not.toContain('XAI_API_KEY')
    expect(JSON.parse(text).version).toBe(1)
  })

  it('ignores other provider ids on read and refuses them on write', async () => {
    const store = await tempStore()
    await store.modify(XAI_PI_PROVIDER, async () => ({
      type: 'oauth',
      access: 'a',
      refresh: 'r',
      expires: 1,
    }))
    expect(await store.read('openai-codex')).toBeUndefined()
    await expect(store.modify('openai-codex', async current => current)).rejects.toThrow(/does not own/)
  })

  it('reads and writes the same credential for the route id alias too', async () => {
    const store = await tempStore()
    await store.modify(XAI_PI_PROVIDER, async () => ({
      type: 'oauth',
      access: 'aaa',
      refresh: 'rrr',
      expires: 1,
    }))
    // The pi-ai collection resolves auth under the harness route id.
    expect(await store.read(XAI_OAUTH_ROUTE)).toMatchObject({ type: 'oauth', access: 'aaa' })
    const rotated = await store.modify(XAI_OAUTH_ROUTE, async current => ({
      ...current!,
      access: 'bbb',
      refresh: 'rrr2',
      expires: 999,
    }))
    expect(rotated).toMatchObject({ type: 'oauth', access: 'bbb', refresh: 'rrr2' })
    expect(await store.read(XAI_PI_PROVIDER)).toMatchObject({ access: 'bbb' })
    await store.delete(XAI_OAUTH_ROUTE)
    expect(await store.read(XAI_PI_PROVIDER)).toBeUndefined()
  })

  it('rejects an unsupported document version', async () => {
    const store = await tempStore()
    await writeFile(store.filename, `${JSON.stringify({
      version: 99,
      credential: { type: 'oauth', access: 'a', refresh: 'r', expires: 1 },
    })}\n`, { mode: 0o600 })
    await expect(store.read(XAI_PI_PROVIDER)).rejects.toThrow(/unsupported auth format version/)
  })

  it('rejects unknown credential fields', async () => {
    const store = await tempStore()
    await writeFile(store.filename, `${JSON.stringify({
      version: 1,
      credential: { type: 'oauth', access: 'a', refresh: 'r', expires: 1, leak: 'nope' },
    })}\n`, { mode: 0o600 })
    await expect(store.read(XAI_PI_PROVIDER)).rejects.toThrow(/unknown field/)
  })

  it('deletes only the xAI credential', async () => {
    const store = await tempStore()
    await store.modify(XAI_PI_PROVIDER, async () => ({
      type: 'oauth',
      access: 'a',
      refresh: 'r',
      expires: 1,
    }))
    await store.delete(XAI_PI_PROVIDER)
    expect(await store.read(XAI_PI_PROVIDER)).toBeUndefined()
    expect(await store.list()).toEqual([])
  })

  it('reads and writes a Grok CLI auth.json without dropping extra slot fields', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-xai-grok-store-'))
    const grokDir = join(dir, '.grok')
    await mkdir(grokDir, { recursive: true })
    const filename = join(grokDir, 'auth.json')
    await writeFile(filename, `${JSON.stringify({
      'https://auth.x.ai::b1a00492-073a-47ea-816f-4c329264a828': {
        key: 'old-access',
        refresh_token: 'old-refresh',
        expires_at: '2026-08-14T12:00:00.000Z',
        oidc_issuer: 'https://auth.x.ai',
        email: 'keep@example.com',
        first_name: 'Ada',
      },
    }, null, 2)}\n`, { mode: 0o600 })
    const store = new XaiOAuthCredentialStore(filename)
    expect(store.sharedWithGrokCli).toBe(true)
    expect(await store.read(XAI_PI_PROVIDER)).toMatchObject({ type: 'oauth', access: 'old-access' })
    await store.modify(XAI_PI_PROVIDER, async current => ({
      type: 'oauth',
      access: 'new-access',
      refresh: 'new-refresh',
      expires: Date.parse('2026-08-23T18:00:00.000Z'),
      accountId: current && 'accountId' in current ? current.accountId : undefined,
    }))
    const slot = (JSON.parse(await readFile(filename, 'utf8')) as Record<string, Record<string, unknown>>)[
      'https://auth.x.ai::b1a00492-073a-47ea-816f-4c329264a828'
    ]
    expect(slot).toMatchObject({
      key: 'new-access',
      refresh_token: 'new-refresh',
      email: 'keep@example.com',
      first_name: 'Ada',
    })
  })

  it('prefers ~/.grok/auth.json over a leftover dsh credential file', async () => {
    const home = await mkdtemp(join(tmpdir(), 'dsh-xai-homes-'))
    const userHome = join(home, 'user')
    const dshHome = join(home, 'dsh')
    await mkdir(join(userHome, '.grok'), { recursive: true })
    await mkdir(dshHome, { recursive: true })
    await writeFile(join(userHome, '.grok', 'auth.json'), '{}\n', { mode: 0o600 })
    await writeFile(join(dshHome, '.xai-oauth-auth.json'), '{}\n', { mode: 0o600 })
    expect(resolveXaiOAuthStorePath({ userHome, dshHome }).replaceAll('\\', '/'))
      .toMatch(/\/user\/.grok\/auth\.json$/)
  })

  it('keeps the writer lock out of ~/.grok when sharing the Grok CLI file', () => {
    const grok = lockPathForAuthFile(join('/home', 'u', '.grok', 'auth.json')).replaceAll('\\', '/')
    expect(grok).toMatch(/\/.dsh\/.xai-oauth-auth\.json$/)
    expect(grok).not.toContain('/.grok/')
    const store = new XaiOAuthCredentialStore(join(tmpdir(), 'dsh-xai-lockpath', '.grok', 'auth.json'))
    expect(store.lockFilename.replaceAll('\\', '/')).toMatch(/\/dsh-xai-lockpath\/.dsh\/.xai-oauth-auth\.json$/)
  })

  it.runIf(process.platform !== 'win32')('rejects a credential file readable beyond the owner (Linux)', async () => {
    const store = await tempStore()
    await store.modify(XAI_PI_PROVIDER, async () => ({
      type: 'oauth',
      access: 'a',
      refresh: 'r',
      expires: 1,
    }))
    await chmod(store.filename, 0o644)
    await expect(store.read(XAI_PI_PROVIDER)).rejects.toThrow(/readable beyond its owner/)
    await chmod(store.filename, 0o600)
    await expect(store.read(XAI_PI_PROVIDER)).resolves.toMatchObject({ type: 'oauth', access: 'a' })
  })
})
