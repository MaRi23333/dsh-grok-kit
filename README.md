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

Default: grok-4.6 searches on xAI's servers inside the same Responses turn (shown as thinking). The DSH native function `web_search` is stripped from that payload so it does not collide with `{type:"web_search"}` (`Duplicate tool names: web_search`).

`grok_web_search` / nested `x_search` are **not** registered in this default. They were a nested LLM hop (`grok-build-0.1`) from before the main request could mix server-side tools. Keep the code behind `nestedSearchTools: true` only if you need `allowed_domains` / handle / date filters, or as a fallback after `backendSearch: false`. A SuperGrok 403 on the chat route is fatal for that turn — set `backendSearch: false` (nested tools then come back unless you also set `nestedSearchTools: false`).

`grok_imagine` generates images (approximate 1K low ~$0.04/image). Output is an image block when the host attachment service is present; otherwise it writes under `<session cwd>/.dsh-grok-kit/` (not gitignored automatically).

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
- **Backend search** is on in this bundle's composition. Follow-up turns after a server-side search may still 400 if xAI pairs `encrypted_content` with omitted `*_search_call` items; set `backendSearch: false` if that happens.
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
