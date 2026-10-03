# Fork 说明：适配 DeepSeek Harness 0.2.0-rc.x 的顶层 pi-ai

本仓库是 [MaRi23333/dsh-grok-kit](https://github.com/MaRi23333/dsh-grok-kit) 的 fork，基线提交
`0f3e4b1`（上游 v0.1.13，2026-09-30）。

**改动的唯一目的**：让插件在 DeepSeek Harness 0.2.0-rc.x 下能正常工作——即使用**核心同代**的
`@earendil-works/pi-ai` 0.87.1。**不改变任何功能行为，不修改 `src/` 与 `lib/`。**

---

## 为什么需要这个 fork

上游 0.1.13 声明了两条在 DSH 0.2.0-rc.x 下不成立的范围：

| 声明 | 上游值 | 问题 |
| --- | --- | --- |
| `peerDependencies["@earendil-works/pi-ai"]` | `^0.84.4 \|\| ^0.85.1` | 上限 `<0.86`，拿不到 0.87.1（该版本才含 `grok-4.7` 的完整目录元数据） |
| 16 个 `@deepseek-ai/dsh-*` 的 peer 范围 | `^0.1.2-rc.1 \|\| ^0.1.5-rc.2` | 0.x 下 caret 锁 minor ⇒ 上限 `<0.2.0`，与核心 `0.2.0-rc.2` 结构性不满足，每次升级都要 `allow-version --accept-risk` |

更关键的是**运行时不兼容**，这是必须升到 0.87.1 的真正原因：

```js
// 核心 @deepseek-ai/dsh-llm-pi-ai（asar 内 lib/index.js）
const models = createModels(this.config.auth);
for (const profile of profiles.values()) models.setProvider(profile.piProvider);   // :1767
…
const iterator = toStreamChunks(snapshot.models.streamSimple(model, context, {…})); // :1881

// pi-ai 0.87 的 ModelsImpl.streamSimple
streamSimple(model, context, options) {
  const transcript = normalizeContext(context);          // ← 返回值只有 { messages }
  return provider.streamSimple(requestModel, transcript, requestOptions);
}
export function normalizeContext(context) {
  const initialMessage = createInitialSystemMessage(context.systemPrompt, context.tools);
  return { messages: initialMessage ? [initialMessage, ...context.messages] : context.messages };
}
```

本插件通过核心的 `PiAiAdapter` 注册 provider（`src/adapter.ts` 的 `piProvider` 槽位），
**context 由核心构造**，所以核心喂进来的永远是 `{ messages }`（顶层 `systemPrompt` / `tools`
已被折进 `messages[0]` 且不再返回）。

而 pi-ai **0.85.1** 的 `xaiProvider` 只读 `context.systemPrompt` / `context.tools`，收到
`{ messages }` 会去访问 `context.systemPrompt.length` ⇒ 直接抛错，**请求根本发不出去**
（实测：`Cannot read properties of undefined (reading 'length')`）。0.87.1 的 provider 读的正是
`messages[0]`，与核心完全对齐。

> 一句话判据：**谁构造 context，谁决定版本。** 自建 context 的插件（如 `dsh-codex-connect`，
> 它把首条 system 抽成 `{systemPrompt, tools, messages}`）该用 0.85；把 provider 交给核心
> `PiAiAdapter` / `Models` 的插件（本插件）必须与核心同代。

---

## 相对上游的改动（全部集中在 `package.json`）

| 项 | 上游 0.1.13 | 本 fork |
| --- | --- | --- |
| `@earendil-works/pi-ai` | 在 `peerDependencies`，`^0.84.4 \|\| ^0.85.1` | **移入 `dependencies`，`^0.87.1`** |
| 16 个 `@deepseek-ai/dsh-*` peer 范围 | `^0.1.2-rc.1 \|\| ^0.1.5-rc.2` | 追加 `\|\| ^0.2.0-rc.1 \|\| ^0.2.0-rc.2` |

`README.md` 顶部另加了一段 fork 提示（纯文档）。

**为什么必须挪进 `dependencies`**：peer-only 的包没有依赖边，拿到的是顶层 hoisted 副本，
pnpm 的 scoped override 管不到它。只有成为**真依赖者**，pnpm 才会在 profile 顶层物化 0.87.1，
同时让仍需要 0.85.1 的 `dsh-codex-connect` 通过 scoped override 拿到自己的嵌套副本——两者分层共存。

`src/`、`lib/`、`scripts/`、CI 配置与上游**逐字节相同**。

**未改动项**：`devDependencies` 保留上游的 `@earendil-works/pi-ai: 0.84.4` 与整套测试矩阵配置。
本 fork **未重跑上游的 `npm run check`**（typecheck + 单测 + 打包检查），因此不对"源码在 0.87.1
类型下 typecheck 通过"作声明。运行时依赖与 peer 范围是本次唯一改动，其正确性由下面的契约探针验证。

---

## 安装到 DSH profile（`file:` 本地插件）

profile 的 `package.json`：

```json
"dsh-grok-kit": "file:../../local-plugins/dsh-grok-kit"
```

`~/.dsh/profiles/desktop/pnpm-workspace.yaml` 保留分层 override：

```yaml
overrides:
  '@earendil-works/pi-ai': 0.87.1
  'dsh-codex-connect>@earendil-works/pi-ai': 0.85.1   # 自建 context 的那个钉回 0.85
```

重装（Windows 实测参数，含三个 pnpm 11 的坑）：

```powershell
$node = "$env:USERPROFILE\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
$pnpm = "$env:USERPROFILE\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs"
$env:CI = 'true'                                    # 非 TTY：否则拒绝 purge node_modules
$env:https_proxy = 'http://127.0.0.1:7890'          # pnpm 不读大写的 HTTPS_PROXY
& $node $pnpm install --dir "$env:USERPROFILE\.dsh\profiles\desktop" `
    --no-frozen-lockfile `                          # 改过 specifier 时必须
    --config.confirmModulesPurge=false `
    --registry=https://registry.npmmirror.com
```

> 不要用 `--config.fetch-timeout=<ms>`：pnpm 11 会把它当字符串传给 `AbortSignal.timeout()`，
> 抛 `ERR_INVALID_ARG_TYPE` 并掩盖真正的网络错误。

---

## 验证

依赖落地（两处都要看）：

```powershell
$pr = "$env:USERPROFILE\.dsh\profiles\desktop"
(Get-Content "$pr\node_modules\@earendil-works\pi-ai\package.json" -Raw | ConvertFrom-Json).version
# 期望 0.87.1

(Get-Content "$pr\node_modules\dsh-codex-connect\node_modules\@earendil-works\pi-ai\package.json" -Raw | ConvertFrom-Json).version
# 期望 0.85.1（pnpm 自动生成的嵌套副本）
```

请求体契约（伪造 SSE，不会真的调用模型）：

- 本插件的 provider 应能接受 `messages[0]` 形态并带上 system 与 tools
- `dsh-codex-connect` 应能接受 `{systemPrompt, tools, messages}` 形态

改完必须**重启 DSH**（模块在进程启动时解析），然后实际用 `xai-oauth / grok-4.6`（或 0.87.1 目录里
新增的 `grok-4.7`）发一次会触发工具调用的消息。

---

## 与上游同步

```powershell
git remote add upstream https://github.com/MaRi23333/dsh-grok-kit.git
git fetch upstream
git rebase upstream/main
```

由于改动只落在 `package.json` 的两处与 `README.md` 顶部一行，冲突应当很小且局部。

~~若上游自行放宽了 peer 范围并把 pi-ai 升到 0.87+，本 fork 即可废弃，直接切回上游发布版。~~
（2026-10-02：上游 v0.1.14 已放宽 peers 并接受 pi-ai `^0.87.1`，但 fork 已承载合并的
edit/UI 功能与 pi-ai dependencies 分层，不再可废弃；见文末同步记录。）

---

## 状态与边界

- 基线：上游 `v0.1.13`（`0f3e4b1`）。上游自 2026-09-30 起进入**有限维护**（维护者无有效订阅，暂停功能开发）。
- 本 fork **未做在线行为实测**；持有订阅的使用者实测结果请开 issue 记录，并附插件版本、`dsh --version`、Node 版本、系统、订阅档位与最小复现步骤（**不要粘贴 token / `auth.json` / 账号邮箱 / session id**）。
- 离线可复现的问题、打包与宿主兼容修复在本 fork 内维护。

---

## 2026-10-01 合并：吸收 dsh-grok-imagine-edit 与 dsh-grok-imagine-ui（本 fork v0.1.14）

自本版本起，两个卫星插件并入本包，不再保持 "src/lib 与上游逐字节相同"：

| 原插件 | 去向 |
| --- | --- |
| `dsh-grok-imagine-edit` 0.1.0 | Host 侧：`src/imagine-edit-core.ts`（纯逻辑，零依赖）+ `src/imagine-edit.ts`（工具注册）；配置字段 `editTool` / `editModel` / `editMaxSourceImages` / `editMaxImageBytes`；测试 `tests/imagine-edit.spec.ts` |
| `dsh-grok-imagine-ui` 0.1.0 | client 侧：`src/client/imagine-view.tsx`（toolview + turnTail slot），入口 `src/client/index.tsx`；`dsh.client.inject` 增加 `@deepseek-ai/dsh-client-ui-slots` |

行为改进（合并的自然收益）：

- **消除了重复 OAuth session**：原 edit 插件自建第二个 `XaiOAuthSession` 读同一凭据文件；现在直接复用主 session 与 token 源。
- 工具名不变（`grok_imagine` / `grok_imagine_edit`），会话与模型习惯无感。
- imagine-ui 的两个生产修复已保留在移植代码中：save_path 文本回退（原 FIX-null-render-save-path.md）、双工具名渲染（原 REVERT-edit-tool-support.md）。

安装方式变化：profile 的 bundles 列表与 dependencies 移除 `dsh-grok-imagine-edit`、`dsh-grok-imagine-ui` 两条，仅保留 `dsh-grok-kit`。上游若复活，rebase 时上述四个 src 文件与 client 改动需手工搬移。

---

## 2026-10-02 同步：合入上游 v0.1.14（335402a…15cf9c3，merge commit），fork 升至 v0.1.15

上游在 2026-09-30 发布了同名 v0.1.14（与 fork 的合并版号撞号，内容不同），共 4 个提交。
采用 `git merge upstream/main` 合入，冲突仅 `package.json` / `package-lock.json` 两处，
均以 fork 侧为准。因上游 v0.1.14 已发布到 npm，fork 版号顺升为 **0.1.15**（package.json /
package-lock / 三处 UA / smoke 断言同步），避免与上游发布混淆。

**取上游的**：

- `scripts/verify-host-compat.mjs`：新增 0.2.0-rc.2 宿主腿（冻结 fixture 按宿主钉
  schemastery 3.18.4 / cordis 4.0.4，0.2 线排除已更名的 `dsh-code-runtime`）
- `scripts/pack-install-smoke.mjs`：smoke 支持 0.2.0-rc.2 参数；安装版本断言升到 0.1.14
- `.github/workflows/ci.yml`：接入 0.2.0-rc.2 host-compat 腿
- `src/search.ts`：UA `dsh-grok-kit/0.1.13` → `0.1.14`（fork 升版号时漏改的）
- README / README.en / INSTALL / INSTALL.zh：0.2.0-rc.2 兼容性说明与可复现锚点更新

**保 fork 的**（冲突解决依据）：

- `package.json`：description（含合并说明）、peers 更宽（保留 `^0.2.0-rc.1`）、
  pi-ai 留在 `dependencies`（pi-ai 分层：scoped override 要求实体依赖才能落到 0.87.1，
  上游改成 optional peer 的写法在本 profile 的 pnpm override 下会被顶层提升穿透）、
  `dsh.client.inject` 的 `dsh-client-ui-slots`
- `tests/composition.spec.ts` 的宽断言（pi-ai 在 peer 或 dependencies 均可）不受影响

验证：`npm run check` 全绿（typecheck host+client、22 测试文件 197 通过、tsdown 构建）；
`lib/` 由合并后源码重新构建。
