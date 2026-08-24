import { describe, expect, it } from 'vitest'
import {
  capSources,
  formatGrokSearchOutput,
  parseGrokWebSearchArgs,
  parseXSearchArgs,
  projectSearchSource,
  DEFAULT_SEARCH_MAX_RESULTS,
  DEFAULT_WEB_SEARCH_TIMEOUT_MS,
  DEFAULT_X_SEARCH_TIMEOUT_MS,
} from '../src/tools.ts'
import type { SearchResult } from '../src/search.ts'

const sample: SearchResult = {
  content: 'A Grok summary.',
  sources: [
    { url: 'https://a.example/', title: 'A title', snippet: 'A snippet', publishedAt: '2026-08-22' },
    { url: 'https://b.example/' },
  ],
  truncated: false,
}

describe('tool formatting', () => {
  it('formats answer, sources, and the standing citation instruction', () => {
    const text = formatGrokSearchOutput(sample)
    expect(text).toContain('A Grok summary.')
    expect(text).toContain('[A title](https://a.example/) — A snippet (2026-08-22)')
    expect(text).toContain('[b.example](https://b.example/)')
    expect(text).toContain('Cite the relevant URLs')
  })

  it('falls back to hostname and reports empty results', () => {
    const text = formatGrokSearchOutput({ sources: [], truncated: false })
    expect(text).toContain('No results found.')
  })

  it('carries the truncation note when the seam cut sources', () => {
    const text = formatGrokSearchOutput(capSources(sample, 1))
    expect(text).toContain('Showing the first 1 sources')
    expect(capSources(sample, 1).truncated).toBe(true)
  })
})

describe('projectSearchSource', () => {
  it('omits every absent optional field', () => {
    expect(projectSearchSource({ url: 'https://x.example/' })).toEqual({ url: 'https://x.example/' })
    expect(projectSearchSource({ url: 'https://x.example/', title: 't' })).toEqual({ url: 'https://x.example/', title: 't' })
  })
})

describe('parseGrokWebSearchArgs', () => {
  it('accepts a bare query and official domain filters', () => {
    expect(parseGrokWebSearchArgs({ query: 'latest' })).toEqual({ query: 'latest' })
    expect(parseGrokWebSearchArgs({
      query: 'docs',
      allowed_domains: ['https://x.ai/news', 'X.AI'],
      excluded_domains: ['example.com'],
    })).toEqual({
      query: 'docs',
      allowedDomains: ['x.ai'],
      excludedDomains: ['example.com'],
    })
  })

  it('rejects an empty query and an oversized domain list', () => {
    expect(() => parseGrokWebSearchArgs({ query: '   ' })).toThrow(/non-empty/)
    expect(() => parseGrokWebSearchArgs({
      query: 'q',
      allowed_domains: ['a.com', 'b.com', 'c.com', 'd.com', 'e.com', 'f.com'],
    })).toThrow(/at most 5/)
  })
})

describe('parseXSearchArgs', () => {
  it('strips @, de-dupes handles, and keeps an ISO date window', () => {
    expect(parseXSearchArgs({
      query: 'Starship',
      allowed_x_handles: ['@elonmusk', 'elonmusk', 'SpaceX'],
      from_date: '2026-08-01',
      to_date: '2026-08-23',
    })).toEqual({
      query: 'Starship',
      allowedXHandles: ['elonmusk', 'SpaceX'],
      fromDate: '2026-08-01',
      toDate: '2026-08-23',
    })
  })

  it('rejects inverted dates and illegal handles', () => {
    expect(() => parseXSearchArgs({ query: 'q', from_date: '2026-08-23', to_date: '2026-08-01' })).toThrow(/on or before/)
    expect(() => parseXSearchArgs({ query: 'q', allowed_x_handles: ['not a handle!!'] })).toThrow(/invalid X handle/)
    expect(() => parseXSearchArgs({ query: 'q', from_date: '08-23-2026' })).toThrow(/YYYY-MM-DD/)
    expect(() => parseXSearchArgs({
      query: 'q',
      allowed_x_handles: ['a'],
      excluded_x_handles: ['b'],
    })).toThrow(/cannot be set together/)
  })

  it('accepts 20 handles and rejects 21', () => {
    const twenty = Array.from({ length: 20 }, (_, i) => `h${i}`)
    expect(parseXSearchArgs({ query: 'q', allowed_x_handles: twenty }).allowedXHandles).toHaveLength(20)
    expect(() => parseXSearchArgs({ query: 'q', allowed_x_handles: [...twenty, 'h20'] })).toThrow(/at most 20/)
  })
})

describe('defaults', () => {
  it('keeps an x_search budget above the measured xAI latency', () => {
    expect(DEFAULT_SEARCH_MAX_RESULTS).toBe(8)
    expect(DEFAULT_X_SEARCH_TIMEOUT_MS).toBeGreaterThanOrEqual(120_000)
    expect(DEFAULT_WEB_SEARCH_TIMEOUT_MS).toBeGreaterThanOrEqual(45_000)
  })
})
