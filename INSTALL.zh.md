# 安装 dsh-grok-kit

[English](INSTALL.md) | 中文

给人和其他自动化 agent 用的完整步骤。

## 先决条件

- DeepSeek Harness 桌面客户端，或与 Web 宿主配套的 DSH CLI（当前冻结支持 **0.2.0-rc.2**，配套 `@earendil-works/pi-ai@0.87.1`，Node 22/24；不再支持旧 0.1 宿主线）。桌面界面安装不要求 PATH 上有 `dsh`
- xAI 允许走 OAuth API 的 X Subscription 或原 SuperGrok / X Premium 账号
- 能打开浏览器完成 device-code 授权

## 桌面客户端

桌面与 Web 的插件安装和启用状态独立；已在 Web 中安装的插件需要另行装到桌面端。

1. 打开桌面客户端，在侧栏进入 **插件（Plugins）→ 添加插件（Add plugin）**。
2. 输入 `dsh-grok-kit@latest` 并安装，或输入 `dsh-grok-kit@0.2.12` 固定本版。
3. 安装完成后点击 **立即启用（Enable now）**；直接关闭对话框会保留安装结果，但不会启用插件。
4. 若界面提示需要重启，通过应用菜单或托盘的 **Quit / 退出** 完整退出后重开；仅关闭窗口可能只是隐藏应用。随后在 **设置 → xAI Grok** 中确认入口出现。

