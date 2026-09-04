# Install dsh-grok-kit

[English](INSTALL.md) | [中文](INSTALL.zh.md)

Idempotent runbook for humans and automation agents.

## Prerequisites

- DeepSeek Harness `dsh` on PATH (**0.1.2-rc.1**; this plugin does not claim 0.1.1); a source checkout that runs `pnpm dsh` works too
- A SuperGrok or X Premium account that xAI allows on the OAuth API
- A browser you can use to approve the device-code login

## Install into the web profile

Install from npm:

```sh
dsh plugin --profile web add dsh-grok-kit
```

From a DeepSeek Harness source checkout, prefix the same command with `pnpm`:

```sh
pnpm dsh plugin --profile web add dsh-grok-kit
```

If this profile already has the GitHub source, explicitly request the latest npm release first:

```sh
dsh plugin --profile web add dsh-grok-kit@latest
```

If the source does not switch, run `dsh plugin --profile web remove dsh-grok-kit`, then add it again.

For a reproducible install, pin a full Git commit:

```sh
dsh plugin --profile web add github:MaRi23333/dsh-grok-kit#91266c116dd6be086cb91c51e225c1d3d9578562
```

`github:MaRi23333/dsh-grok-kit` without a SHA follows `main` and is **not** a reproducible pin.

A local checkout can be installed by path instead:

```sh
dsh plugin --profile web add ./dsh-grok-kit
```

This repository ships `lib/`, so a git install does not run build scripts. If you installed an older commit and pnpm still asks for `allowBuilds` / `onlyBuiltDependencies`, put the printed package key in that profile's `pnpm-workspace.yaml` and re-run `add`:

```yaml
allowBuilds:
  dsh-grok-kit: true
```

The file is usually `~/.dsh/profiles/web/pnpm-workspace.yaml` (create it if missing). Do not use `npm dsh` or `pnpm dsh` from your home directory.

## Development install

```sh
git clone https://github.com/MaRi23333/dsh-grok-kit
cd dsh-grok-kit
npm install
npm run check
dsh plugin --profile web add .
```

## Sign in

> **Unofficial integration:** This is not an official xAI or X product and does not claim product-specific permission or endorsement. OAuth availability depends on account entitlement and current xAI policies. Read the full [unofficial-project, trademark, and account-use notice in the README](README.md) before signing in.

Web UI:

1. `dsh web` (or `dsh --profile web`)
2. Settings → xAI Grok → Sign in with SuperGrok
3. Approve access in the browser
4. Pick `xai-oauth` / `grok-4.6` (or `grok-4.5`) in the model picker if it is not already selected

After a successful login the plugin calls `GET /v1/models` and caches the account-visible ids.

## Migrating from dsh-xai

- Both plugins can still read a leftover `$DSH_HOME/.xai-oauth-auth.json`. The live store is `~/.grok/auth.json` when that file exists (same document Grok CLI uses).
- The proxy setting also carries over (`$DSH_HOME/.xai-oauth-proxy.json`).
- **Do not keep both installed.** dsh-grok-kit guards its own side (unique plugin id, route/settings-page checks), but the old bundle can still fail the profile boot when it loads second. Remove dsh-xai before adding this bundle:
  `dsh plugin --profile web remove dsh-xai`

## Search

This bundle's composition sets `backendSearch: false` (off by default; enable it from Settings or config). When enabled, grok-4.6 mixes xAI server-side `{type:web_search}` / `{type:x_search}` into the **same** Responses turn as the reply (shown as thinking). dsh's native function `web_search` stays in the host tool list, but is stripped from that xAI payload so the names do not collide (`Duplicate tool names: web_search`).

Nested `grok_web_search` / `x_search` (a second `grok-build-0.1` hop) are registered automatically while `backendSearch` is off (`nestedSearchTools ?? !backendSearch`). Set `nestedSearchTools: true` only if you need `allowed_domains` / handle / date filters alongside backend search. A SuperGrok 403 on the chat route is fatal for that turn — set `backendSearch: false` in the plugin config. Reject-tool stubs such as `x_keyword_search` are stripped from the forwarded stream when backend search is on; they are not part of the normal UI.

`grok_imagine` is on by default. Current DSH builds cannot display the generated image directly in the conversation. Ask the Agent to save it to a specific directory when you need a normal file; without a specified directory, it is stored in the DSH attachment library.

## Proxy

Optional. Set it from Settings → xAI Grok → Network proxy (xAI only), or via `DSH_XAI_PROXY` (e.g. `http://127.0.0.1:8080`) in the dsh environment / config. Applies to x.ai traffic only.

## Uninstall

```sh
dsh plugin --profile web remove dsh-grok-kit
```

Sign out from the account page first if the local OAuth document should be deleted. Removing the package leaves `~/.grok/auth.json` (and any leftover `$DSH_HOME/.xai-oauth-auth.json` / `$DSH_HOME/.xai-oauth-proxy.json`) in place.
