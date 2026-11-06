# Install dsh-grok-kit

[English](INSTALL.md) | [中文](INSTALL.zh.md)

Idempotent runbook for humans and automation agents.

## Prerequisites

- The DeepSeek Harness desktop app, or the DSH CLI matching your Web host (frozen support for **0.2.0-rc.2** paired with `@earendil-works/pi-ai@0.87.1`, Node 22/24; the legacy 0.1 line is no longer supported). Desktop GUI installation does not require `dsh` on PATH
- An X Subscription or legacy SuperGrok / X Premium account that xAI allows on the OAuth API
- A browser you can use to approve the device-code login

## Desktop app

Desktop and Web have separate plugin installations and activation states. A plugin installed in Web must be installed separately in Desktop.

1. Open the desktop app and select **Plugins → Add plugin** in the sidebar.
2. Enter `dsh-grok-kit@latest` and install it, or use `dsh-grok-kit@0.2.11` to pin this release.
3. Click **Enable now** when installation finishes. Closing the dialog instead keeps the plugin installed but disabled.
4. If prompted to restart, fully quit through the application menu or tray **Quit** action, then reopen the app. Closing the window may only hide it. Check that **Settings → xAI Grok** is available.

The input also accepts a Git source or an absolute local directory. For a reproducible install, enter the same pinned Git source string shown in the Web section below. See the [official plugin-manager guide](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.0-rc.2/packages/client/ui-plugin-manager/README.md#installing-a-bundle) for the GUI flow.

### Desktop CLI

On Windows / macOS, use the desktop application menu **Manage dsh Command… → Install** to register its bundled command. Follow any command-conflict instructions in the dialog, then open a new terminal. Start the desktop app once to initialize its profile, fully quit through **Quit**, then run:

```sh
dsh plugin --profile desktop add dsh-grok-kit@latest
dsh plugin --profile desktop list
```

Here, `dsh` must come from the desktop app. An npm-installed or `npx` CLI cannot manage the `desktop` profile. Do not use `dsh --profile desktop` to launch Desktop. Reopen the app after the commands finish. See the [official bundled-runtime guide](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.0-rc.2/apps/desktop/README.md#bundled-command-runtime).

## Install into the web profile

The following commands are for Web only. Use the same DSH CLI that starts your Web instance, stop any running Web process, then install from npm:

```sh
dsh plugin --profile web add dsh-grok-kit@latest
```

From a DeepSeek Harness source checkout, prefix the same command with `pnpm`:

```sh
pnpm dsh plugin --profile web add dsh-grok-kit@latest
```

Or pin version 0.2.11:

```sh
dsh plugin --profile web add dsh-grok-kit@0.2.11
```

If `dsh` is not on PATH, run via pinned `npx`:

```sh
npx @deepseek-ai/dsh@0.2.0-rc.2 plugin --profile web add dsh-grok-kit@latest
npx @deepseek-ai/dsh@0.2.0-rc.2 web
```

If this profile already has the GitHub source, explicitly request the latest npm release first:

```sh
dsh plugin --profile web add dsh-grok-kit@latest
```

If the source does not switch, run `dsh plugin --profile web remove dsh-grok-kit`, then add it again.

For a reproducible install, pin a full Git commit (the command below pins the shown commit rather than following the rolling default branch):

```sh
dsh plugin --profile web add github:MaRi23333/dsh-grok-kit#0578aad2ac07a60e664ae9b4f185dca477aeb2fd
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

The file is usually `~/.dsh/profiles/web/pnpm-workspace.yaml` (create it if missing). Do not use `npm dsh` or `pnpm dsh` from your home directory. After installation, start `dsh web` again and refresh the page.

## Web development install

```sh
git clone https://github.com/MaRi23333/dsh-grok-kit
cd dsh-grok-kit
npm ci
npm run check
dsh plugin --profile web add .
```

Routine development uses `npm ci` (or `npm install`) and `npm run check`. Running `node scripts/link-host-deps.mjs` is optional when linking live host dependencies for local debugging.

## Sign in

> **Unofficial integration:** This is not an official xAI or X product and does not claim product-specific permission or endorsement. OAuth availability depends on account entitlement and current xAI policies. Read the full [unofficial-project, trademark, and account-use notice in the README](README.md) before signing in.

Desktop and Web use the same settings-page sign-in flow:

1. Open the desktop app, or start `dsh web` (or `dsh --profile web`) for Web
2. Settings → xAI Grok → Sign in with Grok / X Subscription (or "Sign in again" to switch accounts when already signed in)
3. Approve access in the browser
4. Pick a mainline Grok model under `xai-oauth` in the model picker (for example `grok-4.6`; the preferred model is usually selected automatically)

After a successful login the plugin calls `GET /v1/models` and caches the account-visible ids.

## Migrating from dsh-xai

- Both plugins can still read a leftover `$DSH_HOME/.xai-oauth-auth.json`. The live store is `~/.grok/auth.json` when that file exists (same document Grok CLI uses).
- The proxy setting also carries over (`$DSH_HOME/.xai-oauth-proxy.json`).
- **Do not keep both installed in the same profile.** dsh-grok-kit guards its own side (unique plugin id, route/settings-page checks), but the old bundle can still fail the profile boot when it loads second. In Desktop, uninstall dsh-xai from the Plugins page first. For Web, run:
  `dsh plugin --profile web remove dsh-xai`

## Search

This bundle's composition sets `backendSearch: false` (off by default; enable it from Settings or config). When enabled, xAI mixes its server-side `{type:web_search}` / `{type:x_search}` into the **same** Responses turn as the Grok request (shown as thinking). dsh's native function `web_search` stays in the host tool list, but is stripped from that xAI payload so the names do not collide (`Duplicate tool names: web_search`).

Nested `grok_web_search` / `x_search` (a second `grok-build-0.1` hop) are registered automatically while `backendSearch` is off (`nestedSearchTools ?? !backendSearch`). Set `nestedSearchTools: true` only if you need `allowed_domains` / handle / date filters alongside backend search. A SuperGrok 403 on the chat route is fatal for that turn — set `backendSearch: false` in the plugin config. Reject-tool stubs such as `x_keyword_search` are stripped from the forwarded stream when backend search is on; they are not part of the normal UI.

`grok_imagine` (text-to-image) and `grok_imagine_edit` (image-to-image, reusing the main OAuth session) are off by default; old media enablement is not inherited. Confirm the risks in Settings, save, and restart the host to enable them. Normal use does not repeat the prompt; see [Enabling media tools and understanding the risks](README.en.md#enabling-media-tools-and-understanding-the-risks). Images are stored in the DSH attachment library and rendered directly in session image cards; they can be downloaded from the card or exported with host file tools. Direct disk writing via `save_path` is no longer supported for either tool. Experimental video tools (`grok_video_generate` / `grok_video_status` / `grok_video_resume`) are likewise off by default and enabled after risk confirmation and a restart — see [Video tasks (experimental)](README.en.md#video-tasks-experimental) and [VIDEO.md](VIDEO.md).

## Proxy

Optional. Set it from Settings → xAI Grok → Network tab under "Network proxy (xAI only)", or via `DSH_XAI_PROXY` (e.g. `http://127.0.0.1:8080`) in the dsh environment / config. Routes x.ai and official Grok billing requests through this proxy, including the exact `grok.com` `GetGrokCreditsConfig` fallback path. Other requests to these targets in the same DSH process may also be affected; other paths and traffic retain their existing network settings, rather than being forced to connect directly.

## Uninstall

In Desktop, uninstall `dsh-grok-kit` from the **Plugins** page. To use the desktop-bundled CLI instead, fully quit the app as described above, run `dsh plugin --profile desktop remove dsh-grok-kit`, then reopen it.

For Web:

```sh
dsh plugin --profile web remove dsh-grok-kit
```

Sign out from the account page first if the local OAuth document should be deleted. Removing the package leaves `~/.grok/auth.json` (and any leftover `$DSH_HOME/.xai-oauth-auth.json` / `$DSH_HOME/.xai-oauth-proxy.json`) in place.
