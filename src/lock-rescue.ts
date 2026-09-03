//

// Part of dsh-grok-kit, Apache-2.0.

//

/**
 * Stale-writer-lock recovery for this plugin's own lock siblings.
 * @module dsh-grok-kit/lock-rescue
 */

import { readFile, rm } from 'node:fs/promises'

/**
 * `@deepseek-ai/dsh-atomic-write` deliberately never removes a lock it did
 * not create: lock-file age cannot distinguish a crashed owner from a paused
 * live writer, so orphan recovery is left to the operator. In practice that
 * operator action never happens until something breaks: a force-killed host
 * leaves `<file>.lock` behind and every later writer of the credential file
 * times out until a human notices. This happened three times in the field
 * (`.grok/auth.json.lock` via the Grok CLI, then `.dsh/.xai-oauth-auth.json.lock`
 * for this plugin), which is why the plugin now proves orphanhood itself.
 *
 * Proof standard: a dsh-atomic-write lock contains exactly `${process.pid}\n`,
 * and `process.kill(pid, 0)` failing with `ESRCH` means that pid no longer
 * exists. A dead owner cannot release its critical section later, so removing
 * the lock cannot race a live writer — with one exception: a contender that
 * broke the same stale lock and was handed it fresh between our two reads.
 * `breakStaleWriterLock` re-reads the content immediately before unlinking
 * and aborts on any change, closing that window to a single read→rm pair.
 * Anything short of proof — unparsable content, a recycled pid, an
 * `EPERM`/`EACCES` from a foreign-owner process — is left untouched for the
 * operator, never guessed.
 */

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
 * Remove the writer lock at `lockPath` when its recorded owner is provably
 * dead. Returns the dead owner's pid when the lock file was removed, and
 * `undefined` when there was nothing to do or orphanhood could not be proven
 * (missing/unparsable lock, live or unknown owner, content changed between
 * the two reads, unlink refused). Never throws: rescue must not add a new
 * failure in front of the operation that follows it.
 */
export async function breakStaleWriterLock(lockPath: string): Promise<number | undefined> {
  const first = await readLockText(lockPath)
  if (first === undefined) return undefined
  const pid = parseLockPid(first)
  if (pid === undefined || isPidAlive(pid) !== false) return undefined
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
