import { AsyncLocalStorage } from 'node:async_hooks'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'

interface SearchRequest { sessionId?: string; purpose?: GenerateOptions['purpose'] }
const requests = new AsyncLocalStorage<SearchRequest>()

/** Keep purpose across the lazy adapter iterator, without changing host request options. */
export async function* withSearchRequest<T>(
  request: SearchRequest,
  create: () => AsyncIterable<T>,
): AsyncGenerator<T> {
  const context = { sessionId: request.sessionId, purpose: request.purpose }
  const iterator = requests.run(context, () => create()[Symbol.asyncIterator]())
  let exhausted = false
  try {
    while (true) {
      const result = await requests.run(context, () => iterator.next())
      if (result.done) { exhausted = true; return }
      yield result.value
    }
  } finally {
    if (!exhausted) await requests.run(context, () => iterator.return?.())
  }
}

/** Optional in-process contract for callers that explicitly own a session's search policy. */
export class SessionSearchPolicy {
  readonly apiVersion = 1 as const
  private readonly sessions = new Map<string, { owner: object; enabled: () => boolean }>()
  private disposed = false

  bindSession(sessionId: string, owner: object, enabled: () => boolean): () => void {
    if (this.disposed) throw new Error('Grok search policy is disposed')
    if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 256 || /[\u0000-\u001f\u007f]/.test(sessionId)) {
      throw new Error('Invalid Grok search session ID')
    }
    if (owner === null || typeof owner !== 'object' || typeof enabled !== 'function') {
      throw new Error('Invalid Grok search session binding')
    }
    const previous = this.sessions.get(sessionId)
    if (previous !== undefined && previous.owner !== owner) throw new Error('Grok search session already has a different owner')
    const entry = { owner, enabled }
    this.sessions.set(sessionId, entry)
    return () => { if (this.sessions.get(sessionId) === entry) this.sessions.delete(sessionId) }
  }

  resolve(sessionId: string): boolean | undefined {
    // An adapter still draining after unload must not fall back to a global on.
    if (this.disposed) return false
    const entry = this.sessions.get(sessionId)
    if (entry === undefined) return undefined
    const request = requests.getStore()
    if (request?.sessionId === sessionId && request.purpose !== undefined) return false
    const enabled = entry.enabled()
    if (typeof enabled !== 'boolean') throw new Error('Grok search session policy must return a boolean')
    return enabled
  }

  dispose(): void { this.disposed = true; this.sessions.clear() }
}
