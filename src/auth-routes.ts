//

// Derived from dsh-xai (https://github.com/MirDie/dsh-xai), Apache-2.0.

// Modified for dsh-grok-kit — see NOTICE for the full attribution.

//

/** Same-origin Web settings routes for xAI Grok OAuth. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AuthEvent, AuthPrompt } from '@earendil-works/pi-ai'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { loginXaiOAuthSession, importXaiOAuthSession, xaiOAuthAuthStatus } from './auth.ts'
import type { CatalogSource } from './catalog.ts'
import { probeGrokAuth } from './grok-import.ts'
import { readStoredProxyUrl, setXaiProxyUrl, validProxyUrl, writeStoredProxyUrl } from './proxy.ts'
import { safeMessage } from './redact.ts'
import {
  readStoredOptions,
  sanitizeStoredOptions,
  type StoredPluginOptions,
  writeStoredOptions,
} from './options.ts'
import type { XaiOAuthSession } from './session.ts'

export const XAI_OAUTH_AUTH_STATUS_PATH = '/plugins/dsh-grok-kit/auth/status'
export const XAI_OAUTH_AUTH_LOGIN_PATH = '/plugins/dsh-grok-kit/auth/login'
export const XAI_OAUTH_AUTH_IMPORT_PATH = '/plugins/dsh-grok-kit/auth/import'
export const XAI_OAUTH_AUTH_LOGOUT_PATH = '/plugins/dsh-grok-kit/auth/logout'
export const XAI_OAUTH_AUTH_MODELS_PATH = '/plugins/dsh-grok-kit/auth/models'
export const XAI_OAUTH_AUTH_PROXY_PATH = '/plugins/dsh-grok-kit/auth/proxy'
export const XAI_OAUTH_AUTH_OPTIONS_PATH = '/plugins/dsh-grok-kit/auth/options'

/** Known option keys; POST accepts null / '' to remove an explicit override. */
const OPTION_KEYS: ReadonlyArray<keyof StoredPluginOptions> = [
  'backendSearch',
  'nestedSearchTools',
  'statefulResponses',
  'imagineTool',
  'searchModel',
  'searchMaxResults',
  'webSearchTimeoutMs',
  'xSearchTimeoutMs',
]

/** Merge a partial POST body over the stored overrides (null / '' removes). */
export function mergeStoredOptionsPatch(
  current: StoredPluginOptions,
  patch: unknown,
): StoredPluginOptions {
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) return current
  const next: Record<string, unknown> = { ...current }
  for (const key of OPTION_KEYS) {
    if (!(key in patch)) continue
    const value = (patch as Record<string, unknown>)[key]
    if (value === null || value === undefined || value === '') delete next[key]
    else next[key] = value
  }
  // Return next directly — spreading current again would resurrect deleted keys.
  return next as StoredPluginOptions
}

export type XaiOAuthWebAuthStatus =
  | { status: 'signed-out'; grokImportAvailable: boolean; sharedGrokAuth: boolean }
  | { status: 'signing-in'; url?: string; userCode?: string; grokImportAvailable: boolean; sharedGrokAuth: boolean }
  | {
    status: 'signed-in'
    models: string[]
    available: string[]
    selected: string[]
    catalogSource: CatalogSource
    catalogError?: string
    grokImportAvailable: boolean
    sharedGrokAuth: boolean
  }
  | { status: 'error'; message: string; grokImportAvailable: boolean; sharedGrokAuth: boolean }

export interface LoginChallenge {
  url: string
  userCode?: string
}

function waitForPromptAbort(prompt: AuthPrompt): Promise<string> {
  const signal = prompt.signal
  if (signal === undefined) return new Promise<string>(() => {})
  if (signal.aborted) return Promise.reject(signal.reason)
  return new Promise<string>((_resolve, reject) => {
    signal.addEventListener('abort', () => { reject(signal.reason) }, { once: true })
  })
}

async function grokImportAvailable(): Promise<boolean> {
  return (await probeGrokAuth()).available
}

/** One lifecycle owner for the device-code poller, challenge, and public status. */
export class XaiOAuthWebAuth {
  private state: XaiOAuthWebAuthStatus = { status: 'signed-out', grokImportAvailable: false, sharedGrokAuth: false }
  private operation: Promise<void> | undefined
  private cancellation: AbortController | undefined
  private challenge: LoginChallenge | undefined
  private challengeWaiters: Array<{ resolve(value: LoginChallenge): void; reject(error: unknown): void }> = []
  /** Serializes import/logout against each other and against an in-flight login. */
  private exclusive: Promise<void> = Promise.resolve()
  private exclusivePending = false

