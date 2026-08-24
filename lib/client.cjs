Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
let react = require("react");
let react_jsx_runtime = require("react/jsx-runtime");
//#region src/client/XaiSettings.tsx
/** Plugin-owned xAI Grok account page inside the dsh Settings shell. */
const STATUS_PATH = "/plugins/dsh-grok-kit/auth/status";
const LOGIN_PATH = "/plugins/dsh-grok-kit/auth/login";
const IMPORT_PATH = "/plugins/dsh-grok-kit/auth/import";
const LOGOUT_PATH = "/plugins/dsh-grok-kit/auth/logout";
const MODELS_PATH = "/plugins/dsh-grok-kit/auth/models";
const PROXY_PATH = "/plugins/dsh-grok-kit/auth/proxy";
const POLL_INTERVAL_MS = 1e3;
const pageStyle = {
	display: "flex",
	flexDirection: "column",
	gap: 18,
	maxWidth: 720
};
const headerStyle = {
	display: "flex",
	alignItems: "center",
	gap: 14
};
const logoStyle = {
	flex: "0 0 auto",
	width: 40,
	height: 40,
	borderRadius: 12,
	display: "grid",
	placeItems: "center",
	background: "linear-gradient(135deg, var(--dsw-alias-brand-primary, #1677ff), var(--dsw-alias-state-info-primary, #4f6bed))",
	color: "white",
	fontSize: 22,
	fontWeight: 700,
	fontFamily: "ui-sans-serif, system-ui, sans-serif",
	lineHeight: 1
};
const titleStyle = {
	margin: 0,
	fontSize: 20,
	lineHeight: "28px",
	fontWeight: 600,
	color: "var(--dsw-alias-label-primary)"
};
const bodyStyle = {
	margin: 0,
	fontSize: 14,
	lineHeight: "22px",
	color: "var(--dsw-alias-label-secondary)"
};
const cardStyle = {
	display: "flex",
	flexDirection: "column",
	gap: 14,
	padding: "18px 20px",
	border: "1px solid var(--dsw-alias-border-l2)",
	borderRadius: 12,
	background: "var(--dsw-alias-bg-module-platform)"
};
const rowStyle = {
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
	flexWrap: "wrap",
	gap: 12
};
const statusStyle = {
	display: "flex",
	alignItems: "center",
	gap: 9,
	fontSize: 15,
	fontWeight: 500,
	color: "var(--dsw-alias-label-primary)"
};
const buttonStyle = {
	boxSizing: "border-box",
	minHeight: 34,
	padding: "6px 14px",
	border: "1px solid var(--dsw-alias-border-l2)",
	borderRadius: 18,
	background: "var(--dsw-alias-bg-layer-1)",
	color: "var(--dsw-alias-label-primary)",
	font: "inherit",
	fontSize: 14,
	cursor: "pointer"
};
const primaryButtonStyle = {
	...buttonStyle,
	borderColor: "var(--dsw-alias-brand-primary)",
	background: "var(--dsw-alias-brand-primary)",
	color: "white"
};
const errorStyle = {
	...bodyStyle,
	color: "var(--dsw-alias-state-error-primary)"
};
const codeBoxStyle = {
	display: "flex",
	alignItems: "center",
	flexWrap: "wrap",
	gap: 10,
	padding: "10px 14px",
	border: "1px dashed var(--dsw-alias-border-l2)",
	borderRadius: 10,
	background: "var(--dsw-alias-bg-layer-1)"
};
const codeStyle = {
	fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
	fontSize: 20,
	letterSpacing: "0.08em",
	fontWeight: 600,
	color: "var(--dsw-alias-label-primary)"
};
const linkStyle = {
	color: "var(--dsw-alias-brand-primary)",
	wordBreak: "break-all"
};
const listStyle = {
	display: "flex",
	flexDirection: "column",
	gap: 4,
	margin: 0,
	padding: 0,
	listStyle: "none"
};
const modelRowStyle = {
	display: "flex",
	alignItems: "center",
	gap: 10,
	padding: "6px 10px",
	borderRadius: 8,
	color: "var(--dsw-alias-label-primary)"
};
const modelNameStyle = {
	fontSize: 14,
	fontWeight: 500
};
const modelIdStyle = {
	fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
	fontSize: 12,
	color: "var(--dsw-alias-label-dimmed)"
};
const badgeStyle = {
	display: "inline-flex",
	alignItems: "center",
	gap: 5,
	padding: "2px 9px",
	borderRadius: 999,
	border: "1px solid var(--dsw-alias-border-l2)",
	fontSize: 12,
	fontWeight: 500,
	color: "var(--dsw-alias-label-secondary)",
	whiteSpace: "nowrap"
};
const sourceBadgeStyle = {
	...badgeStyle,
	fontWeight: 600
};
function sourceBadge(source) {
	switch (source) {
		case "live": return {
			text: "Live",
			color: "var(--dsw-alias-state-success-primary, #22a06b)"
		};
		case "cache": return {
			text: "Cached",
			color: "var(--dsw-alias-state-info-primary, #4f6bed)"
		};
		case "fallback": return {
			text: "Fallback",
			color: "var(--dsw-alias-label-dimmed, #9aa0a6)"
		};
		default: return {
			text: "—",
			color: "var(--dsw-alias-label-dimmed, #9aa0a6)"
		};
	}
}
function dotStyle(status) {
	return {
		width: 9,
		height: 9,
		borderRadius: "50%",
		flex: "0 0 auto",
		background: status === "signed-in" ? "var(--dsw-alias-state-success-primary, #22a06b)" : status === "error" ? "var(--dsw-alias-state-error-primary, #d92d20)" : status === "signing-in" || status === "loading" ? "var(--dsw-alias-brand-primary, #1677ff)" : "var(--dsw-alias-label-dimmed, #9aa0a6)"
	};
}
/** grok-4.6 → "Grok 4.6"; only used for display, never sent to the API. */
function displayName(id) {
	return id.split(/[-_]/g).map((part) => part.length === 0 ? part : part[0].toUpperCase() + part.slice(1)).join(" ");
}
async function jsonRequest(path, method = "GET", body) {
	const response = await fetch(path, {
		method,
		headers: {
			accept: "application/json",
			...body === void 0 ? {} : { "content-type": "application/json" }
		},
		credentials: "same-origin",
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
	const [busy, setBusy] = (0, react.useState)(false);
	const [proxyUrl, setProxyUrl] = (0, react.useState)("");
	const [proxyBusy, setProxyBusy] = (0, react.useState)(false);
	const [proxyFeedback, setProxyFeedback] = (0, react.useState)("idle");
	const [popupBlocked, setPopupBlocked] = (0, react.useState)(false);
	const loadProxy = (0, react.useCallback)(async () => {
		try {
			const value = await jsonRequest(PROXY_PATH);
			setProxyUrl(value.proxyUrl ?? "");
		} catch {
			setProxyFeedback("error");
		}
	}, []);
	const saveProxy = async () => {
		setProxyBusy(true);
		try {
			await jsonRequest(PROXY_PATH, "POST", { proxyUrl });
			setProxyFeedback("saved");
		} catch {
			setProxyFeedback("error");
		} finally {
			setProxyBusy(false);
		}
	};
	const refresh = (0, react.useCallback)(async () => {
		try {
			setStatus(await jsonRequest(STATUS_PATH));
		} catch (error) {
			setStatus({
				status: "error",
				message: error instanceof Error ? error.message : t("requestFailed")
			});
		}
	}, [t]);
	(0, react.useEffect)(() => {
		refresh();
	}, [refresh]);
	(0, react.useEffect)(() => {
		loadProxy();
	}, [loadProxy]);
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
		}
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
		setBusy(true);
		try {
			setStatus(await jsonRequest(IMPORT_PATH, "POST"));
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
		setBusy(true);
		try {
			setStatus(await jsonRequest(LOGOUT_PATH, "POST"));
		} catch (error) {
			setStatus({
				status: "error",
				message: error instanceof Error ? error.message : t("requestFailed")
			});
		} finally {
			setBusy(false);
		}
	};
	const shared = status.status !== "loading" && status.sharedGrokAuth === true;
	const label = status.status === "signed-in" ? t(shared ? "signedInShared" : "signedIn") : status.status === "loading" ? t("loadingAccount") : status.status === "signing-in" ? t("signingIn") : status.status === "error" ? t("requestFailed") : t(shared ? "signedOutShared" : "signedOut");
	const modelIds = status.status === "signed-in" ? status.available ?? status.models ?? [] : [];
	const selectedIds = status.status === "signed-in" ? status.selected ?? status.models ?? [] : [];
	const source = status.status === "signed-in" ? sourceBadge(status.catalogSource) : null;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
		style: pageStyle,
		"aria-labelledby": "xai-oauth-settings-title",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
				style: headerStyle,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: logoStyle,
					"aria-hidden": "true",
					children: "ɡ"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: { minWidth: 0 },
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
						id: "xai-oauth-settings-title",
						style: titleStyle,
						children: t("title")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: {
							...bodyStyle,
							marginTop: 4
						},
						children: t("intro")
					})]
				})]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: cardStyle,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: rowStyle,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: statusStyle,
							role: "status",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								"aria-hidden": "true",
								style: dotStyle(status.status)
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: label })]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								display: "flex",
								flexWrap: "wrap",
								gap: 8
							},
							children: status.status === "loading" ? null : status.status === "signed-in" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: buttonStyle,
								disabled: busy,
								onClick: () => {
									signOut();
								},
								children: busy ? t("working") : t(shared ? "logoutShared" : "logout")
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: primaryButtonStyle,
								disabled: busy || status.status === "signing-in",
								onClick: () => {
									signIn();
								},
								children: busy ? t("working") : status.status === "error" ? t("loginAgain") : t(shared ? "loginShared" : "login")
							}), status.grokImportAvailable === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: buttonStyle,
								disabled: busy,
								onClick: () => {
									importGrok();
								},
								children: t("importGrok")
							}) : null] })
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: {
							...bodyStyle,
							fontSize: 12,
							color: "var(--dsw-alias-label-dimmed)"
						},
						children: t("unofficialNotice")
					}),
					status.status === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: errorStyle,
						children: status.message
					}) : null,
					status.status !== "loading" && status.sharedGrokAuth === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: bodyStyle,
						children: t("sharedGrok")
					}) : null,
					status.status !== "signed-in" && status.status !== "loading" && status.grokImportAvailable === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: bodyStyle,
						children: t("importHint")
					}) : null,
					status.status === "signing-in" && status.userCode !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: codeBoxStyle,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: bodyStyle,
							children: t("userCode")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: codeStyle,
							children: status.userCode
						})]
					}) : null,
					status.status === "signing-in" && status.url !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						style: bodyStyle,
						children: [
							t(popupBlocked ? "popupBlocked" : "openUrl"),
							" ",
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
								href: status.url,
								target: "_blank",
								rel: "noreferrer",
								style: linkStyle,
								children: status.url
							})
						]
					}) : null
				]
			}),
			status.status === "signed-in" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: cardStyle,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: rowStyle,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: 8
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
									style: {
										...titleStyle,
										fontSize: 14
									},
									children: t("models")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: badgeStyle,
									children: String(modelIds.length)
								}),
								source === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										...sourceBadgeStyle,
										color: source.color
									},
									children: source.text
								})
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							style: buttonStyle,
							disabled: busy,
							onClick: () => {
								saveModels([]);
							},
							children: t("selectAll")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: bodyStyle,
						children: status.catalogSource === "live" ? t("catalogLive") : status.catalogSource === "cache" ? t("catalogCache") : t("catalogFallback")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: bodyStyle,
						children: t("modelHint")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
						style: listStyle,
						children: modelIds.map((id) => {
							const checked = selectedIds.includes(id);
							return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								style: modelRowStyle,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "checkbox",
										checked,
										disabled: busy,
										onChange: () => {
											const current = new Set(selectedIds);
											if (checked) current.delete(id);
											else current.add(id);
											saveModels([...current]);
										}
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: modelNameStyle,
										children: displayName(id)
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: modelIdStyle,
										children: id
									})
								]
							}) }, id);
						})
					}),
					status.catalogError === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: errorStyle,
						children: t("catalogError")
					})
				]
			}) : null,
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: cardStyle,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						style: {
							...titleStyle,
							fontSize: 14
						},
						children: t("proxyTitle")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							flexWrap: "wrap",
							gap: 8
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "text",
							value: proxyUrl,
							placeholder: t("proxyPlaceholder"),
							disabled: proxyBusy,
							"aria-label": t("proxyTitle"),
							onChange: (event) => {
								setProxyUrl(event.target.value);
								setProxyFeedback("idle");
							},
							style: {
								flex: "1 1 260px",
								minHeight: 34,
								padding: "6px 12px",
								border: "1px solid var(--dsw-alias-border-l2)",
								borderRadius: 10,
								background: "var(--dsw-alias-bg-layer-1)",
								color: "var(--dsw-alias-label-primary)",
								font: "inherit",
								fontSize: 14
							}
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							style: buttonStyle,
							disabled: proxyBusy,
							onClick: () => {
								saveProxy();
							},
							children: proxyBusy ? t("working") : t("proxySave")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: bodyStyle,
						children: t("proxyHint")
					}),
					proxyFeedback === "saved" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: {
							...bodyStyle,
							color: "var(--dsw-alias-state-success-primary, #22a06b)"
						},
						children: t("proxySaved")
					}) : null,
					proxyFeedback === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: errorStyle,
						children: t("proxyError")
					}) : null
				]
			})
		]
	});
}
//#endregion
//#region src/client/locales.ts
/** English copy for the xAI Grok settings page. */
const en = {
	nav: "xAI Grok",
	title: "xAI Grok",
	intro: "Use your SuperGrok or X Premium subscription in dsh without an API key. grok-4.6 searches the web and X on the same turn as the reply.",
	unofficialNotice: "Unofficial integration: not an xAI or X product; no affiliation or endorsement. OAuth availability depends on account entitlement and current xAI policies.",
	loadingAccount: "Loading account…",
	signedOut: "Not signed in",
	signedOutShared: "Not signed in · will use ~/.grok/auth.json",
	signingIn: "Waiting for xAI authorization…",
	signedIn: "Signed in",
	signedInShared: "Signed in via Grok CLI (~/.grok/auth.json)",
	login: "Sign in with SuperGrok",
	loginShared: "Sign in (writes ~/.grok/auth.json)",
	loginAgain: "Sign in again",
	logout: "Sign out",
	logoutShared: "Sign out of dsh and Grok CLI",
	confirmLogoutShared: "This removes the xAI slot in ~/.grok/auth.json. Grok CLI will be signed out too. Continue?",
	confirmLoginShared: "This replaces the Grok CLI login in ~/.grok/auth.json. Continue?",
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
	proxyHint: "Applies to x.ai traffic only; every other request stays direct. HTTP/HTTPS proxies only. Example: http://127.0.0.1:8080",
	proxyPlaceholder: "http://127.0.0.1:8080",
	proxySave: "Save proxy",
	proxySaved: "Proxy saved",
	proxyError: "Could not save the proxy setting."
};
const zh = {
	nav: "xAI Grok",
	title: "xAI Grok",
	intro: "使用 SuperGrok 或 X Premium 订阅在 dsh 中调用 Grok，无需 API Key。grok-4.6 会在同一轮回复里做网页和 X 搜索。",
	unofficialNotice: "非官方集成：与 xAI / X 无隶属或背书关系；OAuth 可用性取决于账户资格与 xAI 当前策略。",
	loadingAccount: "正在加载账户信息…",
	signedOut: "尚未登录",
	signedOutShared: "尚未登录 · 将使用 ~/.grok/auth.json",
	signingIn: "正在等待 xAI 授权…",
	signedIn: "已登录",
	signedInShared: "已通过 Grok CLI 登录（~/.grok/auth.json）",
	login: "使用 SuperGrok 登录",
	loginShared: "登录（会写入 ~/.grok/auth.json）",
	loginAgain: "重新登录",
	logout: "退出登录",
	logoutShared: "退出 dsh 和 Grok CLI",
	confirmLogoutShared: "这会清掉 ~/.grok/auth.json 里的 xAI 凭证，Grok CLI 也会掉线。确定？",
	confirmLoginShared: "这会覆盖 ~/.grok/auth.json 里现有的 Grok CLI 登录。确定？",
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
	proxyHint: "只对 x.ai 域名生效，其余请求保持直连。仅支持 HTTP/HTTPS 代理。示例：http://127.0.0.1:8080",
	proxyPlaceholder: "http://127.0.0.1:8080",
	proxySave: "保存代理",
	proxySaved: "代理已保存",
	proxyError: "保存代理设置失败。"
};
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
}
//#endregion
exports.apply = apply;
exports.inject = inject;
exports.name = name;