添加框也接受 Git 来源或绝对本地目录；需要可复现安装时，可输入下方 Web 章节给出的同一个固定 Git 来源字符串。界面流程见 [官方插件管理器说明](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.0-rc.2/packages/client/ui-plugin-manager/README.md#installing-a-bundle)。

### 桌面端命令行

Windows / macOS 的终端用户可通过桌面应用菜单 **Manage dsh Command… → Install** 注册桌面配套命令。按菜单提示处理已有命令冲突，再打开新终端。先启动桌面客户端一次以初始化 profile，然后通过 **Quit / 退出** 完整退出应用，再运行：

```sh
dsh plugin --profile desktop add dsh-grok-kit@latest
dsh plugin --profile desktop list
```

这里的 `dsh` 必须来自桌面应用；npm 全局安装或 `npx` 启动的 CLI 不能管理 `desktop` profile。不要使用 `dsh --profile desktop` 启动桌面。命令完成后重新打开桌面客户端。详见 [官方桌面配套运行时说明](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.0-rc.2/apps/desktop/README.md#bundled-command-runtime)。

## 装进 web profile

以下命令只用于 Web。使用启动该 Web 实例的同一套 DSH CLI，先停止正在运行的 Web 进程，再从 npm 安装：

```sh
dsh plugin --profile web add dsh-grok-kit@latest
```

从 dsh 源码目录启动时，在同一命令前加 `pnpm`：

```sh
pnpm dsh plugin --profile web add dsh-grok-kit@latest
```

也可以固定安装 0.2.12：

```sh
dsh plugin --profile web add dsh-grok-kit@0.2.12
```

如果 PATH 中没有 `dsh`，可以使用固定宿主版本的 npx：

```sh
npx @deepseek-ai/dsh@0.2.0-rc.2 plugin --profile web add dsh-grok-kit@latest
npx @deepseek-ai/dsh@0.2.0-rc.2 web
```

如果这个 profile 已装过 GitHub 来源，先尝试显式请求 npm 最新版：

```sh
dsh plugin --profile web add dsh-grok-kit@latest
```

如果来源没有切换，先运行 `dsh plugin --profile web remove dsh-grok-kit`，再重新添加。

需要可复现安装时，可固定到完整 Git 提交（以下命令固定到所示提交，不跟随默认分支滚动）：

```sh
dsh plugin --profile web add github:MaRi23333/dsh-grok-kit#0578aad2ac07a60e664ae9b4f185dca477aeb2fd
```

不带 SHA 的 `github:MaRi23333/dsh-grok-kit` 会跟随 `main`，**不是**可复现锚点。

本地检出目录也可以直接装：

```sh
dsh plugin --profile web add ./dsh-grok-kit
```

仓库已经带构建好的 `lib/`，git 安装不跑构建脚本。若你装到的还是旧提交、pnpm 仍提示 `allowBuilds` / `onlyBuiltDependencies`，把提示里的包名写进该 profile 的 `pnpm-workspace.yaml` 后再 `add` 一次：

```yaml
allowBuilds:
  dsh-grok-kit: true
```

文件一般在 `~/.dsh/profiles/web/pnpm-workspace.yaml`（没有就新建）。不要改成 `npm dsh` 或在家目录跑 `pnpm dsh`。安装完成后重新运行 `dsh web` 并刷新页面。

## Web 开发安装

```sh
git clone https://github.com/MaRi23333/dsh-grok-kit
cd dsh-grok-kit
npm ci
npm run check
dsh plugin --profile web add .
```

日常开发运行 `npm ci`（或 `npm install`）与 `npm run check` 即可。若需在本地环境链接真实宿主依赖进行调试，可按需可选运行 `node scripts/link-host-deps.mjs`。

## 登录

> **非官方集成：** 本插件不是 xAI 或 X 的官方产品，也不主张获得其对本插件的个别许可或背书。OAuth 可用性取决于账户资格与 xAI 当前策略；请在登录前阅读 [README 的完整非官方项目、商标与账户使用声明](README.md)。

桌面与 Web 使用相同的设置页登录流程：

1. 打开桌面客户端；Web 用户运行 `dsh web`（或 `dsh --profile web`）
2. 设置 → xAI Grok → 登录 Grok / X 订阅（已登录时为“重新登录”以切换账号）
3. 在浏览器里批准
4. 模型选择器里选 `xai-oauth` 下的主线 Grok 模型（如 `grok-4.6`；通常会自动选中偏好型号）

登录成功后插件会请求 `GET /v1/models`，并缓存账号可见的模型 id。

## 从 dsh-xai 迁移

- 两个插件都能读残留的 `$DSH_HOME/.xai-oauth-auth.json`。有 `~/.grok/auth.json` 时用它（和 Grok CLI 同一份）。
- 代理设置同样继承（`$DSH_HOME/.xai-oauth-proxy.json`）。
- **不要在同一个 profile 中同时保留两个插件。** dsh-grok-kit 只对自己的部分做了降级防护（唯一插件 id、路由/设置页守卫），旧插件后加载时仍可能拖垮 profile 启动。桌面用户先在插件管理页卸载 dsh-xai；Web 用户先运行：
  `dsh plugin --profile web remove dsh-xai`

## 搜索

本 bundle 的组合把 `backendSearch` 设为 `false`（默认关闭，可在设置页或配置中打开）。开启后，xAI 会在**同一轮** Responses 里把服务端 `{type:web_search}` / `{type:x_search}` 混入 Grok 请求（界面上多半是 thinking）。dsh 原生函数 `web_search` 仍在宿主工具列表里，但会从这份 xAI payload 剥掉，避免 `Duplicate tool names: web_search`。

嵌套的 `grok_web_search` / `x_search`（再开一轮 `grok-build-0.1`）在 `backendSearch` 关闭时自动注册（`nestedSearchTools ?? !backendSearch`）。只有需要与主搜索同时使用 `allowed_domains` / 账号/日期过滤时，才设 `nestedSearchTools: true`。主请求 403 会让整轮聊天失败——在插件配置里设 `backendSearch: false`。开启主循环搜索时，`x_keyword_search` 等拒绝桩会从转发流中剥掉，不属于正常界面体验。

`grok_imagine`（文生图）与 `grok_imagine_edit`（图生图，复用主 OAuth session）默认关闭，旧媒体开启配置不继承；需在设置页确认风险、保存并重启宿主后开启。正常使用不重复确认，详见 [媒体工具的开启与风险](README.md#媒体工具的开启与风险)。图片保存到 DSH 附件库并直接在会话图片卡片中显示；支持从卡片下载或通过宿主文件工具导出，两工具的 `save_path` 参数均不再支持直接写盘。实验性视频工具（`grok_video_generate` / `grok_video_status` / `grok_video_resume`）同样默认关闭、确认风险并重启后开启，详见 [视频任务（实验性）](README.md#视频任务实验性) 与 [VIDEO.zh.md](VIDEO.zh.md)。

## 代理

可选。在 设置 → xAI Grok → 网络页的“网络代理（仅 xAI）”里配置，或通过 dsh 环境 / config 设置 `DSH_XAI_PROXY`（例如 `http://127.0.0.1:8080`）。代理对 x.ai 与 Grok 官方额度请求生效，包括 `grok.com` 上精确的 `GetGrokCreditsConfig` 回退路径。同一 DSH 进程内其他发往这些目标的请求也可能受影响；其他路径和请求沿用原有网络设置，不强制直连。

## 卸载

桌面用户在 **插件（Plugins）** 页卸载 `dsh-grok-kit`。若使用桌面配套 CLI，按上面的步骤先完整退出应用，再执行 `dsh plugin --profile desktop remove dsh-grok-kit`，完成后重开。

Web 用户使用：

```sh
dsh plugin --profile web remove dsh-grok-kit
```

如果要删掉本地 OAuth 文件，先到设置页退出登录。只 `remove` 包装不会删除 `~/.grok/auth.json`（以及可能残留的 `$DSH_HOME/.xai-oauth-auth.json` / `$DSH_HOME/.xai-oauth-proxy.json`）。