  constructor(private readonly session: XaiOAuthSession) {}

  async status(): Promise<XaiOAuthWebAuthStatus> {
    if (this.operation !== undefined) return this.state
    if (this.state.status === 'error') {
      return { ...this.state, grokImportAvailable: await grokImportAvailable() }
    }
    return this.readStoredStatus()
  }

  async signIn(): Promise<LoginChallenge> {
    // Never start a login over a running import/logout (or the reverse):
    // the TOCTOU would interleave two credential writers.
    if (this.exclusivePending) await this.exclusive
    if (this.operation === undefined) this.start()
    if (this.challenge !== undefined) return this.challenge
    return new Promise<LoginChallenge>((resolve, reject) => {
      this.challengeWaiters.push({ resolve, reject })
    })
  }

  async importGrok(): Promise<void> {
    await this.runExclusive(async () => {
      await importXaiOAuthSession(this.session)
      this.challenge = undefined
      this.state = await this.readStoredStatus()
    })
  }

  async setModels(ids: readonly string[]): Promise<void> {
    await this.session.setSelectedModels(ids)
    this.state = await this.readStoredStatus()
  }

  async signOut(): Promise<void> {
    await this.runExclusive(async () => {
      await this.session.logout()
      this.state = {
        status: 'signed-out',
        grokImportAvailable: await grokImportAvailable() && !this.session.store.sharedWithGrokCli,
        sharedGrokAuth: this.session.store.sharedWithGrokCli,
      }
      this.challenge = undefined
    })
  }

  async dispose(): Promise<void> {
    this.cancellation?.abort(new Error('xAI Grok plugin disposed'))
    await this.operation?.catch(() => undefined)
  }

  /** Cancel any running login, then run one credential-mutating action exclusively. */
  private runExclusive(fn: () => Promise<void>): Promise<void> {
    const run = this.exclusive.then(async () => {
      this.cancellation?.abort(new Error('xAI Grok sign-in cancelled'))
      await this.operation?.catch(() => undefined)
      await fn()
    })
    this.exclusivePending = true
    this.exclusive = run.catch(() => undefined)
    return run.finally(() => { this.exclusivePending = false })
  }

  private start(): void {
    const cancellation = new AbortController()
    this.cancellation = cancellation
    this.challenge = undefined
    this.state = { status: 'signing-in', grokImportAvailable: false, sharedGrokAuth: this.session.store.sharedWithGrokCli }
    this.operation = loginXaiOAuthSession({
      signal: cancellation.signal,
      prompt: prompt => prompt.type === 'select'
        ? Promise.resolve(prompt.options.some(option => option.id === 'oauth') ? 'oauth' : prompt.options[0]?.id ?? 'oauth')
        : waitForPromptAbort(prompt),
      notify: event => { this.onEvent(event) },
    }, this.session).then(
      async () => {
        this.state = await this.readStoredStatus()
      },
      (error: unknown) => {
        this.rejectChallenge(error)
        this.state = {
          status: 'error',
          message: safeMessage(error),
          grokImportAvailable: false,
          sharedGrokAuth: this.session.store.sharedWithGrokCli,
        }
      },
    ).finally(() => {
      this.operation = undefined
      this.cancellation = undefined
    })
  }

  private onEvent(event: AuthEvent): void {
    if (event.type === 'device_code') {
      this.acceptChallenge({
        url: event.verificationUri,
        ...event.userCode.length > 0 ? { userCode: event.userCode } : {},
      })
      return
    }
    if (event.type === 'auth_url') {
      this.acceptChallenge({ url: event.url })
    }
  }

  private acceptChallenge(challenge: LoginChallenge): void {
    try {
      const url = new URL(challenge.url)
      if (url.protocol !== 'https:') {
        const error = new Error('xAI returned an unsafe authorization URL')
        this.cancellation?.abort(error)
        this.rejectChallenge(error)
        return
      }
    } catch {
      const error = new Error('xAI returned an invalid authorization URL')
      this.cancellation?.abort(error)
      this.rejectChallenge(error)
      return
    }
    this.challenge = challenge
    this.state = {
      status: 'signing-in',
      url: challenge.url,
      grokImportAvailable: false,
      sharedGrokAuth: this.session.store.sharedWithGrokCli,
      ...challenge.userCode === undefined ? {} : { userCode: challenge.userCode },
    }
    for (const waiter of this.challengeWaiters.splice(0)) waiter.resolve(challenge)
  }

