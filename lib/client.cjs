Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
let react = require("react");
let react_jsx_runtime = require("react/jsx-runtime");
//#region src/client/media-card.tsx
const mediaCardStyles = {
	muted: {
		color: "var(--dsw-alias-label-secondary)",
		fontSize: 12,
		lineHeight: 1.6
	},
	preview: {
		display: "grid",
		placeItems: "center",
		minHeight: 180,
		overflow: "hidden",
		borderRadius: 12,
		background: "var(--dsw-alias-bg-base)",
		border: "1px solid var(--dsw-alias-border-l2)"
	},
	action: {
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		minHeight: 34,
		padding: "7px 12px",
		borderRadius: 8,
		border: "1px solid var(--dsw-alias-border-l2)",
		background: "var(--dsw-alias-bg-base)",
		color: "var(--dsw-alias-label-primary)",
		font: "inherit",
		fontSize: 12,
		fontWeight: 500,
		cursor: "pointer"
	},
	primaryAction: {
		background: "var(--dsw-alias-label-primary)",
		color: "var(--dsw-alias-bg-base)"
	},
	detail: {
		display: "grid",
		gap: 8,
		paddingTop: 12,
		fontSize: 12,
		lineHeight: 1.6,
		color: "var(--dsw-alias-label-secondary)",
		overflowWrap: "anywhere",
		minWidth: 0
	},
	prompt: {
		margin: 0,
		whiteSpace: "pre-wrap",
		overflowWrap: "anywhere",
		font: "inherit",
		fontSize: 12,
		lineHeight: 1.65
	}
};
const tones = {
	neutral: { color: "var(--dsw-alias-label-secondary)" },
	busy: { color: "var(--dsw-alias-label-primary)" },
	success: { color: "var(--dsw-alias-state-success-primary, var(--dsw-alias-label-secondary))" },
	error: { color: "var(--dsw-alias-state-error-primary, var(--dsw-alias-label-primary))" }
};
function MediaCardFrame({ title, status, statusTone = "neutral", summary, preview, actions, details, detailsLabel, notice, testId, ariaLabel }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
		"data-testid": testId,
		"aria-label": ariaLabel ?? title,
		style: {
			display: "grid",
			gap: 14,
			width: "100%",
			maxWidth: 760,
			minWidth: 0,
			boxSizing: "border-box",
			padding: 16,
			borderRadius: 14,
			border: "1px solid var(--dsw-alias-border-l2)",
			background: "var(--dsw-alias-bg-module-platform)",
			color: "var(--dsw-alias-label-primary)",
			fontFamily: "inherit"
		},
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
				style: {
					display: "flex",
					alignItems: "flex-start",
					justifyContent: "space-between",
					flexWrap: "wrap",
					gap: 10
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "grid",
						gap: 4,
						minWidth: 0
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
						style: {
							fontSize: 14,
							fontWeight: 600,
							letterSpacing: "-0.01em"
						},
						children: title
					}), summary === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							...mediaCardStyles.muted,
							display: "flex",
							gap: 8,
							alignItems: "center",
							flexWrap: "wrap"
						},
						children: summary
					})]
				}), status === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					role: "status",
					style: {
						...tones[statusTone],
						display: "inline-flex",
						alignItems: "center",
						gap: 6,
						padding: "4px 9px",
						borderRadius: 20,
						background: "var(--dsw-alias-bg-base)",
						border: "1px solid var(--dsw-alias-border-l2)",
						fontSize: 11,
						fontWeight: 500
					},
					children: [statusTone === "busy" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						"aria-hidden": true,
						children: "◌"
					}) : null, status]
				})]
			}),
			preview,
			notice === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: mediaCardStyles.muted,
				children: notice
			}),
			actions === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					display: "flex",
					flexWrap: "wrap",
					alignItems: "center",
					gap: 8
				},
				children: actions
			}),
			details === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
				style: {
					borderTop: "1px solid var(--dsw-alias-border-l2)",
					paddingTop: 10
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", {
					style: {
						...mediaCardStyles.muted,
						cursor: "pointer",
						userSelect: "none"
					},
					children: detailsLabel
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: mediaCardStyles.detail,
					children: details
				})]
			})
		]
	});
}
//#endregion
//#region src/client/locales.ts
/** English copy for the xAI Grok settings page. */
const en = {
	navSearchShort: "Search",
	navMediaShort: "Media",
	accountDetails: "About sign-in and subscriptions",
	modelsSelected: "visible",
	modelsImmediate: "Changes to model visibility are saved immediately.",
	modelsSignIn: "Sign in from Account to choose your visible models.",
	searchParameters: "Edit dedicated search parameters",
	webTimeoutShort: "Web timeout",
	xTimeoutShort: "X timeout",
	nestedDraftOn: "Current draft: dedicated tools available",
	nestedDraftOff: "Current draft: dedicated tools off; parameters below are not used",
	nestedDraftAuto: "Automatic: inherits configuration; follows main-request search when unspecified",
	optionsHowTo: "How saving and defaults work",
	stageEdit: "Edit",
	stageSave: "Save",
	stageRestart: "Restart DSH to apply",
	mediaConfirmTitle: "CONFIRM ENABLEMENT",
	networkImmediate: "Applies after saving; no restart needed",
	nav: "xAI Grok",
	/** Page labels double as the sticky header's navigation buttons. */
	navAccount: "Account",
	navModels: "Models",
	navSearch: "Search & conversation",
	navMedia: "Media & tasks",
	navNetwork: "Network",
	/** Shared status line in the sticky header, shown on every page. */
	statusLabel: "Account status",
	title: "xAI Grok",
	intro: "Sign in with the official Grok OAuth to use your X Subscription or legacy SuperGrok / X Premium plan in dsh — no xAI API key needed. Grok searches the web and X on the same turn as the reply.",
	unofficialNotice: "Unofficial integration: not an xAI or X product; no affiliation or endorsement. OAuth availability depends on account entitlement and current xAI policies.",
	loadingAccount: "Loading account…",
	signedOut: "Not signed in",
	signedOutShared: "Not signed in · will use ~/.grok/auth.json",
	signingIn: "Waiting for xAI authorization…",
	signedIn: "Signed in",
	signedInShared: "Signed in via Grok CLI (~/.grok/auth.json)",
	login: "Sign in with Grok / X Subscription",
	loginShared: "Sign in with Grok / X Subscription (shared with Grok CLI)",
	subscriptionLoginHint: "The X Subscription and legacy SuperGrok / X Premium plans share the same official Grok OAuth login; sign in again to switch accounts. This page reads the signed-in account only — it does not combine quotas across workspaces or seats.",
	subscriptionDashboard: "Manage the X Subscription",
	loginAgain: "Sign in again",
	logout: "Sign out",
	logoutShared: "Sign out of dsh and Grok CLI",
	confirmLogoutShared: "This removes the xAI slot in ~/.grok/auth.json. Grok CLI will be signed out too. Continue?",
	confirmLoginShared: "This replaces the Grok CLI login in ~/.grok/auth.json. Continue?",
	confirmLoginPrivate: "Signing in again will replace the currently saved account after successful authorization. Continue?",
	loginFailedStoredAccount: "Authorization did not complete. The account shown is based on the currently saved credentials.",
	working: "Working…",
	userCode: "If xAI asks for a code, enter:",
	openUrl: "If the window did not open, open this URL:",
	popupBlocked: "The browser blocked the sign-in window. Open the URL below, or allow pop-ups and retry.",
	requestFailed: "The xAI Grok account request failed.",
	importGrok: "Import from Grok CLI",
	importHint: "Only needed when dsh still has a leftover private credential file. Prefer sharing ~/.grok/auth.json so both apps rotate the same token.",
	sharedGrok: "Using ~/.grok/auth.json — the same file as Grok CLI. Sign-in and refresh update it in place. Sign-out signs Grok CLI out too.",
	models: "Visible models",
	catalogLive: "From your xAI account",
	catalogCache: "From the last successful listing",
	catalogFallback: "Installed catalog (live listing unavailable)",
	catalogError: "Could not refresh the live model list.",
	selectAll: "Show all",
	modelHint: "Checked models appear in the composer picker as xai-oauth / <id>.",
	proxyTitle: "Network proxy (xAI only)",
	proxyHint: "Used for x.ai, its subdomains, and subscription-quota requests. Other xAI requests in DSH may also be affected; other traffic keeps its existing network settings. HTTP/HTTPS proxies only; saving takes effect immediately. Example: http://127.0.0.1:8080",
	proxyPlaceholder: "http://127.0.0.1:8080",
	proxySave: "Save proxy",
	proxySaved: "Proxy saved",
	proxyError: "Could not save the proxy setting.",
	proxyLoadError: "Could not load the network settings. Saving stays disabled until they load.",
	proxyRetry: "Retry loading network settings",
	quotaCompatibilityWarning: "Do not enable this mode where host-level egress controls, DLP or mandatory outbound wrappers are required. If you only need a fixed proxy, also fill in the proxy URL above; this does not restore the host wrapper’s controls.",
	networkUnsavedChangesHint: "The proxy URL and the quota request compatibility mode are saved together.",
	quotaCompatibilityMode: "Quota request compatibility mode",
	quotaCompatibilityModeHint: "Off by default. When enabled, only the subscription-quota requests bypass the global fetch wrapper and use this plugin’s own network channel, which follows the proxy above; a blank proxy means that channel connects directly, without the host’s global fetch. Chat and sign-in are unaffected, and the credential boundary is unchanged. Takes effect immediately after saving — no restart needed.",
	quotaCompatibilityUnsaved: "The quota request compatibility mode differs from the saved value.",
	optionsTitle: "Search & feature options",
	optionsHint: "Save and Reset affect only this page; unsaved edits stay when you switch pages. Restart DSH to apply search and media changes. Turning media off and saving blocks new calls immediately, but does not cancel submitted tasks. Resetting Media & tasks also clears the risk acknowledgment.",
	backendSearch: "Search within the reply",
	backendSearchHint: "Search the web and X in the same reply. Off by default; if it fails, switch it off to use dedicated search tools.",
	statefulResponses: "Stateful continuation",
	statefulResponsesHint: "Reuse the previous reply and append only new input. Turns that used client tools are not continued. Turn off if replies repeat or xAI returns a 400.",
	nestedSearchTools: "Dedicated search tools",
	nestedSearchToolsAuto: "Automatic",
	nestedSearchToolsHint: "Auto inherits your configuration; if unspecified, these tools are available when main-request search is off. Forcing them on allows both and may bill twice. Use them for domain, account or date filters.",
	imagineTool: "Image tools (generate / edit)",
	imagineToolHint: "Off by default. Selecting enables both grok_imagine and grok_imagine_edit; clearing disables both. Advanced configuration may select them separately; each state is shown below.",
	imageGenerationSwitch: "Generate",
	imageEditingSwitch: "Edit",
	mediaOn: "On",
	mediaOff: "Off",
	mediaRiskHint: "Media tools are third-party, unofficial access. Whether they work depends on your xAI account eligibility and xAI service rules, and access can be limited or paused at any time; do not send sensitive content or material you have no rights to.",
	experimentalTag: "Experimental",
	mediaConfirmPrompt: "Media tools are experimental. Once enabled, the agent can call xAI to generate media directly. Output comes from xAI and counts against your plan quota or incurs charges; prompts and input images are uploaded to xAI. Takes effect after saving and restarting the DSH host, and submitted tasks cannot be cancelled instantly.",
	mediaConfirmYes: "Enable",
	mediaConfirmNo: "Cancel",
	searchModel: "Nested search model",
	searchModelHint: "Default grok-build-0.1.",
	searchMaxResults: "Source limit",
	searchMaxResultsHint: "Default 8.",
	webSearchTimeoutMs: "Web search timeout (ms)",
	webSearchTimeoutHint: "Default 60000.",
	xSearchTimeoutMs: "X search timeout (ms)",
	xSearchTimeoutHint: "Default 120000.",
	unsavedChanges: "Unsaved changes",
	unsavedChangesHint: "Changes on this page are not saved yet. Switching pages keeps your draft.",
	optionsSave: "Save options",
	optionsSaved: "Saved — restart the DSH host to apply tool registration",
	optionsError: "Could not save the options.",
	optionsReset: "Reset to defaults",
	videoTool: "grok_video video tool",
	videoToolHint: "Off by default. Enables video generation / status / resume after confirmation and a DSH host restart. When off, the local task list, resume and video download routes are also disabled.",
	videoModelLabel: "Video model (read-only)",
	videoMaxBytesLabel: "Video size limit (bytes, read-only)",
	capabilitiesTitle: "Capability status",
	capabilitiesIntro: "Reads the plugin’s local records without probing xAI. Records live in host memory and are cleared on sign-out.",
	capabilitiesLoading: "Loading capability status…",
	capabilitiesError: "Could not load the capability status.",
	capabilitiesRefresh: "Refresh",
	featureVideo: "Video generation",
	featureVoice: "Voice",
	featureCode: "Code",
	featureImageGeneration: "Main-loop image generation (pending / unverified)",
	stateUnverified: "Unverified",
	stateAvailable: "Available",
	stateRestricted: "Restricted",
	stateTemporaryError: "Temporary error",
	capabilityCheckedAt: "Checked",
	capabilityModel: "Model",
	capabilityHttp: "HTTP",
	quotaTitle: "Quota",
	quotaIntro: "This shows the signed-in account’s subscription usage. It is read when this page opens and cached for 60 seconds, without automatic polling.",
	quotaUnified: "The X Subscription with unified billing: eligible official features share this seat’s weekly allowance; seats are not pooled. Extra usage draws on prepaid credit subject to your account settings.",
	quotaPartial: "The subscription details were returned without a usage percentage, so used and remaining are unknown. The period, plan and reported balance are still listed below.",
	quotaLoading: "Loading quota…",
	quotaRefresh: "Refresh quota",
	quotaSignedOut: "Sign in to read the quota.",
	quotaError: "Could not load the quota.",
	quotaRestricted: "This account does not expose this quota.",
	quotaAuthError: "xAI rejected the quota request — the account may need to sign in again.",
	quotaUnavailable: "No readable quota data.",
	quotaUsed: "Used",
	quotaRemaining: "Remaining",
	quotaWeek: "This week",
	quotaMonth: "This month",
	quotaSubscription: "Subscription",
	quotaResetAt: "Resets at",
	quotaCheckedAt: "Checked at",
	quotaPlan: "Plan",
	quotaBalance: "Balance",
	videoOn: "Video tool enabled",
	videoOff: "Video tool disabled (off by default)",
	videoRestartHint: "Newly enabled tools need a DSH host restart. Saving the change blocks further calls but does not cancel tasks already submitted upstream.",
	videoTasksTitle: "Video tasks",
	videoTasksIntro: "Local task list only — this page never polls the upstream service.",
	videoTasksLoading: "Loading video tasks…",
	videoTasksError: "Could not load the video tasks.",
	videoTasksEmpty: "No video tasks recorded on this machine.",
	videoTasksRefresh: "Refresh local list",
	videoTasksDisabled: "Video is off — its task list, resume and downloads are disabled. Review the risks above, enable video and restart the DSH host to use them.",
	resumeQuery: "Resume query",
	resumeHint: "Resume only continues the waiting and downloading of an existing task — it never creates a new request and is not a regeneration. Stopping the wait does not stop upstream billing.",
	resumeBusy: "Resuming…",
	resumeDone: "Task updated.",
	resumeFailed: "Could not resume this task.",
	videoAttachmentRef: "Attachment reference",
	videoDownload: "Download video",
	videoDownloadBusy: "Downloading…",
	videoDownloadDone: "Download started",
	videoDownloadFailed: "Video download failed.",
	videoDownloadFallback: "If a download fails, the reference below locates the file stored on the host.",
	taskStatePending: "Waiting",
	taskStateDownloading: "Downloading",
	taskStateDone: "Done",
	taskStateFailed: "Failed",
	taskStateInterrupted: "Interrupted",
	taskStateSubmissionUnknown: "Submission unknown",
	actionFailed: "Failed",
	videoCardPendingGenerate: "Submitting the video task…",
	videoCardPendingStatus: "Checking the video task…",
	videoCardPendingResume: "Resuming the video task…",
	videoCardReceivingArgs: "Receiving call arguments…",
	videoCardStopWaiting: "Stop waiting",
	videoCardPrompt: "Prompt",
	videoCardResult: "Result",
	videoCardFile: "Video file",
	videoCardFileName: "File",
	videoCardFileSize: "Size",
	videoCardRefNote: "The reference only locates the file already stored on the host; it is never sent anywhere.",
	videoCardCopyRef: "Copy reference",
	videoCardCopied: "Reference copied",
	videoCardCopyFailed: "Copy failed",
	videoCardStateUnknown: "State unknown",
	videoCardFileOnly: "File attached (the host did not report a task state)",
	videoCardModel: "Model",
	videoCardResolution: "Resolution",
	videoCardDuration: "Duration",
	videoCardCreated: "Created",
	videoCardUpdated: "Updated",
	videoCardResumeDone: "Task updated",
	videoCardResumeFailed: "Resume failed (video tool disabled or not signed in)",
	videoCardRedownload: "Download again",
	videoCardDownloaded: "Download started",
	videoCardDownloadNote: "Downloads use the host same-origin /video/file route (finished tasks of the signed-in account, client cap 100 MiB); on failure the reference below locates the stored file.",
	videoCardFailureTitle: "Video task failed",
	videoCardAriaRunning: "Video task in progress",
	videoCardAriaResult: "Video task result",
	videoCardAriaFileRef: "Video file reference",
	videoUiDetails: "Details",
	videoUiLoadVideo: "Click to load and play",
	videoUiPlay: "Play",
	videoUiLoading: "Loading video…",
	videoUiQuery: "Query status",
	videoUiResume: "Resume",
	imageUiGenerated: "Image generated",
	imageUiEdited: "Image edited",
	imageUiGenerating: "Generating image…",
	imageUiEditing: "Editing image…",
	imageUiGenerateFailed: "Image generation failed",
	imageUiEditFailed: "Image editing failed",
	imageUiStatusDone: "Done",
	imageUiResult: "Result",
	imageUiPrompt: "Prompt",
	imageUiDetails: "Details",
	imageUiImageInfo: "Image info",
	imageUiInputImages: "Input images",
	imageUiInputImage: "Input image",
	imageUiViewLarge: "View image",
	imageUiDownload: "Download",
	imageUiCopyImage: "Copy image",
	imageUiCopyPrompt: "Copy prompt",
	imageUiCopied: "Copied",
	imageUiCopyFailed: "Copy failed",
	imageUiRegenerate: "Regenerate",
	imageUiStopWaiting: "Stop waiting",
	imageUiOpenInput: "Open input image",
	imageUiStopNotice: "Stopping the wait stops the current session run; it does not cancel upstream generation or stop billing.",
	imageUiReceivingArgs: "Receiving call arguments…",
	imageUiLoadingImage: "Loading image…",
	imageUiImageUnavailable: "Image unavailable",
	imageUiLoadingInput: "Loading input image: ",
	imageUiInputReadFailed: "Could not read input image: ",
	imageUiImage: "Image",
	imageUiRemoteLink: "(remote link)",
	imageUiZoomReset: "Reset",
	imageUiClose: "Close",
	imageUiCodexLegendA: "Purple dot = Grok Imagine images rendered by this plugin; this turn also has ",
	imageUiCodexLegendB: " Codex (GPT Image) image(s) rendered elsewhere with a different card style and no purple dot.",
	imageUiRegenerateText: "Please regenerate an image with grok_imagine using exactly this prompt; do not rewrite it:",
	imageUiEditIntro: "Please edit again with grok_imagine_edit, ",
	imageUiEditSources: "reuse all of these input image sources (the first is image, the rest are images): ",
	imageUiEditSourcesFallback: "reuse all input images (image and images) from the previous grok_imagine_edit call",
	imageUiEditSettings: ". Keep the parameters: ",
	imageUiEditKeepPrompt: ". Do not rewrite the prompt:"
};
const zh = {
	navSearchShort: "搜索",
	navMediaShort: "媒体",
	accountDetails: "登录与订阅说明",
	modelsSelected: "个已显示",
	modelsImmediate: "模型显示范围修改后立即保存。",
	modelsSignIn: "请先在账号页登录，再选择要显示的模型。",
	searchParameters: "调整独立搜索参数",
	webTimeoutShort: "网页搜索超时",
	xTimeoutShort: "X 搜索超时",
	nestedDraftOn: "当前草稿：独立搜索工具可用",
	nestedDraftOff: "当前草稿：独立搜索工具关闭，下方参数暂不使用",
	nestedDraftAuto: "自动模式：继承配置；未指定时，随融合搜索切换",
	optionsHowTo: "保存与默认值说明",
	stageEdit: "修改配置",
	stageSave: "保存设置",
	stageRestart: "重启 DSH 后生效",
	mediaConfirmTitle: "二步确认 · 启用媒体能力",
	networkImmediate: "保存后立即生效，无需重启",
	nav: "xAI Grok",
	/** Page labels double as the sticky header's navigation buttons. */
	navAccount: "账户",
	navModels: "模型",
	navSearch: "搜索与对话",
	navMedia: "媒体与任务",
	navNetwork: "网络",
	/** Shared status line in the sticky header, shown on every page. */
	statusLabel: "账户状态",
	title: "xAI Grok",
	intro: "用 X Subscription 或原 SuperGrok / X Premium 订阅，通过官方 Grok OAuth 在 dsh 里调用 Grok，无需 xAI API Key。Grok 会在同一轮回复里做网页和 X 搜索。",
	unofficialNotice: "非官方集成：与 xAI / X 无隶属或背书关系；OAuth 可用性取决于账户资格与 xAI 当前策略。",
	loadingAccount: "正在加载账户信息…",
	signedOut: "尚未登录",
	signedOutShared: "尚未登录 · 将使用 ~/.grok/auth.json",
	signingIn: "正在等待 xAI 授权…",
	signedIn: "已登录",
	signedInShared: "已通过 Grok CLI 登录（~/.grok/auth.json）",
	login: "登录 Grok / X 订阅",
	loginShared: "登录 Grok / X 订阅（与 Grok CLI 共享）",
	subscriptionLoginHint: "X Subscription 和原 SuperGrok / X Premium 订阅用的是同一个官方 Grok OAuth 登录，重新登录即可切换账号。这里只读取当前登录的账号，不会把不同工作区或席位的额度加在一起。",
	subscriptionDashboard: "管理 X 订阅",
	loginAgain: "重新登录",
	logout: "退出登录",
	logoutShared: "退出 dsh 和 Grok CLI",
	confirmLogoutShared: "这会清掉 ~/.grok/auth.json 里的 xAI 凭证，Grok CLI 也会掉线。确定？",
	confirmLoginShared: "这会覆盖 ~/.grok/auth.json 里现有的 Grok CLI 登录。确定？",
	confirmLoginPrivate: "重新登录将在授权成功后替换当前保存的账号。确定继续？",
	loginFailedStoredAccount: "授权未完成，当前按已保存的凭据显示账号。",
	working: "处理中…",
	userCode: "如果 xAI 要求输入代码，请输入：",
	openUrl: "如果窗口没有打开，请打开这个链接：",
	popupBlocked: "浏览器阻止了登录窗口。请打开下方链接，或允许此页面弹出窗口后重试。",
	requestFailed: "xAI Grok 账户请求失败。",
	importGrok: "从 Grok CLI 导入",
	importHint: "只有 dsh 还在用自己那份旧凭证时才需要。更推荐直接共用 ~/.grok/auth.json，两边刷新同一把 token。",
	sharedGrok: "正在使用 ~/.grok/auth.json，和 Grok CLI 同一份文件。登录和刷新会写回这个文件。在这里退出登录也会让 Grok CLI 掉线。",
	models: "可见模型",
	catalogLive: "来自当前 xAI 账号",
	catalogCache: "来自上一次成功拉取",
	catalogFallback: "已安装目录（未能拉取账号列表）",
	catalogError: "无法刷新线上模型列表。",
	selectAll: "全部显示",
	modelHint: "勾选的模型会出现在对话的模型选择器里，名字是 xai-oauth / 模型 id。",
	proxyTitle: "网络代理（仅 xAI）",
	proxyHint: "用于 x.ai 及其子域名和订阅额度接口，也可能影响 DSH 内其他 xAI 请求。其余请求沿用原有网络设置。仅支持 HTTP/HTTPS 代理，保存即生效。示例：http://127.0.0.1:8080",
	proxyPlaceholder: "http://127.0.0.1:8080",
	proxySave: "保存代理",
	proxySaved: "代理已保存",
	proxyError: "保存代理设置失败。",
	proxyLoadError: "无法加载网络设置，加载成功前无法保存。",
	proxyRetry: "重试加载网络设置",
	quotaCompatibilityWarning: "依赖宿主级强制出口、DLP 或强制网络包装控制的环境不要开启此模式。若只需要固定出口代理，请同时填写上方代理地址；这不能恢复宿主包装链中的控制。",
	networkUnsavedChangesHint: "代理地址与配额请求兼容模式会一起保存。",
	quotaCompatibilityMode: "配额请求兼容模式",
	quotaCompatibilityModeHint: "默认关闭。开启后仅订阅额度请求绕过全局 fetch 包装，改用插件自有的网络通道，并沿用上方代理；代理留空时该通道直连，不跟随宿主的全局 fetch。聊天与登录不受影响，凭据边界不变。保存后立即生效，无需重启。",
	quotaCompatibilityUnsaved: "配额请求兼容模式与已保存的值不同。",
	optionsTitle: "搜索与功能选项",
	optionsHint: "保存与恢复默认只影响当前页，切页会保留未保存的修改。搜索和媒体选项需重启 DSH 后生效；关闭媒体并保存会立即阻止新调用，但不会取消已提交任务。在「媒体与任务」页恢复默认也会撤销开启确认。",
	backendSearch: "融合搜索",
	backendSearchHint: "在同一轮回答中搜索 Web 与 X。默认关闭；遇到搜索异常时可关闭，改用独立搜索工具。",
	statefulResponses: "连续对话",
	statefulResponsesHint: "沿用上一轮回复，仅追加新输入；使用过客户端工具的轮次不续接。若回复重复或返回 400，请关闭。",
	nestedSearchTools: "独立搜索工具",
	nestedSearchToolsAuto: "自动",
	nestedSearchToolsHint: "自动模式继承现有配置；未指定时，在融合搜索关闭后启用。强制开启可与融合搜索并用，可能重复计费；需要域名、账号或日期筛选时使用。",
	imagineTool: "图片工具（生成 / 编辑）",
	imagineToolHint: "默认关闭。勾选同时开启 grok_imagine 和 grok_imagine_edit；取消勾选同时关闭。高级配置可分别选择，两项状态显示在下方。",
	imageGenerationSwitch: "生成",
	imageEditingSwitch: "编辑",
	mediaOn: "开启",
	mediaOff: "关闭",
	mediaRiskHint: "媒体工具是第三方非官方接入，能否使用取决于 xAI 的账户资格和服务规则，随时可能被限制或暂停；请勿通过媒体工具发送敏感内容或无权使用的素材。",
	experimentalTag: "实验性",
	mediaConfirmPrompt: "媒体工具为实验性功能。开启后 Agent 可直接调用 xAI 生成媒体：内容来自 xAI，计入订阅额度或产生费用；提示词与输入图片会上传至 xAI。保存并重启 DSH 宿主后生效，已提交的任务无法即时取消。",
	mediaConfirmYes: "确认开启",
	mediaConfirmNo: "取消",
	searchModel: "嵌套搜索模型",
	searchModelHint: "默认 grok-build-0.1。",
	searchMaxResults: "来源上限",
	searchMaxResultsHint: "默认 8。",
	webSearchTimeoutMs: "网页搜索超时（毫秒）",
	webSearchTimeoutHint: "默认 60000。",
	xSearchTimeoutMs: "X 搜索超时（毫秒）",
	xSearchTimeoutHint: "默认 120000。",
	unsavedChanges: "未保存的修改",
	unsavedChangesHint: "此页修改尚未保存；切换分类不会丢失草稿。",
	optionsSave: "保存选项",
	optionsSaved: "已保存，重启 DSH 宿主后应用工具注册",
	optionsError: "保存选项失败。",
	optionsReset: "恢复默认",
	videoTool: "grok_video 视频工具",
	videoToolHint: "默认关闭。确认风险并重启 DSH 宿主后开启视频生成 / 查询 / 恢复。关闭时，本地任务列表、恢复和视频下载接口也会停用。",
	videoModelLabel: "视频模型（只读）",
	videoMaxBytesLabel: "视频大小上限（字节，只读）",
	capabilitiesTitle: "功能能力状态",
	capabilitiesIntro: "这里只显示插件自己记录到的状态——本页不会发起任何网络探测；记录只存在宿主内存里，退出登录即清空。",
	capabilitiesLoading: "正在加载能力状态…",
	capabilitiesError: "无法加载能力状态。",
	capabilitiesRefresh: "刷新",
	featureVideo: "视频生成",
	featureVoice: "语音",
	featureCode: "代码",
	featureImageGeneration: "主循环生图（待接入 / 未验证）",
	stateUnverified: "未验证",
	stateAvailable: "可用",
	stateRestricted: "受限",
	stateTemporaryError: "临时错误",
	capabilityCheckedAt: "检测于",
	capabilityModel: "模型",
	capabilityHttp: "HTTP",
	quotaTitle: "配额",
	quotaIntro: "这里显示当前账号的订阅用量。打开账号页时读取一次，缓存 60 秒，不会自动轮询。",
	quotaUnified: "X Subscription（统一计费）：支持的官方功能共用当前席位的周额度，不同席位不叠加；超额使用按账号设置从预付余额扣除。",
	quotaPartial: "接口返回了订阅信息，但没有使用百分比，因此已用和剩余无法显示；下方仍列出周期、套餐和余额。",
	quotaLoading: "正在读取配额…",
	quotaRefresh: "刷新配额",
	quotaSignedOut: "登录后才能读取配额。",
	quotaError: "无法加载配额。",
	quotaRestricted: "当前账号未提供这项配额。",
	quotaAuthError: "xAI 拒绝了配额请求——可能需要重新登录。",
	quotaUnavailable: "没有可读的配额数据。",
	quotaUsed: "已用",
	quotaRemaining: "剩余",
	quotaWeek: "本周",
	quotaMonth: "本月",
	quotaSubscription: "订阅",
	quotaResetAt: "重置时间",
	quotaCheckedAt: "读取时间",
	quotaPlan: "套餐",
	quotaBalance: "余额",
	videoOn: "视频工具已开启",
	videoOff: "视频工具已关闭（默认关闭）",
	videoRestartHint: "新开启的工具需重启 DSH 宿主。关闭并保存会阻止后续调用，但不会取消已提交的上游任务。",
	videoTasksTitle: "视频任务",
	videoTasksIntro: "仅读取本地任务列表——本页不会轮询上游服务。",
	videoTasksLoading: "正在加载视频任务…",
	videoTasksError: "无法加载视频任务。",
	videoTasksEmpty: "本机没有记录到视频任务。",
	videoTasksRefresh: "刷新本地列表",
	videoTasksDisabled: "视频已关闭，任务列表、恢复和下载均停用。请先在上方阅读风险并开启视频，再重启 DSH 宿主。",
	resumeQuery: "恢复查询",
	resumeHint: "恢复只继续已有任务的等待和下载：不会新建请求，也不是重新生成。停止等待不会停止上游计费。",
	resumeBusy: "正在恢复…",
	resumeDone: "任务已更新。",
	resumeFailed: "恢复该任务失败。",
	videoAttachmentRef: "附件引用",
	videoDownload: "下载视频",
	videoDownloadBusy: "下载中…",
	videoDownloadDone: "下载已开始",
	videoDownloadFailed: "视频下载失败。",
	videoDownloadFallback: "下载失败时，可用下方引用定位宿主已存好的文件。",
	taskStatePending: "等待中",
	taskStateDownloading: "下载中",
	taskStateDone: "已完成",
	taskStateFailed: "失败",
	taskStateInterrupted: "已中断",
	taskStateSubmissionUnknown: "提交状态未知",
	actionFailed: "失败",
	videoCardPendingGenerate: "正在提交视频任务…",
	videoCardPendingStatus: "正在查询视频任务…",
	videoCardPendingResume: "正在恢复视频任务…",
	videoCardReceivingArgs: "正在接收调用参数…",
	videoCardStopWaiting: "停止等待",
	videoCardPrompt: "提示词",
	videoCardResult: "执行结果",
	videoCardFile: "视频文件",
	videoCardFileName: "文件名",
	videoCardFileSize: "大小",
	videoCardRefNote: "引用只用于定位宿主已存好的文件，不参与任何网络请求。",
	videoCardCopyRef: "复制引用",
	videoCardCopied: "引用已复制",
	videoCardCopyFailed: "复制失败",
	videoCardStateUnknown: "状态未知",
	videoCardFileOnly: "已附带视频文件（宿主未回传任务状态）",
	videoCardModel: "模型",
	videoCardResolution: "分辨率",
	videoCardDuration: "时长",
	videoCardCreated: "创建",
	videoCardUpdated: "更新",
	videoCardResumeDone: "任务已更新",
	videoCardResumeFailed: "恢复失败（视频功能已关闭或未登录）",
	videoCardRedownload: "重新下载",
	videoCardDownloaded: "下载已开始",
	videoCardDownloadNote: "下载走宿主同源接口 /video/file（仅当前账号已完成任务，客户端上限 100 MiB）；失败时可用下方引用定位宿主已存好的文件。",
	videoCardFailureTitle: "视频任务失败",
	videoCardAriaRunning: "视频任务处理中",
	videoCardAriaResult: "视频任务结果",
	videoCardAriaFileRef: "视频文件引用",
	videoUiDetails: "详情",
	videoUiLoadVideo: "点击加载并播放",
	videoUiPlay: "播放",
	videoUiLoading: "正在加载视频…",
	videoUiQuery: "查询状态",
	videoUiResume: "恢复",
	imageUiGenerated: "已生成",
	imageUiEdited: "已编辑",
	imageUiGenerating: "正在生成图片…",
	imageUiEditing: "正在编辑图片…",
	imageUiGenerateFailed: "图片生成失败",
	imageUiEditFailed: "图片编辑失败",
	imageUiStatusDone: "已完成",
	imageUiResult: "执行结果",
	imageUiPrompt: "提示词",
	imageUiDetails: "详情",
	imageUiImageInfo: "图片信息",
	imageUiInputImages: "输入图片",
	imageUiInputImage: "输入图片",
	imageUiViewLarge: "查看大图",
	imageUiDownload: "下载",
	imageUiCopyImage: "复制图片",
	imageUiCopyPrompt: "复制提示词",
	imageUiCopied: "已复制",
	imageUiCopyFailed: "复制失败",
	imageUiRegenerate: "重新生成",
	imageUiStopWaiting: "停止等待",
	imageUiOpenInput: "打开输入图片",
	imageUiStopNotice: "停止等待会停止当前会话运行，但不会取消上游生成或停止计费。",
	imageUiReceivingArgs: "正在接收调用参数…",
	imageUiLoadingImage: "正在加载图片…",
	imageUiImageUnavailable: "图片无法显示",
	imageUiLoadingInput: "正在加载输入图片：",
	imageUiInputReadFailed: "输入图片无法读取：",
	imageUiImage: "图片",
	imageUiRemoteLink: "（远程链接）",
	imageUiZoomReset: "重置",
	imageUiClose: "关闭",
	imageUiCodexLegendA: "紫点 = 本插件渲染的 Grok Imagine 出图；本回合另有 ",
	imageUiCodexLegendB: " 张由 Codex（GPT Image）出图，卡片样式不同、不带紫点。",
	imageUiRegenerateText: "请用 grok_imagine 按以下提示词重新生成一张图，不要改写提示词：",
	imageUiEditIntro: "请用 grok_imagine_edit 再次编辑，",
	imageUiEditSources: "输入图沿用全部这些来源（第一张为 image，其余为 images）：",
	imageUiEditSourcesFallback: "输入图沿用上一条 grok_imagine_edit 调用的全部图片（image 和 images）",
	imageUiEditSettings: "。参数沿用：",
	imageUiEditKeepPrompt: "。不要改写提示词："
};
//#endregion
//#region src/video-config.ts
/** Opt-in video defaults shared by host configuration and settings presentation. */
/** Browser-safe shared route contract; no host imports are needed by the client. */
const GROK_VIDEO_FILE_PATH = "/plugins/dsh-grok-kit/video/file";
//#endregion
//#region src/client/video-view.tsx
/**
* Session result cards for the grok video tools (`grok_video_generate`,
* `grok_video_status`, `grok_video_resume`), plus the shared video-task
* contract parsers and lazy media resource that the settings video-task list
* reuses through {@link VideoMediaCard}.
*
* Safety rules baked into this module:
*   - two explicit user actions, both same-origin, both aborted on unmount:
*     `POST /plugins/dsh-grok-kit/video/resume` with `{ taskId }` (continues
*     waiting/downloading for an existing task — never creates one, never
*     regenerates, never polls on a timer) and `GET
*     /plugins/dsh-grok-kit/video/file?taskId=<uuid>` (bytes of one `done`
*     task of the signed-in account, size-checked before and after the read,
*     capped at MAX_VIDEO_DOWNLOAD_BYTES). No Range request and no extra
*     backend route: the player and the download button share ONE lazy
*     {@link VideoBlobResource} — bytes are fetched only after a user action,
*     simultaneous requests are merged into a single fetch, and every request
*     and object URL is aborted/revoked when the owner unmounts or the bound
*     task / account changes.
*   - no remote media URLs and no local path reads; the `<video>` element only
*     ever points at a blob object URL minted from those same-origin bytes,
*     with native `controls` and never autoplays (playback starts from the
*     user's click).
*   - the host session channel (`session.readAttachment`) resolves IMAGE
*     attachments only (verified against the host source: its lookup matches
*     `type === 'image'` blocks and then calls `attachments.readImage`), and a
*     `FileAttachmentRef` carries no media type — so that API is never used
*     here for video bytes; the full file reference is still printed as the
*     fallback when a download fails.
*
* Presentation (shared {@link MediaCardFrame}, same look as the imagine cards):
* the first view is media + specs + the state actions only. Technical ids,
* the full attachment reference, the prompt, ISO timestamps, the model and
* the copy-reference action live inside the collapsed `details` section — the
* initial view never dumps raw text. A settled `done` card never offers the
* resume action; `failed` and `submission-unknown` never offer any action
* that would POST again; "stop waiting" only cancels the local wait and keeps
* the billing notice.
*/
/**
* English fallback for the rare case that the locale service is not bound
* (tests, or a boot where the namespace was not registered). English — never a
* hardcoded Chinese string — so an English UI can never show Chinese errors.
*/
const FALLBACK_TRANSLATE$1 = (key) => en[key];
/** Host tool names this view occupies. */
const VIDEO_TOOL_NAMES = [
	"grok_video_generate",
	"grok_video_status",
	"grok_video_resume"
];
const RESUME_PATH = "/plugins/dsh-grok-kit/video/resume";
const VIDEO_TASK_STATES = [
	"pending",
	"downloading",
	"done",
	"failed",
	"interrupted",
	"submission-unknown"
];
function isObject$1(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isVideoTaskState(value) {
	return typeof value === "string" && VIDEO_TASK_STATES.includes(value);
}
/** Parse one task against the frozen contract; malformed tasks yield undefined. */
function parseVideoTask(value) {
	if (!isObject$1(value)) return void 0;
	const taskId = value["taskId"];
	const state = value["state"];
	if (typeof taskId !== "string" || taskId === "") return void 0;
	if (!isVideoTaskState(state)) return void 0;
	const rawAttachment = value["attachment"];
	const attachment = isObject$1(rawAttachment) && typeof rawAttachment["attachmentId"] === "string" && rawAttachment["attachmentId"] !== "" && typeof rawAttachment["name"] === "string" && typeof rawAttachment["bytes"] === "number" && Number.isFinite(rawAttachment["bytes"]) && rawAttachment["bytes"] >= 0 ? {
		attachmentId: rawAttachment["attachmentId"],
		name: rawAttachment["name"],
		bytes: rawAttachment["bytes"]
	} : void 0;
	return {
		taskId,
		state,
		model: typeof value["model"] === "string" ? value["model"] : "",
		createdAt: typeof value["createdAt"] === "string" ? value["createdAt"] : "",
		updatedAt: typeof value["updatedAt"] === "string" ? value["updatedAt"] : "",
		prompt: typeof value["prompt"] === "string" ? value["prompt"] : "",
		...typeof value["duration"] === "number" && Number.isFinite(value["duration"]) ? { duration: value["duration"] } : {},
		...typeof value["resolution"] === "string" ? { resolution: value["resolution"] } : {},
		...attachment === void 0 ? {} : { attachment },
		...typeof value["error"] === "string" && value["error"] !== "" ? { error: value["error"] } : {}
	};
}
/** Parse the `GET /video/tasks` payload (`{ tasks: [...] }`); throws when malformed. */
function parseVideoTasks(payload) {
	if (!isObject$1(payload) || !Array.isArray(payload["tasks"])) throw new Error("video task list is malformed");
	const tasks = [];
	for (const raw of payload["tasks"]) {
		const task = parseVideoTask(raw);
		if (task !== void 0) tasks.push(task);
	}
	return tasks;
}
/**
* Parse a `POST /video/resume` payload. The frozen contract returns the task
* itself; the `{ result: task }` wrapper is accepted only as a transitional
* shape while the host route lands.
*/
function parseResumePayload(value) {
	const direct = parseVideoTask(value);
	if (direct !== void 0) return direct;
	return isObject$1(value) ? parseVideoTask(value["result"]) : void 0;
}
function toolNameOf$1(block) {
	if (isObject$1(block)) {
		const name = isObject$1(block["call"]) ? block["call"]["name"] : block["name"];
		if (typeof name === "string" && VIDEO_TOOL_NAMES.includes(name)) return name;
	}
	return "grok_video_generate";
}
function rawArgs(block) {
	if (!isObject$1(block)) return void 0;
	const raw = "kind" in block && isObject$1(block["call"]) ? block["call"]["argsRaw"] : block["argsRaw"];
	return typeof raw === "string" && raw !== "" ? raw : void 0;
}
function argsOf$1(block) {
	const raw = rawArgs(block);
	if (raw === void 0) return void 0;
	try {
		const parsed = JSON.parse(raw);
		return isObject$1(parsed) ? parsed : void 0;
	} catch {
		return;
	}
}
/** Prompt from the call arguments (used by the pending and failure cards). */
function promptOf$1(block) {
	const prompt = argsOf$1(block)?.["prompt"];
	return typeof prompt === "string" ? prompt.trim() : "";
}
function textOf$1(block) {
	if (!isObject$1(block) || !Array.isArray(block["content"])) return "";
	const parts = [];
	for (const part of block["content"]) {
		if (!isObject$1(part)) continue;
		if (part.type === "text" && typeof part.text === "string" && part.text.trim() !== "") parts.push(part.text.trim());
	}
	return parts.join("\n\n");
}
/** The task result embedded in a settled tool result. */
function taskOf(block) {
	if (!isObject$1(block)) return void 0;
	const fromMeta = parseVideoTask(block["meta"]);
	if (fromMeta !== void 0) return fromMeta;
	if (Array.isArray(block["content"])) for (const part of block["content"]) {
		if (!isObject$1(part) || part.type !== "text" || typeof part.text !== "string") continue;
		try {
			const task = parseVideoTask(JSON.parse(part.text));
			if (task !== void 0) return task;
		} catch {}
	}
	return parseTaskSummary(textOf$1(block));
}
const TASK_SUMMARY = /Video task (\S+) is ([a-z-]+)(?: \(model ([^)]*)\))?/;
const ATTACHMENT_SUMMARY = /attachment=(\{[^{}]*\})/;
/**
* Last-resort parse of the host's prose summary. Only the fields stated
* verbatim in that sentence are extracted — nothing is guessed.
*/
function parseTaskSummary(text) {
	const summary = TASK_SUMMARY.exec(text);
	if (summary === null) return void 0;
	const attachmentMatch = ATTACHMENT_SUMMARY.exec(text);
	let attachment;
	if (attachmentMatch !== null) try {
		attachment = JSON.parse(attachmentMatch[1]);
	} catch {
		attachment = void 0;
	}
	return parseVideoTask({
		taskId: summary[1],
		state: summary[2],
		model: summary[3] ?? "",
		...attachment === void 0 ? {} : { attachment }
	});
}
/** File blocks in the result (`{ type: 'file', attachment }`), kept as refs. */
function fileAttachmentsOf(block) {
	if (!isObject$1(block) || !Array.isArray(block["content"])) return [];
	const refs = [];
	for (const part of block["content"]) {
		if (!isObject$1(part) || part.type !== "file") continue;
		const attachment = parseVideoTask({
			taskId: "ref",
			state: "done",
			attachment: part.attachment
		})?.attachment;
		if (attachment !== void 0) refs.push(attachment);
	}
	return refs;
}
/**
* All file references of one card, deduplicated by `attachmentId`: the
* structured task's attachment wins over a `file` block carrying the same id,
* and genuinely different attachments are all kept.
*/
function collectVideoAttachments(task, block) {
	const byId = /* @__PURE__ */ new Map();
	if (task?.attachment !== void 0) byId.set(task.attachment.attachmentId, task.attachment);
	for (const attachment of fileAttachmentsOf(block)) if (!byId.has(attachment.attachmentId)) byId.set(attachment.attachmentId, attachment);
	return [...byId.values()];
}
function formatBytes$1(bytes) {
	if (bytes < 1e3) return `${String(bytes)} B`;
	if (bytes < 1e6) return `${(bytes / 1e3).toFixed(bytes < 1e4 ? 1 : 0)} KB`;
	return `${(bytes / 1e6).toFixed(bytes < 1e7 ? 1 : 0)} MB`;
}
/**
* Same-origin byte route owned by the host plugin: `GET ?taskId=<uuid>`.
* It only serves `done` tasks of the signed-in account — no arbitrary path or
* attachment id is ever accepted by this client.
*/
const VIDEO_FILE_PATH = GROK_VIDEO_FILE_PATH;
/** Client-side ceiling; a larger reported size is refused before any request. */
const MAX_VIDEO_DOWNLOAD_BYTES = 104857600;
function videoFileUrl(taskId) {
	return `${VIDEO_FILE_PATH}?taskId=${encodeURIComponent(taskId)}`;
}
function guessVideoMediaType(name) {
	const lower = name.toLowerCase();
	if (lower.endsWith(".webm")) return "video/webm";
	if (lower.endsWith(".mov") || lower.endsWith(".qt")) return "video/quicktime";
	if (lower.endsWith(".mkv")) return "video/x-matroska";
	if (lower.endsWith(".gif")) return "image/gif";
	if (lower.endsWith(".mp4") || lower.endsWith(".m4v")) return "video/mp4";
	return "application/octet-stream";
}
function triggerDownload$1(url, name) {
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = name;
	anchor.rel = "noopener";
	document.body.append(anchor);
	try {
		anchor.click();
	} finally {
		anchor.remove();
	}
}
/** Read the body while refusing anything past `limit` (never buffers unbounded). */
async function readCapped(response, limit) {
	const body = response.body;
	if (body === null) throw new Error("response has no readable stream; download aborted");
	const reader = body.getReader();
	const chunks = [];
	let total = 0;
	for (;;) {
		const chunk = await reader.read();
		if (chunk.done) break;
		if (chunk.value === void 0) continue;
		total += chunk.value.byteLength;
		if (total > limit) {
			await reader.cancel().catch(() => void 0);
			throw new Error(`response exceeds the ${formatBytes$1(limit)} streaming cap`);
		}
		chunks.push(chunk.value);
	}
	const out = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return out;
}
/**
* Fetch one finished task's video file: size pre-check against the reported
* `attachment.bytes`, a hard 100 MiB read cap, and a length check on the bytes
* actually received. Rejects with a human-readable reason on any mismatch.
*/
async function fetchVideoFile(task, signal) {
	const attachment = task.attachment;
	if (attachment === void 0) throw new Error("attachment missing: the task has no stored file reference");
	if (task.state !== "done") throw new Error("only finished (done) tasks can be downloaded");
	if (attachment.bytes > 104857600) throw new Error(`file ${formatBytes$1(attachment.bytes)} exceeds the ${formatBytes$1(MAX_VIDEO_DOWNLOAD_BYTES)} client limit`);
	const response = await fetch(videoFileUrl(task.taskId), {
		method: "GET",
		credentials: "same-origin",
		headers: { accept: "application/octet-stream" },
		signal
	});
	if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
	const data = await readCapped(response, MAX_VIDEO_DOWNLOAD_BYTES);
	if (attachment.bytes > 0 && data.byteLength !== attachment.bytes) throw new Error(`length mismatch: expected ${String(attachment.bytes)} bytes, received ${String(data.byteLength)} bytes`);
	return new Blob([data], { type: guessVideoMediaType(attachment.name) });
}
/**
* One task's lazily fetched video bytes, shared by the player and the download
* button. Nothing is requested until `load()` (a user action); concurrent
* `load()` calls merge into a single fetch; `dispose()` aborts the in-flight
* request and revokes all object URLs (unmount, task switch, account switch).
* Disposing never poisons the resource: the owner that disposed it is gone or
* rebound, so a stray later `load()` simply starts over.
*/
function createVideoBlobResource(loader) {
	let inflight;
	let controller;
	let cached;
	let url;
	let generation = 0;
	const load = () => {
		if (cached !== void 0) return Promise.resolve(cached);
		if (inflight !== void 0) return inflight;
		const active = new AbortController();
		controller = active;
		const epoch = generation;
		const started = loader(active.signal).then((blob) => {
			active.signal.throwIfAborted();
			if (epoch !== generation) throw new DOMException("Media resource was disposed", "AbortError");
			cached = blob;
			inflight = void 0;
			return blob;
		}, (error) => {
			if (epoch === generation) inflight = void 0;
			throw error;
		});
		inflight = started;
		return started;
	};
	return {
		load,
		objectUrl: () => {
			if (cached === void 0) return void 0;
			if (url === void 0) url = URL.createObjectURL(cached);
			return url;
		},
		dispose: () => {
			generation += 1;
			controller?.abort();
			controller = void 0;
			inflight = void 0;
			cached = void 0;
			if (url !== void 0) {
				URL.revokeObjectURL(url);
				url = void 0;
			}
		}
	};
}
/**
* The {@link VideoBlobResource} bound to the current task: rebuilt (and the
* previous one disposed) when the task id changes, disposed again on unmount —
* which also covers an account switch, because the settings page remounts the
* account subtree with a fresh key. The loader always reads the *latest* task
* so a task that completes after the card mounted still downloads correctly.
*/
function useVideoBlobResource(task) {
	const holder = (0, react.useRef)(void 0);
	const latest = (0, react.useRef)(task);
	latest.current = task;
	const key = task?.taskId;
	if (key === void 0) {
		if (holder.current !== void 0) {
			holder.current.resource.dispose();
			holder.current = void 0;
		}
	} else if (holder.current?.key !== key) {
		holder.current?.resource.dispose();
		holder.current = {
			key,
			resource: createVideoBlobResource((signal) => {
				const current = latest.current;
				if (current === void 0) return Promise.reject(/* @__PURE__ */ new Error("no task is bound to the media resource"));
				return fetchVideoFile(current, signal);
			})
		};
	}
	const resource = key === void 0 ? void 0 : holder.current?.resource;
	(0, react.useEffect)(() => () => {
		resource?.dispose();
	}, [resource]);
	return resource;
}
const rowStyle$1 = {
	display: "flex",
	alignItems: "baseline",
	gap: 8,
	flexWrap: "wrap",
	minWidth: 0
};
const labelStyle$1 = {
	...mediaCardStyles.muted,
	flex: "0 0 auto"
};
const valueStyle = {
	fontFamily: "var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)",
	fontSize: 12,
	overflowWrap: "anywhere",
	minWidth: 0
};
const TASK_STATE_TONE = {
	pending: "busy",
	downloading: "busy",
	done: "success",
	failed: "error",
	interrupted: "neutral",
	"submission-unknown": "neutral"
};
/** Task state label from the shared settings locale (zh/en, no hardcoded copy). */
function taskStateLabel(t, state) {
	switch (state) {
		case "pending": return t("taskStatePending");
		case "downloading": return t("taskStateDownloading");
		case "done": return t("taskStateDone");
		case "failed": return t("taskStateFailed");
		case "interrupted": return t("taskStateInterrupted");
		case "submission-unknown": return t("taskStateSubmissionUnknown");
		case void 0: return t("videoCardStateUnknown");
		default: return t("videoCardStateUnknown");
	}
}
/** Pending card title for the tool currently running. */
function pendingTitle(t, name) {
	switch (name) {
		case "grok_video_status": return t("videoCardPendingStatus");
		case "grok_video_resume": return t("videoCardPendingResume");
		case "grok_video_generate": return t("videoCardPendingGenerate");
		default: return t("videoCardPendingGenerate");
	}
}
const SOURCE_LABEL$1 = "Grok Video";
function ActionButton$1({ t, label, onClick, disabled, primary }) {
	const [state, setState] = (0, react.useState)("idle");
	const alive = (0, react.useRef)(true);
	(0, react.useEffect)(() => {
		alive.current = true;
		return () => {
			alive.current = false;
		};
	}, []);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
		type: "button",
		style: {
			...mediaCardStyles.action,
			...primary === true ? mediaCardStyles.primaryAction : {}
		},
		disabled: disabled === true || state === "pending",
		"aria-busy": state === "pending",
		onClick: () => {
			if (state === "pending" || disabled === true) return;
			setState("pending");
			Promise.resolve().then(onClick).then(() => {
				if (alive.current) setState("idle");
			}).catch(() => {
				if (alive.current) setState("failed");
			});
		},
		children: state === "pending" ? t("working") : state === "failed" ? t("actionFailed") : label
	});
}
function DetailRow({ label, value }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		style: rowStyle$1,
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
			style: labelStyle$1,
			children: label
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
			style: valueStyle,
			children: value
		})]
	});
}
function PromptDetail({ title, text }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		style: {
			display: "grid",
			gap: 6
		},
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
			style: {
				fontSize: 12,
				fontWeight: 600
			},
			children: title
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
			style: mediaCardStyles.prompt,
			children: text
		})]
	});
}
/** One file reference block (name / size / id / full ref / copy action). */
function AttachmentDetail({ attachment, t }) {
	const [copied, setCopied] = (0, react.useState)("idle");
	(0, react.useEffect)(() => {
		if (copied === "idle") return;
		const timer = window.setTimeout(() => {
			setCopied("idle");
		}, 2e3);
		return () => {
			window.clearTimeout(timer);
		};
	}, [copied]);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		"data-testid": "grok-video-attachment-ref",
		"aria-label": t("videoCardAriaFileRef"),
		style: {
			display: "grid",
			gap: 6
		},
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
				style: {
					fontSize: 12,
					fontWeight: 600
				},
				children: t("videoCardFile")
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: rowStyle$1,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: labelStyle$1,
						children: t("videoCardFileName")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: valueStyle,
						children: attachment.name
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: labelStyle$1,
						children: t("videoCardFileSize")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: valueStyle,
						children: formatBytes$1(attachment.bytes)
					})
				]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(DetailRow, {
				label: "attachmentId",
				value: attachment.attachmentId
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(DetailRow, {
				label: t("videoAttachmentRef"),
				value: JSON.stringify(attachment)
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionButton$1, {
				t,
				label: copied === "ok" ? t("videoCardCopied") : copied === "fail" ? t("videoCardCopyFailed") : t("videoCardCopyRef"),
				onClick: async () => {
					try {
						await navigator.clipboard.writeText(JSON.stringify(attachment));
						setCopied("ok");
					} catch {
						setCopied("fail");
						throw new Error("clipboard unavailable");
					}
				}
			}) }),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				style: labelStyle$1,
				children: t("videoCardRefNote")
			})
		]
	});
}
/** Pending (unsettled) call: media slot + local stop with the billing note. */
function VideoPendingCard({ block, sessionId, sessions, t: translate }) {
	const t = translate ?? FALLBACK_TRANSLATE$1;
	const prompt = promptOf$1(block);
	const canCancel = typeof sessionId === "string" && typeof sessions?.binding === "function";
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MediaCardFrame, {
		testId: "grok-video-pending",
		ariaLabel: t("videoCardAriaRunning"),
		title: SOURCE_LABEL$1,
		status: pendingTitle(t, toolNameOf$1(block)),
		statusTone: "busy",
		summary: prompt === "" ? t("videoCardReceivingArgs") : void 0,
		preview: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
			style: mediaCardStyles.preview,
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("progress", { style: {
				width: "100%",
				height: 4
			} })
		}),
		actions: canCancel ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionButton$1, {
			t,
			label: t("videoCardStopWaiting"),
			onClick: async () => {
				if ((await sessions.binding(sessionId)?.session?.cancel?.())?.ok !== true) throw new Error("cancel failed");
			}
		}) : void 0,
		notice: t("resumeHint"),
		detailsLabel: t("videoUiDetails"),
		details: prompt === "" ? void 0 : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PromptDetail, {
			title: t("videoCardPrompt"),
			text: prompt
		})
	});
}
/** Errored call: keep the host error visible and the prompt folded away. */
function VideoFailureCard({ block, t: translate }) {
	const t = translate ?? FALLBACK_TRANSLATE$1;
	const prompt = promptOf$1(block);
	const text = textOf$1(block);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MediaCardFrame, {
		testId: "grok-video-failure",
		ariaLabel: t("videoCardFailureTitle"),
		title: SOURCE_LABEL$1,
		status: t("videoCardFailureTitle"),
		statusTone: "error",
		notice: text === "" ? void 0 : text,
		detailsLabel: t("videoUiDetails"),
		details: prompt === "" ? void 0 : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PromptDetail, {
			title: t("videoCardPrompt"),
			text: prompt
		})
	});
}
/**
* The one media-first card shared by the session toolview and the settings
* video-task list: media + specs + state actions in the first view; ids, full
* ref, prompt, model and ISO times folded into `details`.
*
* State actions: `done` → play + download (download is the primary action, no
* resume ever); `pending` / `downloading` → query; `interrupted` → resume;
* `failed` / `submission-unknown` → nothing that could POST again.
*/
function VideoMediaCard({ block, task: reported, t: translate, resetToken, continueEnabled = true, testId }) {
	const t = translate ?? FALLBACK_TRANSLATE$1;
	const [override, setOverride] = (0, react.useState)(void 0);
	const [continueState, setContinueState] = (0, react.useState)("idle");
	const [playing, setPlaying] = (0, react.useState)(false);
	const [blobState, setBlobState] = (0, react.useState)("idle");
	const [blobError, setBlobError] = (0, react.useState)(void 0);
	const [downloaded, setDownloaded] = (0, react.useState)(false);
	const abort = (0, react.useRef)(void 0);
	const mounted = (0, react.useRef)(true);
	const playbackStarted = (0, react.useRef)(false);
	(0, react.useEffect)(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
			abort.current?.abort();
		};
	}, []);
	(0, react.useEffect)(() => {
		abort.current?.abort();
		setOverride(void 0);
		setContinueState("idle");
	}, [resetToken, reported?.taskId]);
	(0, react.useEffect)(() => {
		playbackStarted.current = false;
		setPlaying(false);
		setBlobState("idle");
		setBlobError(void 0);
		setDownloaded(false);
	}, [reported?.taskId]);
	const task = override ?? reported;
	const resource = useVideoBlobResource(task);
	const boundTaskId = (0, react.useRef)(task?.taskId);
	boundTaskId.current = task?.taskId;
	const attachments = collectVideoAttachments(task, block);
	const resultText = textOf$1(block);
	const prompt = task?.prompt !== void 0 && task.prompt !== "" ? task.prompt : promptOf$1(block);
	if (task === void 0 && attachments.length === 0 && resultText === "") return null;
	const attachment = attachments[0];
	const canPlay = task?.state === "done" && attachment !== void 0;
	const canContinue = task !== void 0 && (task.state === "pending" || task.state === "downloading" || task.state === "interrupted");
	const stateLabel = taskStateLabel(t, task?.state);
	/** The bound task must still be the one this card renders. */
	const stillBound = (boundId) => mounted.current && boundTaskId.current === boundId;
	const loadMedia = async () => {
		if (resource === void 0 || blobState === "busy") return;
		const boundId = task?.taskId;
		setBlobState("busy");
		setBlobError(void 0);
		try {
			await resource.load();
			if (!stillBound(boundId)) return;
			setPlaying(true);
			setBlobState("idle");
		} catch (error) {
			if (!stillBound(boundId)) return;
			setBlobError(error instanceof Error ? error.message : String(error));
			setBlobState("error");
		}
	};
	const download = async () => {
		if (resource === void 0 || task === void 0 || blobState === "busy") return;
		const boundId = task.taskId;
		setBlobState("busy");
		setBlobError(void 0);
		try {
			await resource.load();
			if (!stillBound(boundId)) return;
			const url = resource.objectUrl();
			if (url !== void 0) triggerDownload$1(url, task.attachment?.name ?? `grok-video-${task.taskId}`);
			setDownloaded(true);
			setBlobState("idle");
		} catch (error) {
			if (!stillBound(boundId)) return;
			setBlobError(error instanceof Error ? error.message : String(error));
			setBlobState("error");
		}
	};
	/** Query/resume: `POST /video/resume` for one existing task — never a new one. */
	const continueTask = async () => {
		if (task === void 0 || continueState === "busy" || !continueEnabled) return;
		abort.current?.abort();
		const controller = new AbortController();
		abort.current = controller;
		setContinueState("busy");
		try {
			const response = await fetch(RESUME_PATH, {
				method: "POST",
				headers: {
					accept: "application/json",
					"content-type": "application/json"
				},
				credentials: "same-origin",
				body: JSON.stringify({ taskId: task.taskId }),
				signal: controller.signal
			});
			const value = await response.json().catch(() => void 0);
			if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
			const updated = parseResumePayload(value);
			if (controller.signal.aborted || !mounted.current || abort.current !== controller) return;
			if (updated !== void 0) setOverride(updated);
			setContinueState("done");
		} catch {
			if (controller.signal.aborted || !mounted.current) return;
			setContinueState("error");
		}
	};
	let preview;
	if (canPlay) {
		const url = resource?.objectUrl();
		preview = playing && url !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("video", {
			controls: true,
			playsInline: true,
			preload: "metadata",
			src: url,
			"data-testid": "grok-video-player",
			"aria-label": t("videoCardAriaResult"),
			ref: (element) => {
				if (element !== null && !playbackStarted.current) {
					playbackStarted.current = true;
					element.play().catch(() => void 0);
				}
			},
			style: {
				display: "block",
				width: "100%",
				maxHeight: 380,
				borderRadius: 12,
				background: "var(--dsw-alias-bg-base)"
			}
		}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
			type: "button",
			"data-testid": "grok-video-preview",
			"aria-label": t("videoUiPlay"),
			title: t("videoUiLoadVideo"),
			disabled: blobState === "busy",
			onClick: () => {
				loadMedia();
			},
			style: {
				...mediaCardStyles.preview,
				width: "100%",
				cursor: "pointer",
				font: "inherit"
			},
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				"aria-hidden": true,
				style: {
					fontSize: 26,
					lineHeight: 1
				},
				children: "▶"
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				style: mediaCardStyles.muted,
				children: blobState === "busy" ? t("videoUiLoading") : t("videoUiPlay")
			})]
		});
	} else if (task?.state === "pending" || task?.state === "downloading") preview = /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		style: mediaCardStyles.preview,
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("progress", { style: {
			width: "100%",
			height: 4
		} })
	});
	else preview = /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		style: mediaCardStyles.preview,
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
			style: mediaCardStyles.muted,
			children: stateLabel
		})
	});
	const summaryParts = [];
	if (task?.resolution !== void 0) summaryParts.push(task.resolution);
	if (task?.duration !== void 0) summaryParts.push(`${String(task.duration)}s`);
	for (const ref of attachments) summaryParts.push(`${ref.name} · ${formatBytes$1(ref.bytes)}`);
	const summary = summaryParts.length === 0 ? void 0 : summaryParts.map((part, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: part }, `${String(index)}:${part}`));
	const actions = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [canPlay ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionButton$1, {
		t,
		primary: true,
		label: blobState === "busy" ? t("videoDownloadBusy") : downloaded ? t("videoCardRedownload") : t("videoDownload"),
		onClick: download
	}) }) : null, canContinue && task !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionButton$1, {
		t,
		label: task.state === "interrupted" ? t("videoUiResume") : t("videoUiQuery"),
		onClick: continueTask,
		disabled: !continueEnabled
	}) : null] });
	const notice = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
		task?.error !== void 0 && (task.state === "failed" || task.state === "interrupted" || task.state === "submission-unknown") ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
			style: { color: "var(--dsw-alias-state-error-primary)" },
			children: task.error
		}) : null,
		blobError === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
			style: { color: "var(--dsw-alias-state-error-primary)" },
			children: `${t("videoDownloadFailed")} ${blobError}`
		}),
		continueState === "done" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
			style: { color: "var(--dsw-alias-state-success-primary)" },
			children: t("videoCardResumeDone")
		}) : null,
		continueState === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
			style: { color: "var(--dsw-alias-state-error-primary)" },
			children: t("videoCardResumeFailed")
		}) : null
	] });
	const details = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
		prompt === "" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PromptDetail, {
			title: t("videoCardPrompt"),
			text: prompt
		}),
		task === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DetailRow, {
			label: "taskId",
			value: task.taskId
		}),
		task?.model === void 0 || task.model === "" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DetailRow, {
			label: t("videoCardModel"),
			value: task.model
		}),
		task?.createdAt === void 0 || task.createdAt === "" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DetailRow, {
			label: t("videoCardCreated"),
			value: task.createdAt
		}),
		task?.updatedAt === void 0 || task.updatedAt === "" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DetailRow, {
			label: t("videoCardUpdated"),
			value: task.updatedAt
		}),
		resultText === "" || task !== void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PromptDetail, {
			title: t("videoCardResult"),
			text: resultText
		}),
		attachments.map((ref) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AttachmentDetail, {
			attachment: ref,
			t
		}, ref.attachmentId)),
		task === void 0 && attachments.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
			style: labelStyle$1,
			children: t("videoCardFileOnly")
		}) : null,
		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
			style: labelStyle$1,
			children: t("resumeHint")
		}),
		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
			style: labelStyle$1,
			children: t("videoCardDownloadNote")
		})
	] });
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MediaCardFrame, {
		testId: testId ?? "grok-video-result",
		ariaLabel: t("videoCardAriaResult"),
		title: SOURCE_LABEL$1,
		status: stateLabel,
		statusTone: task === void 0 ? "neutral" : TASK_STATE_TONE[task.state],
		summary,
		preview,
		actions: canPlay || canContinue ? actions : void 0,
		notice: blobError !== void 0 || continueState === "done" || continueState === "error" || task?.error !== void 0 && (task.state === "failed" || task.state === "interrupted" || task.state === "submission-unknown") ? notice : void 0,
		detailsLabel: t("videoUiDetails"),
		details
	});
}
function GrokVideoToolView(rawProps) {
	const props = rawProps.owner !== void 0 ? {
		...rawProps,
		block: rawProps.owner.block
	} : rawProps;
	if (!(isObject$1(props.block) && "kind" in props.block)) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(VideoPendingCard, { ...props });
	if (props.block.isError === true) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(VideoFailureCard, { ...props });
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(VideoMediaCard, {
		block: props.block,
		task: taskOf(props.block),
		t: props.t
	});
}
/**
* Register the toolview occupant for all three grok video tools. Called from
* the client entry; the registrations live in a `sessions` child fiber so they
* unload with it (same shape as `applyImagineViews`).
*
* The translator is bound from the plugin's existing settings locale namespace
* (`settings.xai-oauth`, registered with zh + en by the client entry) so the
* cards follow the host language. If the locale service is not available the
* views fall back to the English copy — never to hardcoded Chinese.
*/
function applyVideoViews(ctx) {
	const t = typeof ctx.locale?.bind === "function" ? ctx.locale.bind("settings.xai-oauth") : FALLBACK_TRANSLATE$1;
	ctx.inject(["sessions"], (scope) => {
		const sessions = scope.sessions;
		for (const key of VIDEO_TOOL_NAMES) scope.slots.inject("tool.call.toolview", () => scope.slots.register({
			name: "tool.call.toolview",
			key,
			inject: () => ({
				sessions,
				t
			})
		}, GrokVideoToolView));
	});
}
//#endregion
//#region src/client/capabilities-view.tsx
/**
* Capability snapshot and local video task panels for the xAI Grok settings
* page (`XaiSettings` embeds {@link CapabilitiesView}).
*
* Contract rules honoured here:
*   - reads only the frozen same-origin routes: `GET
*     /plugins/dsh-grok-kit/capabilities` and `GET
*     /plugins/dsh-grok-kit/video/tasks`; the query/resume and file-byte
*     actions live inside the shared {@link VideoMediaCard} (same card, same
*     visuals and the same state actions as the session toolview — the old
*     debug-style row dump is gone);
*   - no automatic probing, no timer polling of the upstream, no invented
*     quota numbers. The snapshot payload still parses its `quota` field so
*     the wire contract stays frozen, but nothing renders it here any more:
*     the account page's own `QuotaView` owns the quota reading;
*   - loading and error states are real, and every fetch is aborted when the
*     component unmounts;
*   - signed-out viewers receive the shape with all features `unverified`
*     (the host clears its records on sign-out). The panel is remounted by the
*     settings page on every account change (`key` = account status +
*     generation, bumped by sign-in / import / sign-out), which aborts its
*     in-flight requests, revokes any blob URL and drops every task row — so
*     one account's tasks or diagnostics are never rendered for the next.
*     The task list is not mounted at all while signed out.
*/
const CAPABILITIES_PATH = "/plugins/dsh-grok-kit/capabilities";
const VIDEO_TASKS_PATH = "/plugins/dsh-grok-kit/video/tasks";
const FEATURE_IDS = [
	"video",
	"voice",
	"code",
	"image-generation"
];
const FEATURE_STATES = [
	"unverified",
	"available",
	"restricted",
	"temporary-error"
];
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** Parse the frozen snapshot payload; throws on a structurally wrong body. */
function parseCapabilitySnapshot(value) {
	if (!isRecord(value)) throw new Error("capability snapshot is not an object");
	const rawFeatures = value["features"];
	if (!Array.isArray(rawFeatures)) throw new Error("capability snapshot has no feature list");
	const features = [];
	for (const raw of rawFeatures) {
		if (!isRecord(raw)) continue;
		const id = raw["id"];
		const state = raw["state"];
		if (typeof id !== "string" || !FEATURE_IDS.includes(id)) continue;
		if (typeof state !== "string" || !FEATURE_STATES.includes(state)) continue;
		features.push({
			id,
			state,
			...typeof raw["checkedAt"] === "string" ? { checkedAt: raw["checkedAt"] } : {},
			...typeof raw["model"] === "string" ? { model: raw["model"] } : {},
			...typeof raw["httpStatus"] === "number" && Number.isInteger(raw["httpStatus"]) ? { httpStatus: raw["httpStatus"] } : {},
			...typeof raw["message"] === "string" && raw["message"] !== "" ? { message: raw["message"] } : {}
		});
	}
	const quota = isRecord(value["quota"]) ? value["quota"] : void 0;
	return {
		features,
		quota: {
			state: "unavailable",
			message: typeof quota?.["message"] === "string" ? quota["message"] : ""
		},
		videoEnabled: value["videoEnabled"] === true
	};
}
async function requestJson(path, init, signal) {
	const headers = { accept: "application/json" };
	const request = {
		method: init.method ?? "GET",
		credentials: "same-origin",
		headers,
		signal
	};
	if (init.body !== void 0) {
		headers["content-type"] = "application/json";
		request.body = JSON.stringify(init.body);
	}
	const response = await fetch(path, request);
	const value = await response.json().catch(() => void 0);
	if (!response.ok) {
		const detail = isRecord(value) && typeof value["error"] === "string" ? `: ${value["error"]}` : "";
		throw new Error(`HTTP ${String(response.status)}${detail}`);
	}
	return value;
}
function errorDetail(error) {
	return error instanceof Error ? error.message : "";
}
const cardStyle = {
	display: "flex",
	flexDirection: "column",
	gap: 18,
	padding: 22,
	border: "1px solid var(--gk-line, var(--dsw-alias-border-l2, #e5e5e5))",
	borderRadius: 20,
	background: "var(--gk-surface, var(--dsw-alias-bg-module-platform, #fff))"
};
const titleStyle = {
	margin: 0,
	fontSize: 15,
	fontWeight: 600,
	color: "var(--gk-text, var(--dsw-alias-label-primary, #171717))"
};
const bodyStyle = {
	margin: 0,
	fontSize: 13,
	lineHeight: "21px",
	color: "var(--gk-muted, var(--dsw-alias-label-secondary, #666))"
};
const hintStyle = {
	...bodyStyle,
	fontSize: 12
};
const errorStyle = {
	...bodyStyle,
	color: "var(--gk-danger, var(--dsw-alias-state-error-primary, #c13b36))",
	overflowWrap: "anywhere"
};
const rowStyle = {
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
	flexWrap: "wrap",
	gap: 12
};
const listStyle = {
	display: "flex",
	flexDirection: "column",
	gap: 12,
	margin: 0,
	padding: 0,
	listStyle: "none"
};
const buttonStyle = {
	boxSizing: "border-box",
	minHeight: 34,
	padding: "6px 14px",
	border: "1px solid var(--gk-line, var(--dsw-alias-border-l2, #e5e5e5))",
	borderRadius: 999,
	background: "var(--gk-surface, var(--dsw-alias-bg-layer-1, #fff))",
	color: "var(--gk-text, var(--dsw-alias-label-primary, #171717))",
	font: "inherit",
	fontSize: 12,
	cursor: "pointer"
};
const badgeStyle = {
	display: "inline-flex",
	alignItems: "center",
	gap: 7,
	fontSize: 12,
	fontWeight: 500,
	color: "var(--gk-muted, var(--dsw-alias-label-secondary, #666))",
	whiteSpace: "nowrap"
};
const itemStyle = {
	display: "flex",
	flexDirection: "column",
	gap: 8,
	padding: "16px",
	minWidth: 0
};
const labelStyle = {
	fontSize: 11,
	lineHeight: "18px",
	color: "var(--gk-muted, var(--dsw-alias-label-tertiary, #81858c))",
	overflowWrap: "anywhere"
};
const dotStyle$1 = {
	width: 6,
	height: 6,
	borderRadius: "50%",
	background: "currentColor",
	flexShrink: 0
};
const emptyStyle = {
	...bodyStyle,
	padding: "20px 16px",
	borderRadius: 14,
	background: "var(--gk-soft, var(--dsw-alias-bg-layer-1, #f5f5f5))"
};
const STATE_TONE = {
	unverified: "var(--gk-muted, var(--dsw-alias-label-tertiary, #81858c))",
	available: "var(--gk-success, var(--dsw-alias-state-success-primary, #21865a))",
	restricted: "var(--gk-danger, var(--dsw-alias-state-error-primary, #c13b36))",
	"temporary-error": "var(--gk-danger, var(--dsw-alias-state-error-primary, #c13b36))"
};
/**
* Local video task list: one read per mount/refresh. Each row renders the same
* {@link VideoMediaCard} as the session toolview (query/resume/download/play
* actions included), keyed by `resetToken` so a refreshed list wins over a
* locally applied query/resume result.
*/
function VideoTasksView({ t, videoEnabled }) {
	const [status, setStatus] = (0, react.useState)({ kind: videoEnabled ? "loading" : "disabled" });
	const [reloadKey, setReloadKey] = (0, react.useState)(0);
	(0, react.useEffect)(() => {
		if (!videoEnabled) {
			setStatus({ kind: "disabled" });
			return;
		}
		const abort = new AbortController();
		let live = true;
		setStatus({ kind: "loading" });
		requestJson(VIDEO_TASKS_PATH, {}, abort.signal).then((value) => parseVideoTasks(value)).then((tasks) => {
			if (live) setStatus({
				kind: "ready",
				tasks
			});
		}).catch((error) => {
			if (!live || abort.signal.aborted) return;
			setStatus({
				kind: "error",
				detail: errorDetail(error)
			});
		});
		return () => {
			live = false;
			abort.abort();
		};
	}, [reloadKey, videoEnabled]);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
		"aria-label": t("videoTasksTitle"),
		"aria-busy": videoEnabled && status.kind === "loading",
		style: {
			display: "flex",
			flexDirection: "column",
			gap: 12,
			borderTop: "1px solid var(--gk-line, var(--dsw-alias-border-l2, #e5e5e5))",
			paddingTop: 20,
			minWidth: 0
		},
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: rowStyle,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", {
					className: "gk-title",
					style: {
						...titleStyle,
						fontSize: 14
					},
					children: t("videoTasksTitle")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					className: "gk-button",
					type: "button",
					style: buttonStyle,
					disabled: !videoEnabled || status.kind === "loading",
					onClick: () => {
						if (videoEnabled) setReloadKey((key) => key + 1);
					},
					children: t("videoTasksRefresh")
				})]
			}),
			videoEnabled ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				style: hintStyle,
				children: t("videoTasksIntro")
			}) : null,
			videoEnabled ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "gk-empty",
				style: emptyStyle,
				children: t("videoTasksDisabled")
			}),
			videoEnabled ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				style: hintStyle,
				children: t("resumeHint")
			}) : null,
			videoEnabled && status.kind === "loading" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				role: "status",
				style: emptyStyle,
				children: t("videoTasksLoading")
			}) : null,
			videoEnabled && status.kind === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				style: errorStyle,
				children: t("videoTasksError")
			}), status.detail === "" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				style: errorStyle,
				children: status.detail
			})] }) : null,
			videoEnabled && status.kind === "ready" && status.tasks.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "gk-empty",
				style: emptyStyle,
				children: t("videoTasksEmpty")
			}) : null,
			videoEnabled && status.kind === "ready" && status.tasks.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
				style: listStyle,
				children: status.tasks.map((task) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", {
					style: { listStyle: "none" },
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(VideoMediaCard, {
						task,
						t,
						resetToken: task,
						continueEnabled: videoEnabled,
						testId: "grok-video-task"
					})
				}, task.taskId))
			}) : null
		]
	});
}
function featureLabel(t, id) {
	switch (id) {
		case "video": return t("featureVideo");
		case "voice": return t("featureVoice");
		case "code": return t("featureCode");
		case "image-generation": return t("featureImageGeneration");
		default: return t("featureImageGeneration");
	}
}
function featureStateLabel(t, state) {
	switch (state) {
		case "available": return t("stateAvailable");
		case "restricted": return t("stateRestricted");
		case "temporary-error": return t("stateTemporaryError");
		case "unverified": return t("stateUnverified");
		default: return t("stateUnverified");
	}
}
/**
* Capability panel: features, the video gate and the local video task list.
* One read on mount plus explicit refresh — no polling. Mounted only while its
* page is active, so re-entering the page re-reads the host's local record.
*/
function CapabilitiesView({ t, signedIn }) {
	const [status, setStatus] = (0, react.useState)({ kind: "loading" });
	const [reloadKey, setReloadKey] = (0, react.useState)(0);
	(0, react.useEffect)(() => {
		const abort = new AbortController();
		let live = true;
		setStatus({ kind: "loading" });
		requestJson(CAPABILITIES_PATH, {}, abort.signal).then((value) => parseCapabilitySnapshot(value)).then((data) => {
			if (live) setStatus({
				kind: "ready",
				data
			});
		}).catch((error) => {
			if (!live || abort.signal.aborted) return;
			setStatus({
				kind: "error",
				detail: errorDetail(error)
			});
		});
		return () => {
			live = false;
			abort.abort();
		};
	}, [reloadKey]);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
		className: "gk-panel",
		"aria-labelledby": "grok-capabilities-title",
		"aria-busy": status.kind === "loading",
		style: cardStyle,
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: rowStyle,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
					className: "gk-title",
					id: "grok-capabilities-title",
					style: titleStyle,
					children: t("capabilitiesTitle")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					className: "gk-button",
					type: "button",
					style: buttonStyle,
					disabled: status.kind === "loading",
					onClick: () => {
						setReloadKey((key) => key + 1);
					},
					children: t("capabilitiesRefresh")
				})]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				style: bodyStyle,
				children: t("capabilitiesIntro")
			}),
			status.kind === "loading" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				role: "status",
				style: emptyStyle,
				children: t("capabilitiesLoading")
			}) : null,
			status.kind === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				style: errorStyle,
				children: t("capabilitiesError")
			}), status.detail === "" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				style: errorStyle,
				children: status.detail
			})] }) : null,
			status.kind === "ready" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						...rowStyle,
						padding: "12px 16px",
						borderRadius: 14,
						background: "var(--gk-soft, var(--dsw-alias-bg-layer-1, #f5f5f5))"
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: "gk-status",
						style: {
							...badgeStyle,
							color: status.data.videoEnabled ? STATE_TONE.available : STATE_TONE.unverified
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							"aria-hidden": "true",
							style: dotStyle$1
						}), status.data.videoEnabled ? t("videoOn") : t("videoOff")]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: hintStyle,
						children: t("videoRestartHint")
					})]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
					style: {
						...listStyle,
						gap: 0,
						border: "1px solid var(--gk-line, var(--dsw-alias-border-l2, #e5e5e5))",
						borderRadius: 14,
						overflow: "hidden"
					},
					children: status.data.features.map((feature, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
						style: {
							...itemStyle,
							...index > 0 ? { borderTop: "1px solid var(--gk-line, var(--dsw-alias-border-l2, #e5e5e5))" } : {}
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: rowStyle,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										fontSize: 13,
										fontWeight: 500,
										color: "var(--gk-text, var(--dsw-alias-label-primary, #171717))"
									},
									children: featureLabel(t, feature.id)
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: "gk-status",
									style: {
										...badgeStyle,
										color: STATE_TONE[feature.state]
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										"aria-hidden": "true",
										style: dotStyle$1
									}), featureStateLabel(t, feature.state)]
								})]
							}),
							feature.checkedAt === void 0 && feature.model === void 0 && feature.httpStatus === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									display: "flex",
									flexWrap: "wrap",
									gap: "4px 16px",
									fontFamily: "Bahnschrift, Consolas, monospace",
									fontVariantNumeric: "tabular-nums"
								},
								children: [
									feature.checkedAt === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: labelStyle,
										children: `${t("capabilityCheckedAt")}: ${feature.checkedAt}`
									}),
									feature.model === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: labelStyle,
										children: `${t("capabilityModel")}: ${feature.model}`
									}),
									feature.httpStatus === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: labelStyle,
										children: `${t("capabilityHttp")}: ${String(feature.httpStatus)}`
									})
								]
							}),
							feature.message === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: {
									...bodyStyle,
									fontSize: 13,
									margin: 0,
									overflowWrap: "anywhere"
								},
								children: feature.message
							})
						]
					}, feature.id))
				}),
				signedIn ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(VideoTasksView, {
					t,
					videoEnabled: status.data.videoEnabled
				}) : null
			] }) : null
		]
	});
}
//#endregion
//#region src/client/quota-view.tsx
/** Account-only subscription quota. No credentials or upstream URLs enter the browser. */
const QUOTA_PATH = "/plugins/dsh-grok-kit/quota";
function record(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function timestamp(value) {
	return typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : void 0;
}
/** Whitelist the public contract, never render arbitrary error text or response fields. */
function parseQuotaSnapshot(value) {
	if (!record(value)) throw new Error("Invalid quota snapshot");
	if (value.state === "signed-out" || value.state === "unavailable" || value.state === "error") {
		const reason = value.reason;
		return {
			state: value.state,
			...reason === "auth" || reason === "restricted" || reason === "temporary" || reason === "invalid" ? { reason } : {}
		};
	}
	const checkedAt = timestamp(value.checkedAt);
	if (value.state !== "available" && value.state !== "partial" || checkedAt === void 0 || value.period !== "week" && value.period !== "month" && value.period !== "subscription") throw new Error("Invalid quota snapshot");
	const resetAt = timestamp(value.resetAt);
	const details = {
		period: value.period,
		checkedAt,
		...resetAt === void 0 ? {} : { resetAt },
		...typeof value.plan === "string" && value.plan.trim() !== "" ? { plan: value.plan.slice(0, 100) } : {},
		...typeof value.prepaidBalanceUsd === "number" && Number.isFinite(value.prepaidBalanceUsd) && value.prepaidBalanceUsd >= 0 ? { prepaidBalanceUsd: value.prepaidBalanceUsd } : {},
		...typeof value.unifiedBilling === "boolean" ? { unifiedBilling: value.unifiedBilling } : {}
	};
	if (value.state === "partial") return {
		...details,
		state: "partial"
	};
	const used = value.usedPercent;
	const remaining = value.remainingPercent;
	if (typeof used !== "number" || !Number.isFinite(used) || used < 0 || used > 100 || typeof remaining !== "number" || !Number.isFinite(remaining) || remaining < 0 || remaining > 100 || Math.abs(used + remaining - 100) > .001) throw new Error("Invalid quota snapshot");
	return {
		...details,
		state: "available",
		usedPercent: used,
		remainingPercent: remaining
	};
}
const card = {
	display: "flex",
	flexDirection: "column",
	gap: 18,
	padding: "22px",
	border: "1px solid var(--gk-line, var(--dsw-alias-border-l2, #e5e5e5))",
	borderRadius: 20,
	background: "var(--gk-surface, var(--dsw-alias-bg-module-platform, #fff))"
};
const body = {
	margin: 0,
	fontSize: 13,
	lineHeight: "21px",
	color: "var(--gk-muted, var(--dsw-alias-label-secondary, #666))"
};
const button = {
	minHeight: 34,
	padding: "6px 14px",
	border: "1px solid var(--gk-line, var(--dsw-alias-border-l2, #e5e5e5))",
	borderRadius: 999,
	background: "var(--gk-surface, var(--dsw-alias-bg-layer-1, #fff))",
	color: "var(--gk-text, var(--dsw-alias-label-primary, #171717))",
	font: "inherit",
	fontSize: 12,
	cursor: "pointer"
};
const row = {
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
	flexWrap: "wrap",
	gap: 10
};
const numeric = {
	fontFamily: "Bahnschrift, Consolas, monospace",
	fontVariantNumeric: "tabular-nums",
	fontWeight: 500
};
const screenReader = {
	position: "absolute",
	width: 1,
	height: 1,
	padding: 0,
	margin: -1,
	overflow: "hidden",
	clipPath: "inset(50%)",
	whiteSpace: "nowrap",
	border: 0
};
const detail = {
	display: "flex",
	flexDirection: "column",
	gap: 5,
	minWidth: 0
};
const detailValue = {
	margin: 0,
	color: "var(--gk-text, var(--dsw-alias-label-primary, #171717))",
	overflowWrap: "anywhere",
	fontSize: 13
};
function QuotaDetails({ quota, t }) {
	if (quota.state !== "available" && quota.state !== "partial") {
		const key = quota.state === "signed-out" ? "quotaSignedOut" : quota.reason === "auth" ? "quotaAuthError" : quota.reason === "restricted" ? "quotaRestricted" : quota.state === "error" ? "quotaError" : "quotaUnavailable";
		return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
			role: "status",
			className: "gk-empty",
			style: {
				...body,
				padding: "18px 0"
			},
			children: t(key)
		});
	}
	const percent = (value) => `${Number(value.toFixed(1))}%`;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		style: {
			display: "flex",
			flexDirection: "column",
			gap: 18
		},
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: row,
				children: [quota.state === "available" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: screenReader,
						children: `${t("quotaRemaining")} : ${percent(quota.remainingPercent)}`
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						"aria-hidden": "true",
						style: {
							...body,
							display: "block",
							marginBottom: 5
						},
						children: t("quotaRemaining")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						"aria-hidden": "true",
						className: "gk-numeric",
						style: {
							...numeric,
							display: "inline-flex",
							alignItems: "baseline",
							gap: 5,
							fontSize: 44,
							lineHeight: 1.1,
							letterSpacing: "-1.5px",
							color: "var(--gk-text, var(--dsw-alias-label-primary, #171717))"
						},
						children: [Number(quota.remainingPercent.toFixed(1)), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", {
							style: {
								fontSize: 18,
								letterSpacing: 0
							},
							children: "%"
						})]
					})
				] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					role: "status",
					style: {
						...body,
						maxWidth: 520
					},
					children: t("quotaPartial")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "gk-status",
					style: {
						...body,
						fontSize: 12,
						padding: "5px 10px",
						borderRadius: 999,
						background: "var(--gk-soft, var(--dsw-alias-bg-layer-1, #f5f5f5))"
					},
					children: t(quota.period === "week" ? "quotaWeek" : quota.period === "month" ? "quotaMonth" : "quotaSubscription")
				})]
			}),
			quota.state === "available" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 8
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
					style: {
						...body,
						...numeric,
						fontSize: 12
					},
					children: [
						t("quotaUsed"),
						": ",
						percent(quota.usedPercent)
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					role: "progressbar",
					"aria-label": t("quotaUsed"),
					"aria-valuemin": 0,
					"aria-valuemax": 100,
					"aria-valuenow": quota.usedPercent,
					style: {
						height: 5,
						borderRadius: 8,
						background: "var(--gk-line, var(--dsw-alias-border-l2, #e5e5e5))",
						overflow: "hidden"
					},
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { style: {
						height: "100%",
						width: `${quota.usedPercent}%`,
						borderRadius: 8,
						background: "var(--gk-strong, var(--dsw-alias-label-primary, #171717))"
					} })
				})]
			}) : null,
			quota.unifiedBilling === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "gk-hint",
				style: body,
				children: t("quotaUnified")
			}) : null,
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
				style: {
					...body,
					display: "grid",
					gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 170px), 1fr))",
					gap: "18px 24px",
					paddingTop: 16,
					borderTop: "1px solid var(--gk-line, var(--dsw-alias-border-l2, #e5e5e5))"
				},
				children: [
					quota.plan === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: detail,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("quotaPlan") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
							style: detailValue,
							children: quota.plan
						})]
					}),
					quota.prepaidBalanceUsd === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: detail,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("quotaBalance") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dd", {
							className: "gk-numeric",
							style: {
								...detailValue,
								...numeric
							},
							children: [quota.prepaidBalanceUsd.toFixed(2), " USD"]
						})]
					}),
					quota.resetAt === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: detail,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("quotaResetAt") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
							style: {
								...detailValue,
								...numeric
							},
							children: new Date(quota.resetAt).toLocaleString()
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: detail,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("quotaCheckedAt") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
							style: {
								...detailValue,
								...numeric
							},
							children: new Date(quota.checkedAt).toLocaleString()
						})]
					})
				]
			})
		]
	});
}
function QuotaView({ t, signedIn, accountLoading = false }) {
	const [quota, setQuota] = (0, react.useState)();
	const [loading, setLoading] = (0, react.useState)(signedIn);
	const [reload, setReload] = (0, react.useState)(0);
	(0, react.useEffect)(() => {
		if (!signedIn || accountLoading) {
			setQuota({ state: "signed-out" });
			setLoading(false);
			return;
		}
		const abort = new AbortController();
		let live = true;
		setQuota(void 0);
		setLoading(true);
		fetch(QUOTA_PATH, {
			credentials: "same-origin",
			headers: { accept: "application/json" },
			signal: abort.signal
		}).then(async (response) => {
			if (!response.ok) throw new Error("Quota request failed");
			return parseQuotaSnapshot(await response.json());
		}).then((value) => {
			if (live) setQuota(value);
		}).catch(() => {
			if (live && !abort.signal.aborted) setQuota({
				state: "error",
				reason: "temporary"
			});
		}).finally(() => {
			if (live) setLoading(false);
		});
		return () => {
			live = false;
			abort.abort();
		};
	}, [
		signedIn,
		accountLoading,
		reload
	]);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
		className: "gk-panel",
		"aria-label": t("quotaTitle"),
		"aria-busy": accountLoading || loading,
		style: card,
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: row,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
					className: "gk-title",
					style: {
						margin: 0,
						fontSize: 15,
						fontWeight: 600,
						color: "var(--gk-text, var(--dsw-alias-label-primary, #171717))"
					},
					children: t("quotaTitle")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					className: "gk-button",
					type: "button",
					style: button,
					disabled: !signedIn || accountLoading || loading,
					onClick: () => setReload((value) => value + 1),
					children: t("quotaRefresh")
				})]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				style: body,
				children: t("quotaIntro")
			}),
			accountLoading || loading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				role: "status",
				style: body,
				children: t(accountLoading ? "loadingAccount" : "quotaLoading")
			}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(QuotaDetails, {
				quota: signedIn ? quota ?? { state: "unavailable" } : { state: "signed-out" },
				t
			})
		]
	});
}
//#endregion
//#region src/client/media-options.ts
/** Build only the media choices deliberately accepted on the settings page. */
function mediaTogglePatch(current, group, enabled) {
	if (!enabled) return group === "images" ? {
		imagineTool: false,
		editTool: false
	} : { videoTool: false };
	return {
		imagineTool: group === "images" || current.imagineTool === true,
		editTool: group === "images" || current.editTool === true,
		videoTool: group === "video" || current.videoTool === true,
		mediaRiskAcknowledged: true
	};
}
//#endregion
//#region src/client/settings-ui.tsx
/** Scoped settings styling; host tokens keep both desktop themes in sync. */
const styles = `
.grok-settings {
  --gk-text: var(--dsw-alias-label-primary, #171717);
  --gk-muted: var(--dsw-alias-label-secondary, #62666b);
  --gk-soft: var(--dsw-alias-bg-layer-1, #f3f3f3);
  --gk-line: var(--dsw-alias-border-l2, #dedede);
  --gk-surface: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-base, #fff));
  --gk-strong: var(--dsw-alias-label-primary, #171717);
  --gk-on-strong: var(--dsw-alias-bg-layer-2, #fff);
  --gk-success: color-mix(in srgb, var(--dsw-alias-state-success-primary, #16834b) 80%, var(--gk-text));
  --gk-danger: var(--dsw-alias-state-error-primary, #c53532);
  container: grok-settings / inline-size;
  color: var(--gk-text); font-size: 14px; line-height: 1.6;
  width: 100%; max-width: 720px; min-width: 0;
  display: flex; flex-direction: column; gap: 24px;
  overflow-wrap: anywhere;
}
.grok-settings *, .grok-settings *::before, .grok-settings *::after { box-sizing: border-box; }
.grok-settings :where(h2,h3,h4,p) { margin: 0; }
.grok-settings button, .grok-settings input, .grok-settings select { font: inherit; }
.grok-settings :where(input,select,summary,button) { scroll-margin-block: 130px; }
.grok-settings :where(button,input,select,summary,a):focus-visible { outline: 2px solid var(--gk-text); outline-offset: 4px; }
.grok-settings .gk-feature :where(button,input,select,summary,a):focus-visible { outline-color: #f7f7f8; }
.grok-settings button:disabled, .grok-settings input:disabled, .grok-settings select:disabled { opacity: .46; cursor: not-allowed; }
.grok-settings a { color: inherit; text-underline-offset: 4px; }
.grok-settings .gk-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
.grok-settings .gk-header { display: flex; flex-direction: column; gap: 16px; padding: 18px 0 14px; border-bottom: 1px solid var(--gk-line); }
.grok-settings .gk-brand-row { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px 20px; }
.grok-settings .gk-wordmark { display: inline-flex; align-items: center; gap: 12px; font: 750 30px/1 Arial, sans-serif; letter-spacing: -1.6px; }
.grok-settings .gk-wordmark small { border-left: 1px solid currentColor; padding: 3px 0 3px 12px; font: 500 11px/1.2 ui-monospace, Consolas, monospace; letter-spacing: 2px; }
.grok-settings .gk-status { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 7px; font-size: 12px; }
.grok-settings .gk-status--success { color: var(--gk-success); }
.grok-settings .gk-nav { display: flex; flex-wrap: wrap; gap: 4px; }
.grok-settings .gk-nav button { position: relative; border: 0; background: transparent; color: var(--gk-muted); border-radius: 999px; padding: 7px 13px; cursor: pointer; font-size: 13px; min-height: 34px; }
.grok-settings .gk-nav button:hover { background: var(--gk-soft); color: var(--gk-text); }
.grok-settings .gk-nav button[aria-current=page] { background: var(--gk-strong); color: var(--gk-on-strong); font-weight: 600; }
.grok-settings .gk-nav-dirty { position: absolute; top: 6px; right: 7px; width: 4px; height: 4px; border-radius: 50%; background: currentColor; }
.grok-settings .gk-page { display: flex; flex-direction: column; gap: 22px; min-width: 0; }
.grok-settings .gk-eyebrow { font: 500 10px/1.5 ui-monospace, Consolas, monospace; letter-spacing: 1.7px; color: var(--gk-muted); }
.grok-settings .gk-hint { font-size: 12px; line-height: 1.65; color: var(--gk-muted); }
.grok-settings .gk-title { font-size: 15px; font-weight: 600; line-height: 1.5; }
.grok-settings .gk-panel { padding: 20px; border: 1px solid var(--gk-line); border-radius: 14px; background: var(--gk-surface); min-width: 0; }
.grok-settings .gk-stack { display: flex; flex-direction: column; gap: 14px; }
.grok-settings .gk-feature { padding: 22px; border-radius: 14px; background: #111214; color: #f7f7f8; }
.grok-settings .gk-feature .gk-hint { color: inherit; opacity: .75; }
.grok-settings .gk-feature .gk-tag { border-color: currentColor; opacity: .7; }
.grok-settings .gk-feature .gk-setting + .gk-setting { border-color: color-mix(in srgb,currentColor 20%,transparent); }
.grok-settings .gk-setting { display: flex; flex-direction: column; gap: 7px; }
.grok-settings .gk-setting + .gk-setting { margin-top: 18px; padding-top: 18px; border-top: 1px solid var(--gk-line); }
.grok-settings .gk-setting-label { display: flex; align-items: center; justify-content: space-between; gap: 18px; cursor: pointer; }
.grok-settings .gk-setting-label > span { min-width: 0; display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; }
.grok-settings .gk-setting-label b { font-size: 15px; font-weight: 600; }
.grok-settings .gk-tag { display: inline-block; padding: 0 6px; border: 1px solid var(--gk-line); border-radius: 4px; font-size: 10px; line-height: 18px; font-weight: 400; }
.grok-settings input.gk-switch { appearance: none; -webkit-appearance: none; flex: 0 0 36px; width: 36px; height: 22px; border: 1px solid var(--gk-line); border-radius: 20px; margin: 0; background: var(--gk-soft); color: var(--gk-text); cursor: pointer; position: relative; }
.grok-settings input.gk-switch::before { content: ''; width: 14px; height: 14px; border-radius: 50%; position: absolute; top: 3px; left: 3px; background: var(--gk-muted); }
.grok-settings input.gk-switch:checked { background: var(--gk-strong); border-color: var(--gk-strong); }
.grok-settings input.gk-switch:checked::before { background: var(--gk-on-strong); transform: translateX(14px); }
.grok-settings .gk-feature input.gk-switch { background: transparent; border-color: color-mix(in srgb,currentColor 50%,transparent); color: inherit; }
.grok-settings .gk-feature input.gk-switch::before { background: currentColor; opacity: .65; }
.grok-settings .gk-feature input.gk-switch:checked { background: #f7f7f8; border-color: #f7f7f8; }
.grok-settings .gk-feature input.gk-switch:checked::before { background: #111214; opacity: 1; }
.grok-settings .gk-button { display: inline-flex; justify-content: center; align-items: center; gap: 6px; border: 1px solid var(--gk-line); border-radius: 999px; background: transparent; color: var(--gk-text); padding: 7px 15px; min-height: 36px; font-size: 12px; line-height: 1.5; cursor: pointer; text-align: center; }
.grok-settings .gk-button:hover:not(:disabled) { background: var(--gk-soft); }
.grok-settings .gk-button--primary { background: var(--gk-strong); color: var(--gk-on-strong); border-color: var(--gk-strong); }
.grok-settings .gk-button--primary:hover:not(:disabled) { background: var(--gk-strong); opacity: .85; }
.grok-settings .gk-button--danger { background: #b4232d; color: #fff; border-color: #b4232d; }
.grok-settings .gk-button--danger:hover:not(:disabled) { background: #b4232d; opacity: .85; }
.grok-settings .gk-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.grok-settings .gk-input { min-width: 0; width: 100%; border: 1px solid var(--gk-line); border-radius: 8px; background: var(--gk-soft); color: var(--gk-text); padding: 9px 11px; min-height: 38px; font-size: 13px; }
.grok-settings .gk-select { width: auto; max-width: 100%; }
.grok-settings .gk-field { display: flex; flex-direction: column; gap: 7px; font-size: 12px; color: var(--gk-muted); min-width: 0; }
.grok-settings .gk-telemetry { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); padding: 16px 0; border-top: 1px solid var(--gk-line); border-bottom: 1px solid var(--gk-line); }
.grok-settings .gk-telemetry > div { padding: 0 14px; border-left: 1px solid var(--gk-line); min-width: 0; }
.grok-settings .gk-telemetry > div:first-child { padding-left: 0; border: 0; }
.grok-settings .gk-telemetry > div:last-child { padding-right: 0; }
.grok-settings .gk-numeric { font-family: Bahnschrift, 'Arial Narrow', ui-monospace, Consolas, sans-serif; font-variant-numeric: tabular-nums; font-weight: 500; letter-spacing: -1px; }
.grok-settings .gk-reading { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px; line-height: 1.2; }
.grok-settings .gk-reading .gk-numeric { font-size: 34px; }
.grok-settings .gk-reading small { font-size: 11px; color: var(--gk-muted); }
.grok-settings .gk-telemetry-label { font-size: 10px; color: var(--gk-muted); margin-top: 6px; }
.grok-settings .gk-details { border-top: 1px solid var(--gk-line); padding-top: 12px; }
.grok-settings .gk-telemetry + .gk-details { border-top: 0; padding-top: 0; }
.grok-settings .gk-details summary { cursor: pointer; font-size: 12px; color: var(--gk-muted); width: fit-content; }
.grok-settings .gk-details[open] > summary { margin-bottom: 16px; }
.grok-settings .gk-fields { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 12px; }
.grok-settings .gk-footer { position: sticky; bottom: -24px; z-index: 2; margin: 0 0 -24px; padding: 14px 0 24px; background: var(--gk-surface); border-top: 1px solid var(--gk-line); display: flex; flex-direction: column; gap: 10px; }
.grok-settings .gk-stages { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 12px; font-size: 10px; color: var(--gk-muted); }
.grok-settings .gk-stages span { display: inline-flex; align-items: center; gap: 5px; }
.grok-settings .gk-stage-dot { width: 5px; height: 5px; border-radius: 50%; border: 1px solid currentColor; }
.grok-settings .gk-stage-current { color: var(--gk-text); font-weight: 600; }
.grok-settings .gk-stage-current .gk-stage-dot { background: currentColor; }
.grok-settings .gk-feedback { font-size: 12px; line-height: 1.5; }
.grok-settings .gk-error { color: var(--gk-danger); }
.grok-settings .gk-success { color: var(--gk-success); }
.grok-settings .gk-confirm { display: flex; flex-direction: column; gap: 12px; border: 1px solid var(--gk-danger); border-radius: 12px; padding: 18px; background: color-mix(in srgb,var(--gk-danger) 5%,var(--gk-surface)); }
.grok-settings .gk-empty { padding: 24px 0; font-size: 13px; color: var(--gk-muted); }
.grok-settings .gk-models { list-style: none; padding: 0; margin: 0; }
.grok-settings .gk-models li + li { border-top: 1px solid var(--gk-line); }
.grok-settings .gk-model-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 15px 0; cursor: pointer; }
.grok-settings .gk-model-row input { width: 17px; height: 17px; flex: 0 0 auto; accent-color: var(--gk-strong); }
.grok-settings .gk-model-id { display: block; font: 11px/1.6 ui-monospace, Consolas, monospace; color: var(--gk-muted); margin-top: 2px; }
.grok-settings .gk-model-count { display: flex; align-items: baseline; gap: 7px; }
.grok-settings .gk-model-count .gk-numeric { font-size: 40px; line-height: 1; }
.grok-settings .gk-code { font: 600 24px/1.4 ui-monospace, Consolas, monospace; letter-spacing: 2px; }
@container grok-settings (max-width: 460px) {
  .grok-settings .gk-nav { gap: 2px; }
  .grok-settings .gk-nav button { padding: 7px 9px; font-size: 12px; }
  .grok-settings .gk-feature, .grok-settings .gk-panel { padding: 17px; }
  .grok-settings .gk-telemetry > div { padding: 0 10px; }
  .grok-settings .gk-reading .gk-numeric { font-size: 29px; }
  .grok-settings .gk-fields { grid-template-columns: 1fr; }
}
@container grok-settings (max-width: 290px) {
  .grok-settings .gk-telemetry { grid-template-columns: 1fr; gap: 12px; }
  .grok-settings .gk-telemetry > div { padding: 0; border: 0; }
  .grok-settings .gk-setting-label { flex-wrap: wrap; }
}
@container grok-settings (max-width: 360px) {
  .grok-settings .gk-header { position: static !important; }
  .grok-settings .gk-footer { position: static; margin-bottom: 0; padding-bottom: 0; }
}
`;
function SettingsStyles() {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: styles });
}
//#endregion
//#region src/client/XaiSettings.tsx
/** Plugin-owned xAI Grok account page inside the dsh Settings shell. */
const STATUS_PATH = "/plugins/dsh-grok-kit/auth/status";
const LOGIN_PATH = "/plugins/dsh-grok-kit/auth/login";
const IMPORT_PATH = "/plugins/dsh-grok-kit/auth/import";
const LOGOUT_PATH = "/plugins/dsh-grok-kit/auth/logout";
const MODELS_PATH = "/plugins/dsh-grok-kit/auth/models";
const PROXY_PATH = "/plugins/dsh-grok-kit/auth/proxy";
const OPTIONS_PATH = "/plugins/dsh-grok-kit/auth/options";
const POLL_INTERVAL_MS = 1e3;
const STATUS_TIMEOUT_MS = 1e4;
/**
* The five pages of this settings section. Only the active page is mounted, so
* a backgrounded page never keeps a video download or a capability read
* running; every draft it owns lives in this component instead of in the page
* body, so switching pages keeps unsaved options and proxy edits.
*/
const SETTINGS_PAGES = [
	"account",
	"models",
	"search",
	"media",
	"network"
];
/** Page label, doubled as the sticky header's navigation button text. */
const PAGE_LABEL_KEYS = {
	account: "navAccount",
	models: "navModels",
	search: "navSearch",
	media: "navMedia",
	network: "navNetwork"
};
/**
* Which option keys each page owns for ordinary edits. Save is scoped to the
* active page's dirty keys from this list, so one page can never write another
* page's overrides and a draft left unsaved elsewhere is never dropped by
* this page's save.
*/
const PAGE_OPTION_KEYS = {
	account: [],
	models: [],
	network: [],
	search: [
		"backendSearch",
		"statefulResponses",
		"nestedSearchTools",
		"searchModel",
		"searchMaxResults",
		"webSearchTimeoutMs",
		"xSearchTimeoutMs"
	],
	media: [
		"imagineTool",
		"editTool",
		"videoTool",
		"mediaRiskAcknowledged"
	]
};
/**
* Extra keys Reset may clear even though the form does not edit them.
* Media still displays videoModel / videoMaxBytes as read-only; a stale
* stored videoMaxBytes would keep interrupting downloads after the user
* believes this page was reset.
*/
const PAGE_RESET_ONLY_KEYS = { media: ["videoModel", "videoMaxBytes"] };
function pageResetKeys(pageId) {
	return [...PAGE_OPTION_KEYS[pageId], ...PAGE_RESET_ONLY_KEYS[pageId] ?? []];
}
function optBool(value, fallback) {
	return typeof value === "boolean" ? value : fallback;
}
const stickyBarStyle = {
	position: "sticky",
	top: 0,
	zIndex: 1,
	background: "var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-base))"
};
function sourceBadge$1(source) {
	switch (source) {
		case "live": return {
			text: "Live",
			color: "var(--dsw-alias-state-success-primary, #22a06b)"
		};
		case "cache": return {
			text: "Cached",
			color: "var(--gk-muted)"
		};
		case "fallback": return {
			text: "Fallback",
			color: "var(--dsw-alias-label-tertiary, #81858c)"
		};
		case void 0: return {
			text: "—",
			color: "var(--dsw-alias-label-tertiary, #81858c)"
		};
		default: return {
			text: "—",
			color: "var(--dsw-alias-label-tertiary, #81858c)"
		};
	}
}
function dotStyle(status) {
	return {
		width: 9,
		height: 9,
		borderRadius: "50%",
		flex: "0 0 auto",
		background: status === "signed-in" ? "var(--dsw-alias-state-success-primary, #22a06b)" : status === "error" ? "var(--dsw-alias-state-error-primary, #d92d20)" : status === "signing-in" || status === "loading" ? "var(--gk-muted)" : "var(--dsw-alias-label-tertiary, #81858c)"
	};
}
/** grok-4.6 → "Grok 4.6"; only used for display, never sent to the API. */
function displayName(id) {
	return id.split(/[-_]/g).map((part) => part.length === 0 ? part : part[0].toUpperCase() + part.slice(1)).join(" ");
}
async function jsonRequest(path, method = "GET", body, signal) {
	const response = await fetch(path, {
		method,
		headers: {
			accept: "application/json",
			...body === void 0 ? {} : { "content-type": "application/json" }
		},
		credentials: "same-origin",
		...signal === void 0 ? {} : { signal },
		...body === void 0 ? {} : { body: JSON.stringify(body) }
	});
	const value = await response.json().catch(() => void 0);
	if (!response.ok) {
		const message = typeof value === "object" && value !== null && "error" in value && typeof value.error === "string" ? value.error : `HTTP ${response.status}`;
		throw new Error(message);
	}
	return value;
}
/** xAI Grok account status and OAuth actions. */
function XaiSettings({ t }) {
	if (t === void 0) throw new Error("xAI Grok settings requires its translation function");
	const [status, setStatus] = (0, react.useState)({ status: "loading" });
	const statusRequestRef = (0, react.useRef)(0);
	const statusAbortRef = (0, react.useRef)(void 0);
	const invalidateStatusRead = (0, react.useCallback)(() => {
		++statusRequestRef.current;
		const pending = statusAbortRef.current;
		statusAbortRef.current = void 0;
		pending?.abort();
	}, []);
	const [busy, setBusy] = (0, react.useState)(false);
	const [proxyUrl, setProxyUrl] = (0, react.useState)("");
	const [savedProxyUrl, setSavedProxyUrl] = (0, react.useState)("");
	const [quotaCompatibilityMode, setQuotaCompatibilityMode] = (0, react.useState)(false);
	const [savedQuotaCompatibilityMode, setSavedQuotaCompatibilityMode] = (0, react.useState)(false);
	const [proxyLoaded, setProxyLoaded] = (0, react.useState)(false);
	const [proxyLoading, setProxyLoading] = (0, react.useState)(false);
	const proxyLoadingRef = (0, react.useRef)(false);
	const proxyUrlEditedRef = (0, react.useRef)(false);
	const quotaEditedRef = (0, react.useRef)(false);
	const proxySavedRef = (0, react.useRef)(false);
	const [proxyBusy, setProxyBusy] = (0, react.useState)(false);
	const [proxyFeedback, setProxyFeedback] = (0, react.useState)("idle");
	const [popupBlocked, setPopupBlocked] = (0, react.useState)(false);
	const [options, setOptions] = (0, react.useState)({});
	const [storedOptions, setStoredOptions] = (0, react.useState)({});
	const [optionsDirty, setOptionsDirty] = (0, react.useState)(/* @__PURE__ */ new Set());
	const optionsDirtyRef = (0, react.useRef)(/* @__PURE__ */ new Set());
	const optionsTouchedRef = (0, react.useRef)(/* @__PURE__ */ new Set());
	const [optionsBusy, setOptionsBusy] = (0, react.useState)(false);
	const [optionsFeedback, setOptionsFeedback] = (0, react.useState)();
	const [pendingMediaGroup, setPendingMediaGroup] = (0, react.useState)(null);
	const mediaConfirmRef = (0, react.useRef)(null);
	const mediaImageRef = (0, react.useRef)(null);
	const mediaVideoRef = (0, react.useRef)(null);
	const [accountGeneration, setAccountGeneration] = (0, react.useState)(0);
	const [page, setPage] = (0, react.useState)("account");
	(0, react.useEffect)(() => {
		if (page !== "media" || pendingMediaGroup === null) return;
		mediaConfirmRef.current?.focus({ preventScroll: true });
		mediaConfirmRef.current?.scrollIntoView({ block: "center" });
	}, [page, pendingMediaGroup]);
	const [capabilityGeneration, setCapabilityGeneration] = (0, react.useState)(0);
	/**
	* Apply a server payload.
	*
	* The initial load replaces untouched fields. A page-scoped save or reset passes
	* `clearedKeys` and then moves ONLY those keys: another page's unsaved draft
	* is never overwritten by a response that did not cover it, its dirty flag
	* survives, and a key the server no longer reports as an override is dropped
	* from the stored view so the form falls back to auto / default.
	*/
	const applyOptionsPayload = (value, clearedKeys) => {
		const effective = value.effective ?? value.options ?? {};
		const stored = value.stored ?? {};
		if (clearedKeys === void 0) {
			const drafts = optionsDirtyRef.current;
			const protectedKeys = optionsTouchedRef.current;
			setOptions((previous) => {
				const next = { ...effective };
				for (const key of protectedKeys) if (key in previous) next[key] = previous[key];
				else delete next[key];
				return next;
			});
			setStoredOptions((previous) => {
				const next = { ...stored };
				for (const key of protectedKeys) if (key in previous) next[key] = previous[key];
				else delete next[key];
				return next;
			});
			setOptionsDirty(new Set(drafts));
			return;
		}
		optionsTouchedRef.current = /* @__PURE__ */ new Set([...optionsTouchedRef.current, ...clearedKeys]);
		setOptions((previous) => {
			const next = { ...previous };
			for (const key of clearedKeys) if (key in effective) next[key] = effective[key];
			else delete next[key];
			return next;
		});
		setStoredOptions((previous) => {
			const next = { ...previous };
			for (const key of clearedKeys) if (key in stored) next[key] = stored[key];
			else delete next[key];
			return next;
		});
		setOptionsDirty((previous) => {
			const next = new Set(previous);
			for (const key of clearedKeys) next.delete(key);
			return next;
		});
	};
	const markOption = (key, value) => {
		setOptions((previous) => ({
			...previous,
			[key]: value
		}));
		setOptionsDirty((previous) => new Set(previous).add(key));
		optionsDirtyRef.current = new Set(optionsDirtyRef.current).add(key);
		optionsTouchedRef.current = new Set(optionsTouchedRef.current).add(key);
		const owner = SETTINGS_PAGES.find((pageId) => PAGE_OPTION_KEYS[pageId].includes(key));
		setOptionsFeedback((previous) => previous?.page === owner ? void 0 : previous);
	};
	/**
	* Numeric option edit. An empty field is an explicit "clear my override".
	* Anything else that is not a finite number ('1e999', a pasted non-number)
	* is rejected outright: JSON.stringify(NaN) is `null`, so writing it would
	* silently delete the stored override instead of applying what was typed.
	*/
	const markOptionNumber = (key, raw) => {
		if (raw.trim() === "") {
			markOption(key, void 0);
			return;
		}
		const value = Number(raw);
		if (!Number.isFinite(value)) return;
		markOption(key, value);
	};
	const pageHasDraft = (pageId) => pageId === "network" ? proxyUrl.trim() !== savedProxyUrl || quotaCompatibilityMode !== savedQuotaCompatibilityMode : PAGE_OPTION_KEYS[pageId].some((key) => optionsDirty.has(key));
	/** Feedback visible on one page: its own, or a page-independent load error. */
	const feedbackFor = (pageId) => optionsFeedback === void 0 ? void 0 : optionsFeedback.page === void 0 || optionsFeedback.page === pageId ? optionsFeedback.state : void 0;
	const applyMediaPatch = (patch) => {
		for (const [key, value] of Object.entries(patch)) markOption(key, value);
	};
	const markMedia = (group, enabled) => {
		if (enabled) {
			setPendingMediaGroup(group);
			setOptionsFeedback((previous) => previous?.page === "media" ? void 0 : previous);
			return;
		}
		const patch = mediaTogglePatch(options, group, false);
		if (patch === void 0) return;
		applyMediaPatch(patch);
	};
	const confirmPendingMedia = () => {
		if (pendingMediaGroup === null) return;
		const patch = mediaTogglePatch(options, pendingMediaGroup, true);
		setPendingMediaGroup(null);
		if (patch === void 0) return;
		applyMediaPatch(patch);
	};
	const cancelPendingMedia = () => {
		setPendingMediaGroup(null);
		setOptionsFeedback((previous) => previous?.page === "media" ? void 0 : previous);
	};
	const restoreMediaFocus = () => {
		(pendingMediaGroup === "images" ? mediaImageRef.current : mediaVideoRef.current)?.focus();
	};
	const loadOptions = (0, react.useCallback)(async () => {
		try {
			applyOptionsPayload(await jsonRequest(OPTIONS_PATH));
		} catch {
			setOptionsFeedback({ state: "error" });
		}
	}, []);
	/** Save only the active page's dirty keys; every other page keeps its draft. */
	const saveOptions = async (pageId) => {
		const keys = PAGE_OPTION_KEYS[pageId].filter((key) => optionsDirty.has(key));
		if (keys.length === 0) return;
		setOptionsBusy(true);
		try {
			const patch = {};
			for (const key of keys) patch[key] = options[key] ?? null;
			applyOptionsPayload(await jsonRequest(OPTIONS_PATH, "POST", patch), keys);
			const remaining = new Set(optionsDirtyRef.current);
			for (const key of keys) remaining.delete(key);
			optionsDirtyRef.current = remaining;
			setOptionsFeedback({
				page: pageId,
				state: "saved"
			});
			if (keys.includes("videoTool") || keys.includes("mediaRiskAcknowledged")) setCapabilityGeneration((generation) => generation + 1);
		} catch {
			setOptionsFeedback({
				page: pageId,
				state: "error"
			});
		} finally {
			setOptionsBusy(false);
		}
	};
	/** Reset only the active page's overrides back to the defaults. */
	const resetOptions = async (pageId) => {
		const keys = pageResetKeys(pageId);
		if (keys.length === 0) return;
		setOptionsBusy(true);
		try {
			const patch = {};
			for (const key of keys) patch[key] = null;
			if (pageId === "media") {
				patch.mediaRiskAcknowledged = false;
				setPendingMediaGroup(null);
			}
			applyOptionsPayload(await jsonRequest(OPTIONS_PATH, "POST", patch), keys);
			const remaining = new Set(optionsDirtyRef.current);
			for (const key of keys) remaining.delete(key);
			optionsDirtyRef.current = remaining;
			setOptionsFeedback({
				page: pageId,
				state: "saved"
			});
			if (pageId === "media") setCapabilityGeneration((generation) => generation + 1);
		} catch {
			setOptionsFeedback({
				page: pageId,
				state: "error"
			});
		} finally {
			setOptionsBusy(false);
		}
	};
	/**
	* Read the effective proxy settings.
	*
	* The URL and the compatibility mode have their own edit flags, so a read
	* that arrives late still fills in the field the user has not touched
	* (toggling the mode must not hide the proxy URL, whose empty draft would
	* otherwise be written back over a real proxy) and never overwrites a field
	* the user has edited or a baseline a save has already committed.
	*/
	const loadProxy = (0, react.useCallback)(async () => {
		if (proxyLoadingRef.current) return;
		proxyLoadingRef.current = true;
		setProxyLoading(true);
		try {
			const value = await jsonRequest(PROXY_PATH);
			const url = typeof value.proxyUrl === "string" ? value.proxyUrl : "";
			const mode = value.quotaCompatibilityMode === true;
			setProxyLoaded(true);
			if (!proxyUrlEditedRef.current) setProxyUrl(url);
			if (!quotaEditedRef.current) setQuotaCompatibilityMode(mode);
			if (!proxySavedRef.current) {
				setSavedProxyUrl(url);
				setSavedQuotaCompatibilityMode(mode);
			}
			setProxyFeedback((previous) => previous === "loadError" ? "idle" : previous);
		} catch {
			setProxyLoaded(false);
			setProxyFeedback("loadError");
		} finally {
			proxyLoadingRef.current = false;
			setProxyLoading(false);
		}
	}, []);
	/**
	* Save the proxy URL and the compatibility mode in one request: the server
	* needs both, and a half-saved pair would leave the page describing a
	* state the server never stored.
	*/
	const saveProxy = async () => {
		if (proxyFeedback === "loadError") return;
		setProxyBusy(true);
		try {
			const value = await jsonRequest(PROXY_PATH, "POST", {
				proxyUrl,
				quotaCompatibilityMode
			});
			const url = typeof value.proxyUrl === "string" ? value.proxyUrl : proxyUrl;
			const mode = value.quotaCompatibilityMode === true;
			proxyUrlEditedRef.current = true;
			quotaEditedRef.current = true;
			proxySavedRef.current = true;
			setProxyUrl(url);
			setSavedProxyUrl(url);
			setQuotaCompatibilityMode(mode);
			setSavedQuotaCompatibilityMode(mode);
			setProxyLoaded(true);
			setProxyFeedback("saved");
		} catch {
			setProxyFeedback("error");
		} finally {
			setProxyBusy(false);
		}
	};
	/** A new edit clears a stale save result, but not a failed read. */
	const resetProxyFeedback = () => {
		setProxyFeedback((previous) => previous === "loadError" ? previous : "idle");
	};
	const refresh = (0, react.useCallback)(async () => {
		if (statusAbortRef.current !== void 0) return;
		const abort = new AbortController();
		statusAbortRef.current = abort;
		const request = ++statusRequestRef.current;
		let rejectAborted;
		const aborted = new Promise((_resolve, reject) => {
			rejectAborted = reject;
		});
		const onAbort = () => rejectAborted(abort.signal.reason);
		abort.signal.addEventListener("abort", onAbort, { once: true });
		const timer = setTimeout(() => {
			abort.abort(new Error(t("requestFailed")));
		}, STATUS_TIMEOUT_MS);
		try {
			const value = await Promise.race([jsonRequest(STATUS_PATH, "GET", void 0, abort.signal), aborted]);
			if (request === statusRequestRef.current) setStatus(value);
		} catch (error) {
			if (request === statusRequestRef.current) setStatus((previous) => previous.status === "signing-in" ? previous : {
				status: "error",
				message: error instanceof Error ? error.message : t("requestFailed")
			});
		} finally {
			clearTimeout(timer);
			abort.signal.removeEventListener("abort", onAbort);
			if (statusAbortRef.current === abort) statusAbortRef.current = void 0;
		}
	}, [t]);
	(0, react.useEffect)(() => {
		refresh();
		return invalidateStatusRead;
	}, [refresh, invalidateStatusRead]);
	(0, react.useEffect)(() => {
		loadProxy();
	}, [loadProxy]);
	(0, react.useEffect)(() => {
		loadOptions();
	}, [loadOptions]);
	(0, react.useEffect)(() => {
		if (status.status !== "signing-in") return;
		const timer = window.setInterval(() => {
			refresh();
		}, POLL_INTERVAL_MS);
		return () => {
			window.clearInterval(timer);
		};
	}, [refresh, status.status]);
	const signIn = async () => {
		if (status.status === "signing-in") return;
		if (status.status !== "loading" && status.sharedGrokAuth === true) {
			if (!window.confirm(t("confirmLoginShared"))) return;
		} else if (status.status === "signed-in") {
			if (!window.confirm(t("confirmLoginPrivate"))) return;
		}
		invalidateStatusRead();
		setAccountGeneration((generation) => generation + 1);
		const popup = window.open("about:blank", "_blank");
		if (popup !== null) popup.opener = null;
		setPopupBlocked(popup === null);
		setBusy(true);
		setStatus({ status: "signing-in" });
		try {
			const challenge = await jsonRequest(LOGIN_PATH, "POST");
			if (popup === null) {
				setStatus({
					status: "signing-in",
					url: challenge.url,
					...challenge.userCode === void 0 ? {} : { userCode: challenge.userCode }
				});
				return;
			}
			popup.location.replace(challenge.url);
			setStatus({
				status: "signing-in",
				url: challenge.url,
				...challenge.userCode === void 0 ? {} : { userCode: challenge.userCode }
			});
		} catch (error) {
			popup?.close();
			setStatus((previous) => previous.status === "signing-in" ? previous : {
				status: "error",
				message: error instanceof Error ? error.message : t("requestFailed")
			});
		} finally {
			setBusy(false);
		}
	};
	const importGrok = async () => {
		invalidateStatusRead();
		setAccountGeneration((generation) => generation + 1);
		setStatus({ status: "loading" });
		setBusy(true);
		try {
			const imported = await jsonRequest(IMPORT_PATH, "POST");
			invalidateStatusRead();
			setAccountGeneration((generation) => generation + 1);
			setStatus(imported);
		} catch (error) {
			setStatus({
				status: "error",
				message: error instanceof Error ? error.message : t("requestFailed")
			});
		} finally {
			setBusy(false);
		}
	};
	const saveModels = async (selected) => {
		invalidateStatusRead();
		setBusy(true);
		try {
			setStatus(await jsonRequest(MODELS_PATH, "POST", { selected }));
		} catch (error) {
			setStatus({
				status: "error",
				message: error instanceof Error ? error.message : t("requestFailed")
			});
		} finally {
			setBusy(false);
		}
	};
	const signOut = async () => {
		if (status.status === "signed-in" && status.sharedGrokAuth === true) {
			if (!window.confirm(t("confirmLogoutShared"))) return;
		}
		setStatus({ status: "loading" });
		invalidateStatusRead();
		setAccountGeneration((generation) => generation + 1);
		setBusy(true);
		try {
			setStatus(await jsonRequest(LOGOUT_PATH, "POST"));
		} catch {
			await refresh();
		} finally {
			setBusy(false);
		}
	};
	const shared = status.status !== "loading" && status.sharedGrokAuth === true;
	const label = status.status === "signed-in" ? t(shared ? "signedInShared" : "signedIn") : status.status === "loading" ? t("loadingAccount") : status.status === "signing-in" ? t("signingIn") : status.status === "error" ? t("requestFailed") : t(shared ? "signedOutShared" : "signedOut");
	const modelIds = status.status === "signed-in" ? status.available ?? status.models ?? [] : [];
	const selectedIds = status.status === "signed-in" ? status.selected ?? status.models ?? [] : [];
	const source = status.status === "signed-in" ? sourceBadge$1(status.catalogSource) : null;
	/** Remount key: every account-changing action drops the previous account's
	*  quota reading, capability record and task rows. */
	const accountKey = `${status.status}:${String(accountGeneration)}`;
	/** Saves stay scoped to the active page. The stage strip describes the
	*  draft, never guesses whether the host has already reloaded its tools. */
	const optionActions = (pageId) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("footer", {
		className: "gk-footer",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "gk-stages",
				"aria-hidden": "true",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: pageHasDraft(pageId) ? "gk-stage-current" : void 0,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", { className: "gk-stage-dot" }), t("stageEdit")]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: optionsBusy || feedbackFor(pageId) === "saved" ? "gk-stage-current" : void 0,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", { className: "gk-stage-dot" }), optionsBusy ? t("working") : t("stageSave")]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", { className: "gk-stage-dot" }), t("stageRestart")] })
				]
			}),
			pageHasDraft(pageId) ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				role: "status",
				className: "gk-feedback",
				children: t("unsavedChangesHint")
			}) : null,
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "gk-actions",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: "gk-button gk-button--primary",
					disabled: optionsBusy || !pageHasDraft(pageId),
					onClick: () => {
						saveOptions(pageId);
					},
					children: optionsBusy ? t("working") : `${t("optionsSave")} · ${t(PAGE_LABEL_KEYS[pageId])}`
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: "gk-button",
					disabled: optionsBusy,
					onClick: () => {
						resetOptions(pageId);
					},
					children: `${t("optionsReset")} · ${t(PAGE_LABEL_KEYS[pageId])}`
				})]
			}),
			feedbackFor(pageId) === "saved" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				role: "status",
				className: "gk-feedback gk-success",
				children: t("optionsSaved")
			}) : null,
			feedbackFor(pageId) === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				role: "alert",
				className: "gk-feedback gk-error",
				children: t("optionsError")
			}) : null
		]
	});
	const nestedMode = optionsDirty.has("nestedSearchTools") ? options.nestedSearchTools === void 0 ? "auto" : String(options.nestedSearchTools) : storedOptions.nestedSearchTools === void 0 ? "auto" : String(storedOptions.nestedSearchTools);
	const compactStatus = status.status === "signed-in" ? t("signedIn") : status.status === "signed-out" ? t("signedOut") : label;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
		className: "grok-settings",
		"aria-labelledby": "xai-oauth-settings-title",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingsStyles, {}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "gk-header",
				style: stickyBarStyle,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
					className: "gk-brand-row",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h2", {
						id: "xai-oauth-settings-title",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "gk-wordmark",
							"aria-hidden": "true",
							children: ["GROK", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "KIT" })]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "gk-sr-only",
							children: t("title")
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: `gk-status${status.status === "signed-in" ? " gk-status--success" : ""}`,
						role: "status",
						title: label,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								"aria-hidden": "true",
								style: dotStyle(status.status)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								"aria-hidden": "true",
								children: compactStatus
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "gk-sr-only",
								children: [
									t("statusLabel"),
									": ",
									label
								]
							})
						]
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("nav", {
					"aria-label": t("nav"),
					className: "gk-nav",
					children: SETTINGS_PAGES.map((id) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						"aria-current": page === id ? "page" : void 0,
						"aria-label": pageHasDraft(id) ? `${t(PAGE_LABEL_KEYS[id])} — ${t("unsavedChanges")}` : t(PAGE_LABEL_KEYS[id]),
						title: pageHasDraft(id) ? t("unsavedChangesHint") : void 0,
						onClick: () => {
							setPage(id);
						},
						children: [t(id === "search" ? "navSearchShort" : id === "media" ? "navMediaShort" : PAGE_LABEL_KEYS[id]), pageHasDraft(id) ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "gk-nav-dirty",
							"aria-hidden": "true"
						}) : null]
					}, id))
				})]
			}),
			page === "account" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "gk-page",
				role: "region",
				"aria-label": t("navAccount"),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(QuotaView, {
					t,
					signedIn: status.status === "signed-in",
					accountLoading: status.status === "loading" || status.status === "signing-in"
				}, accountKey), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "gk-stack",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "gk-actions",
							children: status.status === "loading" ? null : status.status === "signed-in" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "gk-button gk-button--primary",
								disabled: busy,
								onClick: () => {
									signIn();
								},
								children: busy ? t("working") : t("loginAgain")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "gk-button",
								disabled: busy,
								onClick: () => {
									signOut();
								},
								children: busy ? t("working") : t(shared ? "logoutShared" : "logout")
							})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "gk-button gk-button--primary",
								disabled: busy || status.status === "signing-in",
								onClick: () => {
									signIn();
								},
								children: busy ? t("working") : status.status === "error" ? t("loginAgain") : t(shared ? "loginShared" : "login")
							}), status.grokImportAvailable === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "gk-button",
								disabled: busy,
								onClick: () => {
									importGrok();
								},
								children: t("importGrok")
							}) : null] })
						}),
						status.status === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							role: "alert",
							className: "gk-feedback gk-error",
							children: status.message
						}) : null,
						status.status === "signed-in" && status.loginError !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
							role: "status",
							className: "gk-feedback gk-error",
							children: [
								t("loginFailedStoredAccount"),
								" ",
								status.loginError
							]
						}) : null,
						shared ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "gk-hint",
							children: t("sharedGrok")
						}) : null,
						status.status !== "signed-in" && status.status !== "loading" && status.grokImportAvailable === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "gk-hint",
							children: t("importHint")
						}) : null,
						status.status === "signing-in" && status.userCode !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "gk-panel gk-stack",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "gk-hint",
								children: t("userCode")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "gk-code",
								children: status.userCode
							})]
						}) : null,
						status.status === "signing-in" && status.url !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
							className: "gk-hint",
							children: [
								t(popupBlocked ? "popupBlocked" : "openUrl"),
								" ",
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
									href: status.url,
									target: "_blank",
									rel: "noreferrer",
									children: status.url
								})
							]
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("a", {
							className: "gk-hint",
							href: "https://grok.com/dashboard",
							target: "_blank",
							rel: "noreferrer",
							children: [t("subscriptionDashboard"), " ↗"]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
							className: "gk-details",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: t("accountDetails") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "gk-stack",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "gk-hint",
									children: t("intro")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "gk-hint",
									children: t("subscriptionLoginHint")
								})]
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "gk-hint",
							children: t("unofficialNotice")
						})
					]
				})]
			}) : null,
			page === "models" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "gk-page",
				role: "region",
				"aria-label": t("navModels"),
				children: status.status === "signed-in" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "gk-brand-row",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "gk-model-count",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "gk-numeric",
								children: String(selectedIds.length).padStart(2, "0")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "gk-hint",
								children: [
									"/ ",
									modelIds.length,
									" · ",
									t("modelsSelected")
								]
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "gk-button",
							disabled: busy,
							onClick: () => {
								saveModels([]);
							},
							children: t("selectAll")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "gk-hint",
						children: t("modelHint")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "gk-status",
						children: [source === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: { color: source.color },
							children: source.text
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "gk-hint",
							children: status.catalogSource === "live" ? t("catalogLive") : status.catalogSource === "cache" ? t("catalogCache") : t("catalogFallback")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
						className: "gk-models",
						children: modelIds.map((id) => {
							const checked = selectedIds.includes(id);
							return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "gk-model-row",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: displayName(id) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "gk-model-id",
									children: id
								})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									checked,
									disabled: busy,
									onChange: () => {
										const current = new Set(selectedIds);
										if (checked) current.delete(id);
										else current.add(id);
										saveModels([...current]);
									}
								})]
							}) }, id);
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "gk-hint",
						children: t("modelsImmediate")
					}),
					status.catalogError === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "gk-feedback gk-error",
						children: t("catalogError")
					})
				] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "gk-panel gk-stack",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "gk-empty",
						children: status.status === "loading" || status.status === "signing-in" ? t("loadingAccount") : t("modelsSignIn")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "gk-button",
						onClick: () => {
							setPage("account");
						},
						children: t("navAccount")
					})]
				})
			}) : null,
			page === "search" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "gk-page",
				role: "region",
				"aria-label": t("navSearch"),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "gk-feature",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "gk-setting",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: "gk-setting-label",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: t("backendSearch") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "gk-tag",
								children: t("experimentalTag")
							})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: "gk-switch",
								type: "checkbox",
								checked: optBool(options.backendSearch, false),
								disabled: optionsBusy,
								onChange: (event) => markOption("backendSearch", event.target.checked)
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "gk-hint",
							children: t("backendSearchHint")
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "gk-setting",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: "gk-setting-label",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: t("statefulResponses") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "gk-tag",
								children: t("experimentalTag")
							})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: "gk-switch",
								type: "checkbox",
								checked: optBool(options.statefulResponses, false),
								disabled: optionsBusy,
								onChange: (event) => markOption("statefulResponses", event.target.checked)
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "gk-hint",
							children: t("statefulResponsesHint")
						})]
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "gk-stack",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: "gk-setting-label",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: t("nestedSearchTools") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
								className: "gk-input gk-select",
								value: nestedMode,
								disabled: optionsBusy,
								onChange: (event) => markOption("nestedSearchTools", event.target.value === "auto" ? void 0 : event.target.value === "true"),
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "auto",
										children: t("nestedSearchToolsAuto")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "true",
										children: t("mediaOn")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "false",
										children: t("mediaOff")
									})
								]
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "gk-hint",
							children: t("nestedSearchToolsHint")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
							className: "gk-status",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								"aria-hidden": "true",
								style: {
									width: 5,
									height: 5,
									borderRadius: "50%",
									background: "currentColor"
								}
							}), t(nestedMode === "auto" ? "nestedDraftAuto" : nestedMode === "true" ? "nestedDraftOn" : "nestedDraftOff")]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "gk-telemetry",
							"aria-label": t("searchParameters"),
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "gk-reading",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "gk-numeric",
										children: options.searchMaxResults === void 0 ? "—" : String(options.searchMaxResults).padStart(2, "0")
									})
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "gk-telemetry-label",
									children: t("searchMaxResults")
								})] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "gk-reading",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "gk-numeric",
										children: options.webSearchTimeoutMs === void 0 ? "—" : Number(options.webSearchTimeoutMs) / 1e3
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "s" })]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "gk-telemetry-label",
									children: t("webTimeoutShort")
								})] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "gk-reading",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "gk-numeric",
										children: options.xSearchTimeoutMs === void 0 ? "—" : Number(options.xSearchTimeoutMs) / 1e3
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "s" })]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "gk-telemetry-label",
									children: t("xTimeoutShort")
								})] })
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
							className: "gk-details",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: t("searchParameters") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "gk-stack",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										className: "gk-field",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("searchModel") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											className: "gk-input",
											type: "text",
											value: String(options.searchModel ?? ""),
											placeholder: "grok-build-0.1",
											disabled: optionsBusy,
											onChange: (event) => markOption("searchModel", event.target.value.trim() === "" ? void 0 : event.target.value)
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: "gk-hint",
										children: t("searchModelHint")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "gk-fields",
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
												className: "gk-field",
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("searchMaxResults") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													className: "gk-input",
													type: "number",
													min: 1,
													value: String(options.searchMaxResults ?? ""),
													placeholder: "8",
													disabled: optionsBusy,
													onChange: (event) => markOptionNumber("searchMaxResults", event.target.value)
												})]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
												className: "gk-field",
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("webSearchTimeoutMs") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													className: "gk-input",
													type: "number",
													min: 1e3,
													value: String(options.webSearchTimeoutMs ?? ""),
													placeholder: "60000",
													disabled: optionsBusy,
													onChange: (event) => markOptionNumber("webSearchTimeoutMs", event.target.value)
												})]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
												className: "gk-field",
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("xSearchTimeoutMs") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													className: "gk-input",
													type: "number",
													min: 1e3,
													value: String(options.xSearchTimeoutMs ?? ""),
													placeholder: "120000",
													disabled: optionsBusy,
													onChange: (event) => markOptionNumber("xSearchTimeoutMs", event.target.value)
												})]
											})
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
										className: "gk-hint",
										children: [
											t("searchMaxResultsHint"),
											" · ",
											t("webSearchTimeoutHint"),
											" · ",
											t("xSearchTimeoutHint")
										]
									})
								]
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
							className: "gk-details",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: t("optionsHowTo") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "gk-hint",
								children: t("optionsHint")
							})]
						})
					]
				})]
			}) : null,
			page === "media" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "gk-page",
				role: "region",
				"aria-label": t("navMedia"),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "gk-feature",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "gk-setting",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: "gk-setting-label",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: t("imagineTool") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "gk-tag",
										children: t("experimentalTag")
									})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										className: "gk-switch",
										type: "checkbox",
										checked: optBool(options.imagineTool, false) || optBool(options.editTool, false),
										disabled: optionsBusy,
										ref: mediaImageRef,
										onChange: (event) => markMedia("images", event.target.checked)
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "gk-hint",
									children: t("imagineToolHint")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "gk-hint",
									children: `${t("imageGenerationSwitch")}: ${t(optBool(options.imagineTool, false) ? "mediaOn" : "mediaOff")} · ${t("imageEditingSwitch")}: ${t(optBool(options.editTool, false) ? "mediaOn" : "mediaOff")}`
								})
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "gk-setting",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "gk-setting-label",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: t("videoTool") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "gk-tag",
									children: t("experimentalTag")
								})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: "gk-switch",
									type: "checkbox",
									checked: optBool(options.videoTool, false),
									disabled: optionsBusy,
									ref: mediaVideoRef,
									onChange: (event) => markMedia("video", event.target.checked)
								})]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "gk-hint",
								children: t("videoToolHint")
							})]
						})]
					}),
					pendingMediaGroup !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "gk-confirm",
						ref: mediaConfirmRef,
						tabIndex: -1,
						role: "region",
						"aria-label": t("mediaConfirmTitle"),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "gk-eyebrow gk-error",
								children: t("mediaConfirmTitle")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", {
								className: "gk-title gk-error",
								children: pendingMediaGroup === "images" ? t("imagineTool") : t("videoTool")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "gk-hint",
								children: t("mediaConfirmPrompt")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "gk-actions",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "gk-button gk-button--danger",
									disabled: optionsBusy,
									onClick: () => {
										restoreMediaFocus();
										confirmPendingMedia();
									},
									children: t("mediaConfirmYes")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "gk-button",
									disabled: optionsBusy,
									onClick: () => {
										restoreMediaFocus();
										cancelPendingMedia();
									},
									children: t("mediaConfirmNo")
								})]
							})
						]
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "gk-hint",
						children: t("mediaRiskHint")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
						className: "gk-details",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: t("optionsHowTo") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "gk-stack",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "gk-hint",
									children: t("optionsHint")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "gk-hint",
									children: `${t("videoModelLabel")}: ${String(options.videoModel ?? "—")}`
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "gk-hint",
									children: `${t("videoMaxBytesLabel")}: ${String(options.videoMaxBytes ?? "—")}`
								})
							]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(CapabilitiesView, {
						t,
						signedIn: status.status === "signed-in"
					}, `${accountKey}:${String(capabilityGeneration)}`)
				]
			}) : null,
			page === "network" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "gk-page",
				role: "region",
				"aria-label": t("navNetwork"),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "gk-panel gk-stack",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: "gk-field",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", {
							className: "gk-title",
							children: t("proxyTitle")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: "gk-input",
							type: "text",
							value: proxyUrl,
							placeholder: t("proxyPlaceholder"),
							disabled: proxyBusy,
							"aria-label": t("proxyTitle"),
							onChange: (event) => {
								proxyUrlEditedRef.current = true;
								setProxyUrl(event.target.value);
								resetProxyFeedback();
							}
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "gk-hint",
						children: t("proxyHint")
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "gk-stack",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: "gk-setting-label",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: t("quotaCompatibilityMode") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: "gk-switch",
								type: "checkbox",
								checked: quotaCompatibilityMode,
								disabled: proxyBusy,
								onChange: (event) => {
									quotaEditedRef.current = true;
									setQuotaCompatibilityMode(event.target.checked);
									resetProxyFeedback();
								}
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "gk-hint",
							children: t("quotaCompatibilityModeHint")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							role: "note",
							className: "gk-hint gk-error",
							children: t("quotaCompatibilityWarning")
						})
					]
				})]
			}) : null,
			page === "search" || page === "media" ? optionActions(page) : null,
			page === "network" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("footer", {
				className: "gk-footer",
				children: [
					pageHasDraft("network") ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						role: "status",
						className: "gk-feedback",
						children: [
							t("unsavedChangesHint"),
							" ",
							t("networkUnsavedChangesHint"),
							" ",
							quotaCompatibilityMode !== savedQuotaCompatibilityMode ? t("quotaCompatibilityUnsaved") : ""
						]
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "gk-actions",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "gk-button gk-button--primary",
							disabled: proxyBusy || !proxyLoaded,
							onClick: () => {
								saveProxy();
							},
							children: proxyBusy ? t("working") : t("proxySave")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "gk-hint",
							children: t("networkImmediate")
						})]
					}),
					proxyFeedback === "saved" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						role: "status",
						className: "gk-feedback gk-success",
						children: t("proxySaved")
					}) : null,
					proxyFeedback === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						className: "gk-feedback gk-error",
						children: t("proxyError")
					}) : null,
					proxyFeedback === "loadError" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						className: "gk-feedback gk-error",
						children: t("proxyLoadError")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "gk-button",
						disabled: proxyLoading,
						"aria-label": t("proxyRetry"),
						onClick: () => {
							loadProxy();
						},
						children: proxyLoading ? t("working") : t("proxyRetry")
					})] }) : null
				]
			}) : null
		]
	});
}
//#endregion
//#region src/client/nav-icon.ts
/**
* Settings-nav icon decoration for this plugin's own row (xAI Grok).
*
* The official settings shell's navIcon(id) table is closed — official ids
* get drawn icons and everything else falls back to a generic gear. This
* replaces that fallback <svg> inside OUR nav button (matched by our own
* registered label text) with the drawn terminal-prompt icon. A
* MutationObserver re-applies the icon when the panel re-renders; gated on
* the settings dialog being present so idle chat streams never pay the
* query cost.
*/
const NAV_ICON_INNER = "<path d=\"M13.75 5v6.5a1.5 1.5 0 0 1-1.5 1.5H3.75a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 3.75 3.5h8.5A1.5 1.5 0 0 1 13.75 5z\"/><path d=\"M4.75 6.5 6.5 8.25 4.75 10\"/><path d=\"M8 10h2.25\"/>";
const NAV_LABELS = /* @__PURE__ */ new Set(["xAI Grok"]);
function decorateSettingsNavIcon(ctx) {
	ctx.effect(() => {
		const decorate = () => {
			if (document.querySelector("[role=\"dialog\"]") === null) return;
			for (const button of Array.from(document.querySelectorAll("button"))) {
				const label = button.querySelector(":scope > span");
				if (label === null || !NAV_LABELS.has(label.textContent ?? "")) continue;
				const existing = button.firstElementChild;
				if (existing instanceof SVGElement) {
					if (existing.dataset.navIcon === "1") continue;
					const template = document.createElement("template");
					template.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-nav-icon="1">${NAV_ICON_INNER}</svg>`;
					existing.replaceWith(template.content.firstElementChild);
				}
			}
		};
		const observer = new MutationObserver(() => decorate());
		observer.observe(document.body, {
			childList: true,
			subtree: true
		});
		decorate();
		return () => observer.disconnect();
	}, "dsh-grok-kit: nav icon decoration");
}
//#endregion
//#region src/client/imagine-view.tsx
/** Session image viewer for grok_imagine / grok_imagine_edit results. */
const TOOL_NAME = "grok_imagine";
/** This view renders both text-to-image and image-to-image; the latter is registered as grok_imagine_edit. */
const TOOL_NAMES = /* @__PURE__ */ new Set(["grok_imagine", "grok_imagine_edit"]);
/**
* Codex-line image tool. Not rendered here (dsh-codex-connect draws its own
* cards); only counted at the turn tail for the purple/green source legend.
*/
const CODEX_TOOL_NAMES = /* @__PURE__ */ new Set(["codex_connect_image_generate"]);
/**
* English fallback for the rare case that the locale service is not bound
* (tests, or a boot where the namespace was not registered). English — never a
* hardcoded Chinese string — so an English UI can never show Chinese copy.
*/
const FALLBACK_TRANSLATE = (key) => en[key];
function isObject(value) {
	return typeof value === "object" && value !== null;
}
function toolNameOf(block) {
	if (isObject(block)) {
		const name = isObject(block.call) ? block.call.name : block.name;
		if (typeof name === "string" && TOOL_NAMES.has(name)) return name;
	}
	return TOOL_NAME;
}
function argsOf(block) {
	if (!isObject(block)) return void 0;
	const raw = "kind" in block && isObject(block.call) ? block.call.argsRaw : block.argsRaw;
	if (typeof raw !== "string" || raw === "") return void 0;
	try {
		const parsed = JSON.parse(raw);
		return isObject(parsed) ? parsed : void 0;
	} catch {
		return;
	}
}
/** Edit results have no "regenerate" semantics; re-edit the same input image instead. */
function regenerateText(toolName, prompt, args, t = FALLBACK_TRANSLATE) {
	if (toolName !== "grok_imagine_edit") return `${t("imageUiRegenerateText")}\n${prompt}`;
	const sources = [args?.image, ...Array.isArray(args?.images) ? args.images : []].filter((source) => typeof source === "string" && source.trim().length > 0).map((source) => source.trim());
	const hint = sources.length > 0 && sources.every((source) => source.length <= 400) ? `${t("imageUiEditSources")}${JSON.stringify(sources)}` : t("imageUiEditSourcesFallback");
	const settings = Object.fromEntries([
		"aspect_ratio",
		"resolution",
		"n"
	].filter((key) => args?.[key] !== void 0).map((key) => [key, args[key]]));
	return `${t("imageUiEditIntro")}${hint}${t("imageUiEditSettings")}${JSON.stringify(settings)}${t("imageUiEditKeepPrompt")}\n${prompt}`;
}
const IMAGE_MEDIA_TYPES = /* @__PURE__ */ new Set([
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/gif"
]);
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = .5;
/** Bounded box for the media gallery: media-first, but never full-bleed. */
const GALLERY_MAX_WIDTH = 520;
/** Text blocks (prompt / raw result) keep the shared prompt style plus a boxed chrome. */
const blockStyle = {
	...mediaCardStyles.prompt,
	boxSizing: "border-box",
	width: "100%",
	maxHeight: 160,
	overflowY: "auto",
	padding: "10px 12px",
	border: "1px solid var(--dsw-alias-border-l2)",
	borderRadius: 8,
	background: "var(--dsw-alias-bg-base)",
	color: "var(--dsw-alias-label-secondary)",
	fontFamily: "var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)"
};
const sectionHeading = {
	fontSize: 13,
	fontWeight: 600
};
/**
* Source badge. Grok and Codex image cards look alike in a session, so the
* card must identify itself: this view renders the Grok line (purple dot);
* the Codex line is rendered by dsh-codex-connect (green dot is reserved).
* The turn-tail legend below depends on this purple dot staying on the card.
*/
const SOURCE_TONES = {
	grok: "#7c3aed",
	codex: "#10a37f"
};
const SOURCE_LABEL = "Grok Imagine";
function sourceBadge(label, tone) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
		style: {
			display: "inline-flex",
			alignItems: "center",
			gap: 6
		},
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {
			"aria-hidden": true,
			style: {
				display: "inline-block",
				width: 8,
				height: 8,
				borderRadius: "50%",
				background: tone
			}
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
			style: {
				fontSize: 13,
				fontWeight: 600
			},
			children: label
		})]
	});
}
function positiveInteger(value) {
	return typeof value === "number" && Number.isInteger(value) && value > 0;
}
function imageRef(value) {
	if (!isObject(value)) return void 0;
	if (typeof value.attachmentId !== "string" || value.attachmentId === "") return void 0;
	if (typeof value.mediaType !== "string" || !IMAGE_MEDIA_TYPES.has(value.mediaType)) return void 0;
	if (!positiveInteger(value.bytes) || !positiveInteger(value.width) || !positiveInteger(value.height)) return void 0;
	return {
		attachmentId: value.attachmentId,
		mediaType: value.mediaType,
		bytes: value.bytes,
		width: value.width,
		height: value.height,
		...typeof value.name === "string" ? { name: value.name } : {}
	};
}
function imageAttachments(block) {
	if (!isObject(block) || !("kind" in block) || !Array.isArray(block.content)) return [];
	const images = [];
	const seen = /* @__PURE__ */ new Set();
	for (const part of block.content) {
		if (!isObject(part) || part.type !== "image") continue;
		const ref = imageRef(part.attachment);
		if (ref === void 0) return [];
		if (seen.has(ref.attachmentId)) continue;
		seen.add(ref.attachmentId);
		images.push(ref);
	}
	return images;
}
/** Local input references from the call args (image plus images[]). */
function inputSources(block) {
	const args = argsOf(block);
	if (args === void 0) return [];
	return [args.image, ...Array.isArray(args.images) ? args.images : []].filter((value) => typeof value === "string" && value.trim() !== "");
}
function promptOf(block) {
	if (!isObject(block)) return "";
	const raw = "kind" in block && isObject(block.call) ? block.call.argsRaw : block.argsRaw;
	if (typeof raw !== "string" || raw === "") return "";
	try {
		const parsed = JSON.parse(raw);
		return isObject(parsed) && typeof parsed.prompt === "string" ? parsed.prompt.trim() : "";
	} catch {
		return "";
	}
}
/**
* Text of the result block.
* `save_path` is rejected before any request and results always land in the
* attachment library, but failure blocks and text-only results still carry
* text — returning null here would make the whole tool call vanish from the
* conversation.
*/
function textOf(block) {
	if (!isObject(block) || !("kind" in block) || !Array.isArray(block.content)) return "";
	const parts = [];
	for (const part of block.content) {
		if (!isObject(part)) continue;
		if (part.type === "text" && typeof part.text === "string" && part.text.trim() !== "") parts.push(part.text.trim());
	}
	return parts.join("\n\n");
}
function formatBytes(bytes) {
	if (bytes < 1e3) return `${String(bytes)} B`;
	if (bytes < 1e6) return `${(bytes / 1e3).toFixed(bytes < 1e4 ? 1 : 0)} KB`;
	return `${(bytes / 1e6).toFixed(bytes < 1e7 ? 1 : 0)} MB`;
}
function formatMediaType(mediaType) {
	return mediaType === "image/jpeg" ? "JPEG" : mediaType.slice(6).toUpperCase();
}
function extensionFor(mediaType) {
	switch (mediaType) {
		case "image/jpeg": return "jpg";
		case "image/webp": return "webp";
		case "image/gif": return "gif";
		default: return "png";
	}
}
function triggerDownload(url, name) {
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = name;
	anchor.rel = "noopener";
	document.body.append(anchor);
	try {
		anchor.click();
	} finally {
		anchor.remove();
	}
}
function useImageLoader(sessionId, sessions) {
	const urls = (0, react.useRef)(/* @__PURE__ */ new Map());
	const pending = (0, react.useRef)(/* @__PURE__ */ new Map());
	const activeSession = (0, react.useRef)(sessionId);
	const disposed = (0, react.useRef)(false);
	activeSession.current = sessionId;
	(0, react.useEffect)(() => {
		disposed.current = false;
		return () => {
			disposed.current = true;
			for (const entry of urls.current.values()) URL.revokeObjectURL(entry.url);
			urls.current.clear();
		};
	}, []);
	(0, react.useEffect)(() => () => {
		for (const [key, entry] of urls.current) {
			if (entry.sessionId !== sessionId) continue;
			URL.revokeObjectURL(entry.url);
			urls.current.delete(key);
		}
	}, [sessionId]);
	return (0, react.useCallback)(async (attachment) => {
		if (typeof sessionId !== "string" || sessionId === "" || typeof sessions?.binding !== "function") throw new Error("Image session is unavailable");
		const key = `${sessionId}\0${attachment.attachmentId}`;
		const cached = urls.current.get(key);
		if (cached !== void 0) return cached.url;
		const inflight = pending.current.get(key);
		if (inflight !== void 0) return inflight;
		const request = (async () => {
			const result = await sessions.binding(sessionId)?.session?.readAttachment?.(attachment.attachmentId);
			if (result?.ok !== true || result.value?.attachment.attachmentId !== attachment.attachmentId) throw new Error("Image attachment could not be read");
			if (disposed.current || activeSession.current !== sessionId) throw new Error("Image view is no longer active");
			const bytes = result.value.data.slice().buffer;
			const url = URL.createObjectURL(new Blob([bytes], { type: result.value.attachment.mediaType }));
			urls.current.set(key, {
				sessionId,
				url
			});
			return url;
		})().finally(() => {
			pending.current.delete(key);
		});
		pending.current.set(key, request);
		return request;
	}, [sessionId, sessions]);
}
function ImagineLightbox({ src, alt, onClose, t: translate }) {
	const t = translate ?? FALLBACK_TRANSLATE;
	const dialog = (0, react.useRef)(null);
	const viewport = (0, react.useRef)(null);
	const dragStart = (0, react.useRef)(null);
	const [zoom, setZoom] = (0, react.useState)(MIN_ZOOM);
	const [dragging, setDragging] = (0, react.useState)(false);
	(0, react.useEffect)(() => {
		const node = dialog.current;
		if (node === null) return;
		if (typeof node.showModal === "function" && !node.open) node.showModal();
		const onCancel = (event) => {
			event.preventDefault();
			onClose();
		};
		node.addEventListener("cancel", onCancel);
		return () => {
			node.removeEventListener("cancel", onCancel);
			if (node.open) node.close();
		};
	}, [onClose]);
	(0, react.useEffect)(() => {
		if (zoom !== MIN_ZOOM || viewport.current === null) return;
		viewport.current.scrollLeft = 0;
		viewport.current.scrollTop = 0;
	}, [zoom]);
	const button = {
		minWidth: 32,
		height: 32,
		padding: "0 8px",
		border: "1px solid rgba(255,255,255,0.35)",
		borderRadius: 7,
		background: "rgba(0,0,0,0.35)",
		color: "#fff",
		font: "inherit",
		cursor: "pointer"
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dialog", {
		ref: dialog,
		onClose,
		style: {
			padding: 0,
			border: "none",
			background: "transparent",
			maxWidth: "96vw",
			maxHeight: "96vh"
		},
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			style: {
				position: "relative",
				width: "min(96vw, 1200px)",
				height: "min(90vh, 800px)",
				background: "#111",
				borderRadius: 12,
				overflow: "hidden"
			},
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						position: "absolute",
						top: 8,
						left: 8,
						zIndex: 1,
						display: "flex",
						alignItems: "center",
						gap: 6,
						padding: 4,
						borderRadius: 9,
						background: "rgba(0,0,0,0.55)",
						color: "#fff"
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							style: button,
							disabled: zoom === MIN_ZOOM,
							onClick: () => setZoom((value) => Math.max(MIN_ZOOM, value - ZOOM_STEP)),
							children: "−"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: `${Math.round(zoom * 100)}%` }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							style: button,
							disabled: zoom === MAX_ZOOM,
							onClick: () => setZoom((value) => Math.min(MAX_ZOOM, value + ZOOM_STEP)),
							children: "+"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							style: button,
							disabled: zoom === MIN_ZOOM,
							onClick: () => setZoom(MIN_ZOOM),
							children: t("imageUiZoomReset")
						})
					]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					"aria-label": t("imageUiClose"),
					onClick: onClose,
					style: {
						...button,
						position: "absolute",
						top: 8,
						right: 8,
						zIndex: 1,
						width: 32,
						padding: 0
					},
					children: "×"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					ref: viewport,
					onPointerDown: (event) => {
						if (zoom === MIN_ZOOM || event.button !== 0) return;
						dragStart.current = {
							pointerId: event.pointerId,
							clientX: event.clientX,
							clientY: event.clientY,
							scrollLeft: event.currentTarget.scrollLeft,
							scrollTop: event.currentTarget.scrollTop
						};
						event.currentTarget.setPointerCapture?.(event.pointerId);
						setDragging(true);
					},
					onPointerMove: (event) => {
						const start = dragStart.current;
						if (start === null || start.pointerId !== event.pointerId) return;
						event.currentTarget.scrollLeft = start.scrollLeft - (event.clientX - start.clientX);
						event.currentTarget.scrollTop = start.scrollTop - (event.clientY - start.clientY);
						event.preventDefault();
					},
					onPointerUp: (event) => {
						if (dragStart.current?.pointerId !== event.pointerId) return;
						dragStart.current = null;
						if (event.currentTarget.hasPointerCapture?.(event.pointerId) === true) event.currentTarget.releasePointerCapture(event.pointerId);
						setDragging(false);
					},
					onPointerCancel: () => {
						dragStart.current = null;
						setDragging(false);
					},
					style: {
						width: "100%",
						height: "100%",
						overflow: "auto",
						cursor: zoom === MIN_ZOOM ? "zoom-in" : dragging ? "grabbing" : "grab"
					},
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							width: `${zoom * 100}%`,
							height: `${zoom * 100}%`
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
							src,
							alt,
							draggable: false,
							style: {
								display: "block",
								width: "100%",
								height: "100%",
								objectFit: "contain"
							}
						})
					})
				})
			]
		})
	});
}
function ImagineFrame({ attachment, load, t: translate, onOpen }) {
	const t = translate ?? FALLBACK_TRANSLATE;
	const [src, setSrc] = (0, react.useState)(null);
	const [error, setError] = (0, react.useState)(false);
	(0, react.useEffect)(() => {
		let live = true;
		setError(false);
		setSrc(null);
		load(attachment).then((url) => {
			if (live) setSrc(url);
		}).catch(() => {
			if (live) setError(true);
		});
		return () => {
			live = false;
		};
	}, [
		attachment.attachmentId,
		attachment.bytes,
		attachment.height,
		attachment.mediaType,
		attachment.name,
		attachment.width,
		load
	]);
	if (error) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		style: mediaCardStyles.muted,
		children: t("imageUiImageUnavailable")
	});
	if (src === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		style: mediaCardStyles.muted,
		children: t("imageUiLoadingImage")
	});
	const label = attachment.name ?? TOOL_NAME;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
		type: "button",
		title: t("imageUiViewLarge"),
		"aria-label": `${t("imageUiViewLarge")}: ${label}`,
		onClick: () => {
			onOpen({
				src,
				label
			});
		},
		style: {
			display: "block",
			padding: 0,
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 12,
			background: "var(--dsw-alias-bg-secondary, transparent)",
			cursor: "zoom-in",
			overflow: "hidden",
			width: "100%",
			maxWidth: "100%"
		},
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
			src,
			alt: label,
			style: {
				display: "block",
				width: "100%",
				height: "auto",
				maxHeight: 360,
				objectFit: "contain"
			}
		})
	});
}
function ActionButton({ t: translate, label, onClick, disabled, primary }) {
	const t = translate ?? FALLBACK_TRANSLATE;
	const [state, setState] = (0, react.useState)("idle");
	const alive = (0, react.useRef)(true);
	(0, react.useEffect)(() => {
		alive.current = true;
		return () => {
			alive.current = false;
		};
	}, []);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
		type: "button",
		style: primary === true ? {
			...mediaCardStyles.action,
			...mediaCardStyles.primaryAction
		} : mediaCardStyles.action,
		disabled: disabled === true || state === "pending",
		"aria-busy": state === "pending",
		onClick: () => {
			if (state === "pending" || disabled === true) return;
			setState("pending");
			Promise.resolve().then(onClick).then(() => {
				if (alive.current) setState("idle");
			}).catch(() => {
				if (alive.current) setState("failed");
			});
		},
		children: state === "pending" ? t("working") : state === "failed" ? t("actionFailed") : label
	});
}
/** Compact one-line technical summary of an image (media-first key specs). */
function imageSpecLine(images) {
	return images.map((image) => `${image.width}×${image.height} · ${formatMediaType(image.mediaType)} · ${formatBytes(image.bytes)}`).join("  ·  ");
}
/** Full attachment refs and technical info; always folded into details. */
function ImageInfoSection({ images, t: translate }) {
	const t = translate ?? FALLBACK_TRANSLATE;
	if (images.length === 0) return null;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
		"aria-label": t("imageUiImageInfo"),
		style: {
			display: "grid",
			gap: 6
		},
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
			style: sectionHeading,
			children: t("imageUiImageInfo")
		}), images.map((image, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			style: {
				display: "grid",
				gap: 2
			},
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
				image.name ?? `${t("imageUiImage")} ${index + 1}`,
				" · ",
				formatMediaType(image.mediaType),
				" · ",
				image.width,
				"×",
				image.height,
				" · ",
				formatBytes(image.bytes)
			] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: `attachmentId: ${image.attachmentId}` })]
		}, image.attachmentId))]
	});
}
function PromptSection({ prompt, t: translate }) {
	const t = translate ?? FALLBACK_TRANSLATE;
	if (prompt === "") return null;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
		"aria-label": t("imageUiPrompt"),
		style: {
			display: "grid",
			gap: 6
		},
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
			style: sectionHeading,
			children: t("imageUiPrompt")
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
			style: blockStyle,
			children: prompt
		})]
	});
}
/**
* Done card: media-first (bounded gallery + key specs + primary view and
* download), everything long — prompt, raw result, full attachment refs,
* technical info, local inputs — behind the collapsed details. A text-only
* result (save_path fallback) has no media, so its text stays visible.
*/
function ImagineResultCard({ block, sessionId, sessions, openFile, t: translate }) {
	const t = translate ?? FALLBACK_TRANSLATE;
	const load = useImageLoader(sessionId, sessions);
	const images = imageAttachments(block);
	const prompt = promptOf(block);
	const resultText = textOf(block);
	const inputs = inputSources(block);
	const hasImages = images.length > 0;
	const isEdit = toolNameOf(block) === "grok_imagine_edit";
	const [copyState, setCopyState] = (0, react.useState)("idle");
	const [viewer, setViewer] = (0, react.useState)(null);
	const closeViewer = (0, react.useCallback)(() => {
		setViewer(null);
	}, []);
	(0, react.useEffect)(() => {
		if (copyState === "idle") return;
		const timer = window.setTimeout(() => {
			setCopyState("idle");
		}, 2e3);
		return () => {
			window.clearTimeout(timer);
		};
	}, [copyState]);
	if (!hasImages && resultText === "") return null;
	const canPrompt = prompt !== "" && typeof sessionId === "string" && typeof sessions?.binding === "function";
	const specLine = hasImages ? imageSpecLine(images) : "";
	const hasDetails = prompt !== "" || hasImages || inputs.length > 0;
	const preview = hasImages ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		"data-testid": "grok-imagine-gallery",
		style: {
			...mediaCardStyles.preview,
			display: "grid",
			gridTemplateColumns: images.length === 1 ? "1fr" : "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
			gap: 10,
			boxSizing: "border-box",
			width: "100%",
			maxWidth: "100%",
			padding: 12
		},
		children: images.map((attachment, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ImagineFrame, {
			attachment,
			load,
			t,
			onOpen: setViewer
		}, `${attachment.attachmentId}:${index}`))
	}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
		"aria-label": t("imageUiResult"),
		style: {
			display: "grid",
			gap: 6,
			maxWidth: GALLERY_MAX_WIDTH
		},
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
			style: sectionHeading,
			children: t("imageUiResult")
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
			style: blockStyle,
			children: resultText
		})]
	});
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(MediaCardFrame, {
		testId: "grok-imagine-result",
		ariaLabel: "grok_imagine",
		title: t(isEdit ? "imageUiEdited" : "imageUiGenerated"),
		status: t("imageUiStatusDone"),
		statusTone: "success",
		summary: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [sourceBadge(SOURCE_LABEL, SOURCE_TONES.grok), specLine === "" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: specLine })] }),
		preview,
		actions: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
			images.map((image, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionButton, {
				t,
				label: images.length === 1 ? t("imageUiViewLarge") : `${t("imageUiViewLarge")} ${index + 1}`,
				onClick: async () => {
					setViewer({
						src: await load(image),
						label: image.name ?? TOOL_NAME
					});
				}
			}, `view:${image.attachmentId}`)),
			images.map((image, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionButton, {
				t,
				primary: true,
				label: images.length === 1 ? t("imageUiDownload") : `${t("imageUiDownload")} ${index + 1}`,
				onClick: async () => {
					triggerDownload(await load(image), image.name ?? `grok-imagine.${extensionFor(image.mediaType)}`);
				}
			}, `download:${image.attachmentId}`)),
			images.map((image, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionButton, {
				t,
				label: images.length === 1 ? t("imageUiCopyImage") : `${t("imageUiCopyImage")} ${index + 1}`,
				onClick: async () => {
					const blob = await (await fetch(await load(image))).blob();
					await navigator.clipboard.write([new ClipboardItem({ [blob.type || image.mediaType]: blob })]);
				}
			}, `copy:${image.attachmentId}`)),
			prompt !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionButton, {
				t,
				label: copyState === "copied" ? t("imageUiCopied") : copyState === "failed" ? t("imageUiCopyFailed") : t("imageUiCopyPrompt"),
				onClick: async () => {
					try {
						await navigator.clipboard.writeText(prompt);
						setCopyState("copied");
					} catch (error) {
						setCopyState("failed");
						throw error;
					}
				}
			}) : null,
			canPrompt ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionButton, {
				t,
				label: t("imageUiRegenerate"),
				onClick: async () => {
					if ((await sessions.binding(sessionId)?.session?.prompt?.([{
						type: "text",
						text: regenerateText(toolNameOf(block), prompt, argsOf(block), t)
					}], "queue"))?.ok !== true) throw new Error("regenerate failed");
				}
			}) : null
		] }),
		details: hasDetails ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PromptSection, {
				prompt,
				t
			}),
			hasImages && resultText !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				"aria-label": t("imageUiResult"),
				style: {
					display: "grid",
					gap: 6
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
					style: sectionHeading,
					children: t("imageUiResult")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
					style: blockStyle,
					children: resultText
				})]
			}) : null,
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SourceImages, {
				block,
				sessionId,
				sessions,
				openFile,
				t
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ImageInfoSection, {
				images,
				t
			})
		] }) : void 0,
		detailsLabel: t("imageUiDetails")
	}), viewer === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ImagineLightbox, {
		src: viewer.src,
		alt: viewer.label,
		t,
		onClose: closeViewer
	})] });
}
function SourceImages({ block, sessionId, sessions, openFile, t: translate }) {
	const t = translate ?? FALLBACK_TRANSLATE;
	const load = useImageLoader(sessionId, sessions);
	const sources = inputSources(block);
	if (sources.length === 0) return null;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
		"aria-label": t("imageUiInputImages"),
		style: {
			display: "grid",
			gap: 8,
			width: "100%"
		},
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
			style: sectionHeading,
			children: t("imageUiInputImages")
		}), sources.map((source, index) => {
			let ref;
			try {
				ref = imageRef(JSON.parse(source.replace(/^attachment=/u, "")));
			} catch {}
			const id = /sha256:[a-f0-9]{64}/u.exec(source)?.[0];
			if (ref !== void 0 || id !== void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SourceAttachment, {
				id: ref?.attachmentId ?? id,
				load,
				t
			}, index);
			if (/^data:image\/(png|jpeg|webp);base64,/iu.test(source)) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
				src: source,
				alt: `${t("imageUiInputImage")} ${index + 1}`,
				style: {
					maxWidth: 240,
					maxHeight: 160,
					objectFit: "contain"
				}
			}, index);
			if (/^https?:\/\//iu.test(source)) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
				href: source,
				target: "_blank",
				rel: "noreferrer",
				children: `${t("imageUiInputImage")} ${index + 1} ${t("imageUiRemoteLink")}`
			}, index);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: { overflowWrap: "anywhere" },
				children: [source, openFile ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					style: mediaCardStyles.action,
					onClick: () => openFile(source),
					children: t("imageUiOpenInput")
				}) : null]
			}, index);
		})]
	});
}
function SourceAttachment({ id, load, t: translate }) {
	const t = translate ?? FALLBACK_TRANSLATE;
	const [src, setSrc] = (0, react.useState)(null);
	const [failed, setFailed] = (0, react.useState)(false);
	(0, react.useEffect)(() => {
		let live = true;
		setSrc(null);
		setFailed(false);
		load({ attachmentId: id }).then((value) => {
			if (live) setSrc(value);
		}).catch(() => {
			if (live) setFailed(true);
		});
		return () => {
			live = false;
		};
	}, [id, load]);
	return src ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
		src,
		alt: t("imageUiInputImages"),
		style: {
			maxWidth: 240,
			maxHeight: 160,
			objectFit: "contain"
		}
	}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		style: mediaCardStyles.muted,
		children: [failed ? t("imageUiInputReadFailed") : t("imageUiLoadingInput"), id]
	});
}
/**
* Pending card: same frame, busy status, progress, local inputs, and the
* stop-waiting action with its billing honesty note (pending only — a settled
* card never offers it). A new request is only ever issued by an explicit
* user click, never on render.
*/
function GeneratingCard({ block, sessionId, sessions, openFile, t: translate }) {
	const t = translate ?? FALLBACK_TRANSLATE;
	const prompt = promptOf(block);
	const isEdit = toolNameOf(block) === "grok_imagine_edit";
	const canStop = typeof sessionId === "string" && typeof sessions?.binding === "function";
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MediaCardFrame, {
		testId: "grok-imagine-pending",
		title: t(isEdit ? "imageUiEditing" : "imageUiGenerating"),
		status: t("working"),
		statusTone: "busy",
		summary: sourceBadge(SOURCE_LABEL, SOURCE_TONES.grok),
		preview: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			style: {
				display: "grid",
				gap: 10,
				width: "100%",
				maxWidth: GALLERY_MAX_WIDTH
			},
			children: [
				prompt !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						...mediaCardStyles.prompt,
						color: "var(--dsw-alias-label-secondary)"
					},
					children: prompt
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: mediaCardStyles.muted,
					children: t("imageUiReceivingArgs")
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("progress", { style: {
					width: "100%",
					height: 4
				} }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SourceImages, {
					block,
					sessionId,
					sessions,
					openFile,
					t
				})
			]
		}),
		notice: canStop ? t("imageUiStopNotice") : void 0,
		actions: canStop ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionButton, {
			t,
			label: t("imageUiStopWaiting"),
			onClick: async () => {
				if ((await sessions.binding(sessionId)?.session?.cancel?.())?.ok !== true) throw new Error("cancel failed");
			}
		}) : void 0,
		detailsLabel: t("imageUiDetails")
	});
}
/** Errored call: unified frame, error status, prompt and host text stay visible. */
function ImagineFailureCard({ block, sessionId, sessions, openFile, t: translate }) {
	const t = translate ?? FALLBACK_TRANSLATE;
	const prompt = promptOf(block);
	const text = textOf(block);
	const images = imageAttachments(block);
	const inputs = inputSources(block);
	const isEdit = toolNameOf(block) === "grok_imagine_edit";
	const hasDetails = inputs.length > 0 || images.length > 0;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MediaCardFrame, {
		testId: "grok-imagine-failure",
		title: t(isEdit ? "imageUiEditFailed" : "imageUiGenerateFailed"),
		status: t("actionFailed"),
		statusTone: "error",
		summary: sourceBadge(SOURCE_LABEL, SOURCE_TONES.grok),
		preview: prompt !== "" || text !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			style: {
				display: "grid",
				gap: 8,
				width: "100%",
				maxWidth: GALLERY_MAX_WIDTH
			},
			children: [prompt !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					...mediaCardStyles.prompt,
					color: "var(--dsw-alias-label-secondary)"
				},
				children: prompt
			}) : null, text !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
				style: blockStyle,
				children: text
			}) : null]
		}) : void 0,
		details: hasDetails ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SourceImages, {
			block,
			sessionId,
			sessions,
			openFile,
			t
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ImageInfoSection, {
			images,
			t
		})] }) : void 0,
		detailsLabel: t("imageUiDetails")
	});
}
function GrokImagineToolView(rawProps) {
	const props = rawProps.owner ? {
		...rawProps,
		block: rawProps.owner.block,
		openFile: rawProps.owner.openFile
	} : rawProps;
	if (!(isObject(props.block) && "kind" in props.block)) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(GeneratingCard, { ...props });
	if (props.block.isError === true) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ImagineFailureCard, { ...props });
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ImagineResultCard, { ...props });
}
function walkTurnImageResults(rows, closingSeq, names) {
	if (!Array.isArray(rows)) return [];
	const images = [];
	const visited = /* @__PURE__ */ new Set();
	for (const row of rows) {
		if (!isObject(row)) continue;
		const pending = row.root === void 0 ? [] : [row.root];
		while (pending.length > 0) {
			const block = pending.pop();
			if (block === void 0) continue;
			const record = isObject(block) ? block : void 0;
			if (record === void 0) continue;
			const callId = typeof record.callId === "string" ? record.callId : "";
			if (callId !== "" && visited.has(callId)) continue;
			if (callId !== "") visited.add(callId);
			const seq = typeof record.seq === "number" ? record.seq : Number.POSITIVE_INFINITY;
			const callName = record.call?.name;
			if ("kind" in record && record.isError !== true && seq <= closingSeq && callName !== void 0 && names.has(callName) && imageAttachments(record).length > 0) images.push(record);
			const children = Array.isArray(record.subCalls) ? record.subCalls : [];
			for (let index = children.length - 1; index >= 0; index--) if (children[index] !== void 0) pending.push(children[index]);
		}
	}
	return images.sort((left, right) => (left.seq ?? 0) - (right.seq ?? 0));
}
function selectTurnImagineResults(rows, closingSeq) {
	return walkTurnImageResults(rows, closingSeq, TOOL_NAMES);
}
/** Codex-line image count this turn; legend only. */
function countTurnCodexResults(rows, closingSeq) {
	return walkTurnImageResults(rows, closingSeq, CODEX_TOOL_NAMES).length;
}
function GrokImagineTurnTail(rawProps) {
	const props = rawProps.owner ? {
		...rawProps,
		...rawProps.owner
	} : rawProps;
	const t = props.t ?? FALLBACK_TRANSLATE;
	const empty = (0, react.useMemo)(() => {
		const rows = [];
		return {
			subscribe: () => () => void 0,
			getSnapshot: () => rows
		};
	}, []);
	const chat = typeof props.useChat === "function" ? props.useChat((chat) => chat) : void 0;
	const source = (0, react.useMemo)(() => props.turn !== void 0 && typeof chat?.nodes.turnDataSource === "function" ? chat.nodes.turnDataSource(props.turn.turn, "tool-call") : empty, [
		chat,
		props.turn?.turn,
		empty
	]);
	const legacyRows = (0, react.useSyncExternalStore)(source.subscribe, source.getSnapshot, source.getSnapshot);
	const rows = (0, react.useMemo)(() => typeof chat?.nodes.values === "function" ? chat.nodes.values().filter((node) => node.kind === "tool-call" && node.location?.turn?.turn === props.turn?.turn).map((node) => node.data) : legacyRows, [
		chat,
		props.turn?.turn,
		legacyRows
	]);
	const results = (0, react.useMemo)(() => selectTurnImagineResults(rows, props.seq ?? Number.POSITIVE_INFINITY), [rows, props.seq]);
	const codexCount = (0, react.useMemo)(() => countTurnCodexResults(rows, props.seq ?? Number.POSITIVE_INFINITY), [rows, props.seq]);
	if (results.length === 0) return null;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
		"data-turn-image-results": "grok-imagine",
		"aria-label": "grok_imagine",
		style: {
			display: "grid",
			gap: 12,
			minWidth: 0
		},
		children: [codexCount > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			style: {
				...mediaCardStyles.muted,
				display: "flex",
				alignItems: "center",
				flexWrap: "wrap",
				gap: 8
			},
			children: [sourceBadge(SOURCE_LABEL, SOURCE_TONES.grok), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: `${t("imageUiCodexLegendA")}${String(codexCount)}${t("imageUiCodexLegendB")}` })]
		}) : null, results.map((block) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ImagineResultCard, {
			block,
			sessionId: props.sessionId,
			sessions: props.sessions,
			openFile: props.openFile,
			t
		}, block.callId ?? String(block.seq)))]
	});
}
/**
* Register the toolview occupant for both grok image tools and the turn-tail
* summary. Called from the client entry; requires the `sessions` service via
* a child fiber so the registrations unload with it.
*
* The translator is bound from the plugin's existing settings locale namespace
* (`settings.xai-oauth`, registered with zh + en by the client entry) so the
* cards follow the host language. If the locale service is not available the
* views fall back to the English copy — never to hardcoded Chinese.
*/
function applyImagineViews(ctx) {
	const t = typeof ctx.locale?.bind === "function" ? ctx.locale.bind("settings.xai-oauth") : FALLBACK_TRANSLATE;
	ctx.inject(["sessions"], (scope) => {
		const sessions = scope.sessions;
		for (const key of TOOL_NAMES) scope.slots.inject("tool.call.toolview", () => scope.slots.register({
			name: "tool.call.toolview",
			key,
			inject: () => ({
				sessions,
				t
			})
		}, GrokImagineToolView));
		scope.slots.inject("conversation.chat.turnTail", () => scope.slots.register({
			name: "conversation.chat.turnTail",
			id: "dsh-grok-kit-imagine",
			order: 21,
			inject: () => ({
				sessions,
				t
			})
		}, GrokImagineTurnTail));
	});
}
//#endregion
//#region src/client/index.tsx
const name = "dsh-grok-kit-client";
const inject = ["slots", "locale"];
function apply(ctx) {
	const namespace = "settings.xai-oauth";
	ctx.effect(() => {
		try {
			return ctx.locale.register(namespace, {
				zh,
				en
			});
		} catch (error) {
			console.warn("dsh-grok-kit: settings locale namespace already registered; reusing the existing copy.", error);
			return () => void 0;
		}
	}, "dsh-grok-kit: settings copy");
	const t = ctx.locale.bind(namespace);
	ctx.slots.inject("settings.section", () => {
		if (ctx.slots.entries("settings.section").some((entry) => entry.id === "xai-oauth")) {
			console.warn("dsh-grok-kit: settings section slot already registered; keeping the existing entry.");
			return () => void 0;
		}
		return ctx.slots.register({
			name: "settings.section",
			id: "xai-oauth",
			order: 16,
			label: () => t("nav"),
			inject: () => ({ t })
		}, XaiSettings);
	});
	decorateSettingsNavIcon(ctx);
	applyImagineViews(ctx);
	applyVideoViews(ctx);
}
//#endregion
exports.apply = apply;
exports.inject = inject;
exports.name = name;
