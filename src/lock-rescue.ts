//

// Part of dsh-grok-kit, Apache-2.0.

//

/**
 * Stale-writer-lock recovery for this plugin's own lock siblings.
 * @module dsh-grok-kit/lock-rescue
 */

import { readFile, rm, stat } from 'node:fs/promises'

/**
 * `@deepseek-ai/dsh-atomic-write` deliberately never removes a lock it did
 * not create: lock-file age cannot distinguish a crashed owner from a paused
 * live writer, so orphan recovery is left to the operator. In practice that
 * operator action never happens until something breaks: a force-killed host
 * leaves `<file>.lock` behind and every later writer of the credential file
 * times out until a human notices. This happened repeatedly in the field
 * (`.grok/auth.json.lock` via the Grok CLI, then `.dsh/.xai-oauth-auth.json.lock`
 * for this plugin), which is why the plugin proves orphanhood itself.
 *
 * Two orphan shapes are handled, both observed in the field:
 *
 * 1. **Lock with a pid.** A dsh-atomic-write lock contains exactly
 *    `${process.pid}\n`, and `process.kill(pid, 0)` failing with `ESRCH`
 *    means that pid no longer exists. A dead owner cannot release its
 *    critical section later, so removing the lock cannot race a live writer
 *    — with one exception: a contender that broke the same stale lock and
 *    was handed it fresh between our two reads. The re-read before
 *    unlinking aborts on any change, closing that window to a single
 *    read→rm pair.
 *
 * 2. **Empty lock.** A writer killed between the wx-create and the pid
 *    write leaves a zero-byte lock. Empty content cannot be judged by pid
 *    liveness — and a *fresh* empty lock may be a live writer mid-write —
 *    so it is only removed once it is older than {@link EMPTY_LOCK_GRACE_MS}.
 *    A live writer lands its pid within milliseconds of creating the file;
 *    past the grace window, only the killed-between-create-and-write shape
 *    remains, and that owner can never release.
 *
 * Anything short of proof — unparsable non-empty content (e.g. a foreign
 * lock protocol such as the Grok CLI's `pid:timestamp` format), a recycled
 * pid, an `EPERM`/`EACCES` from a foreign-owner process, content changed
 * between reads, unlink refused — is left untouched for the operator, never
 * guessed.
 */

/**
 * How long an empty lock is left alone before it is treated as an orphan
 * whose owner died between creating the file and writing the pid. Sized
 * far above the 2s dsh-atomic-write wait budget and any realistic
 * open→write window, so a live writer is never evicted.
 */
export const EMPTY_LOCK_GRACE_MS = 10_000

/** Extract the owner pid from dsh-atomic-write lock content (`${pid}\n`). */
export function parseLockPid(text: string): number | undefined {
  const first = (text.split('\n', 1)[0] ?? '').trim()
  // 10 digits covers every real pid (2^31-1) while rejecting noise.
  if (!/^\d{1,10}$/.test(first)) return undefined
  const pid = Number(first)
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
    // ESRCH: no process with this pid exists — the owner is gone.
    if (code === 'ESRCH') return false
    // EPERM/EACCES: the process exists but belongs to another user — alive.
    if (code === 'EPERM' || code === 'EACCES') return true
    return undefined
  }
}

async function readLockText(lockPath: string): Promise<string | undefined> {
  try {
    return await readFile(lockPath, 'utf8')
  } catch {
    return undefined
  }
}

/**
 * Break an empty lock past the grace window. Re-reads immediately before
 * unlinking: if a live writer's pid landed after our first read, the
 * content is no longer empty and the lock stays. Returns `0` (sentinel —
 * no pid exists to report) when removed, `undefined` otherwise.
 */
async function breakStaleEmptyLock(lockPath: string): Promise<number | undefined> {
  const second = await readLockText(lockPath)
  if (second === undefined || second.trim().length > 0) return undefined
  let mtimeMs: number
  try {
    mtimeMs = (await stat(lockPath)).mtimeMs
  } catch {
    return undefined
  }
  if (Number.isNaN(mtimeMs) || Date.now() - mtimeMs < EMPTY_LOCK_GRACE_MS) return undefined
  try {
    await rm(lockPath, { force: true })
  } catch {
    return undefined
  }
  return 0
}

/**
 * Remove the writer lock at `lockPath` when its owner is provably gone:
 * a recorded pid that no longer exists, or an empty lock older than
 * {@link EMPTY_LOCK_GRACE_MS} (owner died between create and pid write).
 * Returns the dead owner's pid (or `0` for the empty-lock shape) when the
 * lock file was removed, and `undefined` when there was nothing to do or
 * orphanhood could not be proven (missing/unparsable lock, live or unknown
 * owner, content changed between the two reads, unlink refused). Never
 * throws: rescue must not add a new failure in front of the operation that
 * follows it.
 */
export async function breakStaleWriterLock(lockPath: string): Promise<number | undefined> {
  const first = await readLockText(lockPath)
  if (first === undefined) return undefined
  const pid = parseLockPid(first)
  if (pid === undefined) return breakStaleEmptyLock(lockPath)
  if (isPidAlive(pid) !== false) return undefined
  // Re-read just before unlinking: if another contender already broke this
  // stale lock and a live owner was handed it fresh, the content differs and
  // we must not evict them.
  const second = await readLockText(lockPath)
  if (second !== first) return undefined
  try {
    await rm(lockPath, { force: true })
  } catch {
    return undefined
  }
  return pid
}
