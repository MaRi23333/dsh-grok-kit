import { spawn } from 'node:child_process'
import { copyFile, mkdtemp, readFile, readdir, rename, rm, utimes, writeFile } from 'node:fs/promises'
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

  it('does not evict a live writer that paused past any age threshold with an empty lock', async () => {
    const lockPath = await tempLockPath()
    await writeFile(lockPath, '', { mode: 0o600 })
    const when = new Date(Date.now() - 60_000)
    await utimes(lockPath, when, when)
    await expect(breakStaleWriterLock(lockPath)).resolves.toBeUndefined()
    expect(await readFile(lockPath, 'utf8')).toBe('')
  })

  it('leaves a lock with unparsable content for the operator', async () => {
    const lockPath = await tempLockPath()
    await writeFile(lockPath, '{"grok":"cli"}\n', { mode: 0o600 })
    await expect(breakStaleWriterLock(lockPath)).resolves.toBeUndefined()
    expect(await readFile(lockPath, 'utf8')).toBe('{"grok":"cli"}\n')
  })

  it('leaves a foreign pid:timestamp lock (Grok CLI format) for the operator', async () => {
    const lockPath = await tempLockPath()
    const content = '15016:1788411457'
    await writeFile(lockPath, content, { mode: 0o600 })
    await expect(breakStaleWriterLock(lockPath)).resolves.toBeUndefined()
    expect(await readFile(lockPath, 'utf8')).toBe(content)
  })

  it('leaves multiline pid-like content for the operator', async () => {
    const lockPath = await tempLockPath()
    const pid = await deadPid()
    const content = `${pid}\n${pid}\n`
    await writeFile(lockPath, content, { mode: 0o600 })
    await expect(breakStaleWriterLock(lockPath)).resolves.toBeUndefined()
    expect(await readFile(lockPath, 'utf8')).toBe(content)
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

  it('does not delete a successor lock created at the original path after rename', async () => {
    const lockPath = await tempLockPath()
    const pid = await deadPid()
    await writeFile(lockPath, `${pid}\n`, { mode: 0o600 })
    await expect(breakStaleWriterLock(lockPath, {
      readFile: path => readFile(path, 'utf8'),
      copyFile,
      rm: path => rm(path, { force: true }),
      rename: async (from, to) => {
        await rename(from, to)
        await writeFile(lockPath, `${process.pid}\n`, { mode: 0o600 })
      },
    })).resolves.toBe(pid)
    expect(await readFile(lockPath, 'utf8')).toBe(`${process.pid}\n`)
    const leftovers = (await readdir(join(lockPath, '..'))).filter(name => name.includes('.stale-'))
    expect(leftovers).toEqual([])
  })
})
