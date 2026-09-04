import { spawn } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { breakStaleWriterLock, isPidAlive, parseLockPid } from '../src/lock-rescue.ts'

const dirs: string[] = []

afterEach(async () => {
  const cleanup = [...dirs]
  dirs.length = 0
  await Promise.all(cleanup.map(path => rm(path, { recursive: true, force: true })))
})

async function deadPid(): Promise<number> {
  const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' })
  await new Promise<void>((resolve, reject) => {
    child.once('exit', () => resolve())
    child.once('error', reject)
  })
  return child.pid!
}

describe('parseLockPid', () => {
  it('accepts only the exact dsh-atomic-write document `${pid}\\n`', () => {
    expect(parseLockPid('123\n')).toBe(123)
  })

  it('rejects missing newline, padding, extra lines, and foreign formats', () => {
    expect(parseLockPid('123')).toBeUndefined()
    expect(parseLockPid(' 123\n')).toBeUndefined()
    expect(parseLockPid('123\n456\n')).toBeUndefined()
    expect(parseLockPid('123\r\n')).toBeUndefined()
    expect(parseLockPid('')).toBeUndefined()
    expect(parseLockPid('not-a-pid\n')).toBeUndefined()
    expect(parseLockPid('-7\n')).toBeUndefined()
    expect(parseLockPid('12 3\n')).toBeUndefined()
    expect(parseLockPid('15016:1788411457')).toBeUndefined()
    expect(parseLockPid('99999999999\n')).toBeUndefined()
  })
})

describe('isPidAlive', () => {
  it('sees the current process as alive', () => {
    expect(isPidAlive(process.pid)).toBe(true)
  })

  it('sees an exited child process as dead', async () => {
    expect(isPidAlive(await deadPid())).toBe(false)
  })

  it('cannot judge non-pids', () => {
    expect(isPidAlive(0)).toBeUndefined()
    expect(isPidAlive(-5)).toBeUndefined()
    expect(isPidAlive(Number.NaN)).toBeUndefined()
  })
})

describe('breakStaleWriterLock', () => {
  async function tempLockPath(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-xai-lock-'))
    dirs.push(dir)
    return join(dir, 'auth.json.lock')
  }

  it('never removes a lock whose recorded owner is gone', async () => {
    const lockPath = await tempLockPath()
    const pid = await deadPid()
    await writeFile(lockPath, `${pid}\n`, { mode: 0o600 })
    await expect(breakStaleWriterLock(lockPath)).resolves.toBeUndefined()
    expect(await readFile(lockPath, 'utf8')).toBe(`${pid}\n`)
  })

  it('never removes a lock owned by a live process', async () => {
    const lockPath = await tempLockPath()
    await writeFile(lockPath, `${process.pid}\n`, { mode: 0o600 })
    await expect(breakStaleWriterLock(lockPath)).resolves.toBeUndefined()
    expect(await readFile(lockPath, 'utf8')).toBe(`${process.pid}\n`)
  })

  it('never removes an empty lock, even when old', async () => {
    const lockPath = await tempLockPath()
    await writeFile(lockPath, '', { mode: 0o600 })
    const when = new Date(Date.now() - 60_000)
    await utimes(lockPath, when, when)
    await expect(breakStaleWriterLock(lockPath)).resolves.toBeUndefined()
    expect(await readFile(lockPath, 'utf8')).toBe('')
  })

  it('never removes foreign or multiline content', async () => {
    const lockPath = await tempLockPath()
    const pid = await deadPid()
    const content = `${pid}\n${pid}\n`
    await writeFile(lockPath, content, { mode: 0o600 })
    await expect(breakStaleWriterLock(lockPath)).resolves.toBeUndefined()
    expect(await readFile(lockPath, 'utf8')).toBe(content)
  })

  it('does not steal a lock replaced by a live writer after a stale observation (GROK-WRITER-LOCK-002)', async () => {
    const lockPath = await tempLockPath()
    const pid = await deadPid()
    await writeFile(lockPath, `${pid}\n`, { mode: 0o600 })
    await expect(breakStaleWriterLock(lockPath)).resolves.toBeUndefined()
    await writeFile(lockPath, `${process.pid}\n`, { mode: 0o600 })
    await expect(breakStaleWriterLock(lockPath)).resolves.toBeUndefined()
    expect(await readFile(lockPath, 'utf8')).toBe(`${process.pid}\n`)
    const leftovers = (await readdir(join(lockPath, '..'))).filter(name => name.includes('.stale-'))
    expect(leftovers).toEqual([])
  })
})
