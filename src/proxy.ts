/**
 * xAI-only outbound proxy — per-plugin setting, no global configuration.
 *
 * Style matches the other local dsh plugins: this bundle owns one setting
 * of its own (stored in `$DSH_HOME/.xai-oauth-proxy.json`, editable on its
 * settings page). Nothing global is touched except one transparent
 * `globalThis.fetch` hook that routes ONLY `x.ai` origins (api.x.ai / x.ai
 * and subdomains) through this plugin's ProxyAgent and passes every other
 * request to the original fetch untouched. While the plugin is loaded the
 * hook applies to ALL x.ai requests in this process — including the catalog
 * `xai` API-key route — and it is restored on plugin dispose.
 *
 * Effective URL precedence: stored setting > plugin config `proxyUrl` >
 * `DSH_XAI_PROXY` (plugin-scoped env for headless/CLI use). HTTP/HTTPS
 * proxy URLs only; undici's ProxyAgent does not speak SOCKS. URLs with
 * embedded credentials are rejected and never persisted.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { ProxyAgent, fetch as undiciFetch } from 'undici'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'

const PROXY_FILE_VERSION = 1
const PROXY_FILENAME = '.xai-oauth-proxy.json'

/** Absolute path of the plugin-owned proxy setting file. */
export function xaiProxyPath(dshHome?: string): string {
  return resolve(join(resolveDshHome(dshHome), PROXY_FILENAME))
}

/** Best-effort atomic scrub of a stored proxy file that held credentials. */
function cleanupStoredProxy(file: string): void {
  const tmp = `${file}.cleanup`
  try {
    writeFileSync(tmp, `${JSON.stringify({ version: PROXY_FILE_VERSION, proxyUrl: '' }, null, 2)}\n`, { mode: 0o600 })
    renameSync(tmp, file)
  } catch {
    // Best effort: the read path already returns '' — disk scrubbing is defense.
  }
}

/**
 * Read the plugin's own stored proxy URL ('' = off; invalid/userinfo values
 * are dropped AND the disk copy is scrubbed so credentials do not linger).
 */
export function readStoredProxyUrl(): string {
  try {
    const file = xaiProxyPath()
    const doc = JSON.parse(readFileSync(file, 'utf8')) as {
      version?: unknown
      proxyUrl?: unknown
    }
    if (doc.version !== PROXY_FILE_VERSION) return ''
    const normalized = validProxyUrl(typeof doc.proxyUrl === 'string' ? doc.proxyUrl.trim() : '')
    if (normalized === undefined) {
      cleanupStoredProxy(file)
      return ''
    }
    return normalized
  } catch {
    return ''
  }
}

/**
 * Persist the plugin's own proxy setting. Fail-closed: URLs with embedded
 * credentials or invalid proxies are rejected BEFORE anything hits disk.
 */
export async function writeStoredProxyUrl(url: string): Promise<void> {
  const normalized = validProxyUrl(url)
  if (normalized === undefined) {
    throw new Error('proxyUrl must be a valid http:// or https:// URL without embedded credentials')
  }
  const file = xaiProxyPath()
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  await writeFileAtomic(file, `${JSON.stringify(
    { version: PROXY_FILE_VERSION, proxyUrl: normalized },
    null,
    2,
  )}\n`, { mode: 0o600, dirMode: 0o700 })
}

let proxyAgent: ProxyAgent | null = null
let hookInstalled = false

function urlHref(input: unknown): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  if (input !== null && typeof input === 'object' && typeof (input as { url?: unknown }).url === 'string') {
    return (input as { url: string }).url
  }
  return ''
}

function isXaiUrl(input: unknown): boolean {
  if (input === undefined || input === null) return false
  try {
    const host = new URL(urlHref(input)).hostname.toLowerCase()
    return host === 'x.ai' || host.endsWith('.x.ai')
  } catch {
    return false
  }
}

