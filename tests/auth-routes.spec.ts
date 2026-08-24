import { describe, expect, it } from 'vitest'
import { Readable } from 'node:stream'
import type { IncomingMessage } from 'node:http'
import { isTrustedRequest, jsonContentTypeAccepted, readJson } from '../src/auth-routes.ts'

describe('jsonContentTypeAccepted (CSRF defense in depth)', () => {
  it('accepts no content-type header (no body)', () => {
    expect(jsonContentTypeAccepted('')).toBe(true)
  })

  it('accepts application/json with and without charset', () => {
    expect(jsonContentTypeAccepted('application/json')).toBe(true)
    expect(jsonContentTypeAccepted('application/json; charset=utf-8')).toBe(true)
    expect(jsonContentTypeAccepted('Application/JSON')).toBe(true)
  })

  it('rejects form and other content types', () => {
    expect(jsonContentTypeAccepted('application/x-www-form-urlencoded')).toBe(false)
    expect(jsonContentTypeAccepted('multipart/form-data; boundary=x')).toBe(false)
    expect(jsonContentTypeAccepted('text/plain')).toBe(false)
  })

  it('rejects json with a different media type prefix', () => {
    // 'application/json-seq' must not pass the exact media-type check.
    expect(jsonContentTypeAccepted('application/json-seq')).toBe(false)
  })
})

describe('isTrustedRequest (loopback + Host pin + Origin)', () => {
  const loopback = '127.0.0.1'
  const headers = (host = '127.0.0.1:3080', origin?: string) => ({ host, ...origin === undefined ? {} : { origin } })

  it('accepts same-origin browser POST', () => {
    expect(isTrustedRequest(loopback, headers('127.0.0.1:3080', 'http://127.0.0.1:3080'), 'POST')).toBe(true)
    expect(isTrustedRequest('::1', headers('localhost:3080', 'http://localhost:3080'), 'POST')).toBe(true)
    expect(isTrustedRequest('::ffff:127.0.0.1', headers('[::1]:3080', 'http://[::1]:3080'), 'POST')).toBe(true)
  })

  it('rejects cross-site and cross-origin writes', () => {
    expect(isTrustedRequest(loopback, headers('127.0.0.1:3080', 'http://evil.example'), 'POST')).toBe(false)
    expect(isTrustedRequest(loopback, headers('127.0.0.1:3080', 'http://127.0.0.1:9999'), 'POST')).toBe(false)
    expect(isTrustedRequest(loopback, { host: '127.0.0.1:3080', 'sec-fetch-site': 'cross-site' }, 'POST')).toBe(false)
    // Host:port equality only (no protocol compare): an https Origin pointing
    // at an http target is blocked by browser mixed-content rules anyway.
    expect(isTrustedRequest(loopback, headers('127.0.0.1:3080', 'https://127.0.0.1:3080'), 'POST')).toBe(true)
  })

  it('requires Origin on writes (local-process CSRF slot)', () => {
    expect(isTrustedRequest(loopback, headers('127.0.0.1:3080'), 'POST')).toBe(false)
    expect(isTrustedRequest(loopback, headers(), 'PUT')).toBe(false)
  })

  it('allows no-Origin GET status reads', () => {
    expect(isTrustedRequest(loopback, headers('127.0.0.1:3080'), 'GET')).toBe(true)
  })

  it('rejects non-loopback peers, missing/malformed Host, and DNS-rebinding hosts', () => {
    expect(isTrustedRequest('192.168.1.10', headers('127.0.0.1:3080', 'http://127.0.0.1:3080'), 'POST')).toBe(false)
    expect(isTrustedRequest(loopback, {}, 'GET')).toBe(false)
    expect(isTrustedRequest(loopback, headers('evil.example', 'http://evil.example'), 'POST')).toBe(false)
    expect(isTrustedRequest(loopback, { host: 'evil.example' }, 'GET')).toBe(false)
  })
})

describe('readJson (body ceiling)', () => {
  function request(chunks: Buffer[], contentType = 'application/json'): IncomingMessage {
    const stream = Readable.from(chunks) as unknown as IncomingMessage
    stream.headers = { 'content-type': contentType }
    return stream
  }

  it('parses a normal JSON body', async () => {
    await expect(readJson(request([Buffer.from('{"a":1,"selected":["grok-4.6"]}')]))).resolves.toEqual({
      a: 1,
      selected: ['grok-4.6'],
    })
  })

  it('returns {} for an empty body', async () => {
    await expect(readJson(request([]))).resolves.toEqual({})
  })

  it('rejects a body over 1 MiB with a 413-class error', async () => {
    const big = Buffer.alloc(1024 * 1024 + 1, 0x41)
    await expect(readJson(request([big]))).rejects.toThrow(/too large/)
  })

  it('rejects malformed JSON', async () => {
    await expect(readJson(request([Buffer.from('{nope')]))).rejects.toThrow()
  })

  it('rejects non-JSON content types', async () => {
    await expect(readJson(request([Buffer.from('a=1')], 'application/x-www-form-urlencoded'))).rejects.toThrow(
      /content-type/,
    )
  })
})
