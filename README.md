# dsh-grok-kit

English | [中文](README.zh.md)

Use a SuperGrok or X Premium subscription in [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) through xAI's device-code sign-in — no `XAI_API_KEY` required, and no dsh source patch required.

This is an independent dsh bundle. It adds:

- SuperGrok / X Premium OAuth sign-in with automatic token refresh (device-code flow) from the dsh Settings panel
- an `xai-oauth` chat route — streaming, tool calls, reasoning (default high, with `reasoning.encrypted_content`), and compaction through the normal LLM service
- server-side `{type:web_search}` / `{type:x_search}` on the main grok-4.6 request (`backendSearch`, on in this bundle)
- `grok_imagine` — Imagine image generation via `POST /v1/images/generations`
- an independent proxy setting (Settings page, `DSH_XAI_PROXY` env or config) applied to x.ai traffic only
- dsh's native `web_search` stays in the host tool list; on backend-search turns it is stripped from the xAI payload so the names do not collide

The catalog `xai` API-key route stays untouched. This plugin registers `xai-oauth` so both can coexist.

## Highlights

**Full Grok search power, fused into the main loop — the flagship feature.** `{type:web_search}` / `{type:x_search}` ride the *same* Responses turn as the reply: the search **is** the thinking. No nested search hop, no second model call, no URL-list-only discovery — grok-4.6 searches with its full ability, exactly like Grok Build does, over the public API. **The complete X search toolset is server-side too**: when it wants X detail, xAI emits one of `x_keyword_search` (keyword), `x_semantic_search` (semantic), `x_user_search` (user) or `x_thread_fetch` (thread/conversation) as a `custom_tool_call` — whichever mode fits — and the search already ran inside that turn. The bundle registers execute-only tools under those exact names so the DSH loop can finish the round; none of them is a second search pipeline.

**Subscription, not API key.** Sign in with your SuperGrok / X Premium account through a device-code flow in Settings. No `XAI_API_KEY`, no dsh source patch. The plugin shares `~/.grok/auth.json` with the Grok CLI, so dsh and the CLI rotate the same grant in place — no separate login, no token copying.

**Grok-4.6 to the fullest.** Hand-written model descriptor: 500k context, `xhigh` reasoning, default `high` effort, `reasoning.encrypted_content` included so multi-turn reasoning continuity works (the encrypted thinking replays on the next turn). Future mainline ids (`grok-4.7`, `grok-5`, …) inherit the newest descriptor automatically — no plugin update needed when xAI ships the next Grok.

**A model picker that only shows mainline Grok.** grok-4.5, grok-4.6 and future grok-4.x / grok-5 only. `grok-build-0.1`, `grok-code-fast`, Imagine / video / embedding ids are hidden from both the composer and the Settings page.

**Credentials engineered, not parked.** Atomic writes with owner-only read checks; refresh network outside the file lock with compare-and-write inside; in-process coalescer so a concurrent 401 cannot double-refresh the rotating grant; 403 kept strictly separate from 401 (entitlement gate ≠ expired token); secrets redacted from every diagnostic; CSRF-hardened local settings routes (loopback + Host pin + Origin + sec-fetch-site + JSON content-type).

**Also in the box.** `grok_imagine` (pixels enter the session as image blocks and are visible to the next turn); an xAI-only proxy setting that leaves every other request untouched; coexistence with the `xai` API-key route; bilingual docs (EN/中文); Apache-2.0 with a NOTICE that credits its dsh-xai lineage; a CI workflow; 109+ tests.

| | dsh-grok-kit | Typical Grok-listener plugins |
| --- | --- | --- |
| Auth | SuperGrok / X Premium **OAuth**, device-code, no API key | API key, third-party relay, or a patched source tree |
| Search | **In the main request**: thinking *is* the search; the **full X toolset** (keyword / semantic / user / thread) runs server-side via `custom_tool_call` | Nested LLM hop (`grok-build-0.1` style), a single X mode, or no real search at all |
| Model | grok-4.6: 500k context, `xhigh`, encrypted-reasoning continuity, future-proof descriptor | Static past-generation ids |
| Picker | Mainline Grok only | Imagine / video / build variants mixed in |
| Proxy | xAI-only, per-plugin, zero global impact | Global env takeover or none |
| Output | `grok_imagine` — image blocks into the conversation | — |
| Engineering | No dsh/pi-ai fork; tests + CI; Apache-2.0 + NOTICE | Often a source patch with no test suite |

