//

// Derived from dsh-xai (https://github.com/MirDie/dsh-xai), Apache-2.0.

// Modified for dsh-grok-kit — see NOTICE for the full attribution.

//

/** xAI subscription adapter assembled from public dsh-llm-pi-ai extension points. */

import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import type { ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'
import type { AuthContext } from '@earendil-works/pi-ai'
import { catalogModels, preferredXaiOAuthModelFrom } from './catalog.ts'
import {
  XAI_OAUTH_ROUTE,
  XAI_OAUTH_STREAM_IDLE_TIMEOUT_MS,
} from './ids.ts'
import type { XaiOAuthSession } from './session.ts'

/** Host defaults for the dsh-llm-pi-ai image budget (see its config schema). */
const MAX_REQUEST_IMAGE_BYTES = 20 * 1024 * 1024
const REQUEST_IMAGE_PIXEL_BUDGET = 2048 * 2048
const REQUEST_IMAGE_MAX_BYTES = 1024 * 1024

/** Minimal pi-ai AuthContext over the host process environment and filesystem. */
function hostAuthContext(): AuthContext {
  return {
    env: async name => process.env[name],
    fileExists: async path => existsSync(path.startsWith('~') ? join(homedir(), path.slice(2)) : path),
  }
}

/** Prefer grok-4.6 when the current (live or installed) list has it. */
export function preferredXaiOAuthModel(
  models: readonly { id: string }[] = catalogModels(),
): string {
  return preferredXaiOAuthModelFrom(models)
}

/**
 * Create the SuperGrok adapter without a dsh fork.
 * The public pi-ai adapter owns streaming, tools, reasoning, and compaction;
 * this plugin supplies the OAuth credential store/config and an account model
 * list. `resolveApiKey` deliberately returns undefined: authentication goes
 * through the profile's pi-ai provider, whose oauth channel reads the same
 * credential store pi-ai itself refreshes under its own lock — one auth source
 * for chat, model listing, and the search tools.
 */
export function createXaiOAuthAdapter(
  session: XaiOAuthSession,
  resolveAttachments: () => AttachmentStore | undefined,
): PiAiAdapter {
  let cached: { provider: ReturnType<XaiOAuthSession['provider']>; map: Map<string, ResolvedPiAiProviderProfile> } | undefined
  return new PiAiAdapter({
    profiles: () => {
      const piProvider = session.provider()
      if (cached?.provider === piProvider) return cached.map
      const map = new Map<string, ResolvedPiAiProviderProfile>([[XAI_OAUTH_ROUTE, {
        provider: XAI_OAUTH_ROUTE,
        displayName: 'xAI Grok',
        streamIdleTimeoutMs: XAI_OAUTH_STREAM_IDLE_TIMEOUT_MS,
        retryPolicy: resolveRetryPolicy(undefined, 'dsh-grok-kit retryPolicy'),
        configuredMaxTokens: new Map(),
        piProvider,
        reasoning: 'high',
        maxRequestImageBytes: MAX_REQUEST_IMAGE_BYTES,
        requestImagePixelBudget: REQUEST_IMAGE_PIXEL_BUDGET,
        requestImageMaxBytes: REQUEST_IMAGE_MAX_BYTES,
      }]])
      cached = { provider: piProvider, map }
      return map
    },
    resolveApiKey: async () => undefined,
    auth: {
      credentials: session.store,
      authContext: hostAuthContext(),
    },
    resolveAttachments,
  })
}
