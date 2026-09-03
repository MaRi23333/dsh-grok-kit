//

// Part of dsh-grok-kit, Apache-2.0.

//

/**
 * Global vitest setup: run every spec against a redirected user/DSH home.
 *
 * Why: the store path resolves through `os.homedir()` (prefer
 * `~/.grok/auth.json`, fall back to `$DSH_HOME/.xai-oauth-auth.json`), so
 * per-spec `DSH_HOME` isolation alone cannot keep tests off the real
 * credential, options, proxy, model-cache, and writer-lock files. This
 * actually happened: a fire-and-forget startup refresh from `apply()` in
 * config-nested.spec reached the real store, pi-ai's expired-token refresh
 * took the real writer lock, and vitest tearing the worker down mid-flight
 * left an orphan `.xai-oauth-auth.json.lock` in the real `$DSH_HOME` — which
 * then wedged the user's running host (HANDOFF 2026-09-03).
 *
 * One temp dir per test file; it is deliberately NOT deleted on teardown:
 * worker teardown can abandon in-flight writes, and removing the directory
 * under them would recreate the very race this setup exists to prevent.
 * The OS temp directory cleans these up.
 */
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const home = await mkdtemp(join(tmpdir(), 'dsh-grok-kit-tests-'))
process.env.USERPROFILE = home
process.env.HOME = home
process.env.DSH_HOME = home