## Install

Install from a GitHub repository (replace `<your-name>` with the repository owner):

```sh
dsh plugin --profile web add github:<your-name>/dsh-grok-kit
dsh web
```

If you started the UI with `npx` and have no `dsh` on PATH, use the same package as the CLI:

```sh
npx @deepseek-ai/dsh plugin --profile web add github:<your-name>/dsh-grok-kit
npx @deepseek-ai/dsh web
```

Do not run `npm dsh` or `pnpm dsh` from your home directory. `npx` does not install a global `dsh` command.

Open **Settings → xAI Grok → Sign in with SuperGrok**. The plugin starts xAI's device-code flow, opens the verification URL, and polls until you approve.

The bundle selects `xai-oauth` / `grok-4.6` for new agents. A model already saved in dsh settings still takes precedence. Only mainline Grok chat models (grok-4.5, grok-4.6, future grok-4.x / grok-5) appear in the composer picker — variants (`grok-build-0.1`, `grok-code-fast`, Imagine / video / embedding) are hidden.

The Settings page can choose which account models appear in the composer picker (`xai-oauth / <id>`). After updating the plugin, restart `dsh web` if the picker is still empty.

See [INSTALL.md](INSTALL.md) / [INSTALL.zh.md](INSTALL.zh.md) for the full runbook.

## Search

The main request fuses xAI server-side search into the reply itself: web search runs inside the same Responses turn and shows up as **thinking** — no tool call, no separate search hop. That is the closest this bundle gets to the Grok Build experience on the public API.

When the model wants more X-specific detail, xAI emits a `custom_tool_call` (`x_keyword_search` / `x_semantic_search` / …) into the stream — **that name appearing means an X search already ran on xAI's side inside this turn** (searching X is the model's way to fetch more, not a second search pipeline). The bundle registers execute-only tools under those exact names so the DSH loop can finish the round; their body only says the search already ran. Do not mistake them for nested search.

DSH's native function `web_search` stays in the host list but is stripped from the xAI payload so it does not collide with the server-side `{type:"web_search"}` (`Duplicate tool names: web_search`).

`grok_web_search` / nested `x_search` are **not** registered in this default. They were a nested LLM hop (`grok-build-0.1`) from before the main request could mix server-side tools. Keep the code behind `nestedSearchTools: true` only if you need `allowed_domains` / handle / date filters, or as a fallback after `backendSearch: false`. A SuperGrok 403 on the chat route is fatal for that turn — set `backendSearch: false` (nested tools then come back unless you also set `nestedSearchTools: false`).

`grok_imagine` generates one image per call (approximate 1K low ~$0.04/image). Output is an image block when the host attachment service is present; otherwise it writes under `<session cwd>/.dsh-grok-kit/` (not gitignored automatically).

## Configuration

Plugin config keys (Cordis profile config; the Settings page exposes account, model and proxy):

| Key | Default | Meaning |
| --- | --- | --- |
| `backendSearch` | `false` (bundle composition sets `true`) | Mix xAI server-side `{type:web_search}` / `{type:x_search}` into the main chat request |
| `nestedSearchTools` | no default; `!backendSearch` at apply() | Register nested `grok_web_search` / `x_search` (filtered search or fallback) |
| `searchModel` | `grok-build-0.1` | Model used by nested search calls |
| `searchMaxResults` | `8` | Upper bound on nested search sources |
| `webSearchTimeoutMs` | `60000` | Cooperative budget for nested web search |
| `xSearchTimeoutMs` | `120000` | Cooperative budget for nested x search |
| `imagineTool` | `true` | Register `grok_imagine` |
| `proxyUrl` | `''` | Outbound HTTP/HTTPS proxy for x.ai traffic; stored setting wins over this |

`backendSearch: false` keeps nested tools registered (unless `nestedSearchTools: false`); `backendSearch: true` with the key omitted registers neither — turn them on explicitly only if you need both.

## Proxy

xAI traffic can be routed through an HTTP/HTTPS proxy without affecting any other request:

