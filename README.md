# dsh-grok-kit

**中文** · [English](README.en.md)

<p align="center">
  <img src="assets/readme/hero.svg" width="100%" alt="dsh-grok-kit：DeepSeek Harness 的 Grok OAuth 与融合搜索插件">
</p>

<p align="center">
  <a href="https://github.com/MaRi23333/dsh-grok-kit/actions/workflows/ci.yml"><img src="https://github.com/MaRi23333/dsh-grok-kit/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/dsh-grok-kit"><img src="https://img.shields.io/npm/v/dsh-grok-kit.svg" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-4d6bfe.svg" alt="Apache-2.0"></a>
  <img src="https://img.shields.io/badge/DeepSeek%20Harness-0.1.1--rc.2%2B-4d6bfe" alt="DeepSeek Harness 0.1.1-rc.2+">
  <img src="https://img.shields.io/badge/status-unofficial%20community%20plugin-7c84a8" alt="Unofficial community plugin">
</p>

> 通过 OAuth 在 DeepSeek Harness 中使用 Grok：主循环融合网页与 X 搜索、连续 reasoning、Imagine，以及仅作用于 xAI 的独立代理。

> [!IMPORTANT]
> **非官方项目、商标与账户使用声明**
>
> `dsh-grok-kit` 是由社区独立开发的 DeepSeek Harness 第三方插件，不是 xAI、X、DeepSeek、DeepSeek Harness 或这些项目维护者的官方产品，也不代表它们。本项目不主张已获得上述主体对本插件或其名称的个别许可、背书、赞助或认可。Grok、xAI、X、DeepSeek、DeepSeek Harness 及相关名称与标识归各自权利人所有；本项目仅为准确说明兼容对象而提及这些名称。
>
> OAuth 可用性可能受订阅档位、地区、xAI 条款、账户资格、速率限制和后续服务变更影响。用户应自行确认其账户与用途获准；本项目不保证持续可用性或兼容性，也不提供 xAI/Grok 账号、订阅或官方支持。

## 不止于 OAuth 登录

`dsh-grok-kit` 为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 增加独立的 `xai-oauth` 路由。它不要求 `XAI_API_KEY`，也不修改 dsh 源码；重点不只是“能登录”，而是把服务端搜索和连续 reasoning 所需的请求字段接进主聊天路径。

- **搜索融入主循环：** 网页与 X 检索发生在 grok-4.6 的同一轮 Think 中，推理可以直接使用刚搜到的材料
- **多轮 reasoning 连续：** 默认使用 high effort，并保留 `reasoning.encrypted_content`，让后续回合能够带回加密推理上下文
- **登录状态与 Grok CLI 同步：** 直接共用并回写 `~/.grok/auth.json`，不是只复制一次后各自轮换 refresh token
- **Imagine 与干净的模型选择器：** `grok_imagine` 默认开启，非聊天模型不会混进对话模型列表；当前 DSH 不会把生成图直接显示在对话中

此外还包括 xAI 专用代理、聊天 401 强制刷新重试、凭据原子写入与诊断脱敏等支撑能力。

## 主循环融合搜索