/** Narrow to a URL-bearing value: not '', not the literal spellings 'undefined'/'null'. */
function nonBlank(value: string | undefined): value is string {
  if (value === undefined) return false
  const trimmed = value.trim()
  return trimmed !== '' && trimmed !== 'undefined' && trimmed !== 'null'
}

/** Validate an HTTP(S) proxy URL. Returns the trimmed URL, '' for an explicit off, or undefined for an invalid value. */
export function validProxyUrl(url: string): string | undefined {
  const trimmed = url.trim()
  if (trimmed === '') return ''
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined
    if (parsed.hostname.length === 0) return undefined
    // Refuse embedded credentials (username:password@host): the stored proxy
    // file, the GET /auth/proxy response and logs must never carry them.
    if (parsed.username !== '' || parsed.password !== '') return undefined
    return trimmed
  } catch {
    return undefined
  }
}

/**
 * Point the xAI-only hook at a proxy URL; '' clears it (xAI goes direct too).
 * Invalid URLs are rejected and never throw — the plugin must not crash on a
 * bad stored/env value. Returns true when the value was applied.
 */
export function setXaiProxyUrl(url: string): boolean {
  const normalized = validProxyUrl(url)
  const previous = proxyAgent
  proxyAgent = null
  if (previous !== null) void previous.close().catch(() => undefined)
  if (normalized === undefined) return false
  if (normalized !== '') proxyAgent = new ProxyAgent(normalized)
  return true
}

/**
 * Install a transparent global-fetch hook that routes ONLY x.ai origins
 * through this plugin's ProxyAgent; every other request goes to the
 * original fetch untouched. Reference counted: every install returns its
 * OWN idempotent disposer, and the original fetch is restored only after
 * the LAST owner releases — and only if our wrapper is still installed
 * (a later component that replaced fetch after us is never clobbered).
 */
export function installXaiFetchHook(): () => void {
  if (hookOwners === 0) {
    originalFetch = globalThis.fetch
    const base = originalFetch.bind(globalThis)
    const wrapper = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> => {
      if (proxyAgent !== null && isXaiUrl(input)) {
        return undiciFetch(input as Parameters<typeof undiciFetch>[0], {
          ...(init ?? {}),
          dispatcher: proxyAgent,
        } as Parameters<typeof undiciFetch>[1]) as unknown as Promise<Response>
      }
      return base(input, init)
    }) as typeof fetch
    globalThis.fetch = wrapper
    installedWrapper = wrapper
  }
  hookOwners += 1
  let released = false
  return () => {
    if (released) return
    released = true
    hookOwners -= 1
    if (hookOwners > 0) return
    // Only restore when our wrapper is still the installed fetch; a later
    // third-party hook must not be clobbered by our dispose.
    if (installedWrapper !== undefined && globalThis.fetch === installedWrapper) {
      globalThis.fetch = originalFetch ?? globalThis.fetch
    }
    const previous = proxyAgent
    proxyAgent = null
    if (previous !== null) void previous.close().catch(() => undefined)
    installedWrapper = undefined
    originalFetch = undefined
  }
}

let hookOwners = 0
let installedWrapper: typeof fetch | undefined
let originalFetch: typeof fetch | undefined

/** Effective proxy URL: stored setting > config `proxyUrl` > `DSH_XAI_PROXY`. Invalid/userinfo values resolve to ''. */
export function resolveXaiProxyUrl(configUrl?: string): string {
  const stored = readStoredProxyUrl()
  if (stored !== '') return stored
  const env = process.env.DSH_XAI_PROXY
  const candidate = nonBlank(configUrl) ? configUrl.trim() : nonBlank(env) ? env.trim() : ''
  return validProxyUrl(candidate) ?? ''
}

/**
 * Apply the effective proxy URL (stored > config > env) to the already
 * installed hook. Callers own the hook lifecycle via installXaiFetchHook().
 * Returns the effective URL, '' when unset/invalid.
 */
export function applyXaiProxy(configUrl?: string): string {
  const url = resolveXaiProxyUrl(configUrl)
  setXaiProxyUrl(url)
  return url
}
