# dsh-grok-kit

[English](README.md) | 中文

在 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 里用 SuperGrok / X Premium 订阅登录 xAI，调用 Grok。不需要 `XAI_API_KEY`，也不需要改 dsh 源码。

这是一个独立的 dsh bundle，会提供：

- Settings 面板里的 SuperGrok / X Premium OAuth 登录，并自动刷新 token（device-code 流程）
- `xai-oauth` 聊天路由——流式、工具调用、reasoning（默认 high，带加密推理 include）、compaction 走 dsh 原有 LLM 服务
- 主 grok-4.6 请求混入服务端 `{type:web_search}` / `{type:x_search}`（`backendSearch`，本 bundle 默认开）
- `grok_imagine`——Imagine 出图（`POST /v1/images/generations`）
- 独立的代理设置（设置页、`DSH_XAI_PROXY` 环境变量 / config），只对 x.ai 流量生效
- dsh 原生 `web_search` 仍在宿主工具列表里；打开 backend search 时会从 xAI payload 剥掉，避免重名

内置目录里的 `xai`（API Key）路由不会被动。本插件注册的是 `xai-oauth`，两条路可以并存。

## 安装

从 GitHub 安装（把 `<your-name>` 换成仓库所有者）：

```sh
dsh plugin --profile web add github:<your-name>/dsh-grok-kit
dsh web
```

用 `npx` 起的 Web、PATH 里没有 `dsh` 时，把前面的 `dsh` 换成 `npx @deepseek-ai/dsh`：

```sh
npx @deepseek-ai/dsh plugin --profile web add github:<your-name>/dsh-grok-kit
npx @deepseek-ai/dsh web
```

不要写 `npm dsh` 或在家目录里写 `pnpm dsh`。`npx` 只是临时跑一次，不会安装全局 `dsh` 命令。

打开 **设置 → xAI Grok → 使用 SuperGrok 登录**。插件会走 device-code，打开验证链接，你在浏览器里批准即可。

新会话默认 `xai-oauth` / `grok-4.6`。dsh 里已经存过的默认模型仍然优先。模型选择器里只出现主线 Grok 聊天模型（grok-4.5、grok-4.6、以及将来的 grok-4.x / grok-5）——变体（`grok-build-0.1`、`grok-code-fast`、Imagine / video / embedding）全部隐藏。

设置页可以勾选要出现在模型选择器里的模型。名称形如 `xai-oauth / grok-4.5`。登录后如果选择器还是空的，更新插件并重启 `dsh web`。

完整步骤见 [INSTALL.md](INSTALL.md) / [INSTALL.zh.md](INSTALL.zh.md)。

## 搜索

默认：grok-4.6 在同一轮 Responses 里走 xAI 服务端搜索（界面上多半是 thinking）。DSH 原生函数 `web_search` 会从该 payload 剥掉，避免 `Duplicate tool names: web_search`。

`grok_web_search` / 嵌套 `x_search` **默认不注册**。它们是主请求还不能混服务端工具时的套娃路径（`grok-build-0.1`）。只有需要 `allowed_domains` / 账号/日期过滤，或关掉 `backendSearch` 当回退时，才设 `nestedSearchTools: true`。主请求 403 会让整轮聊天失败——设 `backendSearch: false`（嵌套工具会回来，除非再显式 `nestedSearchTools: false`）。

`grok_imagine` 出图（1K low 大约 $0.04/张，约数）。有附件服务时结果是 image block；否则写到 `<会话 cwd>/.dsh-grok-kit/`（不会自动改 `.gitignore`）。

## 配置项

插件配置键（Cordis profile 配置；设置页负责账号、模型和代理）：

| 键 | 默认 | 含义 |
| --- | --- | --- |
| `backendSearch` | `false`（bundle 组合里设为 `true`） | 主聊天请求混入 xAI 服务端 `{type:web_search}` / `{type:x_search}` |
| `nestedSearchTools` | 无默认；`apply()` 时取 `!backendSearch` | 注册嵌套 `grok_web_search` / `x_search`（带过滤的搜索或回退） |
| `searchModel` | `grok-build-0.1` | 嵌套搜索用的模型 |
| `searchMaxResults` | `8` | 嵌套搜索返回来源的上限 |
| `webSearchTimeoutMs` | `60000` | 嵌套网页搜索的协作超时 |
| `xSearchTimeoutMs` | `120000` | 嵌套 X 搜索的协作超时 |
| `imagineTool` | `true` | 注册 `grok_imagine` |
| `proxyUrl` | `''` | x.ai 流量的出站 HTTP/HTTPS 代理；已保存的设置页值优先于它 |

