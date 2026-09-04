import { describe, expect, it } from 'vitest'
import { restoreEnv } from './restore-env.ts'

describe('restoreEnv', () => {
  it('deletes a key that was originally missing instead of writing "undefined"', () => {
    const name = 'DSH_GROK_KIT_TEST_ENV_MISSING'
    delete process.env[name]
    const original = process.env[name]
    process.env[name] = 'temp'
    restoreEnv(name, original)
    expect(process.env[name]).toBeUndefined()
    expect(Object.prototype.hasOwnProperty.call(process.env, name)).toBe(false)
  })

  it('restores a previously set value', () => {
    const name = 'DSH_GROK_KIT_TEST_ENV_SET'
    const previous = process.env[name]
    process.env[name] = 'kept'
    const original = process.env[name]
    process.env[name] = 'temp'
    restoreEnv(name, original)
    expect(process.env[name]).toBe('kept')
    restoreEnv(name, previous)
  })
})
