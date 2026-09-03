import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { breakStaleWriterLock, EMPTY_LOCK_GRACE_MS, isPidAlive, parseLockPid } from '../src/lock-rescue.ts'

const files: string[] = []

afterEach(async () => {
  const cleanup = [...files]
  files.length = 0
  await Promise.all(cleanup.map(path => rm(path, { force: true })))
})

/** Backdate a file's mtime so age-based logic sees it as old. */
async function ageFile(path: string, ageMs: number): Promise<void> {
  const when = new Date(Date.now() - ageMs)
  await utimes(path, when, when)
}

/** A pid that is definitely gone: spawn a short-lived child and wait for exit. */
async function deadPid(): Promise<number> {
  const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' })
  await new Promise<void>((resolve, reject) => {
    child.once('exit', () => resolve())
    child.once('error', reject)
  })
  return child.pid!
}

describe('parseLockPid', () => {
  it('reads the dsh-atomic-write pid line', () => {
    expect(parseLockPid('123\n')).toBe(123)
    expect(parseLockPid('123')).toBe(123)
  })

  it('rejects content without a bare positive integer first line', () => {
    expect(parseLockPid('')).toBeUndefined()
    expect(parseLockPid('not-a-pid\n')).toBeUndefined()
    expect(parseLockPid('-7\n')).toBeUndefined()
    expect(parseLockPid('12 3\n')).toBeUndefined()
    // 11 digits cannot be a pid on any supported platform.
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
    const lockPath = join(dir, 'auth.json.lock')
    files.push(lockPath)
    return lockPath
  }

  it('is a no-op when the lock file is missing', async () => {
    const lockPath = join(tmpdir(), `dsh-xai-lock-missing-${Date.now()}.lock`)
    await expect(breakStaleWriterLock(lockPath)).resolves.toBeUndefined()
  })

  it('removes a lock whose recorded owner process is gone', async () => {
    const lockPath = await tempLockPath()
    const pid = await deadPid()
    await writeFile(lockPath, `${pid}\n`, { mode: 0o600 })
    await expect(breakStaleWriterLock(lockPath)).resolves.toBe(pid)
    await expect(readFile(lockPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('leaves a lock owned by a live process alone', async () => {
    const lockPath = await tempLockPath()
    await writeFile(lockPath, `${process.pid}\n`, { mode: 0o600 })
    await expect(breakStaleWriterLock(lockPath)).resolves.toBeUndefined()
    expect(await readFile(lockPath, 'utf8')).toBe(`${process.pid}\n`)
  })

  it('leaves a lock with unparsable content for the operator', async () => {
    const lockPath = await tempLockPath()
    await writeFile(lockPath, '{"grok":"cli"}\n', { mode: 0o600 })
    await expect(breakStaleWriterLock(lockPath)).resolves.toBeUndefined()
    expect(await readFile(lockPath, 'utf8')).toBe('{"grok":"cli"}\n')
  })

  it('leaves a foreign pid:timestamp lock (Grok CLI format) for the operator', async () => {
    const lockPath = await tempLockPath()
    // Real-world format observed at ~/.grok/auth.json.lock.
    const content = '15016:1788411457'
    await writeFile(lockPath, content, { mode: 0o600 })
    await ageFile(lockPath, EMPTY_LOCK_GRACE_MS * 10)
    await expect(breakStaleWriterLock(lockPath)).resolves.toBeUndefined()
    expect(await readFile(lockPath, 'utf8')).toBe(content)
  })

  it('removes an empty lock past the grace window (owner died before writing the pid)', async () => {
    const lockPath = await tempLockPath()
    await writeFile(lockPath, '', { mode: 0o600 })
    await ageFile(lockPath, EMPTY_LOCK_GRACE_MS + 1_000)
    await expect(breakStaleWriterLock(lockPath)).resolves.toBe(0)
    await expect(readFile(lockPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('leaves a fresh empty lock alone (may be a live writer mid-write)', async () => {
    const lockPath = await tempLockPath()
    await writeFile(lockPath, '', { mode: 0o600 })
    await expect(breakStaleWriterLock(lockPath)).resolves.toBeUndefined()
    expect(await readFile(lockPath, 'utf8')).toBe('')
  })

  it('stays harmless when two contenders break the same stale lock', async () => {
    const lockPath = await tempLockPath()
    const pid = await deadPid()
    await writeFile(lockPath, `${pid}\n`, { mode: 0o600 })
    const results = await Promise.all([
      breakStaleWriterLock(lockPath),
      breakStaleWriterLock(lockPath),
    ])
    expect(results.some(result => result === pid)).toBe(true)
    await expect(readFile(lockPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
