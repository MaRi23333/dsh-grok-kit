# 安装 dsh-grok-kit

[English](INSTALL.md) | 中文

给人和其他自动化 agent 用的完整步骤。

## 先决条件

- PATH 上有 DeepSeek Harness 的 `dsh`（**0.1.2-rc.1**；本插件不声称支持 0.1.1）
- xAI 允许走 OAuth API 的 SuperGrok 或 X Premium 账号
- 能打开浏览器完成 device-code 授权

## 装进 web profile

推荐从 npm 安装：

```sh
dsh plugin --profile web add dsh-grok-kit
```

从 dsh 源码目录启动时，在同一命令前加 `pnpm`：

```sh
pnpm dsh plugin --profile web add dsh-grok-kit
```

如果这个 profile 已装过 GitHub 来源，先尝试显式请求 npm 最新版：

```sh
dsh plugin --profile web add dsh-grok-kit@latest
```

如果来源没有切换，先运行 `dsh plugin --profile web remove dsh-grok-kit`，再重新添加。

需要可复现安装时，可固定到完整 Git 提交：

```sh
dsh plugin --profile web add github:MaRi23333/dsh-grok-kit#91266c116dd6be086cb91c51e225c1d3d9578562
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

文件一般在 `~/.dsh/profiles/web/pnpm-workspace.yaml`（没有就新建）。不要改成 `npm dsh` 或在家目录跑 `pnpm dsh`。

## 开发安装

```sh
git clone https://github.com/MaRi23333/dsh-grok-kit
cd dsh-grok-kit
npm install
npm run check
dsh plugin --profile web add .
```

## 登录

> **非官方集成：** 本插件不是 xAI 或 X 的官方产品，也不主张获得其对本插件的个别许可或背书。OAuth 可用性取决于账户资格与 xAI 当前策略；请在登录前阅读 [README 的完整非官方项目、商标与账户使用声明](README.md)。

Web UI：

1. `dsh web`（或 `dsh --profile web`）
2. 设置 → xAI Grok → 使用 SuperGrok 登录
3. 在浏览器里批准
4. 模型选择器里选 `xai-oauth` / `grok-4.6`（或 `grok-4.5`，如果还没自动选中）

登录成功后插件会请求 `GET /v1/models`，并缓存账号可见的模型 id。

## 从 dsh-xai 迁移

- 两个插件都能读残留的 `$DSH_HOME/.xai-oauth-auth.json`。有 `~/.grok/auth.json` 时用它（和 Grok CLI 同一份）。
- 代理设置同样继承（`$DSH_HOME/.xai-oauth-proxy.json`）。
- **不要同时保留两个插件。** dsh-grok-kit 只对自己的部分做了降级防护（唯一插件 id、路由/设置页守卫），旧插件后加载时仍可能拖垮 profile 启动。请先移除 dsh-xai 再装本插件：
  `dsh plugin --profile web remove dsh-xai`

## 搜索

本 bundle 的组合把 `backendSearch` 设为 `false`（默认关闭，可在设置页或配置中打开）。开启后，grok-4.6 会在**同一轮** Responses 里混入 xAI 服务端 `{type:web_search}` / `{type:x_search}`（界面上多半是 thinking）。dsh 原生函数 `web_search` 仍在宿主工具列表里，但会从这份 xAI payload 剥掉，避免 `Duplicate tool names: web_search`。

嵌套的 `grok_web_search` / `x_search`（再开一轮 `grok-build-0.1`）在 `backendSearch` 关闭时自动注册（`nestedSearchTools ?? !backendSearch`）。只有需要与主搜索同时使用 `allowed_domains` / 账号/日期过滤时，才设 `nestedSearchTools: true`。主请求 403 会让整轮聊天失败——在插件配置里设 `backendSearch: false`。开启主循环搜索时，`x_keyword_search` 等拒绝桩会从转发流中剥掉，不属于正常界面体验。

`grok_imagine` 默认打开。当前 DSH 还不能把生成图直接显示在对话中；需要直接取得文件时，请让 Agent 把图片保存到指定目录。未指定目录时，图片会保存到 DSH 附件库。

## 代理

可选。在 设置 → xAI Grok → 网络代理（仅 xAI）里配置，或通过 dsh 环境 / config 设置 `DSH_XAI_PROXY`（例如 `http://127.0.0.1:8080`）。只对 x.ai 流量生效。

## 卸载

```sh
dsh plugin --profile web remove dsh-grok-kit
```

如果要删掉本地 OAuth 文件，先到设置页退出登录。只 `remove` 包装不会删除 `~/.grok/auth.json`（以及可能残留的 `$DSH_HOME/.xai-oauth-auth.json` / `$DSH_HOME/.xai-oauth-proxy.json`）。
