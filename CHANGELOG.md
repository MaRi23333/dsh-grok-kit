# 更新记录 / Changelog

## 0.2.10（2026-11-03）

- 更新账户、模型、搜索、媒体和网络设置界面，改善宽窄窗口、明暗主题及键盘操作。
- 新增按会话覆盖融合搜索的接入接口；辅助调用不继承对话搜索许可，切换搜索方式时重新回放会话。
- 锁文件中的 Zod 从 4.6.5 更新至 4.6.7，修复上游资源耗尽漏洞；订阅权限与媒体风险确认不变。
- Refresh the five-tab settings UI, add per-session fused-search integration, and update the locked Zod version to 4.6.7. Subscription entitlements and media risk confirmations are unchanged.

## 0.2.9（2026-10-22）

- 更新首页 hero，展示现有的对话、网页/X 搜索及可选图片/视频能力；未新增功能，媒体仍默认关闭。
- Refreshed the homepage hero to show existing chat, web/X search, and optional image/video capabilities. No features were added; media remains off by default.

- 将网络请求依赖 Undici 升级到 `8.12.3`，包含上游 2026 年 10 月的安全修复；声明下限同步提高到 `^8.12.3`。
- Updated the HTTP dependency Undici to `8.12.3`, including upstream security fixes from October 2026, and raised the declared minimum to `^8.12.3`.
- 插件功能、配置格式和支持的 DSH 版本不变；建议更新插件并重启 DSH。
- Plugin features, configuration format, and supported DSH versions are unchanged; update the plugin and restart DSH.

## 0.2.8（2026-10-21）

- 修复部分账号缺少额度百分比时的显示：结合官方额度接口核实，仅在响应完整、计费周期有效时恢复 0% 已用；无法核实时保留未知或部分信息，不估算用量。
- Fixed quota display for some accounts with a missing usage percentage. The plugin verifies it against the official quota endpoint and restores 0% used only from a complete response with a valid billing period; otherwise it keeps the result unknown or partial, without estimates.
- 新增默认关闭的「配额请求兼容模式」：仅额度读取改用插件专用通道，动态使用插件代理；聊天和登录保持原路径。专用通道限于三个固定官方额度端点，并拒绝重定向。
- Added off-by-default Quota request compatibility mode: quota reads use a plugin-owned channel and the current plugin proxy, while chat and sign-in keep their existing paths. The channel accepts only three fixed official quota endpoints and refuses redirects.
- 网络设置加载失败时可直接重试，保留未保存的地址和开关；加载成功前禁止保存。卸载时等待已接纳的设置写入完成，避免旧实例覆盖后续实例的保存。
- Failed network-settings loads can be retried without losing unsaved URL or toggle edits; saving stays disabled until loading succeeds. Unload waits for accepted settings writes so an old instance cannot overwrite a subsequent instance's save.
- 依赖宿主统一出口、数据防泄漏（DLP）或强制网络包装控制的环境不要开启兼容模式。填写插件代理地址也不会恢复被绕过的宿主控制；现有配置无需迁移，媒体开关与账号权限不变。
- Do not enable compatibility mode where host-level egress controls, data loss prevention (DLP), or mandatory network wrappers are required. A plugin proxy does not restore bypassed host controls. No configuration migration is required; media switches and account entitlements are unchanged.

## 0.2.7（2026-10-17）

- 统一检查 OAuth Bearer 请求的目的地：只允许指定的 xAI API、Grok 计费主机和精确的 `grok.com` 额度接口，拒绝向其他地址发送凭据。
- Centralized destination checks for OAuth bearer requests: credentials are sent only to the designated xAI API and Grok billing hosts, or the exact `grok.com` quota endpoint.
- 带凭据的请求不再跟随重定向，聊天 SDK 发出的实际请求也经过检查；正常请求端点、代理配置和媒体默认关闭策略不变。
- Credentialed requests no longer follow redirects, including requests made by the chat SDK. Normal endpoints, proxy settings, and media-off defaults are unchanged.
- 开发与 CI 增加 lint 检查，帮助发现未处理的 Promise、未使用变量和遗漏的分支；不会新增运行依赖或自动清除现有防御性检查。
- Added development and CI lint checks for floating promises, unused variables, and missing switch cases, without adding runtime dependencies or removing existing defensive checks.

