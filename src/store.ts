//

// Derived from dsh-xai (https://github.com/MirDie/dsh-xai), Apache-2.0.

// Modified for dsh-grok-kit — see NOTICE for the full attribution.

//

/**
 * Owner-only persistent OAuth credential storage for the xAI subscription route.
 * @module dsh-grok-kit/store
 */

import { mkdir, readFile, rm, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import type { Credential, CredentialInfo, CredentialStore, OAuthCredential } from '@earendil-works/pi-ai'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { breakStaleWriterLock } from './lock-rescue.ts'
import {
  grokAuthPath,
  isGrokAuthDocument,
  isGrokAuthPath,
  parseGrokAuthDocument,
  removeGrokAuthSlot,
  writeGrokAuthDocument,
} from './grok-import.ts'
import { XAI_OAUTH_AUTH_FILENAME, XAI_OAUTH_ROUTE, XAI_PI_PROVIDER } from './ids.ts'

/** Current on-disk format; readers reject every other version. */
const AUTH_FORMAT_VERSION = 1

interface AuthDocument {
  version: typeof AUTH_FORMAT_VERSION
  credential: OAuthCredential
}

function isENOENT(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT'
}

async function assertOwnerOnly(filename: string): Promise<void> {
  let mode: number
  try {
    mode = (await stat(filename)).mode
  } catch (error) {
    if (isENOENT(error)) return
    throw error
  }
  if (process.platform === 'win32') return
  if ((mode & 0o077) !== 0) {
    throw new Error(
      `xai-oauth: ${filename} is readable beyond its owner (mode ${(mode & 0o777).toString(8)});`
      + ` run "chmod 600 ${filename}" before starting again`,
    )
  }
}

function parseDocument(text: string, filename: string): AuthDocument {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error(`xai-oauth: ${filename} is not valid JSON`)
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`xai-oauth: ${filename} must contain an object`)
  }
  const document = value as Record<string, unknown>
  if (document['version'] !== AUTH_FORMAT_VERSION) {
    throw new Error(`xai-oauth: ${filename} has unsupported auth format version ${String(document['version'])}`)
  }
  if (Object.keys(document).some(key => key !== 'version' && key !== 'credential')) {
    throw new Error(`xai-oauth: ${filename} contains an unknown top-level field`)
  }
  const raw = document['credential']
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error(`xai-oauth: ${filename} credential must be an object`)
  }
  const credential = raw as Record<string, unknown>
  const allowed = new Set(['type', 'access', 'refresh', 'expires', 'accountId'])
  if (Object.keys(credential).some(key => !allowed.has(key))) {
    throw new Error(`xai-oauth: ${filename} credential contains an unknown field`)
  }
  if (credential['type'] !== 'oauth') throw new Error(`xai-oauth: ${filename} credential type must be oauth`)
  for (const key of ['access', 'refresh'] as const) {
    if (typeof credential[key] !== 'string' || credential[key].length === 0) {
      throw new Error(`xai-oauth: ${filename} credential ${key} must be a non-empty string`)
    }
  }
  if (credential['accountId'] !== undefined && (typeof credential['accountId'] !== 'string' || credential['accountId'].length === 0)) {
    throw new Error(`xai-oauth: ${filename} credential accountId must be a non-empty string when present`)
  }
  if (typeof credential['expires'] !== 'number' || !Number.isFinite(credential['expires']) || credential['expires'] <= 0) {
    throw new Error(`xai-oauth: ${filename} credential expires must be a positive finite number`)
  }
  return { version: AUTH_FORMAT_VERSION, credential: credential as unknown as OAuthCredential }
}

function cloneCredential(credential: OAuthCredential): OAuthCredential {
  return structuredClone(credential)
}

/** Resolve the legacy dsh-owned OAuth document path. */
export function xaiOAuthAuthPath(dshHome?: string): string {
  return resolve(join(resolveDshHome(dshHome), XAI_OAUTH_AUTH_FILENAME))
}

