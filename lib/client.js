window.__ModuleLoader__.load({
	id: "dsh-grok-kit",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
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
const OPTIONS_PATH = "/plugins/dsh-grok-kit/auth/options";
const POLL_INTERVAL_MS = 1e3;
const ALL_OPTION_KEYS = [
	"backendSearch",
	"nestedSearchTools",
	"statefulResponses",
	"imagineTool",
	"searchModel",
	"searchMaxResults",
	"webSearchTimeoutMs",
	"xSearchTimeoutMs"
];
function optBool(value, fallback) {
	return typeof value === "boolean" ? value : fallback;
}
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
	background: "linear-gradient(135deg, var(--dsw-alias-brand-primary, #1677ff), #4f6bed)",
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
	color: "var(--dsw-alias-label-tertiary, #81858c)"
};
const optionRowStyle = {
	display: "flex",
	alignItems: "center",
	gap: 8,
	fontSize: 14,
	color: "var(--dsw-alias-label-primary)",
	flexWrap: "wrap"
};
const optionHintStyle = {
	...bodyStyle,
	fontSize: 12,
	margin: 0,
	color: "var(--dsw-alias-label-tertiary, #81858c)"
};
const optionInputStyle = {
	flex: "1 1 200px",
	minHeight: 30,
	padding: "4px 10px",
	border: "1px solid var(--dsw-alias-border-l2)",
	borderRadius: 8,
	background: "var(--dsw-alias-bg-layer-1)",
	color: "var(--dsw-alias-label-primary)",
	font: "inherit",
	fontSize: 13
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
function sourceBadge$1(source) {
	switch (source) {
		case "live": return {
			text: "Live",
			color: "var(--dsw-alias-state-success-primary, #22a06b)"
		};
		case "cache": return {
			text: "Cached",
			color: "var(--dsw-alias-brand-primary, #4f6bed)"
		};
		case "fallback": return {
			text: "Fallback",
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
		background: status === "signed-in" ? "var(--dsw-alias-state-success-primary, #22a06b)" : status === "error" ? "var(--dsw-alias-state-error-primary, #d92d20)" : status === "signing-in" || status === "loading" ? "var(--dsw-alias-brand-primary, #1677ff)" : "var(--dsw-alias-label-tertiary, #81858c)"
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
	const [options, setOptions] = (0, react.useState)({});
	const [storedOptions, setStoredOptions] = (0, react.useState)({});
	const [optionsDirty, setOptionsDirty] = (0, react.useState)(/* @__PURE__ */ new Set());
	const [optionsBusy, setOptionsBusy] = (0, react.useState)(false);
	const [optionsFeedback, setOptionsFeedback] = (0, react.useState)("idle");
	const applyOptionsPayload = (value) => {
		setOptions(value.effective ?? value.options ?? {});
		setStoredOptions(value.stored ?? {});
		setOptionsDirty(/* @__PURE__ */ new Set());
	};
	const markOption = (key, value) => {
		setOptions((previous) => ({
			...previous,
			[key]: value
		}));
		setOptionsDirty((previous) => new Set(previous).add(key));
		setOptionsFeedback("idle");
	};
	const loadOptions = (0, react.useCallback)(async () => {
		try {
			applyOptionsPayload(await jsonRequest(OPTIONS_PATH));
		} catch {
			setOptionsFeedback("error");
		}
	}, []);
	const saveOptions = async () => {
		setOptionsBusy(true);
		try {
			const patch = {};
			for (const key of optionsDirty) patch[key] = options[key] ?? null;
			applyOptionsPayload(await jsonRequest(OPTIONS_PATH, "POST", patch));
			setOptionsFeedback("saved");
		} catch {
			setOptionsFeedback("error");
		} finally {
			setOptionsBusy(false);
		}
	};
	const resetOptions = async () => {
		setOptionsBusy(true);
		try {
			const patch = {};
			for (const key of ALL_OPTION_KEYS) patch[key] = null;
			applyOptionsPayload(await jsonRequest(OPTIONS_PATH, "POST", patch));
			setOptionsFeedback("saved");
		} catch {
			setOptionsFeedback("error");
		} finally {
			setOptionsBusy(false);
		}
	};
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
	const source = status.status === "signed-in" ? sourceBadge$1(status.catalogSource) : null;
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
							color: "var(--dsw-alias-label-secondary, #61666b)"
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
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: cardStyle,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: rowStyle,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
							style: {
								...titleStyle,
								fontSize: 14
							},
							children: t("optionsTitle")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							style: buttonStyle,
							disabled: optionsBusy,
							onClick: () => {
								resetOptions();
							},
							children: t("optionsReset")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: bodyStyle,
						children: t("optionsHint")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						style: optionRowStyle,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "checkbox",
							checked: optBool(options.backendSearch, false),
							disabled: optionsBusy,
							onChange: (event) => markOption("backendSearch", event.target.checked)
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("backendSearch") })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: optionHintStyle,
						children: t("backendSearchHint")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						style: optionRowStyle,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "checkbox",
							checked: optBool(options.statefulResponses, false),
							disabled: optionsBusy,
							onChange: (event) => markOption("statefulResponses", event.target.checked)
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("statefulResponses") })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: optionHintStyle,
						children: t("statefulResponsesHint")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						style: optionRowStyle,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "checkbox",
							checked: optBool(options.imagineTool, true),
							disabled: optionsBusy,
							onChange: (event) => markOption("imagineTool", event.target.checked)
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("imagineTool") })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: optionHintStyle,
						children: t("imagineToolHint")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						style: optionRowStyle,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("nestedSearchTools") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
							value: optionsDirty.has("nestedSearchTools") ? options.nestedSearchTools === void 0 ? "auto" : String(options.nestedSearchTools) : storedOptions.nestedSearchTools === void 0 ? "auto" : String(storedOptions.nestedSearchTools),
							disabled: optionsBusy,
							onChange: (event) => markOption("nestedSearchTools", event.target.value === "auto" ? void 0 : event.target.value === "true"),
							style: {
								...optionInputStyle,
								flex: "0 1 auto"
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "auto",
									children: t("nestedSearchToolsAuto")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "true",
									children: "on"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "false",
									children: "off"
								})
							]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: optionHintStyle,
						children: t("nestedSearchToolsHint")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						style: optionRowStyle,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("searchModel") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "text",
							value: String(options.searchModel ?? ""),
							placeholder: "grok-build-0.1",
							disabled: optionsBusy,
							onChange: (event) => markOption("searchModel", event.target.value.trim() === "" ? void 0 : event.target.value),
							style: optionInputStyle
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: optionHintStyle,
						children: t("searchModelHint")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							flexWrap: "wrap",
							gap: 14
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								style: optionRowStyle,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("searchMaxResults") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "number",
									min: 1,
									value: String(options.searchMaxResults ?? ""),
									placeholder: "8",
									disabled: optionsBusy,
									onChange: (event) => markOption("searchMaxResults", event.target.value === "" ? void 0 : Number(event.target.value)),
									style: optionInputStyle
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								style: optionRowStyle,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("webSearchTimeoutMs") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "number",
									min: 1e3,
									value: String(options.webSearchTimeoutMs ?? ""),
									placeholder: "60000",
									disabled: optionsBusy,
									onChange: (event) => markOption("webSearchTimeoutMs", event.target.value === "" ? void 0 : Number(event.target.value)),
									style: optionInputStyle
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								style: optionRowStyle,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("xSearchTimeoutMs") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "number",
									min: 1e3,
									value: String(options.xSearchTimeoutMs ?? ""),
									placeholder: "120000",
									disabled: optionsBusy,
									onChange: (event) => markOption("xSearchTimeoutMs", event.target.value === "" ? void 0 : Number(event.target.value)),
									style: optionInputStyle
								})]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						style: optionHintStyle,
						children: [
							t("searchMaxResultsHint"),
							" · ",
							t("webSearchTimeoutHint"),
							" · ",
							t("xSearchTimeoutHint")
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							flexWrap: "wrap",
							gap: 8,
							alignItems: "center"
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: buttonStyle,
								disabled: optionsBusy || optionsDirty.size === 0,
								onClick: () => {
									saveOptions();
								},
								children: optionsBusy ? t("working") : t("optionsSave")
							}),
							optionsFeedback === "saved" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: {
									...bodyStyle,
									margin: 0,
									color: "var(--dsw-alias-state-success-primary, #22a06b)"
								},
								children: t("optionsSaved")
							}) : null,
							optionsFeedback === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: {
									...errorStyle,
									margin: 0
								},
								children: t("optionsError")
							}) : null
						]
					})
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
	proxyError: "Could not save the proxy setting.",
	optionsTitle: "Search & feature options",
	optionsHint: "Checkboxes show the value currently in effect (settings override, then profile/Cordis, then defaults). Saving a change writes an override; Reset clears overrides. Restart dsh web for changes to apply (proxy applies immediately).",
	backendSearch: "Server-side search on the main request",
	backendSearchHint: "Off by default. When enabled it mixes xAI server-side web/X search into the grok-4.6 main request (thinking IS the search). Reliable most of the time, but occasional odd failures — turn it off to fall back to the nested-search path.",
	statefulResponses: "Stateful continuation (experimental)",
	statefulResponsesHint: "store + previous_response_id, appending only new input. A previous toolUse turn (bash and other client tools) is never continued; turn it off if text repeats or you see a 400 fallback.",
	nestedSearchTools: "Nested search tools",
	nestedSearchToolsAuto: "Automatic (follows backendSearch)",
	nestedSearchToolsHint: "Auto: available when the main search is off; explicit on = a second hop alongside the main search (possible double billing). Use only for domain / account / date filters.",
	imagineTool: "grok_imagine",
	imagineToolHint: "Registers the image tool (one image per call).",
	searchModel: "Nested search model",
	searchModelHint: "Default grok-build-0.1.",
	searchMaxResults: "Source limit",
	searchMaxResultsHint: "Default 8.",
	webSearchTimeoutMs: "Web search timeout (ms)",
	webSearchTimeoutHint: "Default 60000.",
	xSearchTimeoutMs: "X search timeout (ms)",
	xSearchTimeoutHint: "Default 120000.",
	optionsSave: "Save options",
	optionsSaved: "Saved — restart dsh web to apply",
	optionsError: "Could not save the options.",
	optionsReset: "Reset to defaults"
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
	proxyError: "保存代理设置失败。",
	optionsTitle: "搜索与功能选项",
	optionsHint: "复选框显示当前实际生效值（设置页覆盖 → profile/Cordis → 默认）。保存会写入覆盖项；重置会清掉覆盖。保存后需重启 dsh web 生效（代理除外）。",
	backendSearch: "主请求服务端搜索",
	backendSearchHint: "默认关闭。开启后在 grok-4.6 主请求混合 xAI 服务端 web/X 搜索（THINK 即搜索）。多数时候可靠，但偶发异常——关闭后回退到嵌套搜索路径。",
	statefulResponses: "有状态续聊（实验）",
	statefulResponsesHint: "store + previous_response_id，只追加新输入。上一轮若是 toolUse（bash 等客户端工具）不会续链；出现重复正文或 400 回退时请关闭。",
	nestedSearchTools: "嵌套搜索工具",
	nestedSearchToolsAuto: "自动（跟随 backendSearch）",
	nestedSearchToolsHint: "自动：主搜索关闭时自动可用；显式开启=与主搜索双跳（可能双重计费）。仅当需要域名/账号/日期过滤时使用。",
	imagineTool: "grok_imagine 出图",
	imagineToolHint: "注册出图工具（每次调用一张）。",
	searchModel: "嵌套搜索模型",
	searchModelHint: "默认 grok-build-0.1。",
	searchMaxResults: "来源上限",
	searchMaxResultsHint: "默认 8。",
	webSearchTimeoutMs: "网页搜索超时（毫秒）",
	webSearchTimeoutHint: "默认 60000。",
	xSearchTimeoutMs: "X 搜索超时（毫秒）",
	xSearchTimeoutHint: "默认 120000。",
	optionsSave: "保存选项",
	optionsSaved: "已保存，重启 dsh web 后生效",
	optionsError: "保存选项失败。",
	optionsReset: "恢复默认"
};
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
function isObject(value) {
	return typeof value === "object" && value !== null;
}
function toolNameOf(block) {
	if (isObject(block) && "kind" in block && isObject(block.call)) {
		const name = block.call.name;
		if (typeof name === "string" && TOOL_NAMES.has(name)) return name;
	}
	return TOOL_NAME;
}
function argsOf(block) {
	if (!isObject(block)) return void 0;
	const raw = "kind" in block && isObject(block.call) ? block.call.argsRaw : block.phase === "start" ? block.argsRaw : void 0;
	if (typeof raw !== "string" || raw === "") return void 0;
	try {
		const parsed = JSON.parse(raw);
		return isObject(parsed) ? parsed : void 0;
	} catch {
		return;
	}
}
/** Edit results have no "regenerate" semantics; re-edit the same input image instead. */
function regenerateText(toolName, prompt, args) {
	if (toolName !== "grok_imagine_edit") return `请用 grok_imagine 按以下提示词重新生成一张图，不要改写提示词：\n${prompt}`;
	const source = args?.image;
	return `请用 grok_imagine_edit 编辑这张图，${typeof source === "string" && source.length > 0 && source.length <= 400 ? `输入图沿用：${source}` : "输入图沿用上一条 grok_imagine_edit 调用的那张图"}。不要改写提示词：\n${prompt}`;
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
const actionStyle = {
	justifySelf: "start",
	minHeight: 28,
	border: "1px solid var(--dsw-alias-border-l2)",
	borderRadius: 7,
	padding: "3px 10px",
	background: "transparent",
	color: "var(--dsw-alias-label-primary)",
	font: "inherit",
	cursor: "pointer"
};
const detailStyle = {
	color: "var(--dsw-alias-label-tertiary)",
	fontSize: 13,
	lineHeight: "18px"
};
const shellStyle = {
	display: "flex",
	flexWrap: "wrap",
	alignItems: "flex-start",
	gap: 14,
	minWidth: 0,
	padding: 12,
	border: "1px solid var(--dsw-alias-border-l2)",
	borderRadius: 10,
	background: "var(--dsw-alias-bg-module-platform)",
	color: "var(--dsw-alias-label-primary)"
};
/**
* Source badge. Grok and Codex image cards look alike in a session, so the
* card must identify itself: this view renders the Grok line (purple dot);
* the Codex line is rendered by dsh-codex-connect (green dot is reserved).
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
/** Title row: source badge + action (已生成 / 已编辑 / 正在生成). */
function grokTitle(verb) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
		style: {
			display: "inline-flex",
			alignItems: "baseline",
			flexWrap: "wrap",
			gap: 8
		},
		children: [sourceBadge(SOURCE_LABEL, SOURCE_TONES.grok), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
			style: {
				fontSize: 13,
				color: "var(--dsw-alias-label-secondary)"
			},
			children: verb
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
	for (const part of block.content) {
		if (!isObject(part) || part.type !== "image") continue;
		const ref = imageRef(part.attachment);
		if (ref === void 0) return [];
		images.push(ref);
	}
	return images;
}
function promptOf(block) {
	if (!isObject(block)) return "";
	const raw = "kind" in block && isObject(block.call) ? block.call.argsRaw : block.phase === "start" ? block.argsRaw : void 0;
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
* Calls with a save_path produce no session attachment (the image went
* straight to disk), so the result block carries text only — returning null
* here would make the whole tool call vanish from the conversation.
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
	(0, react.useEffect)(() => () => {
		disposed.current = true;
		for (const entry of urls.current.values()) URL.revokeObjectURL(entry.url);
		urls.current.clear();
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
function ImagineLightbox({ src, alt, onClose }) {
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
							children: "重置"
						})
					]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					"aria-label": "关闭",
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
function ImagineFrame({ attachment, load }) {
	const [src, setSrc] = (0, react.useState)(null);
	const [error, setError] = (0, react.useState)(false);
	const [open, setOpen] = (0, react.useState)(false);
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
		style: detailStyle,
		children: "图片无法显示"
	});
	if (src === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		style: detailStyle,
		children: "正在加载图片…"
	});
	const label = attachment.name ?? TOOL_NAME;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
		type: "button",
		title: "打开大图",
		"aria-label": `打开 ${label}`,
		onClick: () => {
			setOpen(true);
		},
		style: {
			display: "block",
			padding: 0,
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 12,
			background: "var(--dsw-alias-bg-secondary, transparent)",
			cursor: "zoom-in",
			overflow: "hidden",
			maxWidth: "min(100%, 320px)"
		},
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
			src,
			alt: label,
			style: {
				display: "block",
				width: "100%",
				height: "auto",
				maxHeight: 320,
				objectFit: "contain"
			}
		})
	}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ImagineLightbox, {
		src,
		alt: label,
		onClose: () => {
			setOpen(false);
		}
	}) : null] });
}
function ActionButton({ label, onClick, disabled }) {
	const [state, setState] = (0, react.useState)("idle");
	const alive = (0, react.useRef)(true);
	(0, react.useEffect)(() => () => {
		alive.current = false;
	}, []);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
		type: "button",
		style: actionStyle,
		disabled: disabled === true || state === "pending",
		"aria-busy": state === "pending",
		onClick: () => {
			if (state === "pending" || disabled === true) return;
			setState("pending");
			Promise.resolve(onClick()).then(() => {
				if (alive.current) setState("idle");
			}).catch(() => {
				if (alive.current) setState("failed");
			});
		},
		children: state === "pending" ? "处理中…" : state === "failed" ? "失败" : label
	});
}
function ImagineResultCard({ block, sessionId, sessions }) {
	const load = useImageLoader(sessionId, sessions);
	const images = imageAttachments(block);
	const prompt = promptOf(block);
	const resultText = textOf(block);
	const hasImages = images.length > 0;
	const title = toolNameOf(block) === "grok_imagine_edit" ? "已编辑" : "已生成";
	const [copyState, setCopyState] = (0, react.useState)("idle");
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
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
		"aria-label": "grok_imagine",
		"data-testid": "grok-imagine-result",
		style: shellStyle,
		children: [hasImages ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			style: {
				display: "grid",
				gap: 10,
				flex: "1 1 240px",
				maxWidth: 320,
				minWidth: 0
			},
			children: [grokTitle(title), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				"data-testid": "grok-imagine-gallery",
				style: {
					display: "grid",
					gap: 10
				},
				children: images.map((attachment, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ImagineFrame, {
					attachment,
					load
				}, `${attachment.attachmentId}:${index}`))
			})]
		}) : null, /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			style: {
				display: "grid",
				gap: 10,
				flex: "2 1 280px",
				minWidth: 0
			},
			children: [
				hasImages ? null : grokTitle(title),
				!hasImages && resultText !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
					"aria-label": "执行结果",
					style: {
						display: "grid",
						gap: 8
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
						style: {
							fontSize: 13,
							fontWeight: 600
						},
						children: "图片未进会话，已直接落盘"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
						style: {
							boxSizing: "border-box",
							width: "100%",
							maxHeight: 140,
							margin: 0,
							overflowY: "auto",
							padding: "10px 12px",
							border: "1px solid var(--dsw-alias-border-l2)",
							borderRadius: 8,
							background: "var(--dsw-alias-bg-base)",
							color: "var(--dsw-alias-label-secondary)",
							fontFamily: "var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)",
							fontSize: 12,
							lineHeight: "18px",
							whiteSpace: "pre-wrap",
							overflowWrap: "anywhere"
						},
						children: resultText
					})]
				}) : null,
				prompt ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
					"aria-label": "提示词",
					style: {
						display: "grid",
						gap: 8
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
						style: {
							fontSize: 13,
							fontWeight: 600
						},
						children: "提示词"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
						style: {
							boxSizing: "border-box",
							width: "100%",
							maxHeight: 96,
							margin: 0,
							overflowY: "auto",
							padding: "10px 12px",
							border: "1px solid var(--dsw-alias-border-l2)",
							borderRadius: 8,
							background: "var(--dsw-alias-bg-base)",
							color: "var(--dsw-alias-label-secondary)",
							fontFamily: "var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)",
							fontSize: 12,
							lineHeight: "18px",
							whiteSpace: "pre-wrap",
							overflowWrap: "anywhere"
						},
						children: prompt
					})]
				}) : null,
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						flexWrap: "wrap",
						gap: 8
					},
					children: [
						prompt ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionButton, {
							label: copyState === "copied" ? "已复制" : copyState === "failed" ? "复制失败" : "复制提示词",
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
						images.map((image, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionButton, {
							label: images.length === 1 ? "下载" : `下载 ${index + 1}`,
							onClick: async () => {
								triggerDownload(await load(image), image.name ?? `grok-imagine.${extensionFor(image.mediaType)}`);
							}
						}, `${image.attachmentId}:download`)),
						images.map((image, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionButton, {
							label: images.length === 1 ? "复制图片" : `复制图片 ${index + 1}`,
							onClick: async () => {
								const blob = await (await fetch(await load(image))).blob();
								await navigator.clipboard.write([new ClipboardItem({ [blob.type || image.mediaType]: blob })]);
							}
						}, `${image.attachmentId}:copy`)),
						canPrompt ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionButton, {
							label: "重新生成",
							onClick: async () => {
								if ((await sessions.binding(sessionId)?.session?.prompt?.([{
									type: "text",
									text: regenerateText(toolNameOf(block), prompt, argsOf(block))
								}], "queue"))?.ok !== true) throw new Error("regenerate failed");
							}
						}) : null
					]
				}),
				hasImages ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", {
					style: {
						cursor: "pointer",
						color: "var(--dsw-alias-label-secondary)",
						fontSize: 13
					},
					children: "图片详情"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						...detailStyle,
						display: "grid",
						gap: 4,
						marginTop: 6
					},
					children: images.map((image, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
						image.name ?? `图片 ${index + 1}`,
						" · ",
						formatMediaType(image.mediaType),
						" · ",
						image.width,
						"×",
						image.height,
						" · ",
						formatBytes(image.bytes)
					] }, image.attachmentId))
				})] }) : null
			]
		})]
	});
}
function GeneratingCard({ sessionId, sessions, prompt }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
		"aria-label": "正在生成图片…",
		style: shellStyle,
		children: [
			grokTitle("正在生成图片…"),
			prompt ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: detailStyle,
				children: prompt
			}) : null,
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("progress", { style: {
				width: "100%",
				height: 4
			} }),
			typeof sessionId === "string" && typeof sessions?.binding === "function" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionButton, {
				label: "取消",
				onClick: async () => {
					if ((await sessions.binding(sessionId)?.session?.cancel?.())?.ok === false) throw new Error("cancel failed");
				}
			}) : null
		]
	});
}
function GrokImagineToolView(props) {
	if (!(isObject(props.block) && "kind" in props.block)) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(GeneratingCard, {
		sessionId: props.sessionId,
		sessions: props.sessions,
		prompt: promptOf(props.block)
	});
	if (props.block.isError === true) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
		"aria-label": "图片生成失败",
		style: shellStyle,
		children: grokTitle("图片生成失败")
	});
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ImagineResultCard, {
		block: props.block,
		sessionId: props.sessionId,
		sessions: props.sessions
	});
}
function walkTurnImageResults(rows, closingSeq, names) {
	if (!Array.isArray(rows)) return [];
	const images = [];
	for (const row of rows) {
		if (!isObject(row)) continue;
		const pending = row.root === void 0 ? [] : [row.root];
		const visited = /* @__PURE__ */ new Set();
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
function GrokImagineTurnTail(props) {
	const empty = (0, react.useMemo)(() => ({
		subscribe: () => () => void 0,
		getSnapshot: () => []
	}), []);
	const source = typeof props.useChat === "function" && props.turn !== void 0 ? props.useChat((chat) => chat.nodes.turnDataSource(props.turn.turn, "tool-call")) : empty;
	const rows = (0, react.useSyncExternalStore)(source.subscribe, source.getSnapshot, source.getSnapshot);
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
				...detailStyle,
				display: "flex",
				alignItems: "center",
				flexWrap: "wrap",
				gap: 8
			},
			children: [sourceBadge(SOURCE_LABEL, SOURCE_TONES.grok), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: `紫点 = 本插件渲染的 Grok Imagine 出图；本回合另有 ${String(codexCount)} 张由 Codex（GPT Image）出图，卡片样式不同、不带紫点。` })]
		}) : null, results.map((block) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ImagineResultCard, {
			block,
			sessionId: props.sessionId,
			sessions: props.sessions
		}, block.callId ?? String(block.seq)))]
	});
}
/**
* Register the toolview occupant for both grok image tools and the turn-tail
* summary. Called from the client entry; requires the `sessions` service via
* a child fiber so the registrations unload with it.
*/
function applyImagineViews(ctx) {
	ctx.inject(["sessions"], (scope) => {
		const sessions = scope.sessions;
		for (const key of TOOL_NAMES) scope.slots.inject("tool.call.toolview", () => scope.slots.register({
			name: "tool.call.toolview",
			key,
			inject: () => ({ sessions })
		}, GrokImagineToolView));
		scope.slots.inject("conversation.chat.turnTail", () => scope.slots.register({
			name: "conversation.chat.turnTail",
			id: "dsh-grok-kit-imagine",
			order: 21,
			inject: () => ({ sessions })
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
}
//#endregion
exports.apply = apply;
exports.inject = inject;
exports.name = name;

		return module.exports;
	}
});