## 0.2.6（2026-10-17）

- 修复部分账号因计费接口服务端错误而无法加载额度的问题；服务端错误或连接故障时，使用同一 OAuth 登录凭据回退读取 `grok.com` 的额度接口。
- Fixed quota loading for some accounts affected by billing-service errors. Server errors or connection failures now fall back to the `grok.com` quota endpoint using the same OAuth sign-in credential.
- 额度回退沿用已配置的代理；校验响应状态、大小与用量数据，失败时不显示估算额度。登录失效、权限不足和限流不触发额外回退。
- The quota fallback uses the configured proxy and validates response status, size, and usage data without showing estimates on failure. Invalid sign-ins, access denials, and rate limits do not trigger an extra fallback.

## 0.2.5（2026-10-15）

- 修复“搜索与对话”和“媒体与任务”设置页中四个“实验性”徽标的布局，恢复为开关旁的小标签。
- Fixed four Experimental badges on Search & conversation and Media & tasks so they sit beside their switches.
- 澄清订阅额度、代理配置、设置分页及视频使用说明，减少界面与文档歧义。
- Clarified subscription quota, proxy configuration, settings tabs, and video usage wording across the interface and documentation.

## 0.2.4（2026-10-15）

- 修复账号切换时旧身份读取进入视频任务或下载的问题，同账号并发读取仍可用；额度请求超时、取消或卸载时释放响应与读取器，不额外发起请求。
- Fixed stale account identities reaching video tasks or downloads while preserving concurrent reads for the same account. Quota timeouts, cancellation, and unload now release responses and readers without extra requests.
- 登录入口明确兼容 X Subscription 与原 SuperGrok / X Premium 订阅，共用官方 Grok OAuth 流程；已登录账号增加重新授权入口与账号替换确认弹窗，并提供官方订阅仪表盘管理链接。
- Sign-in explicitly supports The X Subscription alongside legacy SuperGrok / X Premium using official Grok OAuth; signed-in users can reauthorize to switch accounts with replacement confirmation, and the account panel links directly to the official subscription dashboard.
- 账号页新增官方共享订阅额度展示，复用现有 OAuth 与代理配置；成功结果按账号缓存 60 秒（无自动轮询），严格展示官方接口返回的百分比、重置周期与预付余额，不估算 token 余额或编造未报告数据，统一计费标记仅读取官方布尔值。
- Account settings now display official shared subscription quota reusing existing OAuth and proxy settings; successful results are cached for 60 seconds per account without automatic polling, strictly displaying reported percentages, billing periods, and prepaid balances without estimating tokens or fabricating unreported fields.
- 设置面板重构为五大独立分页（账号、模型、搜索与对话、媒体与任务、网络），顶部常驻吸顶状态与导航并适配宿主弹窗背景；保存与重置操作严格隔离至当前页，切换分页保留其他页未保存草稿，重置媒体页同步撤销媒体确认。
- Settings are now reorganized into five tabs (Account, Models, Search & conversation, Media & tasks, Network) with a sticky status/navigation bar matching the host dialog theme; save and reset actions are page-scoped while preserving unsaved drafts across tab navigation, and resetting media revokes risk acknowledgment.
- 加固登录与凭据流程：轮询请求设置 10 秒超时并在组件卸载或新操作时取消，修复轮询挂起与排队堆积；授权失败保留诊断提示，取消或失败后恢复已保存凭据与状态，旧状态读取与迟到响应不再覆盖新状态。
- Hardened sign-in and credential flows: status polling enforces a 10-second deadline and cancels on unmount or user action, preventing request pileup; failure diagnostics are retained across re-renders, saved credentials restore gracefully on cancellation, and stale responses cannot overwrite newer states.
- 完善请求取消与资源清理：凭据读取与等待严格遵循调用者取消信号；搜索与媒体请求在 401 重试或失败时及时释放响应体；搜索在结果解码后复检取消状态以防止迟到成功返回；视频任务替换时取消旧查询等待并隔离迟到错误。
- Improved cancellation and resource cleanup: credential reads honor caller abort signals; search and media requests release response bodies on 401 retry or failure; search re-checks abort signals after decoding to prevent late completions; replaced video tasks cancel older waits and discard late errors.

