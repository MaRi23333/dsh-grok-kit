# dsh-grok-kit

[中文](README.md) · **English**

<p align="center">
  <img src="assets/readme/hero.svg" width="100%" alt="dsh-grok-kit: Grok OAuth and fused search for DeepSeek Harness">
</p>

<p align="center">
  <a href="https://github.com/MaRi23333/dsh-grok-kit/actions/workflows/ci.yml"><img src="https://github.com/MaRi23333/dsh-grok-kit/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/dsh-grok-kit"><img src="https://img.shields.io/npm/v/dsh-grok-kit.svg" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-4d6bfe.svg" alt="Apache-2.0"></a>
  <img src="https://img.shields.io/badge/DeepSeek%20Harness-0.1.2--rc.1-4d6bfe" alt="DeepSeek Harness 0.1.2-rc.1">
  <img src="https://img.shields.io/badge/status-unofficial%20community%20plugin-7c84a8" alt="Unofficial community plugin">
</p>

> Use an eligible SuperGrok or X Premium subscription in DeepSeek Harness through OAuth, with web/X search in the main model turn, continuous reasoning, Imagine, and an xAI-only proxy.

> [!IMPORTANT]
> **Unofficial project, trademark, and account-use notice**
>
> `dsh-grok-kit` is an independently developed, third-party community plugin for DeepSeek Harness. It is not an official product of, or representative of, xAI, X, DeepSeek, DeepSeek Harness, or their maintainers, and it does not claim product-specific permission, sponsorship, endorsement, or approval from them. Grok, xAI, X, DeepSeek, DeepSeek Harness, and related names and marks belong to their respective owners and are used only to identify compatible services accurately.
>
> OAuth availability may depend on subscription tier, region, xAI terms, account entitlement, rate limits, and future service changes. Users are responsible for confirming that their account and use are permitted. This project does not guarantee continued access or compatibility and does not provide xAI/Grok accounts, subscriptions, or official support.

## More than OAuth sign-in