- Settings → xAI Grok → Network proxy (xAI only): enter the proxy URL and save it
- or set `DSH_XAI_PROXY` (e.g. `http://127.0.0.1:8080`) via the dsh environment / config

The proxy applies to x.ai traffic only; every other request stays direct.

## Credentials

- the live store is `~/.grok/auth.json` when that file exists (same document Grok CLI uses)
- otherwise a leftover `$DSH_HOME/.xai-oauth-auth.json` is still read; new logins write the Grok file
- writes are atomic; the writer lock lives under `$DSH_HOME` (never as `~/.grok/auth.json.lock`) so a leftover lock cannot stall Grok CLI or take dsh down at boot
- browser status and diagnostics never return token values

xAI refresh tokens rotate. Sharing `~/.grok/auth.json` means dsh and Grok CLI rotate the same grant. Sign-out from Settings also signs Grok CLI out. Removing the bundle does not delete the file.

## Compatibility notes

- Chat, tool calls, and reasoning ride pi-ai's xAI provider (`openai-completions` / `openai-responses`).
- Some SuperGrok tiers have been seen to accept the browser login and then reject inference with HTTP 403. That is an xAI entitlement gate, not a stale token. Use `XAI_API_KEY` on the catalog `xai` route in that case.
- Filesystem, shell, skills, MCP, subagents, permissions, attachments, and compaction still come from the active dsh profile.

## Known limitations

- **Chat HTTP 401** retries once with the same serialized refresh the search tools use (403 is not retried — that is an entitlement gate). A failed refresh still needs Settings → xAI Grok → sign in again.
- **Search 403:** some SuperGrok tiers accept the login but reject server-side search tools. Nested search: try `searchModel` (e.g. `grok-4.5`). Main-request mix: set `backendSearch: false`.
- **Backend search** is on in this bundle's composition. The theoretical `encrypted_content`-pairing 400 after a searched turn (xAI pairing omitted `*_search_call` items with the next turn's encrypted reasoning) was **not reproduced in practice as of 2026-08-24** — verified by the maintainer's own multi-turn use and a cross-turn grok-4.6 probe (search turn, then a follow-up listing sources: both HTTP 200). The fallback stays documented: set `backendSearch: false` if you ever hit it.
- **X search UI stubs:** pi-ai surfaces xAI `custom_tool_call` (`x_keyword_search` / `x_semantic_search` / …) as client tools. This bundle registers execute-only stubs titled “X search” so the turn can finish; the search already ran server-side. Extra round is cheap. Do not treat the stub names as nested search.
- **Windows ACLs:** Node's file mode bits are not Windows ACLs. On Windows the live credential file is `~/.grok/auth.json` — its protection is the user-profile directory being private (the default for `%USERPROFILE%`). The same applies to `$DSH_HOME` (write locks, legacy credential/proxy files); if either directory lives in a shared location, restrict its ACL yourself.
- **Schema vs bundle defaults:** the Config schema default is `backendSearch: false` with nested tools on; this bundle's `cordis.patch.yml` flips it to the documented defaults. A manually composed/reduced config without the patch gets nested-search behavior instead — check `dsh --profile web --dump-config` after install.
- **One xAI bundle only:** installing dsh-grok-kit alongside the old dsh-xai bundle is NOT supported. This bundle tries to degrade gracefully (unique plugin id, route + settings-page guards), but the old bundle can still fail the profile boot when it loads second. Remove dsh-xai first: `dsh plugin --profile web remove dsh-xai`.

## Development

```sh
npm install
node scripts/link-host-deps.mjs   # re-point @deepseek-ai/* at the host after every install
npm run check
dsh plugin --profile web add ./dsh-grok-kit   # local dev install
```

`npm install` creates a plugin-local `node_modules` whose `@deepseek-ai` /
`@earendil-works` packages would shadow the host's dsh-* versions at runtime
(that produced `registration.adapter.prepareCall is not a function`). The
link script turns those into junctions to the host's flat module fallback
(`$DSH_HOME/profiles/node_modules`), keeping the plugin on the host's exact
versions — run it after every `npm install` / `npm ci`.

## License

Apache-2.0. Some code derives from dsh-xai (Apache-2.0).