## 0.2.3（2026-10-14）

- 新增实验性视频工具 `grok_video_generate`、`grok_video_status`、`grok_video_resume`：单图生成视频、任务持久化与恢复、按账号隔离的下载，以及会话视频卡片。
- Added experimental `grok_video_generate`, `grok_video_status`, and `grok_video_resume` tools: image-to-video, durable tasks and recovery, account-scoped downloads, and session video cards.
- 图片生成、图片编辑和视频统一默认关闭，不继承旧版本媒体开启状态。设置页开启时需确认风险、保存并重启；确认在卡片内显示，正常调用不重复询问，关闭后重开需重新确认。
- Image generation, editing, and video are now off by default and do not inherit old media enablement. Enable them through an inline risk confirmation in Settings, save, and restart; normal calls do not ask again, while reopening requires confirmation.
- 修复桌面端来源和壳转发请求导致设置页登录、代理或选项保存被拒绝的问题。接口仍限回环连接与回环 Host；桌面页面与携带 Fetch Metadata 的本机请求受信任，该标记不构成桌面身份或权限证明。
- Fixed rejected sign-in, proxy, and option writes from desktop-origin or shell-forwarded requests. Routes remain limited to loopback connections and Host names; the desktop page and local requests with Fetch Metadata are trusted, but the marker does not prove desktop identity or authorization.
- 修复视频下载提前结束时的流清理、视频关闭时设置页误报，以及重置后残留的媒体确认。补齐实验性徽标和使用说明，宿主支持范围不变。
- Fixed stream cleanup on early video download termination, spurious Settings errors while video is disabled, and pending media confirmation surviving a reset. Added experimental badges and usage notes; host support is unchanged.
- 视频生成可能消耗订阅额度或产生费用；“停止等待”不会取消已提交的上游任务。关闭视频会停用任务列表、恢复与下载入口，已有任务和附件保留。
- Video generation may use subscription quota or incur charges; stopping the wait does not cancel submitted upstream jobs. Disabling video hides the task list and blocks recovery/download routes without deleting existing tasks or attachments.

## 0.2.2（2026-10-12）

- 修复暗色模式下登录主按钮文字不清晰的问题，文字颜色跟随宿主主题。
- Fixed unreadable text on the primary sign-in button in dark mode; its text color now follows the host theme.
- 修复“全部显示”将模型列表收窄为一个模型的问题；现在显示所有可聊天模型，重启后仍保留这一选择。图片和搜索专用模型继续从聊天选择器过滤。
- Fixed “Show all” narrowing the model list to a single model; all chat models are now shown, and the selection survives restarts. Image and search-only models remain excluded from the chat picker.
- 已保存的单模型选择不会自动改变；遇到列表被收窄时，可在设置页点击“全部显示”。宿主支持范围不变。
- Existing single-model selections are not changed automatically; click “Show all” in Settings if your list was narrowed. Host support is unchanged.

## 0.2.1（2026-10-11）

- 聊天流显式跟踪终止事件：正常结束或重试结束后不再尝试补发错误；缺少终止事件的异常流仍会以错误结束。
- Chat streams now track terminal events explicitly: completed responses and retries no longer attempt to append an extra error, while streams missing a terminal event still end with an error.
- 图片编辑失败卡片显示“图片编辑失败”，与图片生成失败区分，并同步读屏标签。
- Failed image edits now show “图片编辑失败”, distinct from generation failures, with a matching accessibility label.
- 再次编辑时统一去除图片来源的首尾空白，确保长度判断和发送给 Agent 的来源一致。
- Source-image references are trimmed before re-editing so length checks and the references sent to the agent remain consistent.
- 缓存会话图片卡片的数据订阅源，减少重复获取；清理不影响现有行为的冗余分支。
- Session image cards cache their subscription source to avoid repeated lookups; redundant branches were removed without changing their existing behavior.
- 更新项目简介和安装说明；宿主支持范围与 0.2.0 相同。
- Updated the project description and installation notes; host support is unchanged from 0.2.0.

