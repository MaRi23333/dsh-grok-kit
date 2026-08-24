# dsh-grok-kit

**中文** · [English](README.en.md)

<p align="center">
  <img src="assets/readme/hero.svg" width="100%" alt="dsh-grok-kit：DeepSeek Harness 的 Grok OAuth 与融合搜索插件">
</p>

<p align="center">
  <a href="https://github.com/MaRi23333/dsh-grok-kit/actions/workflows/ci.yml"><img src="https://github.com/MaRi23333/dsh-grok-kit/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-4d6bfe.svg" alt="Apache-2.0"></a>
  <img src="https://img.shields.io/badge/DeepSeek%20Harness-0.1.1--rc.2%2B-4d6bfe" alt="DeepSeek Harness 0.1.1-rc.2+">
  <img src="https://img.shields.io/badge/status-unofficial%20community%20plugin-7c84a8" alt="Unofficial community plugin">
</p>

> Use an eligible SuperGrok or X Premium subscription in DeepSeek Harness through OAuth, with Grok chat, server-side web/X search in the main model turn, Imagine image generation, and an xAI-only proxy.

> [!IMPORTANT]
> **非官方项目、商标与账户使用声明**
>
> `dsh-grok-kit` 是由社区独立开发的 DeepSeek Harness 第三方插件，不是 xAI、X、DeepSeek、DeepSeek Harness 或这些项目维护者的官方产品，也不代表它们。本项目不主张已获得上述主体对本插件或其名称的个别许可、背书、赞助或认可。Grok、xAI、X、DeepSeek、DeepSeek Harness 及相关名称与标识归各自权利人所有；本项目仅为准确说明兼容对象而提及这些名称。
>
> OAuth 可用性可能受订阅档位、地区、xAI 条款、账户资格、速率限制和后续服务变更影响。用户应自行确认其账户与用途获准；本项目不保证持续可用性或兼容性，也不提供 xAI/Grok 账号、订阅或官方支持。

## 它做什么

`dsh-grok-kit` 为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 增加独立的 `xai-oauth` 路由，并复用 Grok CLI 的本地登录文件。它不要求 `XAI_API_KEY`，也不修改 dsh 源码；内置的 `xai` API Key 路由仍可并存。

- 在设置页完成 device-code 登录、退出与账号可见模型选择
- 通过 `xai-oauth` 使用 Grok 聊天、流式输出、工具调用和 reasoning
- 把 xAI 服务端网页与 X 搜索放进主模型请求，而不是另开一轮搜索模型
- 提供 `grok_imagine` 图片生成工具
- 提供只作用于 `x.ai` 请求的独立 HTTP/HTTPS 代理
- 对 OAuth 文件、刷新并发、设置接口和诊断输出做防泄露处理

## 主循环融合搜索

本插件的默认 bundle 会把 xAI 服务端 `{type:web_search}` 与 `{type:x_search}` 混入同一轮 Grok Responses 请求。网页检索通常直接体现在 **Think** 里：检索、推理和回答属于同一轮，不需要由 DeepSeek Harness 再调用一条嵌套搜索流水线。

当 xAI 返回 `x_keyword_search`、`x_semantic_search`、`x_user_search` 或 `x_thread_fetch` 这类 `custom_tool_call` 时，搜索已经在 xAI 服务端执行。插件注册同名的收尾工具，让 DSH 主循环能够完成该轮；这些收尾工具本身不会再次发起搜索。

需要域名、账号或日期过滤时，可关闭 `backendSearch`，或显式启用 `nestedSearchTools`，使用独立的 `grok_web_search` / `x_search` 回退模式。

## 界面与效果

<p align="center">
  <img src="assets/readme/settings.png" width="820" alt="dsh-grok-kit 设置页：Grok CLI 登录、模型选择与 xAI 专用代理">
</p>
<p align="center"><sub>设置页：复用 Grok CLI 登录，选择账号可见模型，并按需设置仅对 xAI 生效的网络代理。图中的 <code>127.0.0.1</code> 是本机回环代理示例。</sub></p>

<p align="center">
  <img src="assets/readme/main-loop-search.png" width="960" alt="Grok 在同一轮 Think 中完成网页搜索并回答">