/**
 * Live credential path: prefer ~/.grok/auth.json so dsh and Grok CLI share
 * one refresh-token rotation. Fall back to the legacy dsh file only when that
 * exists and the Grok file does not. New logins land in the Grok file.
 */
export function resolveXaiOAuthStorePath(options: { dshHome?: string; userHome?: string } = {}): string {
  const grok = grokAuthPath(options.userHome ?? homedir())
  const dsh = xaiOAuthAuthPath(options.dshHome)
  if (existsSync(grok)) return grok
  if (existsSync(dsh)) return dsh
  return grok
}

function isDshAuthDocument(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const document = value as Record<string, unknown>
  return 'version' in document && 'credential' in document
}

function parseStoredCredential(text: string, filename: string): OAuthCredential {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error(`xai-oauth: ${filename} is not valid JSON`)
  }
  if (isDshAuthDocument(value)) return parseDocument(text, filename).credential
  if (isGrokAuthDocument(value) || isGrokAuthPath(filename)) {
    return parseGrokAuthDocument(text, filename)
  }
  return parseDocument(text, filename).credential
}

function usesGrokFormat(filename: string, existingText: string | undefined): boolean {
  // A store pointed at ~/.grok/auth.json always writes Grok CLI shape,
  // even when migrating a leftover dsh envelope out of that path.
  if (isGrokAuthPath(filename)) return true
  if (existingText !== undefined && existingText.trim().length > 0) {
    try {
      return isGrokAuthDocument(JSON.parse(existingText) as unknown)
    } catch {
      return false
    }
  }
  return false
}

/** Writer lock lives next to a dsh-owned path, never as ~/.grok/auth.json.lock. */
export function lockPathForAuthFile(filename: string): string {
  if (!isGrokAuthPath(filename)) return resolve(filename)
  return resolve(join(dirname(dirname(filename)), '.dsh', XAI_OAUTH_AUTH_FILENAME))
}

/** File-backed pi-ai store scoped to the single xAI provider. */
export class XaiOAuthCredentialStore implements CredentialStore {
  readonly filename: string
  /** Path whose `.lock` sibling serializes writers. Separate from Grok CLI. */
  readonly lockFilename: string

  constructor(filename: string = resolveXaiOAuthStorePath()) {
    this.filename = resolve(filename)
    this.lockFilename = lockPathForAuthFile(this.filename)
  }

  /** Whether this store reads/writes the Grok CLI document. */
  get sharedWithGrokCli(): boolean {
    return isGrokAuthPath(this.filename)
  }

  private async readText(): Promise<string | undefined> {
    await assertOwnerOnly(this.filename)
    try {
      return await readFile(this.filename, 'utf8')
    } catch (error) {
      if (isENOENT(error)) return undefined
      throw error
    }
  }

  private async readCurrent(): Promise<OAuthCredential | undefined> {
    const text = await this.readText()
    if (text === undefined || text.trim().length === 0) return undefined
    try {
      return cloneCredential(parseStoredCredential(text, this.filename))
    } catch (error) {
      // An empty Grok document (`{}`) is a valid file with no xAI slot yet.
      if (isGrokAuthPath(this.filename)) {
        try {
          const value = JSON.parse(text) as unknown
          if (isGrokAuthDocument(value) && Object.keys(value as object).length === 0) return undefined
        } catch {
          // Keep the original parse error.
        }
      }
      throw error
    }
  }

  /**
   * Accept both provider spellings reading this one credential document: the
   * pi-ai provider id (`xai`) used by login/refresh, and the harness route id
   * (`xai-oauth`) under which the adapter's pi-ai collection resolves auth.
   */
  private owns(providerId: string): boolean {
    return providerId === XAI_PI_PROVIDER || providerId === XAI_OAUTH_ROUTE
  }

  /** Cheap synchronous file-existence check; never refreshes or reads secrets. */
  exists(): boolean {
    return existsSync(this.filename)
  }