同一个模型 id，不代表不同接入方式一定有相同的使用体验。[xAI 官方说明 Grok Build 与公开 API 都提供 `grok-4.6`](https://docs.x.ai/build/overview)；真正影响搜索体验的，是服务端工具是否和主对话处在同一轮请求里。

**分离式搜索**会额外发起一轮模型请求完成检索或摘要，再把结果交回主对话。它仍然适合需要独立过滤条件的任务，但会多出一轮模型处理，而且搜索摘要不是在当前回复的 Think 中生成。

**主循环融合搜索**则按 [xAI Responses API 的服务端搜索方式](https://docs.x.ai/developers/tools/web-search)，把 `{type:web_search}` 与 `{type:x_search}` 直接放进主 grok-4.6 请求。检索发生在 Think 里，模型能在同一轮推理中使用刚获得的网页和 X 材料；默认 bundle 已启用这条路径。

为让两类搜索共存，宿主原生 `web_search` 仍保留在 DSH 工具列表中，但会从启用融合搜索的 xAI payload 里移除，避免服务端工具重名；其他模型路由仍可照常使用宿主搜索。

> 界面偶尔出现 `x_keyword_search` 等名称时，表示 xAI 已经完成了该次 X 搜索。插件中的同名项只负责让 DSH 收尾当前回合，不会再次检索。

需要按域名、账号或日期过滤时，可关闭 `backendSearch` 或启用 `nestedSearchTools`，改走独立的 `grok_web_search` / `x_search`。这是可选模式，不是默认路径。

`statefulResponses` 默认关。打开后用 `store: true` + `previous_response_id` 只追加新 user；上一轮若是 `toolUse`（`x_keyword_search` 收尾、bash 等）不会续链，否则会把已经写完的搜索正文再生成一遍。OAuth 探针里 follow-up 能列来源，但 `cached_tokens` 不会变成那次搜索的 10–30 万 KV。

## 界面与效果

### 账号、模型与代理

<p align="center">
  <img src="assets/readme/settings.png" width="620" alt="dsh-grok-kit 设置页：Grok CLI 登录、模型选择与 xAI 专用代理">
</p>
<p align="center"><em>设置页复用 Grok CLI 登录，展示账号可见模型，并按需设置仅对 xAI 生效的网络代理。图中的 <code>127.0.0.1</code> 是本机回环代理示例。</em></p>

<br><br>

### 网页搜索融入主循环

<p align="center">
  <img src="assets/readme/main-loop-search.png" width="760" alt="Grok 在同一轮 Think 中完成网页搜索并回答">
</p>
<p align="center"><em>没有另起嵌套搜索工具卡片：网页检索直接发生在同一轮 Think 中，材料随即用于当前回复。截图里的新闻内容只用于展示交互，不作为事实来源。</em></p>

<br><br>

### X 搜索的服务端调用

<p align="center">
  <img src="assets/readme/x-search.png" width="760" alt="xAI 返回 X 搜索 custom_tool_call 后继续完成回答">
</p>
<p align="center"><em>响应可能显示 <code>x_keyword_search</code> 等 <code>custom_tool_call</code>；搜索已在 xAI 服务端执行，插件只负责让该轮在 DSH 中收尾。截图内容仅作功能演示。</em></p>

## 安装

推荐从 npm 安装到 Web profile：

```sh
dsh plugin --profile web add dsh-grok-kit
dsh web
```

如果 PATH 中没有 `dsh`，可以使用同一个 CLI 包：

```sh
npx @deepseek-ai/dsh plugin --profile web add dsh-grok-kit
npx @deepseek-ai/dsh web
```

如果这个 profile 以前安装的是 GitHub 来源，可先尝试 `dsh plugin --profile web add dsh-grok-kit@latest`；若来源没有切换，先移除旧包再重新添加。

需要固定到可复现的 Git 提交时，可使用：

```sh
dsh plugin --profile web add github:MaRi23333/dsh-grok-kit#91266c116dd6be086cb91c51e225c1d3d9578562
```

完整 SHA 会固定安装结果；npm 安装则默认跟随 `latest` 稳定版本。

打开 **设置 → xAI Grok**，完成登录后选择 `xai-oauth / grok-4.6` 或账号当前可见的其他主线 Grok 模型。已经保存在 dsh 设置中的模型仍有更高优先级。

完整的安装、迁移、卸载和故障处理步骤见 [INSTALL.zh.md](INSTALL.zh.md)。

## 模型与工具

- 模型选择器只展示主线 Grok 聊天模型；Imagine、video、embedding、build/code 变体会被隐藏
- 默认 grok-4.6 描述符使用 high reasoning，并请求 `reasoning.encrypted_content`，以便后续回合带回加密推理上下文
- `grok_imagine` 默认开启，但当前 DSH 还不能把生成图直接显示在对话中。需要直接取得文件时，请在提示中让 Agent 把生成结果保存到指定目录；未指定目录时，图片会保存到 DSH 附件库
- dsh 原生 `web_search` 仍保留在宿主工具列表中，但会从启用 backend search 的 xAI payload 中移除，避免工具重名

模型列表来自登录账号的 `GET /v1/models` 结果，并在本地缓存。服务端能力或模型要求发生变化时，仍可能需要更新插件；不会把“模型 id 可见”等同于“所有能力一定可用”。

## 配置

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `backendSearch` | `false`（默认关闭；设置页可打开） | 在主聊天请求中启用 xAI 服务端网页/X 搜索 |
| `nestedSearchTools` | 省略时取 `!backendSearch` | 注册独立的 `grok_web_search` / `x_search` |
| `statefulResponses` | 省略时 `false` | 显式打开才用 `store` + `previous_response_id`；`toolUse` 回合不续链 |
| `searchModel` | `grok-build-0.1` | 嵌套搜索模式使用的模型 |
| `searchMaxResults` | `8` | 嵌套搜索返回来源的上限 |
| `webSearchTimeoutMs` | `60000` | 嵌套网页搜索的协作式超时预算 |
| `xSearchTimeoutMs` | `120000` | 嵌套 X 搜索的协作式超时预算 |
| `imagineTool` | `true` | 注册 `grok_imagine` |
| `proxyUrl` | `''` | xAI 专用 HTTP/HTTPS 代理；设置页保存值优先 |

本 bundle 的组合默认值来自 `cordis.patch.yml`。手工拆分或重组配置时，可用 `dsh --profile web --dump-config` 核对最终值。

设置页 → xAI Grok →「搜索与功能选项」也能显式覆盖上表中的搜索/功能键（保存后重启生效；未修改的键继续跟随组合默认值，不会固化）。`proxyUrl` 例外：设置页保存即生效。

## 登录文件、代理与安全边界

- 优先使用 `~/.grok/auth.json`，与 Grok CLI 原地共用同一份 xAI 凭据；登录和刷新都会写回该文件，而不是只做一次性导入；在设置页退出也会让 Grok CLI 退出
- OAuth 刷新令牌会轮换；插件用原子写入、进程内合并和 compare-and-write 避免并发刷新互相覆盖
- 浏览器状态接口、错误信息和诊断不会返回 token 值
- 代理只接受不含用户名/密码的 `http://` 或 `https://` URL；带 userinfo 的旧值会被清理，不会进入状态响应或日志
- xAI 专用 fetch hook 会在插件卸载时恢复；它不会永久修改系统或进程环境变量
- Windows 上的 Node mode bit 不等于 NTFS ACL；如果用户目录或 `$DSH_HOME` 位于共享位置，请自行收紧目录权限

## 兼容性与限制

- 某些订阅档位可能允许浏览器登录，却对聊天或服务端搜索返回 HTTP 403；这是账户资格/服务策略问题，不等同于 token 过期
- HTTP 401 会在串行刷新后重试一次；403 不会按 token 过期处理
- 不支持与另一个注册相同 xAI OAuth 路由的 bundle 同时安装；请先按 [INSTALL.zh.md](INSTALL.zh.md) 的迁移步骤移除冲突 bundle
- backend search 是本 bundle 的默认组合，但可用性仍由账号、模型和 xAI 当前服务决定
- 删除插件不会自动删除 `~/.grok/auth.json`；需要清理本地登录时，请先在设置页退出

## 开发

```sh
npm install
node scripts/link-host-deps.mjs
npm run check
dsh plugin --profile web add ./dsh-grok-kit
```

安装依赖后必须运行 `scripts/link-host-deps.mjs`，让插件开发环境继续使用宿主 DeepSeek Harness 的 `@deepseek-ai/*` 与 `@earendil-works/*` 版本。

CI 在 Node.js 22 与 24 上执行 frozen install、typecheck、测试、构建，并确认提交的 `lib/` 与源码构建结果一致。

## 许可证与致谢

[Apache-2.0](LICENSE)。部分代码源自 Apache-2.0 许可的 `dsh-xai`，详见 [NOTICE](NOTICE)。
