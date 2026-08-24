# dsh-grok-kit

[中文](README.md) · **English**

<p align="center">
  <img src="assets/readme/hero.svg" width="100%" alt="dsh-grok-kit: Grok OAuth and fused search for DeepSeek Harness">
</p>

<p align="center">
  <a href="https://github.com/MaRi23333/dsh-grok-kit/actions/workflows/ci.yml"><img src="https://github.com/MaRi23333/dsh-grok-kit/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-4d6bfe.svg" alt="Apache-2.0"></a>
  <img src="https://img.shields.io/badge/DeepSeek%20Harness-0.1.1--rc.2%2B-4d6bfe" alt="DeepSeek Harness 0.1.1-rc.2+">
  <img src="https://img.shields.io/badge/status-unofficial%20community%20plugin-7c84a8" alt="Unofficial community plugin">
</p>

> Use an eligible SuperGrok or X Premium subscription in DeepSeek Harness through OAuth, with Grok chat, server-side web/X search in the main model turn, Imagine image generation, and an xAI-only proxy.

> [!IMPORTANT]
> **Unofficial project, trademark, and account-use notice**
>
> `dsh-grok-kit` is an independently developed, third-party community plugin for DeepSeek Harness. It is not an official product of, or representative of, xAI, X, DeepSeek, DeepSeek Harness, or their maintainers, and it does not claim product-specific permission, sponsorship, endorsement, or approval from them. Grok, xAI, X, DeepSeek, DeepSeek Harness, and related names and marks belong to their respective owners and are used only to identify compatible services accurately.
>
> OAuth availability may depend on subscription tier, region, xAI terms, account entitlement, rate limits, and future service changes. Users are responsible for confirming that their account and use are permitted. This project does not guarantee continued access or compatibility and does not provide xAI/Grok accounts, subscriptions, or official support.

## What it does

`dsh-grok-kit` adds a separate `xai-oauth` route to [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) and reuses the local Grok CLI sign-in document. It does not require `XAI_API_KEY` or patch dsh source code; the built-in `xai` API-key route can remain installed alongside it.

- Device-code sign-in, sign-out, and account-visible model selection in Settings
- Grok chat, streaming, tool calls, and reasoning through `xai-oauth`
- xAI server-side web and X search inside the main model request instead of another search-model hop
- A `grok_imagine` image-generation tool
- An independent HTTP/HTTPS proxy that applies only to `x.ai` requests
- Defensive handling for OAuth files, concurrent refreshes, settings routes, and diagnostic redaction

## Search in the main model turn

The default bundle mixes xAI server-side `{type:web_search}` and `{type:x_search}` into the same Grok Responses request. Web lookup normally appears directly inside **Think**: lookup, reasoning, and the answer belong to one model turn, without asking DeepSeek Harness to run a separate nested search pipeline.

When xAI returns a `custom_tool_call` such as `x_keyword_search`, `x_semantic_search`, `x_user_search`, or `x_thread_fetch`, the search has already executed server-side. The plugin registers completion tools under those names so the DSH loop can finish the turn; those tools do not launch a second search.

For domain, account, or date filters, disable `backendSearch` or explicitly enable `nestedSearchTools` to use the separate `grok_web_search` / `x_search` fallback mode.

## Interface and behavior

<p align="center">
  <img src="assets/readme/settings.png" width="820" alt="dsh-grok-kit settings: Grok CLI sign-in, model selection, and xAI-only proxy">
</p>
<p align="center"><sub>Settings reuses the Grok CLI login, exposes account-visible models, and optionally configures a proxy for xAI only. <code>127.0.0.1</code> in the example is a loopback proxy address.</sub></p>

<p align="center">
  <img src="assets/readme/main-loop-search.png" width="960" alt="Grok completes web search inside the same Think turn">
</p>
<p align="center"><sub>Main-turn search: web lookup occurs inside the same Think turn rather than appearing as a normal host-side tool call. The news content is illustrative UI data, not a factual reference.</sub></p>

