//

// Part of dsh-grok-kit, Apache-2.0.

//

/**
 * Stale-writer-lock recovery for this plugin's own lock siblings.
 * @module dsh-grok-kit/lock-rescue
 */

import { randomBytes } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, readFile, rename, rm } from 'node:fs/promises'

/** Filesystem operations used by rescue; tests inject a wrapper to interleave a successor writer. */
export interface WriterLockIo {
  readFile(path: string): Promise<string>
  rename(from: string, to: string): Promise<void>
  copyFile(from: string, to: string, flags: number): Promise<void>
  rm(path: string): Promise<void>
}

const defaultIo: WriterLockIo = {
  readFile: path => readFile(path, 'utf8'),
  rename,
  copyFile,
  rm: path => rm(path, { force: true }),
}

/**
 * `@deepseek-ai/dsh-atomic-write` deliberately never removes a lock it did
 * not create: lock-file age cannot distinguish a crashed owner from a paused
 * live writer, so orphan recovery is left to the operator. In practice a
 * force-killed host leaves `<file>.lock` behind and every later writer of
 * the credential file times out until a human notices. This plugin proves
 * orphanhood itself — but only for the one shape that is actually proof:
 * a lock whose entire contents are exactly `${pid}\n` and that pid is gone.
 *
 * Empty locks are never auto-removed. File age cannot prove the creator is
 * dead: a live writer may pause, sleep, or sit in a debugger after the `wx`
 * create and before writing the pid. Those locks stay for the operator.
 *
 * Deletion never targets the original path after the liveness check. The
 * candidate is atomically renamed to a unique sibling; only that isolated
 * file is re-read and unlinked. A successor that created a new lock at the
 * original path is therefore not in the unlink set. If the isolated contents
 * no longer match the inspected dead-pid document, the isolate is copied
 * back with `COPYFILE_EXCL` (never overwriting a new lock) and left for
 * the operator if the original path is already taken.
 *
 * Anything short of proof — unparsable content (Grok CLI `pid:timestamp`,
 * extra lines, missing trailing newline, surrounding whitespace), a recycled
 * pid, `EPERM`/`EACCES`, rename refused, isolate changed — is left untouched.
 */

/** Extract the owner pid from a dsh-atomic-write lock (`${pid}\n` and nothing else). */
export function parseLockPid(text: string): number | undefined {
  const match = /^(\d{1,10})\n$/.exec(text)
  if (match === null) return undefined
  const pid = Number(match[1])
  return pid > 0 ? pid : undefined
}

/** Whether `pid` is running: `true` alive, `false` provably dead, `undefined` unknown. */
export function isPidAlive(pid: number): boolean | undefined {
  if (!Number.isSafeInteger(pid) || pid <= 0) return undefined
  if (pid === process.pid) return true
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | null)?.code
    if (code === 'ESRCH') return false
    if (code === 'EPERM' || code === 'EACCES') return true
    return undefined
  }
}

async function readLockText(lockPath: string, io: WriterLockIo): Promise<string | undefined> {
  try {
    return await io.readFile(lockPath)
  } catch {
    return undefined
  }
}

function isolatePathFor(lockPath: string, pid: number): string {
  return `${lockPath}.stale-${pid}-${process.pid}-${randomBytes(8).toString('hex')}`
}

/** Put `isolatePath` back at `lockPath` only if that path is still free. */
async function restoreIsolatedLock(isolatePath: string, lockPath: string, io: WriterLockIo): Promise<void> {
  try {
    await io.copyFile(isolatePath, lockPath, constants.COPYFILE_EXCL)
  } catch {
    return
  }
  try {
    await io.rm(isolatePath)
  } catch {
    // Original path is restored; leftover isolate is inert.
  }
}

/**
 * Remove the writer lock at `lockPath` when its owner is a recorded pid that
 * no longer exists. Returns that pid when the isolated lock file was removed,
 * and `undefined` when there was nothing to do or orphanhood could not be
 * proven. Never throws: rescue must not add a new failure in front of the
 * operation that follows it.
 */
export async function breakStaleWriterLock(
  lockPath: string,
  io: WriterLockIo = defaultIo,
): Promise<number | undefined> {
  const first = await readLockText(lockPath, io)
  if (first === undefined) return undefined
  const pid = parseLockPid(first)
  if (pid === undefined) return undefined
  if (isPidAlive(pid) !== false) return undefined

  const isolated = isolatePathFor(lockPath, pid)
  try {
    await io.rename(lockPath, isolated)
  } catch {
    return undefined
  }

  const claimed = await readLockText(isolated, io)
  if (claimed !== first || isPidAlive(pid) !== false) {
    await restoreIsolatedLock(isolated, lockPath, io)
    return undefined
  }
  try {
    await io.rm(isolated)
  } catch {
    return undefined
  }
  return pid
}