</p>
<p align="center"><sub>主循环融合搜索：网页检索直接发生在同一轮 Think 中，不显示为宿主侧的常规工具调用。截图里的新闻内容只用于展示交互，不作为事实来源。</sub></p>

<p align="center">
  <img src="assets/readme/x-search.png" width="960" alt="xAI 返回 X 搜索 custom_tool_call 后继续完成回答">
</p>
<p align="center"><sub>X 搜索：响应可能显示 <code>x_keyword_search</code> 等 <code>custom_tool_call</code>；搜索已在 xAI 服务端执行，插件只负责让该轮在 DSH 中收尾。截图内容仅作功能演示。</sub></p>

## 安装

从 GitHub 安装到 Web profile：

```sh
dsh plugin --profile web add github:MaRi23333/dsh-grok-kit
dsh web
```

如果 PATH 中没有 `dsh`，可以使用同一个 CLI 包：

```sh
npx @deepseek-ai/dsh plugin --profile web add github:MaRi23333/dsh-grok-kit
npx @deepseek-ai/dsh web
```

打开 **设置 → xAI Grok**，完成登录后选择 `xai-oauth / grok-4.6` 或账号当前可见的其他主线 Grok 模型。已经保存在 dsh 设置中的模型仍有更高优先级。

完整的安装、迁移、卸载和故障处理步骤见 [INSTALL.zh.md](INSTALL.zh.md)。

## 模型与工具

- 模型选择器只展示主线 Grok 聊天模型；Imagine、video、embedding、build/code 变体会被隐藏
- 默认模型描述符为 grok-4.6，包含 reasoning 与多轮加密推理连续性所需的字段
- `grok_imagine` 默认开启；宿主支持附件服务时，结果以图片块进入会话
- dsh 原生 `web_search` 仍保留在宿主工具列表中，但会从启用 backend search 的 xAI payload 中移除，避免工具重名

模型列表来自登录账号的 `GET /v1/models` 结果，并在本地缓存。服务端能力或模型要求发生变化时，仍可能需要更新插件；不会把“模型 id 可见”等同于“所有能力一定可用”。

## 配置

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `backendSearch` | schema 为 `false`；本 bundle 设为 `true` | 在主聊天请求中启用 xAI 服务端网页/X 搜索 |
| `nestedSearchTools` | 省略时取 `!backendSearch` | 注册独立的 `grok_web_search` / `x_search` |
| `searchModel` | `grok-build-0.1` | 嵌套搜索模式使用的模型 |
| `searchMaxResults` | `8` | 嵌套搜索返回来源的上限 |
| `webSearchTimeoutMs` | `60000` | 嵌套网页搜索的协作式超时预算 |
| `xSearchTimeoutMs` | `120000` | 嵌套 X 搜索的协作式超时预算 |
| `imagineTool` | `true` | 注册 `grok_imagine` |
| `proxyUrl` | `''` | xAI 专用 HTTP/HTTPS 代理；设置页保存值优先 |

本 bundle 的组合默认值来自 `cordis.patch.yml`。手工拆分或重组配置时，可用 `dsh --profile web --dump-config` 核对最终值。

## 登录文件、代理与安全边界

- 优先使用 `~/.grok/auth.json`，与 Grok CLI 共用同一份 xAI 凭据；在设置页退出也会让 Grok CLI 退出
- OAuth 刷新令牌会轮换；插件用原子写入、进程内合并和 compare-and-write 避免并发刷新互相覆盖
- 浏览器状态接口、错误信息和诊断不会返回 token 值
- 代理只接受不含用户名/密码的 `http://` 或 `https://` URL；带 userinfo 的旧值会被清理，不会进入状态响应或日志
- xAI 专用 fetch hook 会在插件卸载时恢复；它不会永久修改系统或进程环境变量
- Windows 上的 Node mode bit 不等于 NTFS ACL；如果用户目录或 `$DSH_HOME` 位于共享位置，请自行收紧目录权限

## 兼容性与限制

- 某些订阅档位可能允许浏览器登录，却对聊天或服务端搜索返回 HTTP 403；这是账户资格/服务策略问题，不等同于 token 过期
- HTTP 401 会在串行刷新后重试一次；403 不会按 token 过期处理
- 不支持与旧版 `dsh-xai` bundle 同时安装；请先运行 `dsh plugin --profile web remove dsh-xai`
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