<p align="center">
  <img src="assets/readme/x-search.png" width="960" alt="xAI returns an X-search custom_tool_call before completing the answer">
</p>
<p align="center"><sub>X search may surface a <code>custom_tool_call</code> such as <code>x_keyword_search</code>. xAI has already run the search; the plugin only completes that turn in DSH. Screenshot content is illustrative.</sub></p>

## Install

Install from GitHub into the Web profile:

```sh
dsh plugin --profile web add github:MaRi23333/dsh-grok-kit
dsh web
```

If `dsh` is not on PATH, run the same CLI package through `npx`:

```sh
npx @deepseek-ai/dsh plugin --profile web add github:MaRi23333/dsh-grok-kit
npx @deepseek-ai/dsh web
```

Open **Settings → xAI Grok**, finish sign-in, then choose `xai-oauth / grok-4.6` or another mainline Grok model currently visible to the account. A model already saved in dsh settings still takes precedence.

See [INSTALL.md](INSTALL.md) for installation, migration, removal, and troubleshooting details.

## Models and tools

- The picker shows only mainline Grok chat models; Imagine, video, embedding, build, and code variants are hidden
- The default grok-4.6 descriptor includes reasoning fields and encrypted reasoning continuity for multi-turn use
- `grok_imagine` is enabled by default; when the host attachment service is available, output enters the session as an image block
- DSH's native `web_search` remains in the host tool list, but is removed from an xAI payload with backend search enabled to avoid duplicate tool names

The model list comes from the signed-in account's `GET /v1/models` response and is cached locally. Service or model requirements may still require a plugin update; a visible model id does not imply that every capability is available to the account.

## Configuration

| Key | Default | Meaning |
| --- | --- | --- |
| `backendSearch` | schema: `false`; bundle: `true` | Enable xAI server-side web/X search in the main chat request |
| `nestedSearchTools` | omitted: `!backendSearch` | Register separate `grok_web_search` / `x_search` tools |
| `searchModel` | `grok-build-0.1` | Model used by nested search mode |
| `searchMaxResults` | `8` | Maximum number of sources returned by nested search |
| `webSearchTimeoutMs` | `60000` | Cooperative budget for nested web search |
| `xSearchTimeoutMs` | `120000` | Cooperative budget for nested X search |
| `imagineTool` | `true` | Register `grok_imagine` |
| `proxyUrl` | `''` | xAI-only HTTP/HTTPS proxy; the value saved in Settings wins |

The bundle defaults come from `cordis.patch.yml`. For a manually reduced or recomposed setup, inspect the final values with `dsh --profile web --dump-config`.

## Sign-in document, proxy, and security boundaries

- The live store prefers `~/.grok/auth.json`, sharing the same xAI credential with Grok CLI; signing out in Settings signs Grok CLI out too
- OAuth refresh tokens rotate; atomic writes, in-process coalescing, and compare-and-write prevent concurrent refreshes from overwriting one another
- Browser status routes, errors, and diagnostics do not return token values
- Proxy settings accept only `http://` or `https://` URLs without embedded credentials; legacy values containing userinfo are scrubbed and do not reach status responses or logs
- The xAI-only fetch hook is restored when the plugin is disposed and does not permanently change system or process environment variables
- On Windows, Node mode bits are not NTFS ACLs. Restrict the directory ACL yourself if the user profile or `$DSH_HOME` is stored in a shared location

## Compatibility and limitations

- Some subscription tiers may allow browser sign-in but return HTTP 403 for chat or server-side search; this is an entitlement/service-policy result, not necessarily an expired token
- HTTP 401 is retried once after serialized refresh; 403 is not treated as token expiry
- Running this bundle together with the old `dsh-xai` bundle is unsupported; remove it first with `dsh plugin --profile web remove dsh-xai`
- Backend search is the default composition, but availability still depends on the account, selected model, and xAI's current service behavior
- Removing the plugin does not delete `~/.grok/auth.json`; sign out in Settings first if the local login should be removed

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
