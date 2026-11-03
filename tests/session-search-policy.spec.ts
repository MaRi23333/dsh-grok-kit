import { describe, expect, it } from 'vitest'
import { SessionSearchPolicy, withSearchRequest } from '../src/session-search-policy.ts'

async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = []
  for await (const item of source) result.push(item)
  return result
}

describe('explicit session search policy', () => {
  it('isolates bindings, reads the latest value and leaves other sessions unbound', () => {
    const policy = new SessionSearchPolicy()
    let on = true
    const off = policy.bindSession('qq', {}, () => on)
    policy.bindSession('tg', {}, () => false)
    expect(policy.resolve('qq')).toBe(true)
    expect(policy.resolve('tg')).toBe(false)
    expect(policy.resolve('desktop')).toBeUndefined()
    on = false
    expect(policy.resolve('qq')).toBe(false)
    off()
    expect(policy.resolve('qq')).toBeUndefined()
  })

  it('rejects another owner and stale disposers cannot remove a replacement', () => {
    const policy = new SessionSearchPolicy(), owner = {}
    const old = policy.bindSession('qq', owner, () => true)
    expect(() => policy.bindSession('qq', {}, () => false)).toThrow('different owner')
    const current = policy.bindSession('qq', owner, () => false)
    old()
    expect(policy.resolve('qq')).toBe(false)
    current()
    expect(policy.resolve('qq')).toBeUndefined()
  })

  it('fails closed after unload and does not hide a broken getter', () => {
    const policy = new SessionSearchPolicy()
    policy.bindSession('broken', {}, () => { throw new Error('bad policy') })
    expect(() => policy.resolve('broken')).toThrow('bad policy')
    policy.bindSession('invalid', {}, () => 'yes' as unknown as boolean)
    expect(() => policy.resolve('invalid')).toThrow('boolean')
    policy.dispose()
    expect(policy.resolve('qq')).toBe(false)
    expect(() => policy.bindSession('qq', {}, () => true)).toThrow('disposed')
  })

  it('suppresses auxiliary requests with a bound ID without leaking into concurrent chat', async () => {
    const policy = new SessionSearchPolicy()
    policy.bindSession('same-id', {}, () => true)
    const generate = (sessionId: string, purpose?: 'compaction') => withSearchRequest({ sessionId, purpose }, async function* () {
      await Promise.resolve()
      yield policy.resolve(sessionId)
      await Promise.resolve()
      yield policy.resolve(sessionId)
    })
    const results = await Promise.all([
      collect(generate('same-id', 'compaction')),
      collect(generate('same-id')),
      collect(generate('unbound', 'compaction')),
    ])
    expect(results).toEqual([[false, false], [true, true], [undefined, undefined]])
    expect(policy.resolve('same-id')).toBe(true)
  })

  it('closes an interrupted lazy iterator in its request context', async () => {
    const policy = new SessionSearchPolicy()
    policy.bindSession('qq', {}, () => true)
    let finalMode: boolean | undefined
    const source = withSearchRequest({ sessionId: 'qq', purpose: 'compaction' }, async function* () {
      try { yield policy.resolve('qq'); yield true }
      finally { finalMode = policy.resolve('qq') }
    })
    expect(await source.next()).toMatchObject({ value: false })
    expect(policy.resolve('qq')).toBe(true)
    await source.return(undefined)
    expect(finalMode).toBe(false)
  })
})
