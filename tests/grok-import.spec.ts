import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  grokAuthPath,
  importGrokAuth,
  isGrokAuthPath,
  parseGrokAuthDocument,
  probeGrokAuth,
  removeGrokAuthSlot,
  writeGrokAuthDocument,
} from '../src/grok-import.ts'
import { XAI_PI_PROVIDER } from '../src/ids.ts'
import { XaiOAuthCredentialStore } from '../src/store.ts'

const grokShape = {
  'https://auth.x.ai::b1a00492-073a-47ea-816f-4c329264a828': {
    key: 'access-from-grok',
    refresh_token: 'refresh-from-grok',
    expires_at: '2026-08-14T12:00:00.000000Z',
    oidc_issuer: 'https://auth.x.ai',
    user_id: 'user-1',
    email: 'hidden@example.com',
  },
}

describe('parseGrokAuthDocument', () => {
  it('reads the Grok CLI issuer::client_id document', () => {
    const credential = parseGrokAuthDocument(JSON.stringify(grokShape), 'auth.json')
    expect(credential).toMatchObject({
      type: 'oauth',
      access: 'access-from-grok',
      refresh: 'refresh-from-grok',
      accountId: 'user-1',
    })
    expect(credential.expires).toBe(Date.parse('2026-08-14T12:00:00.000000Z'))
  })

  it('accepts a flat access_token document', () => {
    const credential = parseGrokAuthDocument(JSON.stringify({
      access_token: 'a',
      refresh_token: 'r',
      expires_in: 3600,
    }), 'auth.json')
    expect(credential.access).toBe('a')
    expect(credential.refresh).toBe('r')
    expect(credential.expires).toBeGreaterThan(Date.now())
  })

  it('rejects a document without a refresh token', () => {
    expect(() => parseGrokAuthDocument(JSON.stringify({ key: 'only-access' }), 'auth.json')).toThrow(/refresh token/)
  })

  it('rejects a multi-provider document when no pair marks auth.x.ai', () => {
    const multi = {
      'other-provider': { access_token: 'a1', refresh_token: 'r1', oidc_issuer: 'https://other.example' },
      'yet-another': { access_token: 'a2', refresh_token: 'r2', oidc_issuer: 'https://another.example' },
    }
    expect(() => parseGrokAuthDocument(JSON.stringify(multi), 'auth.json')).toThrow(/none marks auth\.x\.ai/)
  })
})

describe('importGrokAuth', () => {
  it('copies tokens into the dsh store and leaves the Grok file unchanged', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-xai-grok-'))
    const grokFile = join(dir, 'auth.json')
    const dshFile = join(dir, 'dsh.json')
    const original = `${JSON.stringify(grokShape, null, 2)}\n`
    await writeFile(grokFile, original)
    const store = new XaiOAuthCredentialStore(dshFile)
    await importGrokAuth(store, grokFile)
    expect(await readFile(grokFile, 'utf8')).toBe(original)
    const stored = await store.read(XAI_PI_PROVIDER)
    expect(stored).toMatchObject({ type: 'oauth', access: 'access-from-grok', refresh: 'refresh-from-grok' })
  })

  it('probes availability without returning secrets', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-xai-probe-'))
    const missing = await probeGrokAuth(join(dir, 'missing.json'))
    expect(missing.available).toBe(false)
    const grokFile = join(dir, 'auth.json')
    await writeFile(grokFile, JSON.stringify(grokShape))
    const present = await probeGrokAuth(grokFile)
    expect(present.available).toBe(true)
    expect(JSON.stringify(present)).not.toContain('access-from-grok')
    expect(JSON.stringify(present)).not.toContain('refresh-from-grok')
  })
})

describe('writeGrokAuthDocument', () => {
  it('updates tokens in place and keeps profile fields', () => {
    const next = writeGrokAuthDocument(JSON.stringify(grokShape), {
      type: 'oauth',
      access: 'new-access',
      refresh: 'new-refresh',
      expires: Date.parse('2026-08-23T18:00:00.000Z'),
      accountId: 'user-1',
    })
    const parsed = JSON.parse(next) as typeof grokShape
    const slot = parsed['https://auth.x.ai::b1a00492-073a-47ea-816f-4c329264a828']
    expect(slot).toMatchObject({
      key: 'new-access',
      refresh_token: 'new-refresh',
      expires_at: '2026-08-23T18:00:00.000Z',
      email: 'hidden@example.com',
      user_id: 'user-1',
      oidc_issuer: 'https://auth.x.ai',
    })
  })

  it('creates the standard xAI slot when the document is empty', () => {
    const next = writeGrokAuthDocument(undefined, {
      type: 'oauth', access: 'a', refresh: 'r', expires: Date.parse('2026-01-01T00:00:00.000Z'),
    })
    expect(JSON.parse(next)).toMatchObject({
      'https://auth.x.ai::b1a00492-073a-47ea-816f-4c329264a828': {
        key: 'a',
        refresh_token: 'r',
      },
    })
  })

  it('removes only the xAI slot', () => {
    const withOther = {
      ...grokShape,
      'https://other.example::client': { access_token: 'x', refresh_token: 'y' },
    }
    const next = removeGrokAuthSlot(JSON.stringify(withOther))
    expect(next).toBeDefined()
    const parsed = JSON.parse(next!) as Record<string, unknown>
    expect(parsed['https://auth.x.ai::b1a00492-073a-47ea-816f-4c329264a828']).toBeUndefined()
    expect(parsed['https://other.example::client']).toBeDefined()
    expect(removeGrokAuthSlot(JSON.stringify(grokShape))).toBeUndefined()
  })
})

describe('grokAuthPath', () => {
  it('resolves under the given home', () => {
    expect(grokAuthPath('/tmp/home').replaceAll('\\', '/')).toMatch(/\/tmp\/home\/.grok\/auth\.json$/)
    expect(isGrokAuthPath('/tmp/home/.grok/auth.json')).toBe(true)
    expect(isGrokAuthPath('/tmp/home/.dsh/.xai-oauth-auth.json')).toBe(false)
  })
})