  /**
   * Break a writer lock whose recorded owner process is provably dead.
   * dsh-atomic-write leaves orphan recovery to operators by design (lock age
   * cannot distinguish a crashed owner from a paused writer), but a lock pid
   * that no longer exists (kill(pid, 0) → ESRCH) is proof enough for this
   * plugin's own lock sibling: a force-killed host otherwise wedges every
   * later credential write until a human deletes the file by hand. Runs
   * before every withFileLock acquisition below; a lock that cannot be
   * *proven* orphaned is left untouched.
   */
  private async clearStaleLock(): Promise<void> {
    try {
      const pid = await breakStaleWriterLock(`${this.lockFilename}.lock`)
      if (pid !== undefined) {
        console.warn(
          `dsh-grok-kit: removed writer lock ${this.lockFilename}.lock left by dead process ${pid}; continuing normally.`,
        )
      }
    } catch {
      // Rescue must never introduce a new failure in front of the real one.
    }
  }

  async read(providerId: string): Promise<Credential | undefined> {
    return this.owns(providerId) ? this.readCurrent() : undefined
  }

  async list(): Promise<readonly CredentialInfo[]> {
    return await this.readCurrent() === undefined
      ? []
      : [{ providerId: XAI_PI_PROVIDER, type: 'oauth' }]
  }

  /**
   * Run a read-modify-write under the cross-process writer lock.
   * A leftover lock whose recorded owner is provably dead is broken before
   * acquisition (`clearStaleLock`); one held by a live process still fails
   * after the wait budget. That budget is a fixed 2s (dsh-atomic-write) and
   * is sized for pure file I/O: `fn` MUST NOT perform network work inside
   * the lock.
   * Refresh-first-then-commit flows read + refresh outside and only run the
   * guarded compare-and-write here (see createXaiOAuthSearchTokenSource).
   * pi-ai's own OAuth refresh does run inside its `modify` call — host
   * behaviour, same as upstream dsh-xai; a single refresh round trip fits the
   * 2s deadline in practice.
   */
  async modify(
    providerId: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>,
  ): Promise<Credential | undefined> {
    if (!this.owns(providerId)) {
      throw new Error(`xai-oauth: credential store does not own provider "${providerId}"`)
    }
    await mkdir(dirname(this.filename), { recursive: true, mode: 0o700 })
    await mkdir(dirname(this.lockFilename), { recursive: true, mode: 0o700 })
    await this.clearStaleLock()
    return withFileLock(this.lockFilename, async () => {
      const existingText = await this.readText()
      const current = existingText === undefined || existingText.trim().length === 0
        ? undefined
        : (() => {
          try {
            return cloneCredential(parseStoredCredential(existingText, this.filename))
          } catch {
            return undefined
          }
        })()
      const candidate = await fn(current)
      if (candidate === undefined) return current
      const document = parseDocument(JSON.stringify({
        version: AUTH_FORMAT_VERSION,
        credential: candidate,
      }), this.filename)
      const grok = usesGrokFormat(this.filename, existingText)
      const text = grok
        ? writeGrokAuthDocument(existingText, document.credential)
        : `${JSON.stringify(document, null, 2)}\n`
      await writeFileAtomic(this.filename, text, {
        mode: 0o600,
        dirMode: 0o700,
      })
      return cloneCredential(document.credential)
    })
  }

  async delete(providerId: string): Promise<void> {
    if (!this.owns(providerId)) return
    await mkdir(dirname(this.filename), { recursive: true, mode: 0o700 })
    await mkdir(dirname(this.lockFilename), { recursive: true, mode: 0o700 })
    await this.clearStaleLock()
    await withFileLock(this.lockFilename, async () => {
      const existingText = await this.readText()
      if (existingText === undefined) return
      if (usesGrokFormat(this.filename, existingText)) {
        const next = removeGrokAuthSlot(existingText)
        if (next === undefined) {
          await rm(this.filename, { force: true })
          return
        }
        await writeFileAtomic(this.filename, next, { mode: 0o600, dirMode: 0o700 })
        return
      }
      await rm(this.filename, { force: true })
    })
  }
}