## 0.2.0（2026-10-10）

- 宿主环境升级：冻结支持 DeepSeek Harness `0.2.0-rc.2` 与 `@earendil-works/pi-ai@0.87.1`（Node 22/24）；正式停止对旧 0.1 宿主线的兼容支持。
- Host environment upgrade: Pinned support to DeepSeek Harness `0.2.0-rc.2` and `@earendil-works/pi-ai@0.87.1` (Node 22/24); dropped compatibility with the legacy 0.1 host line.
- 图生图工具：新增 `grok_imagine_edit` 工具（POST `/v1/images/edits`），复用主 OAuth session。支持本地文件路径（按宿主环境权限有界读取）、会话附件完整引用、data URI 与远程 URL，单次请求最多支持 5 张输入图片。
- Image-to-image editing: Added the `grok_imagine_edit` tool (POST `/v1/images/edits`), reusing the main OAuth session. Supports local filesystem paths (bounded by host environment permissions), full session attachment references, data URIs, and remote URLs, accepting up to 5 source images per request.
- 会话图片交互卡片：`grok_imagine` 与 `grok_imagine_edit` 结果均直接渲染在会话图片卡片中，展示提示词、输入来源与结果图，并提供下载与再次生成/编辑入口；两工具输出统一保存至 DSH 附件库并保留归一化 metadata，两工具的 `save_path` 均不再直接写盘。
- Session image interaction cards: Both `grok_imagine` and `grok_imagine_edit` results render directly inside session image cards showing prompt, input sources, and output images, with download and re-generate/re-edit actions. Tool outputs are saved to the DSH attachment library preserving normalized metadata; direct disk writing via `save_path` is no longer supported for either tool.
- 配置项扩充：新增 `editTool`（默认开启）、`editModel`（默认跟随线上目录自动选择）、`editMaxSourceImages`（默认 5）和 `editMaxImageBytes`（默认 20 MiB）。
- New configuration options: Added `editTool` (default true), `editModel` (default auto-catalog), `editMaxSourceImages` (default 5), and `editMaxImageBytes` (default 20 MiB).
- 搜索与契约适配：主循环网页与 X 融合搜索默认保持关闭（可在设置页开启），对齐 DSH 0.2.0-rc.2 宿主环境下的 context 处理与流式契约。
- Search and protocol alignment: Web and X fused search remains off by default (opt-in via Settings); aligned context contracts and streaming behavior with DSH 0.2.0-rc.2.
- 稳定性修复：登录/登出等待进行中的操作，刷新等待者可独立取消；完善异常流终结、错误脱敏和已保存空代理的关闭行为。
- Stability fixes: Sign-in and sign-out wait for pending operations, refresh waiters can cancel independently, and terminal stream errors, diagnostic redaction, and saved empty-proxy overrides are handled more reliably.
- 锁回收机制对齐：遵循官方 `@deepseek-ai/dsh-atomic-write@0.2.0-rc.2` 机制，在同机且同一 PID 命名空间下通过 claim 文件与二次存活性校验自动回收已退出进程遗留的写锁；活进程锁与无法验证的锁保持等待超时，不支持跨机器或跨容器挂载共用凭据锁目录。
- Lock recovery alignment: Aligned with the official `@deepseek-ai/dsh-atomic-write@0.2.0-rc.2` contract to automatically recover leftover writer locks from exited processes on the same host and PID namespace via claim files and double-checked liveness probes; active and unverified locks continue to wait and time out, and cross-host or cross-container shared storage directories are unsupported.

## 0.1.15（2026-10-04）

- 插件列表和详情页新增随 DeepSeek Harness 界面语言切换的中英文名称与简介。
- Added localized English and Chinese names and descriptions for the plugin list and detail page.
- 同步版本号、锁文件、User-Agent 和隔离安装探针。未修改 OAuth、聊天、搜索或 Imagine 行为。
- Synchronized the package, lockfile, User-Agent, and isolated-install probe versions. OAuth, chat, search, and Imagine behavior is unchanged.