`backendSearch: false` 时嵌套工具保持注册（除非 `nestedSearchTools: false`）；`backendSearch: true` 且该键缺席时两者都不注册——只有确实两种都要时才显式打开。

## 代理

xAI 流量可以走 HTTP/HTTPS 代理，不影响任何其他请求：

- 设置 → xAI Grok → 网络代理（仅 xAI）：输入代理地址并保存
- 或在 dsh 环境 / config 里设置 `DSH_XAI_PROXY`（例如 `http://127.0.0.1:8080`）

代理只对 x.ai 域名生效，其余请求保持直连。

## 凭证

- 有 `~/.grok/auth.json` 时直接用它（和 Grok CLI 同一份）
- 否则仍可读旧的 `$DSH_HOME/.xai-oauth-auth.json`；新登录会写到 Grok 那份
- 写入是原子的；写锁放在 `$DSH_HOME` 下（不会变成 `~/.grok/auth.json.lock`），以免孤儿锁卡住 Grok CLI 或让 dsh 启动失败
- 浏览器状态和报错里不会带回 token

xAI 的 refresh token 会轮换。共用 `~/.grok/auth.json` 后，dsh 和 Grok CLI 转的是同一把。在设置页退出登录也会让 Grok CLI 掉线。卸掉插件不会删这个文件。

## 兼容说明

- 对话、工具、reasoning 走 pi-ai 的 xAI 提供商（`openai-completions` / `openai-responses`）。
- 部分 SuperGrok 档位会出现「浏览器登录成功，推理 HTTP 403」。这是 xAI 侧权限，不是 token 过期。这种情况请改用目录里的 `xai` + `XAI_API_KEY`。
- 文件系统、shell、skills、MCP、子代理、权限、附件、compaction 仍由当前 dsh profile 提供。

## 已知限制

- **聊天 HTTP 401** 会按搜索工具同一套纪律强制刷新一次（403 不刷新，那是档位门）。刷新失败仍要去 设置 → xAI Grok 重新登录。
- **搜索 403：** 部分 SuperGrok 档位登录成功但拒绝服务端搜索。嵌套路径可换 `searchModel`（如 `grok-4.5`）；主请求混合则设 `backendSearch: false`。
- **Backend search** 已在组合里默认打开。搜完下一轮若因 `encrypted_content` 配对 400，再关 `backendSearch`。
- **X 搜索 UI 桩：** pi-ai 会把 xAI 的 `custom_tool_call`（`x_keyword_search` / `x_semantic_search` 等）当成客户端工具。本插件注册只执行的桩，卡片标题是 “X search”，用来把这一轮跑完——搜索已经在服务端做过。多一轮很便宜。不要把这些桩名当成嵌套搜索。
- **Windows ACL：** Node 的文件 mode 位不是 Windows ACL。Windows 上活凭证在 `~/.grok/auth.json`——靠用户 profile 目录私有（`%USERPROFILE%` 默认满足）。`$DSH_HOME`（写锁、遗留凭证/代理文件）同理；若任一目录在共享位置，请自行收紧 ACL。
- **schema 默认 vs bundle 默认：** Config schema 的默认是 `backendSearch: false` + 嵌套工具开；本 bundle 靠 `cordis.patch.yml` 翻成文档所述的默认。手动 compose / 精简配置如果没有 patch，行为是嵌套搜索路径——装完用 `dsh --profile web --dump-config` 确认。
- **只装一个 xAI 插件：** 不支持与旧 dsh-xai 同时安装。本插件会尽量优雅降级（唯一插件 id、路由/设置页守卫），但旧插件后加载时仍可能拖垮 profile 启动。请先 `dsh plugin --profile web remove dsh-xai`。

## 开发

```sh
npm install
node scripts/link-host-deps.mjs   # 每次 install 后重新指向宿主的 @deepseek-ai/*
npm run check
dsh plugin --profile web add ./dsh-grok-kit   # 本地开发安装
```

## 许可证

Apache-2.0。部分代码源自 dsh-xai（Apache-2.0）。