`dsh-grok-kit` adds a separate `xai-oauth` route to [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It does not require `XAI_API_KEY` or patch dsh source code. The point is not only to sign in, but to bring server-side search and the fields required for continuous reasoning into the main chat path.

- **Search in the main loop:** web and X lookup occurs inside grok-4.6's current Think turn, so reasoning can use newly found material immediately
- **Continuous multi-turn reasoning:** high effort is the default, with `reasoning.encrypted_content` preserved for the next turn
- **Sign-in stays in sync with Grok CLI:** the plugin shares and writes back `~/.grok/auth.json` instead of copying once and rotating refresh tokens separately
- **Imagine with a clean model picker:** `grok_imagine` is enabled by default, while non-chat models stay out of the conversation picker; current DSH builds do not display the generated image directly in the conversation

Supporting behavior includes an xAI-only proxy, forced refresh and one retry on chat 401, atomic credential writes, and diagnostic redaction.

## Search in the main model turn

The same model id does not guarantee the same experience across integrations. [xAI documents that `grok-4.6` is available in both Grok Build and the public API](https://docs.x.ai/build/overview); the important search difference is whether server-side tools share the main conversation request.

**Separate search** sends another model request to retrieve or summarize material before returning it to the main conversation. That path remains useful when explicit filters are needed, but adds another model round, and its search summary is not produced inside the current reply's Think turn.

**Main-turn search** follows [xAI's server-side Responses search pattern](https://docs.x.ai/developers/tools/web-search), placing `{type:web_search}` and `{type:x_search}` directly on the main grok-4.6 request. Lookup occurs inside Think, so the model can use newly found web and X material during the same reasoning turn. This path is off by default (since v0.1.8); enable it from Settings or config.

To let both search systems coexist, DSH's native `web_search` remains in the host tool list but is removed from an xAI payload with fused search enabled, preventing a server-tool name collision. Other model routes can continue using the host search tool normally.

> When main-turn search is on, the plugin strips xAI reject stubs such as `x_keyword_search` so DSH does not start another step and reprint the writeup. If those names still appear, treat them as a diagnostic path, not normal UI.

For domain, account, or date filters, use the standalone `grok_web_search` / `x_search` tools — the default path while `backendSearch` is off; enabling `backendSearch` turns this standalone path into the optional mode.

`statefulResponses` is off by default. When enabled, the plugin uses `store: true` + `previous_response_id` and appends only new user items. A previous `toolUse` turn (client tools such as bash) is never continued — otherwise xAI emits a second message that reprints the search writeup. A live OAuth probe could list sources on follow-up, but `cached_tokens` does not become that turn's 100k–300k search KV.

## Interface and behavior

### Account, models, and proxy

<p align="center">
  <img src="assets/readme/settings.png" width="620" alt="dsh-grok-kit settings: Grok CLI sign-in, model selection, and xAI-only proxy">
</p>
<p align="center"><em>Settings reuses the Grok CLI login, exposes account-visible models, and optionally configures a proxy for xAI only. <code>127.0.0.1</code> in the example is a loopback proxy address.</em></p>

<br><br>

### Web search inside the main loop

<p align="center">
  <img src="assets/readme/main-loop-search.png" width="760" alt="Grok completes web search inside the same Think turn">
</p>
<p align="center"><em>No nested search-tool card is opened: web lookup occurs inside the same Think turn, and the material is used immediately by the current reply. The news content is illustrative UI data, not a factual reference.</em></p>

<br><br>

### Server-side X search calls

<p align="center">
  <img src="assets/readme/x-search.png" width="760" alt="xAI returns an X-search custom_tool_call before completing the answer">
</p>
<p align="center"><em>Current builds strip <code>x_keyword_search</code> reject stubs when main-turn search is on, so the normal path no longer forwards them to DSH. The screenshot is illustrative and does not mean those names still appear in the UI.</em></p>

## Install

Install the npm package into the Web profile:

```sh
dsh plugin --profile web add dsh-grok-kit
dsh web
```

If `dsh` is not on PATH, run the same CLI package through `npx`:

```sh
npx @deepseek-ai/dsh plugin --profile web add dsh-grok-kit
npx @deepseek-ai/dsh web
```

If this profile previously used the GitHub source, first try `dsh plugin --profile web add dsh-grok-kit@latest`. If the source does not switch, remove the old package and add it again.

For a reproducible Git install, pin a full commit (v0.1.8 code at `2a945b9`; `github:MaRi23333/dsh-grok-kit` without a SHA follows `main` and is not a reproducible pin):

```sh
dsh plugin --profile web add github:MaRi23333/dsh-grok-kit#2a945b9a20ef97216c6759c12c3a1f4dae13d231
```

The full SHA fixes the installed source; the npm form follows the stable `latest` release by default.

Open **Settings → xAI Grok**, finish sign-in, then choose `xai-oauth / grok-4.6` or another mainline Grok model currently visible to the account. A model already saved in dsh settings still takes precedence.

See [INSTALL.md](INSTALL.md) for installation, migration, removal, and troubleshooting details.

## Models and tools

- The picker shows only mainline Grok chat models; Imagine, video, embedding, build, and code variants are hidden
- The default grok-4.6 descriptor uses high reasoning and requests `reasoning.encrypted_content` so encrypted reasoning context can be carried into later turns
- `grok_imagine` is enabled by default, but current DSH builds cannot display the generated image directly in the conversation. To obtain a normal file, ask the Agent in your prompt to save the result to a specific directory; without a specified directory, the image is stored in the DSH attachment library
- DSH's native `web_search` remains in the host tool list, but is removed from an xAI payload with backend search enabled to avoid duplicate tool names

The model list comes from the signed-in account's `GET /v1/models` response and is cached locally. Service or model requirements may still require a plugin update; a visible model id does not imply that every capability is available to the account.

## Configuration

| Key | Default | Meaning |
| --- | --- | --- |
| `backendSearch` | `false` (off by default; enable from Settings) | Enable xAI server-side web/X search in the main chat request |
| `nestedSearchTools` | omitted: `!backendSearch` | Register separate `grok_web_search` / `x_search` tools |
| `statefulResponses` | omitted: `false` | Opt-in `store` + `previous_response_id`; `toolUse` turns are not continued |
| `searchModel` | `grok-build-0.1` | Model used by nested search mode |
| `searchMaxResults` | `8` | Maximum number of sources returned by nested search |
| `webSearchTimeoutMs` | `60000` | Cooperative budget for nested web search |
| `xSearchTimeoutMs` | `120000` | Cooperative budget for nested X search |
| `imagineTool` | `true` | Register `grok_imagine` |
| `proxyUrl` | `''` | xAI-only HTTP/HTTPS proxy; the value saved in Settings wins |

The bundle defaults come from `cordis.patch.yml`. For a manually reduced or recomposed setup, inspect the final values with `dsh --profile web --dump-config`.

The “Search & feature options” card on Settings → xAI Grok can also override the search/feature keys above (restart to apply; untouched keys keep following the bundle defaults instead of being pinned). `proxyUrl` is the exception — it applies immediately on save.

## Sign-in document, proxy, and security boundaries

- The live store prefers `~/.grok/auth.json`, sharing the same xAI credential with Grok CLI in place; sign-in and refresh write back to that file instead of performing a one-time import, and signing out in Settings signs Grok CLI out too
- OAuth refresh tokens rotate; atomic writes, in-process coalescing, and compare-and-write prevent concurrent refreshes from overwriting one another
- Browser status routes, errors, and diagnostics do not return token values
- Proxy settings accept only `http://` or `https://` URLs without embedded credentials; legacy values containing userinfo are scrubbed and do not reach status responses or logs
- The xAI-only fetch hook is restored when the plugin is disposed and does not permanently change system or process environment variables
- On Windows, Node mode bits are not NTFS ACLs. Restrict the directory ACL yourself if the user profile or `$DSH_HOME` is stored in a shared location
- The plugin's own writer lock (`$DSH_HOME/.xai-oauth-auth.json.lock`) is **never deleted or renamed automatically**. A path-based check-then-rename/rm cannot bind the inspected file generation and can move a live writer's lock. Leftover locks are fail-closed (writers time out) and left for the operator

## Compatibility and limitations

- Tested host matrix: DeepSeek Harness `0.1.2-rc.1` + `@earendil-works/pi-ai@0.84.4` (Node 22/24). peerDependencies follow that matrix; 0.1.1 is not claimed.
- Some subscription tiers may allow browser sign-in but return HTTP 403 for chat or server-side search; this is an entitlement/service-policy result, not necessarily an expired token
- HTTP 401 is retried once after serialized refresh; 403 is not treated as token expiry
- Running this bundle alongside another bundle that registers the same xAI OAuth route is unsupported; follow the migration steps in [INSTALL.md](INSTALL.md) and remove the conflicting bundle first
- Backend search is off by default and can be enabled from Settings or config; availability still depends on the account, selected model, and xAI's current service behavior
- Removing the plugin does not delete `~/.grok/auth.json`; sign out in Settings first if the local login should be removed

## Troubleshooting

**Startup or chat reports `timed out waiting for the writer lock`**: a force-killed or crashed writer process left a `*.lock` file behind. This plugin **does not auto-clear locks** (doing so can steal a live writer's lock). Clean up by hand:

1. Close all DeepSeek Harness and Grok CLI processes;
2. Delete `.xai-oauth-auth.json.lock` under `$DSH_HOME` (default `~/.dsh`);
3. `~/.grok/auth.json.lock` belongs to the Grok CLI — delete it only while the Grok CLI is not running;
4. Start again.

A failed startup catalog refresh (including the lock timeout above) never blocks chat: the plugin serves the cached model list and retries in the background with 5s / 30s / 120s backoff.

## Development

```sh
npm install
node scripts/link-host-deps.mjs
npm run check
dsh plugin --profile web add ./dsh-grok-kit
```

Run `scripts/link-host-deps.mjs` after installing dependencies so the development checkout continues to use the host DeepSeek Harness versions of `@deepseek-ai/*` and `@earendil-works/*`.

CI runs frozen install, typecheck, tests, and build on Node.js 22 and 24, then confirms that the committed `lib/` matches the source build.

## License and attribution

[Apache-2.0](LICENSE). Some code derives from Apache-2.0-licensed `dsh-xai`; see [NOTICE](NOTICE).
