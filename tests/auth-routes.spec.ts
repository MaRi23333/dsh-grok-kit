import { describe, expect, it } from 'vitest'
import { jsonContentTypeAccepted } from '../src/auth-routes.ts'

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