  private async readStoredStatus(): Promise<XaiOAuthWebAuthStatus> {
    const [stored, grok] = await Promise.all([xaiOAuthAuthStatus(this.session.store), grokImportAvailable()])
    const shared = this.session.store.sharedWithGrokCli
    if (!stored.authenticated) {
      return { status: 'signed-out', grokImportAvailable: grok && !shared, sharedGrokAuth: shared }
    }
    const available = this.session.availableModels().map(model => model.id)
    const selected = this.session.selectedModelIds()
    return {
      status: 'signed-in',
      models: this.session.visibleModels().map(model => model.id),
      available,
      selected: selected ?? available,
      catalogSource: this.session.catalogSource,
      grokImportAvailable: grok && !shared,
      sharedGrokAuth: shared,
      ...this.session.catalogError === undefined ? {} : { catalogError: this.session.catalogError },
    }
  }

  private rejectChallenge(error: unknown): void {
    for (const waiter of this.challengeWaiters.splice(0)) waiter.reject(error)
  }
}

function loopbackHostname(hostHeader: string): string | undefined {
  // Handles `127.0.0.1:3080`, `localhost:3080`, `[::1]:3080`.
  const hostname = hostHeader.startsWith('[')
    ? hostHeader.slice(1, hostHeader.indexOf(']'))
    : hostHeader.split(':')[0]
  if (hostname === undefined || hostname.length === 0) return undefined
  const lower = hostname.toLowerCase()
  return lower === '127.0.0.1' || lower === 'localhost' || lower === '::1' ? lower : undefined
}

function trustedRequest(req: IncomingMessage): boolean {
  return isTrustedRequest(req.socket.remoteAddress, req.headers, req.method ?? 'GET')
}

/** Trust header/remote shape for the plugin's Web routes. Exported for tests. */
export function isTrustedRequest(
  remote: string | undefined,
  headers: { host?: string | undefined; origin?: string | undefined; 'sec-fetch-site'?: string | undefined },
  method: string,
): boolean {
  if (remote !== '127.0.0.1' && remote !== '::1' && remote !== '::ffff:127.0.0.1') return false
  if (headers['sec-fetch-site'] === 'cross-site') return false
  const host = headers.host
  if (host === undefined) return false
  // PIN the Host header to an explicit loopback name. Otherwise a DNS-rebinding
  // page (attacker domain resolving to 127.0.0.1) satisfies the same-origin
  // check below with a same-host origin while the request really originates
  // from a hostile page — enough to CSRF login/import/logout or to install a
  // proxy URL that later captures the x.ai bearer.
  if (loopbackHostname(host) === undefined) return false
  const origin = headers.origin
  // Same-origin browsers send Origin on every POST; non-browser clients and
  // some privacy modes do not. Requiring Origin on writes closes the
  // local-process CSRF slot (a local script could otherwise POST logout /
  // set-proxy with a forged host). Status GETs stay open.
  if (origin === undefined) return method === 'GET'
  try {
    return new URL(origin).host === new URL(`http://${host}`).host
  } catch {
    return false
  }
}

/** Client-side request error (bad content-type / bad body); reported as 400. */
class BadRequestError extends Error {}

/** Request body exceeded the read ceiling; reported as 413. */
class PayloadTooLargeError extends Error {}

const MAX_JSON_BODY_BYTES = 1024 * 1024

/**
 * Accept a JSON body: no content-type header (no body) or application/json.
 * A cross-site form cannot send application/json, so this rejects form posts;
 * same-origin checks in trustedRequest() are the primary CSRF gate.
 */
export function jsonContentTypeAccepted(contentType: string): boolean {
  if (contentType === '') return true
  return contentType.toLowerCase().split(';')[0].trim() === 'application/json'
}

function errorStatus(error: unknown): number {
  if (error instanceof PayloadTooLargeError) return 413
  if (error instanceof BadRequestError) return 400
  if (error instanceof SyntaxError) return 400
  return 500
}

/** Read a JSON body with a hard size ceiling (exported for tests). */
export async function readJson(req: IncomingMessage): Promise<unknown> {
  if (!jsonContentTypeAccepted(req.headers['content-type'] ?? '')) {
    throw new BadRequestError('content-type must be application/json')
  }
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buf.byteLength
    if (size > MAX_JSON_BODY_BYTES) throw new PayloadTooLargeError('request body too large')
    chunks.push(buf)
  }
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (text.length === 0) return {}
  return JSON.parse(text) as unknown
}

function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(JSON.stringify(value))
}

