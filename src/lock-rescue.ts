//

// Part of dsh-grok-kit, Apache-2.0.

//

/**
 * Writer-lock helpers. Automatic stale-lock recovery is intentionally a
 * no-op: any check-then-rename/rm on a path can move a live writer's lock
 * that appeared after the inspection (GROK-WRITER-LOCK-002). Orphan `.lock`
 * files are fail-closed — writers time out — and left for the operator.
 * @module dsh-grok-kit/lock-rescue
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

/**
 * Do not break writer locks. Path-based recovery cannot bind the inspected
 * file generation to the directory entry, so this never mutates `lockPath`
 * or creates `.stale-*` siblings. Returns `undefined` always.
 */
export async function breakStaleWriterLock(_lockPath: string): Promise<number | undefined> {
  return undefined
}
