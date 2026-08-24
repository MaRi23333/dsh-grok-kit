/**
 * xAI-only outbound proxy — per-plugin setting, no global configuration.
 *
 * Style matches the other local dsh plugins: this bundle owns one setting
 * of its own (stored in `$DSH_HOME/.xai-oauth-proxy.json`, editable on its
 * settings page). Nothing global is touched:
 *  - no undici global dispatcher replacement,
 *  - no global proxy environment variables are read or written,
 *  - a transparent `globalThis.fetch` hook routes ONLY `x.ai` origins
 *    (api.x.ai / x.ai and subdomains) through this plugin's ProxyAgent and
 *    passes every other request to the original fetch untouched — DSH
 *    itself, DeepSeek and every other provider keep their direct routes
 *    with zero behavior change.
 *
 * Effective URL precedence: stored setting > plugin config `proxyUrl` >
 * `DSH_XAI_PROXY` (plugin-scoped env for headless/CLI use). HTTP/HTTPS
 * proxy URLs only; undici's ProxyAgent does not speak SOCKS.
 */
import { mkdirSync, readFileSync } from 'node:fs'
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

/** Read the plugin's own stored proxy URL ('' = off). */
export function readStoredProxyUrl(): string {
  try {
    const doc = JSON.parse(readFileSync(xaiProxyPath(), 'utf8')) as {
      version?: unknown
      proxyUrl?: unknown
    }
    if (doc.version !== PROXY_FILE_VERSION) return ''
    return typeof doc.proxyUrl === 'string' ? doc.proxyUrl.trim() : ''
  } catch {
    return ''
  }
}

/** Persist the plugin's own proxy setting. */
export async function writeStoredProxyUrl(url: string): Promise<void> {
  const file = xaiProxyPath()
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  await writeFileAtomic(file, `${JSON.stringify(
    { version: PROXY_FILE_VERSION, proxyUrl: url.trim() },
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
 * original fetch untouched. Idempotent; without a configured URL it is a
 * pure pass-through.
 */
export function installXaiFetchHook(): void {
  if (hookInstalled) return
  hookInstalled = true
  const original = globalThis.fetch.bind(globalThis)
  globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> => {
    if (proxyAgent !== null && isXaiUrl(input)) {
      return undiciFetch(input as Parameters<typeof undiciFetch>[0], {
        ...(init ?? {}),
        dispatcher: proxyAgent,
      } as Parameters<typeof undiciFetch>[1]) as unknown as Promise<Response>
    }
    return original(input, init)
  }) as typeof fetch
}

/** Effective proxy URL: stored setting > config `proxyUrl` > `DSH_XAI_PROXY`. */
export function resolveXaiProxyUrl(configUrl?: string): string {
  const stored = readStoredProxyUrl()
  if (stored !== '') return stored
  if (nonBlank(configUrl)) return configUrl.trim()
  const env = process.env.DSH_XAI_PROXY
  if (nonBlank(env)) return env.trim()
  return ''
}

/** Install the hook and apply the current URL. Returns the effective URL, '' when unset/invalid. */
export function applyXaiProxy(configUrl?: string): string {
  installXaiFetchHook()
  const url = resolveXaiProxyUrl(configUrl)
  setXaiProxyUrl(url)
  return url
}