/** Register the plugin-owned OAuth routes when the Web server is composed. */
export function registerXaiOAuthAuthRoutes(
  ctx: Context,
  session: XaiOAuthSession,
): void {
  const auth = new XaiOAuthWebAuth(session)
  ctx.effect(() => {
    const routes = [
      ctx.webServer.register({
        kind: 'exact',
        path: XAI_OAUTH_AUTH_STATUS_PATH,
        handler: async (req, res) => {
          if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' })
          if (!trustedRequest(req)) return json(res, 403, { error: 'forbidden' })
          json(res, 200, await auth.status())
        },
      }),
      ctx.webServer.register({
        kind: 'exact',
        path: XAI_OAUTH_AUTH_LOGIN_PATH,
        handler: async (req, res) => {
          if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' })
          if (!trustedRequest(req)) return json(res, 403, { error: 'forbidden' })
          try {
            json(res, 200, await auth.signIn())
          } catch (error: unknown) {
            json(res, errorStatus(error), { error: safeMessage(error) })
          }
        },
      }),
      ctx.webServer.register({
        kind: 'exact',
        path: XAI_OAUTH_AUTH_IMPORT_PATH,
        handler: async (req, res) => {
          if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' })
          if (!trustedRequest(req)) return json(res, 403, { error: 'forbidden' })
          try {
            await auth.importGrok()
            json(res, 200, await auth.status())
          } catch (error: unknown) {
            json(res, errorStatus(error), { error: safeMessage(error) })
          }
        },
      }),
      ctx.webServer.register({
        kind: 'exact',
        path: XAI_OAUTH_AUTH_MODELS_PATH,
        handler: async (req, res) => {
          if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' })
          if (!trustedRequest(req)) return json(res, 403, { error: 'forbidden' })
          try {
            const body = await readJson(req)
            const selected = typeof body === 'object' && body !== null && 'selected' in body
              ? body.selected
              : undefined
            if (!Array.isArray(selected) || selected.some(id => typeof id !== 'string')) {
              return json(res, 400, { error: 'selected must be an array of model ids' })
            }
            await auth.setModels(selected)
            json(res, 200, await auth.status())
          } catch (error: unknown) {
            json(res, errorStatus(error), { error: safeMessage(error) })
          }
        },
      }),
      ctx.webServer.register({
        kind: 'exact',
        path: XAI_OAUTH_AUTH_PROXY_PATH,
        handler: async (req, res) => {
          if (!trustedRequest(req)) return json(res, 403, { error: 'forbidden' })
          if (req.method === 'GET') {
            return json(res, 200, { proxyUrl: readStoredProxyUrl() })
          }
          if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' })
          try {
            const body = await readJson(req)
            const proxyUrl = typeof body === 'object' && body !== null && 'proxyUrl' in body
              ? body.proxyUrl
              : undefined
            if (typeof proxyUrl !== 'string') {
              return json(res, 400, { error: 'proxyUrl must be a string' })
            }
            const normalized = validProxyUrl(proxyUrl)
            if (normalized === undefined) {
              return json(res, 400, { error: 'proxyUrl must be a valid http:// or https:// URL' })
            }
            setXaiProxyUrl(proxyUrl)
            await writeStoredProxyUrl(proxyUrl)
            json(res, 200, { proxyUrl: normalized })
          } catch (error: unknown) {
            json(res, errorStatus(error), { error: safeMessage(error) })
          }
        },
      }),
      ctx.webServer.register({
        kind: 'exact',
        path: XAI_OAUTH_AUTH_OPTIONS_PATH,
        handler: async (req, res) => {
          if (!trustedRequest(req)) return json(res, 403, { error: 'forbidden' })
          if (req.method === 'GET') {
            return json(res, 200, { options: readStoredOptions() })
          }
          if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' })
          try {
            const body = await readJson(req)
            const merged = sanitizeStoredOptions({
              version: 1,
              options: mergeStoredOptionsPatch(readStoredOptions(), body),
            })
            await writeStoredOptions(merged)
            // Respond with the sanized document so the UI state always
            // matches the disk (invalid/out-of-range values are dropped).
            json(res, 200, { options: merged })
          } catch (error: unknown) {
            json(res, errorStatus(error), { error: safeMessage(error) })
          }
        },
      }),
      ctx.webServer.register({
        kind: 'exact',
        path: XAI_OAUTH_AUTH_LOGOUT_PATH,
        handler: async (req, res) => {
          if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' })
          if (!trustedRequest(req)) return json(res, 403, { error: 'forbidden' })
          try {
            await auth.signOut()
            json(res, 200, await auth.status())
          } catch (error: unknown) {
            json(res, errorStatus(error), { error: safeMessage(error) })
          }
        },
      }),
    ]
    return async () => {
      for (const dispose of routes) dispose()
      await auth.dispose()
    }
  }, 'dsh-grok-kit: Web OAuth routes')
}
