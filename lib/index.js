import z from "@deepseek-ai/schemastery";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { HarnessError, resolveRetryPolicy } from "@deepseek-ai/dsh-llm";
import { PiAiAdapter } from "@deepseek-ai/dsh-llm-pi-ai";
import { xaiProvider } from "@earendil-works/pi-ai/providers/xai";
import { AsyncLocalStorage } from "node:async_hooks";
import { createAssistantMessageEventStream, createModels } from "@earendil-works/pi-ai";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { withFileLock, writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import { Agent, ProxyAgent, fetch as fetch$1 } from "undici";
import { createHash, randomUUID } from "node:crypto";
import { defineTool } from "@deepseek-ai/dsh-tools";
//#region src/bearer-guard.ts
/**
* Fail-closed destination guard for the user's OAuth access token.
*
* Every request that would carry an `Authorization` header goes through this
* module. Plugin call sites use {@link fetchWithBearer}, which attaches the
* bearer only after the destination is accepted. pi-ai chat lets the OpenAI
* SDK attach the header itself, so that path receives {@link guardBearerFetch}
* and is refused before the underlying fetch runs.
*
* Any `Authorization` value counts, not only a scheme at the start of the
* header. `Headers` joins duplicates into one comma-separated string, so a
* leading `Basic` would hide a later `Bearer`. When `init.headers` and a
* `Request` both exist, either side carrying the header is enough.
*
* A credentialed request is sent with `redirect: 'error'`, overriding the
* caller, so a 3xx cannot move the token onto another path or host.
*
* OAuth login and refresh post a device code or refresh token as a form body
* to auth.x.ai; they do not send this bearer. Video downloads are token-free
* and must stay off {@link fetchWithBearer} (vidgen.x.ai is not allowlisted).
*
* Allowlist, https only, exact host, no userinfo, no non-default port, no
* fragment:
* - `api.x.ai` — any path (models, responses, images, video submit/status)
* - `cli-chat-proxy.grok.com` — any path (billing and settings)
* - `https://grok.com/grok_api_v2.GrokBuildBilling/GetGrokCreditsConfig`
*   exactly: no extra segment, query, or fragment
*
* @module dsh-grok-kit/bearer-guard
*/
/** Hosts that may receive the OAuth bearer on any https path. */
const OAUTH_BEARER_HOSTS = ["api.x.ai", "cli-chat-proxy.grok.com"];
/** The only grok.com URL that may receive the OAuth bearer. */
const OAUTH_BEARER_EXACT_URL = "https://grok.com/grok_api_v2.GrokBuildBilling/GetGrokCreditsConfig";
const BEARER_HOSTS = new Set(OAUTH_BEARER_HOSTS);
const EXACT_GROK_CREDITS = new URL(OAUTH_BEARER_EXACT_URL);
/** Thrown when a bearer would be sent somewhere outside the allowlist. The message never includes the token. */
var BearerDestinationError = class extends Error {
	constructor(message) {
		super(message);
		this.name = "BearerDestinationError";
	}
};
function destinationLabel(url) {
	const port = url.port === "" ? "" : `:${url.port}`;
	return `${url.protocol}//${url.hostname}${port}${url.pathname}`;
}
function parseAbsolute(input) {
	try {
		return new URL(input);
	} catch {
		throw new BearerDestinationError("refusing to send the OAuth bearer: destination is not an absolute URL");
	}
}
function allowedDestination(url) {
	if (url.protocol !== "https:") return false;
	if (url.username !== "" || url.password !== "") return false;
	if (url.port !== "") return false;
	if (url.hash !== "") return false;
	if (BEARER_HOSTS.has(url.hostname)) return true;
	return url.hostname === EXACT_GROK_CREDITS.hostname && url.pathname === EXACT_GROK_CREDITS.pathname && url.search === EXACT_GROK_CREDITS.search;
}
/** Accept an absolute https destination on the OAuth bearer allowlist. Returns the parsed URL. */
function assertBearerDestination(input) {
	const url = input instanceof URL ? new URL(input.href) : parseAbsolute(input);
	if (!allowedDestination(url)) throw new BearerDestinationError(`refusing to send the OAuth bearer to ${destinationLabel(url)}`);
	return url;
}
function invalidHeadersError() {
	return /* @__PURE__ */ new TypeError("invalid OAuth request headers");
}
function validatedHeaders(headers) {
	try {
		return new Headers(headers);
	} catch {
		throw invalidHeadersError();
	}
}
function headersWithBearer(headers, bearer) {
	const normalized = validatedHeaders(headers);
	try {
		normalized.set("authorization", `Bearer ${bearer}`);
	} catch {
		throw invalidHeadersError();
	}
	const out = {};
	normalized.forEach((value, key) => {
		out[key] = value;
	});
	return out;
}
/**
* Attach the OAuth bearer and perform the request.
* The header is written only after the destination is accepted, and it
* replaces any caller-supplied authorization header. `redirect` is always
* `error`, including when the caller asked to follow.
*/
function fetchWithBearer(fetchImpl, input, bearer, init) {
	assertBearerDestination(input);
	const headers = headersWithBearer(init?.headers, bearer);
	return fetchImpl(input, {
		...init,
		headers,
		redirect: "error"
	});
}
/**
* True when `headers` carries `Authorization`, or when the header list cannot
* be read. Duplicates count: the WHATWG constructor keeps the name if any
* value was appended, including a bearer hidden after another scheme.
*/
function headersCarryAuthorization(headers) {
	try {
		return new Headers(headers).has("authorization");
	} catch {
		return true;
	}
}
function requestHeadersCarryAuthorization(request) {
	try {
		return request.headers.has("authorization");
	} catch {
		return true;
	}
}
/**
* Fail closed if either side carries `Authorization`. `init.headers` replaces
* the Request's header list on the wire, so looking at only one side would
* miss a bearer the other side still holds.
*/
function requestCarriesAuthorization(input, init) {
	const fromInit = init?.headers !== void 0 && headersCarryAuthorization(init.headers);
	const fromRequest = typeof Request !== "undefined" && input instanceof Request && requestHeadersCarryAuthorization(input);
	return fromInit || fromRequest;
}
function requestDestination(input) {
	if (typeof input === "string" || input instanceof URL) return input;
	return input.url;
}
/**
* Wrap a fetch so a request that carries an Authorization header is refused
* unless its destination is allowlisted, and is sent with `redirect: 'error'`.
* Requests without that header (OAuth form posts, token-free downloads) are
* forwarded unchanged, including their redirect mode.
*/
function guardBearerFetch(fetchImpl) {
	return (async (input, init) => {
		if (!requestCarriesAuthorization(input, init)) return await fetchImpl(input, init);
		assertBearerDestination(requestDestination(input));
		if (init?.headers !== void 0) validatedHeaders(init.headers);
		return await fetchImpl(input, {
			...init,
			redirect: "error"
		});
	});
}
//#endregion
//#region src/ids.ts
/** pi-ai provider id used by login, refresh, and the credential store. */
const XAI_PI_PROVIDER = "xai";
/** Harness LLM route. Distinct from the catalog `xai` API-key route. */
const XAI_OAUTH_ROUTE = "xai-oauth";
/** Basename of the OAuth document inside the Harness home. */
const XAI_OAUTH_AUTH_FILENAME = ".xai-oauth-auth.json";
/** Preferred chat model when the live or installed catalog includes it. */
const PREFERRED_XAI_OAUTH_MODEL = "grok-4.6";
/** Fallback model when the installed pi-ai catalog has no grok-4.6. */
const DEFAULT_XAI_OAUTH_MODEL = "grok-4.5";
/** Provider idle ceiling used by the composite route. */
const XAI_OAUTH_STREAM_IDLE_TIMEOUT_MS = 3e5;
//#endregion
//#region src/catalog.ts
const XAI_MODELS_URL = "https://api.x.ai/v1/models";
const BODY_LIMIT_BYTES = 4194304;
const COMPOSER_ALLOWLIST = /* @__PURE__ */ new Set([
	"grok-4.3",
	"grok-4.5",
	"grok-4.6"
]);
/**
* Hand-written grok-4.6 descriptor. pi-ai's installed xai.json does not ship
* this id; live listings inherit from grok-4.5 unless this entry is first.
* `asHarnessModels` rewrites `provider` to the harness route.
*/
const GROK_46_MODEL = {
	id: "grok-4.6",
	name: "Grok 4.6",
	api: "openai-responses",
	provider: "xai",
	baseUrl: "https://api.x.ai/v1",
	reasoning: true,
	input: ["text", "image"],
	cost: {
		input: 2,
		output: 6,
		cacheRead: .3,
		cacheWrite: 0
	},
	contextWindow: 5e5,
	maxTokens: 5e5,
	thinkingLevelMap: {
		off: null,
		minimal: null,
		low: "low",
		medium: "medium",
		high: "high",
		xhigh: "xhigh",
		max: null
	},
	compat: { supportsLongCacheRetention: false }
};
function isRecord$8(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** Pull model ids from an OpenAI-shaped or gateway-shaped listing body. */
function extractModelIds(body) {
	const rows = Array.isArray(body) ? body : isRecord$8(body) && Array.isArray(body["data"]) ? body["data"] : isRecord$8(body) && Array.isArray(body["models"]) ? body["models"] : [];
	const ids = [];
	for (const row of rows) if (typeof row === "string" && row.length > 0) ids.push(row);
	else if (isRecord$8(row) && typeof row["id"] === "string" && row["id"].length > 0) ids.push(row["id"]);
	return [...new Set(ids)];
}
function titleCaseId(id) {
	return id.split(/[-_]/g).map((part) => part.length === 0 ? part : part[0].toUpperCase() + part.slice(1)).join(" ");
}
/**
* Composer / Settings picker filter: only mainline Grok chat models.
* A mainline id is a plain `<major>[.<minor>]` version (grok-4.5, grok-4.6,
* future grok-4.7 / grok-5, …); the allowlist keeps known ids explicit.
* Variants — grok-build-0.1, grok-code-fast, Imagine / video / embedding /
* TTS — are hidden from BOTH the composer and the Settings list, so the
* picker stays a Grok-chat-model selector.
*/
function isComposerChatModel(id) {
	if (COMPOSER_ALLOWLIST.has(id)) return true;
	return /^grok-\d+(\.\d+)?$/i.test(id);
}
function catalogModels(baseline = xaiProvider().getModels()) {
	const rest = baseline.filter((model) => model.id !== GROK_46_MODEL.id);
	return [GROK_46_MODEL, ...rest];
}
function templateFor(id, catalog) {
	const exact = catalog.find((model) => model.id === id);
	if (exact !== void 0) return exact;
	const lower = id.toLowerCase();
	const fallback = catalog.find((model) => model.id === "grok-4.5") ?? catalog[0];
	if (fallback === void 0) throw new Error("xai-oauth: installed xAI catalog is empty");
	if (lower.includes("build") || lower.includes("code-fast")) return catalog.find((model) => model.id === "grok-build-0.1") ?? fallback;
	if (/^grok-\d+(\.\d+)?$/i.test(lower) || lower.includes("reasoning")) return catalog.find((model) => model.id === "grok-4.6") ?? GROK_46_MODEL;
	if (/grok-4\.5/.test(lower)) return catalog.find((model) => model.id === "grok-4.5") ?? fallback;
	return fallback;
}
/** Turn a live id into a pi-ai model, inheriting catalog metadata when possible. */
function materializeLiveModel(id, catalog = catalogModels()) {
	const template = templateFor(id, catalog);
	if (template.id === id) return template;
	return {
		...template,
		id,
		name: titleCaseId(id)
	};
}
/**
* If `liveIds` is missing or empty, serve the installed catalog.
* Otherwise serve only the live ids, each materialized against the catalog.
* Non-chat ids (Imagine / video / embedding / TTS) are dropped in both cases.
*/
function mergeLiveCatalog(catalog, liveIds) {
	return (liveIds === void 0 || liveIds.length === 0 ? [...catalog] : liveIds.map((id) => materializeLiveModel(id, catalog))).filter((model) => isComposerChatModel(model.id));
}
function preferredXaiOAuthModelFrom(models) {
	const ids = new Set(models.map((model) => model.id));
	if (ids.has("grok-4.6")) return PREFERRED_XAI_OAUTH_MODEL;
	if (ids.has("grok-4.5")) return DEFAULT_XAI_OAUTH_MODEL;
	return models[0]?.id ?? "grok-4.5";
}
/** Drop non-chat ids from a saved picker selection. Empty → undefined (caller falls back). */
function filterSelectedChatModelIds(ids) {
	const selected = [...new Set(ids.filter((id) => id.length > 0 && isComposerChatModel(id)))];
	return selected.length === 0 ? void 0 : selected;
}
/** Fetch the account-visible model ids. Throws a secret-free error on failure. */
async function fetchLiveModelIds(accessToken, signal) {
	let response;
	try {
		response = await fetchWithBearer(fetch, XAI_MODELS_URL, accessToken, {
			headers: { accept: "application/json" },
			redirect: "error",
			signal
		});
	} catch {
		if (signal?.aborted) throw new Error("Live model listing was cancelled");
		throw new Error("xAI model listing is unreachable");
	}
	const raw = Buffer.from(await response.arrayBuffer());
	if (raw.byteLength > BODY_LIMIT_BYTES) throw new Error("xAI model listing exceeded the 4 MiB read ceiling");
	let body;
	try {
		body = JSON.parse(raw.toString("utf8"));
	} catch {
		throw new Error(`xAI model listing returned invalid JSON (HTTP ${response.status})`);
	}
	if (!response.ok) {
		const code = isRecord$8(body) && typeof body["error"] === "string" ? body["error"] : void 0;
		throw new Error(`xAI model listing failed (HTTP ${response.status})${code === void 0 ? "" : `: ${code}`}`);
	}
	const ids = extractModelIds(body);
	if (ids.length === 0) throw new Error("xAI model listing contained no model ids");
	return ids;
}
//#endregion
//#region src/session-search-policy.ts
const requests = new AsyncLocalStorage();
/** Keep purpose across the lazy adapter iterator, without changing host request options. */
async function* withSearchRequest(request, create) {
	const context = {
		sessionId: request.sessionId,
		purpose: request.purpose
	};
	const iterator = requests.run(context, () => create()[Symbol.asyncIterator]());
	let exhausted = false;
	try {
		while (true) {
			const result = await requests.run(context, () => iterator.next());
			if (result.done) {
				exhausted = true;
				return;
			}
			yield result.value;
		}
	} finally {
		if (!exhausted) await requests.run(context, () => iterator.return?.());
	}
}
/** Optional in-process contract for callers that explicitly own a session's search policy. */
var SessionSearchPolicy = class {
	apiVersion = 1;
	sessions = /* @__PURE__ */ new Map();
	disposed = false;
	bindSession(sessionId, owner, enabled) {
		if (this.disposed) throw new Error("Grok search policy is disposed");
		if (typeof sessionId !== "string" || !sessionId || sessionId.length > 256 || /[\u0000-\u001f\u007f]/.test(sessionId)) throw new Error("Invalid Grok search session ID");
		if (owner === null || typeof owner !== "object" || typeof enabled !== "function") throw new Error("Invalid Grok search session binding");
		const previous = this.sessions.get(sessionId);
		if (previous !== void 0 && previous.owner !== owner) throw new Error("Grok search session already has a different owner");
		const entry = {
			owner,
			enabled
		};
		this.sessions.set(sessionId, entry);
		return () => {
			if (this.sessions.get(sessionId) === entry) this.sessions.delete(sessionId);
		};
	}
	resolve(sessionId) {
		if (this.disposed) return false;
		const entry = this.sessions.get(sessionId);
		if (entry === void 0) return void 0;
		const request = requests.getStore();
		if (request?.sessionId === sessionId && request.purpose !== void 0) return false;
		const enabled = entry.enabled();
		if (typeof enabled !== "boolean") throw new Error("Grok search session policy must return a boolean");
		return enabled;
	}
	dispose() {
		this.disposed = true;
		this.sessions.clear();
	}
};
//#endregion
//#region src/adapter.ts
/** xAI subscription adapter assembled from public dsh-llm-pi-ai extension points. */
/** Host defaults for the dsh-llm-pi-ai image budget (see its config schema). */
const MAX_REQUEST_IMAGE_BYTES = 20971520;
const REQUEST_IMAGE_PIXEL_BUDGET = 4194304;
const REQUEST_IMAGE_MAX_BYTES = 1048576;
/** Minimal pi-ai AuthContext over the host process environment and filesystem. */
function hostAuthContext() {
	return {
		env: async (name) => process.env[name],
		fileExists: async (path) => existsSync(path.startsWith("~") ? join(homedir(), path.slice(2)) : path)
	};
}
/** Prefer grok-4.6 when the current (live or installed) list has it. */
function preferredXaiOAuthModel(models = catalogModels()) {
	return preferredXaiOAuthModelFrom(models);
}
/**
* Create the SuperGrok adapter without a dsh fork.
* The public pi-ai adapter owns streaming, tools, reasoning, and compaction;
* this plugin supplies the OAuth credential store/config and an account model
* list. `resolveApiKey` deliberately returns undefined: authentication goes
* through the profile's pi-ai provider, whose oauth channel reads the same
* credential store pi-ai itself refreshes under its own lock — one auth source
* for chat, model listing, and the search tools.
*/
function createXaiOAuthAdapter(session, resolveAttachments) {
	let cached;
	const adapter = new PiAiAdapter({
		profiles: () => {
			const piProvider = session.provider();
			if (cached?.provider === piProvider) return cached.map;
			const map = /* @__PURE__ */ new Map([[XAI_OAUTH_ROUTE, {
				provider: XAI_OAUTH_ROUTE,
				displayName: "xAI Grok",
				streamIdleTimeoutMs: XAI_OAUTH_STREAM_IDLE_TIMEOUT_MS,
				retryPolicy: resolveRetryPolicy(void 0, "dsh-grok-kit retryPolicy"),
				configuredMaxTokens: /* @__PURE__ */ new Map(),
				modelErrors: /* @__PURE__ */ new Map(),
				piProvider,
				reasoning: "high",
				maxRequestImageBytes: MAX_REQUEST_IMAGE_BYTES,
				requestImagePixelBudget: REQUEST_IMAGE_PIXEL_BUDGET,
				requestImageMaxBytes: REQUEST_IMAGE_MAX_BYTES
			}]]);
			cached = {
				provider: piProvider,
				map
			};
			return map;
		},
		resolveApiKey: async () => void 0,
		auth: {
			credentials: session.store,
			authContext: hostAuthContext()
		},
		resolveAttachments
	});
	const stream = adapter.stream.bind(adapter);
	adapter.stream = (request) => withSearchRequest(request, () => stream(request));
	const prepareCall = adapter.prepareCall.bind(adapter);
	adapter.prepareCall = async (...args) => {
		const prepared = await prepareCall(...args);
		return {
			...prepared,
			stream: (request) => withSearchRequest(request, () => prepared.stream(request))
		};
	};
	return adapter;
}
//#endregion
//#region src/grok-import.ts
/**
* Grok CLI auth.json: parse, probe, and write-in-place.
* When the store points at this file, dsh login/refresh/logout mutate the
* same document Grok CLI reads — one refresh-token rotation, not a copy.
* @module dsh-grok-kit/grok-import
*/
const DEFAULT_TOKEN_LIFETIME_MS = 36e5;
/** Same client id pi-ai / Grok CLI use for the device-code grant. */
const GROK_XAI_CLIENT_ID = "b1a00492-073a-47ea-816f-4c329264a828";
const GROK_XAI_SLOT_KEY = `https://auth.x.ai::${GROK_XAI_CLIENT_ID}`;
function isENOENT$3(error) {
	return error?.code === "ENOENT";
}
function isRecord$7(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function nonEmptyString(value) {
	return typeof value === "string" && value.length > 0 ? value : void 0;
}
function firstString(record, keys) {
	for (const key of keys) {
		const value = nonEmptyString(record[key]);
		if (value !== void 0) return value;
	}
}
function parseTime(value) {
	const parsed = Date.parse(value);
	if (Number.isFinite(parsed) && parsed > 0) return parsed;
	const trimmed = value.replace(/(\.\d{3})\d+/, "$1");
	const again = Date.parse(trimmed);
	return Number.isFinite(again) && again > 0 ? again : NaN;
}
function parseExpires(record) {
	const expiresAt = record["expires_at"];
	if (typeof expiresAt === "string" && expiresAt.length > 0) {
		const parsed = parseTime(expiresAt);
		if (Number.isFinite(parsed)) return parsed;
	}
	if (typeof expiresAt === "number" && Number.isFinite(expiresAt) && expiresAt > 0) return expiresAt < 0xe8d4a51000 ? expiresAt * 1e3 : expiresAt;
	const expires = record["expires"];
	if (typeof expires === "number" && Number.isFinite(expires) && expires > 0) return expires < 0xe8d4a51000 ? expires * 1e3 : expires;
	const expiresIn = record["expires_in"];
	if (typeof expiresIn === "number" && Number.isFinite(expiresIn) && expiresIn > 0) return Date.now() + expiresIn * 1e3;
	return Date.now() + DEFAULT_TOKEN_LIFETIME_MS;
}
function walk(value, key) {
	if (Array.isArray(value)) return value.flatMap((item, index) => walk(item, `${key}[${index}]`));
	if (!isRecord$7(value)) return [];
	const access = firstString(value, [
		"key",
		"access",
		"access_token"
	]);
	const refresh = firstString(value, ["refresh_token", "refresh"]);
	if (access !== void 0 && refresh !== void 0) {
		const issuer = firstString(value, ["oidc_issuer", "issuer"]);
		const preferred = key.split("::")[0] === "https://auth.x.ai" || issuer === "https://auth.x.ai";
		const foreign = !preferred && (issuer !== void 0 || key.includes("://"));
		const accountId = firstString(value, [
			"user_id",
			"accountId",
			"principal_id"
		]);
		return [{
			credential: {
				type: "oauth",
				access,
				refresh,
				expires: parseExpires(value),
				...accountId === void 0 ? {} : { accountId }
			},
			preferred,
			foreign
		}];
	}
	return Object.entries(value).flatMap(([child, nested]) => walk(nested, child));
}
/** Resolve the Grok CLI auth document. */
function grokAuthPath(home = homedir()) {
	return resolve(join(home, ".grok", "auth.json"));
}
/** True when `filename` is the Grok CLI auth document (`~/.grok/auth.json`). */
function isGrokAuthPath(filename) {
	return resolve(filename).replaceAll("\\", "/").endsWith("/.grok/auth.json");
}
/** True when the JSON is a Grok CLI multi-slot document, not the dsh v1 envelope. */
function isGrokAuthDocument(value) {
	if (!isRecord$7(value) || "version" in value && "credential" in value) return false;
	if (Object.keys(value).length === 0) return true;
	return walk(value, "").length > 0;
}
/** A remaining foreign slot after logout must never become the xAI credential. */
function hasGrokXaiCredential(value) {
	const candidates = walk(value, "");
	return candidates.some((candidate) => candidate.preferred) || candidates.length === 1 && !candidates[0].foreign;
}
function formatExpiresAt(expires) {
	return new Date(expires).toISOString();
}
function slotRecord(document) {
	if (isRecord$7(document[GROK_XAI_SLOT_KEY])) return {
		key: GROK_XAI_SLOT_KEY,
		slot: document[GROK_XAI_SLOT_KEY]
	};
	for (const [key, nested] of Object.entries(document)) {
		if (!isRecord$7(nested)) continue;
		const issuer = firstString(nested, ["oidc_issuer", "issuer"]);
		if (key.split("::")[0] === "https://auth.x.ai" || issuer === "https://auth.x.ai") return {
			key,
			slot: nested
		};
	}
}
/**
* Write an OAuth credential back into a Grok CLI document, preserving every
* unrelated slot and every extra field on the xAI slot (email, names, …).
*/
function writeGrokAuthDocument(existingText, credential) {
	let document = {};
	if (existingText !== void 0 && existingText.trim().length > 0) {
		const parsed = JSON.parse(existingText);
		if (!isRecord$7(parsed)) throw new Error("xai-oauth: Grok CLI auth file must contain an object");
		document = "version" in parsed && "credential" in parsed ? {} : { ...parsed };
	}
	const found = slotRecord(document);
	const key = found?.key ?? GROK_XAI_SLOT_KEY;
	const previous = found?.slot ?? {};
	const slot = {
		...previous,
		key: credential.access,
		refresh_token: credential.refresh,
		expires_at: formatExpiresAt(credential.expires),
		oidc_issuer: nonEmptyString(previous["oidc_issuer"]) ?? "https://auth.x.ai",
		oidc_client_id: nonEmptyString(previous["oidc_client_id"]) ?? "b1a00492-073a-47ea-816f-4c329264a828"
	};
	if (credential.accountId !== void 0) slot["user_id"] = credential.accountId;
	document[key] = slot;
	return `${JSON.stringify(document, null, 2)}\n`;
}
/** Drop the xAI slot. Returns undefined when the document would be empty (caller should unlink). */
function removeGrokAuthSlot(existingText) {
	const parsed = JSON.parse(existingText);
	if (!isRecord$7(parsed)) return void 0;
	if ("version" in parsed && "credential" in parsed) return void 0;
	const document = { ...parsed };
	const found = slotRecord(document);
	if (found !== void 0) delete document[found.key];
	return Object.keys(document).length === 0 ? void 0 : `${JSON.stringify(document, null, 2)}\n`;
}
/** Parse a Grok CLI / generic OAuth document into a pi-ai credential. */
function parseGrokAuthDocument(text, filename) {
	let value;
	try {
		value = JSON.parse(text);
	} catch {
		throw new Error(`xai-oauth: ${filename} is not valid JSON`);
	}
	const candidates = walk(value, "");
	if (candidates.length === 0) throw new Error(`xai-oauth: ${filename} does not contain a Grok OAuth refresh token`);
	const preferred = candidates.find((candidate) => candidate.preferred);
	if (preferred !== void 0) return preferred.credential;
	if (candidates.length === 1 && !candidates[0].foreign) return candidates[0].credential;
	throw new Error(`xai-oauth: ${filename} contains ${candidates.length} credential pairs and none marks auth.x.ai; re-run \`grok login\` to write the standard document, or export the xAI credential explicitly`);
}
/** Whether ~/.grok/auth.json exists and looks importable. Never returns secrets. */
async function probeGrokAuth(filename = grokAuthPath()) {
	try {
		await stat(filename);
		parseGrokAuthDocument(await readFile(filename, "utf8"), filename);
		return {
			available: true,
			path: filename
		};
	} catch (error) {
		if (isENOENT$3(error)) return {
			available: false,
			path: filename
		};
		return {
			available: false,
			path: filename
		};
	}
}
/** Copy Grok CLI tokens into the store. No-op write when the store already is that file. */
async function importGrokAuth(store, filename = grokAuthPath()) {
	let text;
	try {
		text = await readFile(filename, "utf8");
	} catch (error) {
		if (isENOENT$3(error)) throw new Error(`xai-oauth: Grok CLI auth file not found at ${filename}`);
		throw error;
	}
	const credential = parseGrokAuthDocument(text, filename);
	const written = await store.modify("xai", async () => credential);
	if (written === void 0 || written.type !== "oauth") throw new Error("xai-oauth: failed to persist the imported Grok credential");
	return written;
}
//#endregion
//#region src/store.ts
/**
* Owner-only persistent OAuth credential storage for the xAI subscription route.
* @module dsh-grok-kit/store
*/
/** Current on-disk format; readers reject every other version. */
const AUTH_FORMAT_VERSION = 1;
function isENOENT$2(error) {
	return error?.code === "ENOENT";
}
async function assertOwnerOnly(filename) {
	let mode;
	try {
		mode = (await stat(filename)).mode;
	} catch (error) {
		if (isENOENT$2(error)) return;
		throw error;
	}
	if (process.platform === "win32") return;
	if ((mode & 63) !== 0) throw new Error(`xai-oauth: ${filename} is readable beyond its owner (mode ${(mode & 511).toString(8)}); run "chmod 600 ${filename}" before starting again`);
}
function parseDocument$1(text, filename) {
	let value;
	try {
		value = JSON.parse(text);
	} catch {
		throw new Error(`xai-oauth: ${filename} is not valid JSON`);
	}
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`xai-oauth: ${filename} must contain an object`);
	const document = value;
	if (document["version"] !== AUTH_FORMAT_VERSION) throw new Error(`xai-oauth: ${filename} has unsupported auth format version ${String(document["version"])}`);
	if (Object.keys(document).some((key) => key !== "version" && key !== "credential")) throw new Error(`xai-oauth: ${filename} contains an unknown top-level field`);
	const raw = document["credential"];
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error(`xai-oauth: ${filename} credential must be an object`);
	const credential = raw;
	const allowed = /* @__PURE__ */ new Set([
		"type",
		"access",
		"refresh",
		"expires",
		"accountId"
	]);
	if (Object.keys(credential).some((key) => !allowed.has(key))) throw new Error(`xai-oauth: ${filename} credential contains an unknown field`);
	if (credential["type"] !== "oauth") throw new Error(`xai-oauth: ${filename} credential type must be oauth`);
	for (const key of ["access", "refresh"]) if (typeof credential[key] !== "string" || credential[key].length === 0) throw new Error(`xai-oauth: ${filename} credential ${key} must be a non-empty string`);
	if (credential["accountId"] !== void 0 && (typeof credential["accountId"] !== "string" || credential["accountId"].length === 0)) throw new Error(`xai-oauth: ${filename} credential accountId must be a non-empty string when present`);
	if (typeof credential["expires"] !== "number" || !Number.isFinite(credential["expires"]) || credential["expires"] <= 0) throw new Error(`xai-oauth: ${filename} credential expires must be a positive finite number`);
	return {
		version: AUTH_FORMAT_VERSION,
		credential
	};
}
function cloneCredential(credential) {
	return structuredClone(credential);
}
/** Resolve the legacy dsh-owned OAuth document path. */
function xaiOAuthAuthPath(dshHome) {
	return resolve(join(resolveDshHome(dshHome), XAI_OAUTH_AUTH_FILENAME));
}
/**
* Live credential path: prefer ~/.grok/auth.json so dsh and Grok CLI share
* one refresh-token rotation. Fall back to the legacy dsh file only when that
* exists and the Grok file does not. New logins land in the Grok file.
*/
function resolveXaiOAuthStorePath(options = {}) {
	const grok = grokAuthPath(options.userHome ?? homedir());
	const dsh = xaiOAuthAuthPath(options.dshHome);
	if (existsSync(grok)) return grok;
	if (existsSync(dsh)) return dsh;
	return grok;
}
function isDshAuthDocument(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	const document = value;
	return "version" in document && "credential" in document;
}
function parseStoredCredential(text, filename) {
	let value;
	try {
		value = JSON.parse(text);
	} catch {
		throw new Error(`xai-oauth: ${filename} is not valid JSON`);
	}
	if (isDshAuthDocument(value)) return parseDocument$1(text, filename).credential;
	if (isGrokAuthDocument(value) && !hasGrokXaiCredential(value)) return void 0;
	if (isGrokAuthDocument(value) || isGrokAuthPath(filename)) return parseGrokAuthDocument(text, filename);
	return parseDocument$1(text, filename).credential;
}
function usesGrokFormat(filename, existingText) {
	if (isGrokAuthPath(filename)) return true;
	if (existingText !== void 0 && existingText.trim().length > 0) try {
		return isGrokAuthDocument(JSON.parse(existingText));
	} catch {
		return false;
	}
	return false;
}
/** Writer lock lives next to a dsh-owned path, never as ~/.grok/auth.json.lock. */
function lockPathForAuthFile(filename) {
	if (!isGrokAuthPath(filename)) return resolve(filename);
	return resolve(join(dirname(dirname(filename)), ".dsh", XAI_OAUTH_AUTH_FILENAME));
}
/** File-backed pi-ai store scoped to the single xAI provider. */
var XaiOAuthCredentialStore = class {
	filename;
	/** Path whose `.lock` sibling serializes writers. Separate from Grok CLI. */
	lockFilename;
	constructor(filename = resolveXaiOAuthStorePath()) {
		this.filename = resolve(filename);
		this.lockFilename = lockPathForAuthFile(this.filename);
	}
	/** Whether this store reads/writes the Grok CLI document. */
	get sharedWithGrokCli() {
		return isGrokAuthPath(this.filename);
	}
	async readText() {
		await assertOwnerOnly(this.filename);
		try {
			return await readFile(this.filename, "utf8");
		} catch (error) {
			if (isENOENT$2(error)) return void 0;
			throw error;
		}
	}
	async readCurrent() {
		const text = await this.readText();
		if (text === void 0 || text.trim().length === 0) return void 0;
		try {
			const credential = parseStoredCredential(text, this.filename);
			return credential === void 0 ? void 0 : cloneCredential(credential);
		} catch (error) {
			if (isGrokAuthPath(this.filename)) try {
				const value = JSON.parse(text);
				if (isGrokAuthDocument(value) && Object.keys(value).length === 0) return void 0;
			} catch {}
			throw error;
		}
	}
	/**
	* Accept both provider spellings reading this one credential document: the
	* pi-ai provider id (`xai`) used by login/refresh, and the harness route id
	* (`xai-oauth`) under which the adapter's pi-ai collection resolves auth.
	*/
	owns(providerId) {
		return providerId === "xai" || providerId === "xai-oauth";
	}
	/** Cheap synchronous file-existence check; never refreshes or reads secrets. */
	exists() {
		return existsSync(this.filename);
	}
	async read(providerId) {
		return this.owns(providerId) ? this.readCurrent() : void 0;
	}
	async list() {
		return await this.readCurrent() === void 0 ? [] : [{
			providerId: "xai",
			type: "oauth"
		}];
	}
	/**
	* Run a read-modify-write under the cross-process writer lock.
	* Writer locking delegates to `@deepseek-ai/dsh-atomic-write`, which uses a
	* claim-file protocol to safely take over locks whose recorded holder process
	* has exited on the same host and PID namespace. Locks held by live processes,
	* unverified permissions, or malformed records remain fail-closed and fail
	* after the wait budget. That budget is a fixed 2s (dsh-atomic-write) and is
	* sized for pure file I/O: `fn` MUST NOT perform network work inside the lock.
	* Refresh-first-then-commit flows read + refresh outside and only run the
	* guarded compare-and-write here (see createXaiOAuthSearchTokenSource).
	* pi-ai's own OAuth refresh does run inside its `modify` call — host
	* behaviour, same as upstream dsh-xai; a single refresh round trip fits the
	* 2s deadline in practice.
	*/
	async modify(providerId, fn) {
		if (!this.owns(providerId)) throw new Error(`xai-oauth: credential store does not own provider "${providerId}"`);
		await mkdir(dirname(this.filename), {
			recursive: true,
			mode: 448
		});
		await mkdir(dirname(this.lockFilename), {
			recursive: true,
			mode: 448
		});
		return withFileLock(this.lockFilename, async () => {
			const existingText = await this.readText();
			const current = existingText === void 0 || existingText.trim().length === 0 ? void 0 : (() => {
				try {
					const credential = parseStoredCredential(existingText, this.filename);
					return credential === void 0 ? void 0 : cloneCredential(credential);
				} catch {
					return;
				}
			})();
			const candidate = await fn(current);
			if (candidate === void 0) return current;
			const document = parseDocument$1(JSON.stringify({
				version: AUTH_FORMAT_VERSION,
				credential: candidate
			}), this.filename);
			const text = usesGrokFormat(this.filename, existingText) ? writeGrokAuthDocument(existingText, document.credential) : `${JSON.stringify(document, null, 2)}\n`;
			await writeFileAtomic(this.filename, text, {
				mode: 384,
				dirMode: 448
			});
			return cloneCredential(document.credential);
		});
	}
	async delete(providerId) {
		if (!this.owns(providerId)) return;
		await mkdir(dirname(this.filename), {
			recursive: true,
			mode: 448
		});
		await mkdir(dirname(this.lockFilename), {
			recursive: true,
			mode: 448
		});
		await withFileLock(this.lockFilename, async () => {
			const existingText = await this.readText();
			if (existingText === void 0) return;
			if (usesGrokFormat(this.filename, existingText)) {
				const next = removeGrokAuthSlot(existingText);
				if (next === void 0) {
					await rm(this.filename, { force: true });
					return;
				}
				await writeFileAtomic(this.filename, next, {
					mode: 384,
					dirMode: 448
				});
				return;
			}
			await rm(this.filename, { force: true });
		});
	}
};
//#endregion
//#region src/auth.ts
/**
* xAI OAuth orchestration shared by the plugin and standalone launcher.
* @module dsh-grok-kit/auth
*/
/** Complete provider-native OAuth and persist the resulting credential. */
async function loginXaiOAuth(interaction, store = new XaiOAuthCredentialStore()) {
	const models = createModels({ credentials: store });
	models.setProvider(xaiProvider());
	await models.login("xai", "oauth", interaction);
}
/** Copy ~/.grok/auth.json into the dsh store. Does not modify the Grok file. */
async function importXaiOAuthFromGrok(store = new XaiOAuthCredentialStore(), filename) {
	await importGrokAuth(store, filename);
}
/** Remove the stored xAI OAuth credential. */
async function logoutXaiOAuth(store = new XaiOAuthCredentialStore()) {
	await store.delete("xai");
}
/** Read non-secret login state without refreshing the token. */
async function xaiOAuthAuthStatus(store = new XaiOAuthCredentialStore()) {
	const credential = await store.read("xai");
	return credential?.type === "oauth" ? {
		authenticated: true,
		expiresAt: new Date(credential.expires)
	} : { authenticated: false };
}
/** Login then refresh the account model list when a session is available. */
async function loginXaiOAuthSession(interaction, session) {
	await loginXaiOAuth(interaction, session.store);
	await session.refreshLiveCatalog();
}
async function importXaiOAuthSession(session, filename) {
	await importXaiOAuthFromGrok(session.store, filename);
	await session.refreshLiveCatalog();
}
//#endregion
//#region src/grok-credits.ts
/**
* GetGrokCreditsConfig gRPC-web billing probe helpers (GROK-QUOTA-CREDITS-001).
*
* The Grok CLI billing proxy's `GET /v1/billing?format=credits` shape answers
* HTTP 500 ("Failed to serialize billing response") on some unified-billing
* accounts, while grok.com's gRPC-web GetGrokCreditsConfig still answers on
* the same OAuth Bearer and reports credit_usage_percent. This module only
* parses gRPC-web frames — it sends no network requests. Field numbers and
* semantics mirror dsh-subusage's grok-credits module so both consumers read
* the same wire shape. Parsing failures return undefined. An omitted proto3
* float decodes to zero only for a complete config with an active known period.
* A body is usable only when grpc-status is 0, from the
* 0x80 trailer or from an HTTP header the caller supplies (trailers-only).
* @module dsh-grok-kit/grok-credits
*/
/** Official grok.com gRPC-web billing endpoint (POST with an empty request frame). */
const GROK_GRPC_CREDITS_URL = "https://grok.com/grok_api_v2.GrokBuildBilling/GetGrokCreditsConfig";
/** gRPC-web empty message frame: 1 flag byte (uncompressed) + 4-byte big-endian zero length. */
const GROK_GRPC_EMPTY_FRAME = new Uint8Array([
	0,
	0,
	0,
	0,
	0
]);
function readVarint(message, offset, skipValue = false) {
	let result = 0;
	let next = offset;
	for (let index = 0; index < 10 && next < message.length; index += 1) {
		const byte = message[next++];
		if (index === 9 && byte > 1) return void 0;
		result += (byte & 127) * 2 ** (7 * index);
		if ((byte & 128) === 0) return skipValue || Number.isSafeInteger(result) ? {
			value: result,
			next
		} : void 0;
	}
}
function skipField(message, offset, wire) {
	if (wire === 0) return readVarint(message, offset, true)?.next;
	if (wire === 1) return offset + 8 <= message.length ? offset + 8 : void 0;
	if (wire === 2) {
		const length = readVarint(message, offset);
		if (length === void 0) return void 0;
		const next = length.next + length.value;
		return next <= message.length ? next : void 0;
	}
	if (wire === 5) return offset + 4 <= message.length ? offset + 4 : void 0;
}
/**
* Protobuf tags are varints: field numbers above 15 occupy more than one
* byte. Reading a single byte would treat the continuation as payload and
* shift every later field (GROK-QUOTA-CREDITS-001).
*/
function readTag(message, offset) {
	const tag = readVarint(message, offset);
	if (tag === void 0 || tag.value < 8 || tag.value > 4294967295) return void 0;
	return {
		field: tag.value >>> 3,
		wire: tag.value & 7,
		next: tag.next
	};
}
/** Validate the whole message, not just the prefix before the first known field. */
function isCompleteMessage(message, wires) {
	let offset = 0;
	const seen = /* @__PURE__ */ new Set();
	while (offset < message.length) {
		const tag = readTag(message, offset);
		if (tag === void 0) return false;
		if (Object.hasOwn(wires, tag.field)) {
			if (tag.wire !== wires[tag.field] || seen.has(tag.field)) return false;
			seen.add(tag.field);
		}
		const next = skipField(message, tag.next, tag.wire);
		if (next === void 0) return false;
		offset = next;
	}
	return true;
}
function readLengthDelimitedField(message, fieldNumber) {
	let offset = 0;
	while (offset < message.length) {
		const tag = readTag(message, offset);
		if (tag === void 0) return void 0;
		offset = tag.next;
		if (tag.wire === 2) {
			const length = readVarint(message, offset);
			if (length === void 0) return void 0;
			offset = length.next;
			if (length.next + length.value > message.length) return void 0;
			const value = message.subarray(offset, offset + length.value);
			offset += length.value;
			if (tag.field === fieldNumber) return value;
			continue;
		}
		const skipped = skipField(message, offset, tag.wire);
		if (skipped === void 0) return void 0;
		offset = skipped;
	}
}
function readFloatField(message, fieldNumber) {
	let offset = 0;
	while (offset < message.length) {
		const tag = readTag(message, offset);
		if (tag === void 0) return void 0;
		offset = tag.next;
		if (tag.wire === 5) {
			if (offset + 4 > message.length) return void 0;
			const value = new DataView(message.buffer, message.byteOffset + offset, 4).getFloat32(0, true);
			offset += 4;
			if (tag.field === fieldNumber) return value;
			continue;
		}
		const skipped = skipField(message, offset, tag.wire);
		if (skipped === void 0) return void 0;
		offset = skipped;
	}
}
/** Timestamp bounds use conservative milliseconds: start rounds up, end rounds down. */
function readTimestampField(message, fieldNumber, roundUp = false) {
	const nested = readLengthDelimitedField(message, fieldNumber);
	if (nested === void 0 || !isCompleteMessage(nested, {
		1: 0,
		2: 0
	})) return void 0;
	let offset = 0;
	let seconds;
	let nanos = 0;
	while (offset < nested.length) {
		const tag = readTag(nested, offset);
		if (tag === void 0) return void 0;
		offset = tag.next;
		if (tag.wire === 0 && (tag.field === 1 || tag.field === 2)) {
			const value = readVarint(nested, offset);
			if (value === void 0) return void 0;
			offset = value.next;
			if (tag.field === 1) seconds = value.value;
			if (tag.field === 2) {
				if (value.value > 999999999) return void 0;
				nanos = value.value;
			}
			continue;
		}
		const skipped = skipField(nested, offset, tag.wire);
		if (skipped === void 0) return void 0;
		offset = skipped;
	}
	if (seconds === void 0) return void 0;
	const milliseconds = roundUp ? Math.ceil(nanos / 1e6) : Math.floor(nanos / 1e6);
	const date = new Date(seconds * 1e3 + milliseconds);
	return Number.isFinite(date.getTime()) ? date.toISOString() : void 0;
}
/** ASCII header block. Undefined when the frame is not headers; null when headers omit grpc-status. */
function readTrailerGrpcStatus(frame) {
	for (const byte of frame) if (!(byte >= 32 && byte <= 126) && !(byte === 9 || byte === 10 || byte === 13)) return void 0;
	let status;
	for (const line of Buffer.from(frame).toString("ascii").split(/\r\n|\n|\r/)) {
		if (line.length === 0) continue;
		const colon = line.indexOf(":");
		if (colon <= 0) return void 0;
		const name = line.slice(0, colon).trim().toLowerCase();
		if (name.length === 0 || /\s/.test(name)) return void 0;
		if (name !== "grpc-status") continue;
		const value = line.slice(colon + 1).trim();
		if (status !== void 0 && status !== value) return void 0;
		status = value;
	}
	return status ?? null;
}
/**
* Walk gRPC-web frames. 0x00 is the only uncompressed data frame; 0x80 is the
* trailer. Any other flag is not a readable message — including a compressed
* trailer (0x81), which cannot be checked and fails closed.
*/
function scanGrpcWeb(bytes) {
	let offset = 0;
	let message;
	let trailerStatus;
	let trailerUnreadable = false;
	let ambiguousData = false;
	while (offset < bytes.length) {
		if (offset + 5 > bytes.length) return void 0;
		const flags = bytes[offset];
		const length = bytes[offset + 1] * 16777216 + bytes[offset + 2] * 65536 + bytes[offset + 3] * 256 + bytes[offset + 4];
		offset += 5;
		if (offset + length > bytes.length) return void 0;
		const frame = bytes.subarray(offset, offset + length);
		offset += length;
		if ((flags & 128) !== 0) {
			if (flags !== 128) {
				trailerUnreadable = true;
				continue;
			}
			const status = readTrailerGrpcStatus(frame);
			if (status === void 0) {
				trailerUnreadable = true;
				continue;
			}
			if (status !== null) {
				if (trailerStatus !== void 0 && trailerStatus !== status) trailerUnreadable = true;
				else trailerStatus = status;
			}
			continue;
		}
		if (flags !== 0 || message !== void 0) ambiguousData = true;
		if (flags === 0 && message === void 0) message = frame;
	}
	return {
		message,
		trailerStatus,
		trailerUnreadable,
		ambiguousData
	};
}
/** grpc-status 0 from the header or the trailer, and no contradictory status. */
function grpcStatusAccepted(scan, headerStatus) {
	if (scan.trailerUnreadable) return false;
	const header = headerStatus?.trim();
	if (header !== void 0 && header.length > 0 && header !== "0") return false;
	if (scan.trailerStatus !== void 0 && scan.trailerStatus !== "0") return false;
	return scan.trailerStatus === "0" || header === "0";
}
/**
* Period kind is derived from the reported window length (weekly ≈ 7 days,
* monthly ≈ 30): the wire reports no enum here. Undecidable windows stay
* unlabeled instead of guessing.
*/
function periodType(startIso, endIso) {
	if (startIso === void 0 || endIso === void 0) return void 0;
	const start = Date.parse(startIso);
	const end = Date.parse(endIso);
	if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return void 0;
	const days = (end - start) / 864e5;
	if (days >= 4 && days <= 12) return "USAGE_PERIOD_TYPE_WEEKLY";
	if (days >= 20 && days <= 45) return "USAGE_PERIOD_TYPE_MONTHLY";
}
/**
* Fold a GetGrokCreditsConfig gRPC-web response into the JSON shape
* normalizeSuperGrokQuota understands. Parsing failures return undefined —
* never a fabricated 0%.
*/
function parseGrokCreditsGrpcWeb(bytes, options) {
	if (bytes.length === 0) return void 0;
	const scan = scanGrpcWeb(bytes);
	if (scan?.message === void 0 || !grpcStatusAccepted(scan, options?.headerStatus)) return void 0;
	const message = scan.message;
	const envelope = readLengthDelimitedField(message, 1);
	const config = envelope ?? message;
	if (!isCompleteMessage(message, envelope === void 0 ? {
		1: 5,
		4: 2,
		5: 2
	} : { 1: 2 }) || !isCompleteMessage(config, {
		1: 5,
		4: 2,
		5: 2
	})) return void 0;
	let usedPercent = readFloatField(config, 1);
	const start = readTimestampField(config, 4, true);
	const end = readTimestampField(config, 5);
	const type = periodType(start, end);
	const now = options?.now ?? Date.now();
	const implicitUsagePercent = usedPercent === void 0 && envelope !== void 0 && !scan.ambiguousData && type !== void 0 && start !== void 0 && end !== void 0 && Date.parse(start) <= now && now < Date.parse(end);
	if (implicitUsagePercent) usedPercent = 0;
	const currentPeriod = end !== void 0 || start !== void 0 ? {
		...type === void 0 ? {} : { type },
		...start === void 0 ? {} : { start },
		...end === void 0 ? {} : { end }
	} : void 0;
	if (usedPercent !== void 0 && !Number.isFinite(usedPercent)) return void 0;
	if (usedPercent === void 0 && currentPeriod === void 0) return void 0;
	return {
		...implicitUsagePercent ? { implicitUsagePercent: true } : {},
		config: {
			...usedPercent === void 0 ? {} : { creditUsagePercent: usedPercent },
			...currentPeriod === void 0 ? {} : { currentPeriod }
		}
	};
}
//#endregion
//#region src/redact.ts
/** Remove token-like strings from an external OAuth diagnostic. */
function safeMessage(error) {
	return (error instanceof Error ? error.message : String(error)).replace(/(\bBearer\s+)[A-Za-z0-9._~+/=-]+/giu, "$1[redacted]").replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu, "[redacted token]").replace(/(\b(?:code|token|refresh_token|access_token)=)[^&\s]+/giu, "$1[redacted]").replace(/(["'](?:access|access_token|refresh|refresh_token)["']\s*:\s*["'])[^"']+(["'])/giu, "$1[redacted]$2").slice(0, 1e3);
}
//#endregion
//#region src/capabilities.ts
/**
* In-memory capability state kernel for the Grok kit Web surface.
*
* The tracker records what the plugin itself observed (first version: video
* task probes only); every other feature stays `unverified` until something
* explicitly calls {@link CapabilityTracker.observe}. Nothing here probes an
* upstream, persists state, or fabricates quota numbers. Its legacy quota
* field stays unavailable for compatibility; account quota is read separately
* through the quota route. `reset()` clears the recorded
* history (used on sign-out so one account's diagnostics never leak to the
* next viewer).
*/
/** All feature ids, in stable snapshot order. */
const CAPABILITY_FEATURE_IDS = [
	"video",
	"voice",
	"code",
	"image-generation"
];
const QUOTA_UNAVAILABLE_MESSAGE = "Subscription quota is available from the account quota endpoint.";
/** Observation messages are redacted and truncated before they are stored. */
const MAX_MESSAGE_LENGTH = 300;
function defaultClock() {
	return (/* @__PURE__ */ new Date()).toISOString();
}
/**
* Extra conservative redaction layered on top of the shared `safeMessage`:
* upstream diagnostics may carry JSON keys (api_key / authorization / …),
* signed URLs (X-Amz-Signature, sig=…), or full upstream bodies that the
* shared helper does not cover. Values are replaced, never published; the
* query string of any URL is stripped wholesale so a signed URL can never be
* reconstructed from a diagnostic message.
*/
function sanitizeDiagnosticMessage(message) {
	return safeMessage(message).replace(/(["']?[A-Za-z0-9_-]*(?:key|token|secret|signature|credential|auth|authorization)[A-Za-z0-9_-]*["']?\s*:\s*")([^"]*)(")/giu, "$1[redacted]$3").replace(/(["']?[A-Za-z0-9_-]*(?:key|token|secret|signature|credential|auth|authorization)[A-Za-z0-9_-]*["']?\s*:\s*)([^"'\s,}\]]+)/giu, "$1[redacted]").replace(/([?&][A-Za-z0-9_.-]*(?:key|token|secret|signature|sig|credential|auth)[A-Za-z0-9_.-]*=)[^&\s'"]+/giu, "$1[redacted]").replace(/(authorization\s*:\s*)(?!bearer\b)[^\r\n]+/giu, "$1[redacted]").replace(/(https?:\/\/[^?\s'"<>]+)\?[^?\s'"<>]+/giu, "$1?[redacted]");
}
function sanitizeObservationMessage(message) {
	if (message === void 0) return void 0;
	const safe = sanitizeDiagnosticMessage(message);
	return safe.length === 0 ? void 0 : safe.slice(0, MAX_MESSAGE_LENGTH);
}
/**
* Process-local owner of the observed capability states. Records are memory
* only (never persisted, never sent anywhere), and `reset()` drops them so
* history does not survive a sign-out or a plugin reload.
*/
var CapabilityTracker = class {
	observations = /* @__PURE__ */ new Map();
	clock;
	constructor(clock = defaultClock) {
		this.clock = clock;
	}
	/** Record one observation. Only the video path calls this in the first version. */
	observe(feature, event) {
		const message = sanitizeObservationMessage(event.message);
		this.observations.set(feature, {
			state: event.state,
			checkedAt: event.checkedAt.length > 0 ? event.checkedAt : this.clock(),
			model: event.model,
			...event.httpStatus === void 0 ? {} : { httpStatus: event.httpStatus },
			...message === void 0 ? {} : { message }
		});
	}
	/** Drop every recorded observation (sign-out, dispose, tests). */
	reset() {
		this.observations.clear();
	}
	/**
	* Build the Web-facing snapshot. `videoEnabled` gates the video row: with
	* the feature flag off, stale observations are not reported.
	*/
	snapshot(videoEnabled) {
		return {
			features: CAPABILITY_FEATURE_IDS.map((id) => {
				if (id === "video" && !videoEnabled) return {
					id,
					state: "unverified"
				};
				const observed = this.observations.get(id);
				if (observed === void 0) return {
					id,
					state: "unverified"
				};
				return {
					id,
					...observed
				};
			}),
			quota: {
				state: "unavailable",
				message: QUOTA_UNAVAILABLE_MESSAGE
			},
			videoEnabled
		};
	}
};
//#endregion
//#region src/quota.ts
/**
* X Subscription / legacy SuperGrok quota probe over the official Grok CLI billing
* proxy, reusing the shared OAuth token source (resolve + 401 refresh on the
* same rotation chain as chat/search — never a bare token refresh here).
*
* The wire shape mirrors what dsh-subusage reads from
* `GET https://cli-chat-proxy.grok.com/v1/billing?format=credits` (plus an
* optional `GET /settings` for the plan display name): `creditUsagePercent`
* is the USED percentage (0–100), legacy responses fall back to
* `monthlyLimit`/`used` cents. That REST shape answers HTTP 500 ("Failed to
* serialize billing response") on some unified-billing accounts, so an HTTP
* 5xx or a transport failure falls back to grok.com's gRPC-web
* GetGrokCreditsConfig on the same bearer. 401/403 never fall back, and 429
* (or any other non-5xx) stays on the REST error mapping so a rate limit is
* not amplified (GROK-QUOTA-CREDITS-001, see ./grok-credits.ts). A 200 with
* partial period metadata is also verified over gRPC; only a complete active
* config can supply the proto3 implicit zero. Optional verification has its
* own shorter budget; if it fails, REST metadata stays partial. Caller aborts,
* disposal and the whole-get deadline still stop the get. Missing percentages
* add at most one gRPC call per uncached read (60s cache); REST 429 never does.
* Current-period checks use the local wall clock, so clock skew can affect
* freshness/implicit-zero decisions. Verified periods are rechecked after
* final identity I/O and bound cache validity. Snapshots are cached per OAuth
* account partition for at most 60s; an unknown or mid-flight-changed identity fails
* closed and never returns another account's data.
*
* Every await (token resolution, refresh, both reads) races the whole-get
* deadline and the disposal controller, so a hung token source, refresh, or
* body cannot outlive the 10s budget. Non-caller failures always come back
* as a fixed snapshot state, never as an exception for the route.
* @module dsh-grok-kit/quota
*/
/** Official Grok CLI billing proxy (forwards to GetGrokCreditsConfig). */
const GROK_BILLING_URL = "https://cli-chat-proxy.grok.com/v1/billing?format=credits";
/** Plan display name source; failure falls back to the billing body tier. */
const GROK_SETTINGS_URL = "https://cli-chat-proxy.grok.com/v1/settings";
/** Official GrokComConfig.token_header default: nginx routes OAuth on this string. */
const GROK_TOKEN_AUTH = "xai-grok-cli";
/** Version header the billing proxy expects alongside the token auth. */
const GROK_CLIENT_VERSION = "1.0.13";
/** Independent budget for the optional settings (plan name) read. */
const QUOTA_SETTINGS_TIMEOUT_MS = 3e3;
/** Optional REST-200 verification gets at most 2s and half the remaining whole-get budget. */
const QUOTA_VERIFICATION_TIMEOUT_MS = 2e3;
/** Upstream response ceiling (same scale as the Web routes' request ceiling). */
const MAX_QUOTA_RESPONSE_BYTES = 1048576;
/** Billing/settings JSON was readable but carried no usable quota fields. */
var QuotaResponseError = class extends Error {};
function isRecord$6(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function numeric(value) {
	return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
/**
* proto3 message fields decode as `{ val: n }`; a bare `{}` is the proto
* zero value. Missing messages and malformed values remain unknown.
*/
function cents(value) {
	if (!isRecord$6(value)) return void 0;
	return Object.keys(value).length === 0 ? 0 : numeric(value.val);
}
function trimmedString(value) {
	if (typeof value !== "string") return void 0;
	const trimmed = value.trim();
	return trimmed.length === 0 ? void 0 : trimmed;
}
/**
* RFC 3339 / ISO-8601 offset datetime with capture groups so the calendar
* components can be validated below: Date.parse alone rolls invalid dates
* forward ("0" becomes 2000-01-01, 2026-02-30 becomes March 2), which would
* let an invented reset date be displayed and cached as a partial success.
*/
const ISO_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(?:Z|([+-])(\d{2}):(\d{2}))$/u;
const MONTH_DAYS = [
	31,
	28,
	31,
	30,
	31,
	30,
	31,
	31,
	30,
	31,
	30,
	31
];
/** Rejects lexically valid but calendar-invalid timestamps: 2026-02-30, 24:00, +25:00. */
function isRfc3339CalendarValid(match) {
	const [year, month, day, hour, minute, second] = [
		1,
		2,
		3,
		4,
		5,
		6
	].map((index) => match[index] === void 0 ? 0 : Number(match[index]));
	const offsetHours = match[9] === void 0 ? 0 : Number(match[9]);
	const offsetMinutes = match[10] === void 0 ? 0 : Number(match[10]);
	const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
	const monthDays = month === 2 && leapYear ? 29 : MONTH_DAYS[month - 1];
	return month >= 1 && month <= 12 && day >= 1 && day <= monthDays && hour < 24 && minute < 60 && second <= 60 && offsetHours < 24 && offsetMinutes < 60;
}
/** Accepts RFC 3339 strings and Unix epoch seconds/milliseconds; otherwise omitted. */
function parseResetAt(raw) {
	if (typeof raw === "string") {
		const text = raw.trim();
		const match = ISO_DATE_TIME.exec(text);
		if (match === null || !isRfc3339CalendarValid(match)) return void 0;
		const ms = Date.parse(text);
		return Number.isFinite(ms) ? new Date(ms).toISOString() : void 0;
	}
	if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
		const ms = raw > 0xe8d4a51000 ? raw : raw * 1e3;
		return Number.isFinite(new Date(ms).getTime()) ? new Date(ms).toISOString() : void 0;
	}
}
/**
* Strict mapping of the GetGrokCreditsConfig billing body (plus the optional
* settings body). A valid period may carry metadata without a percentage;
* malformed percentages and unreadable data still throw. No values are invented.
*/
function normalizeSuperGrokQuota(body, settingsBody) {
	const config = isRecord$6(body) && isRecord$6(body.config) ? body.config : {};
	let percent = numeric(config.creditUsagePercent);
	if (percent === void 0) {
		const limit = cents(config.monthlyLimit);
		if (limit !== void 0 && limit > 0) {
			const usedRaw = config.used;
			let used;
			if (usedRaw === void 0) used = 0;
			else {
				const value = cents(usedRaw);
				if (value !== void 0 && value >= 0) used = value;
				else if (isRecord$6(usedRaw) && Object.keys(usedRaw).length === 0) used = 0;
				else throw new QuotaResponseError("SuperGrok billing response has an invalid used value");
			}
			percent = used / limit * 100;
		}
	}
	const period = isRecord$6(config.currentPeriod) ? config.currentPeriod : void 0;
	const periodOnly = percent === void 0 && config.creditUsagePercent === void 0 && (period?.type === "USAGE_PERIOD_TYPE_WEEKLY" || period?.type === "USAGE_PERIOD_TYPE_MONTHLY") && parseResetAt(period.end) !== void 0;
	if (percent === void 0 ? !periodOnly : percent < 0 || percent > 100) throw new QuotaResponseError("SuperGrok billing response has no usable usage percentage");
	const periodType = period?.type;
	const hasParseableBillingBounds = parseResetAt(config.billingPeriodStart) !== void 0 || parseResetAt(config.billingPeriodEnd) !== void 0;
	const kind = periodType === "USAGE_PERIOD_TYPE_WEEKLY" ? "week" : periodType === "USAGE_PERIOD_TYPE_MONTHLY" ? "month" : period !== void 0 ? "subscription" : hasParseableBillingBounds ? "month" : "subscription";
	const plan = trimmedString(isRecord$6(settingsBody) ? settingsBody.subscription_tier_display : void 0) ?? trimmedString(isRecord$6(body) ? body.subscription_tier : void 0);
	const safePlan = plan === void 0 ? void 0 : sanitizeDiagnosticMessage(plan).trim().slice(0, 100).trim();
	const prepaid = cents(config.prepaidBalance);
	const resetAt = parseResetAt(period?.end ?? config.billingPeriodEnd);
	const details = {
		period: kind,
		...typeof config.isUnifiedBillingUser === "boolean" ? { unifiedBilling: config.isUnifiedBillingUser } : {},
		...resetAt === void 0 ? {} : { resetAt },
		...safePlan === void 0 || safePlan.length === 0 ? {} : { plan: safePlan },
		...prepaid === void 0 || prepaid < 0 ? {} : { prepaidBalanceUsd: Math.round(prepaid) / 100 }
	};
	return percent === void 0 ? details : {
		...details,
		usedPercent: percent,
		remainingPercent: 100 - percent
	};
}
/** A current window needs two real bounds; an end alone cannot establish freshness. */
function activeQuotaPeriod(period, now) {
	if (!isRecord$6(period)) return false;
	const start = parseResetAt(period.start);
	const end = parseResetAt(period.end);
	return start !== void 0 && end !== void 0 && Date.parse(start) <= now && now < Date.parse(end);
}
/** Do not attach a gRPC number to a different or partially overwritten REST window. */
function verifiedCreditsPeriod(restPeriod, grpcPeriod, now) {
	if (activeQuotaPeriod(grpcPeriod, now) && (grpcPeriod.type === "USAGE_PERIOD_TYPE_WEEKLY" || grpcPeriod.type === "USAGE_PERIOD_TYPE_MONTHLY")) return grpcPeriod;
	if (!activeQuotaPeriod(restPeriod, now)) return void 0;
	for (const bound of ["start", "end"]) if (grpcPeriod?.[bound] !== void 0 && parseResetAt(grpcPeriod[bound]) !== parseResetAt(restPeriod[bound])) return void 0;
	return restPeriod;
}
/** Release an unread response without letting a broken cancel exceed the budget. */
function discardResponse(response) {
	try {
		response.body?.cancel().catch(() => void 0);
	} catch {}
}
/** Bounded body read: hard byte ceiling, abort-aware. */
async function readBoundedBytes(response, maxBytes, signal) {
	if (signal?.aborted) {
		discardResponse(response);
		signal.throwIfAborted();
	}
	const body = response.body;
	if (body === null) throw new Error("quota response has no body");
	const reader = body.getReader();
	const chunks = [];
	let size = 0;
	let completed = false;
	try {
		for (;;) {
			const pending = reader.read();
			const { done, value } = signal === void 0 ? await pending : await raceAbort(pending, signal);
			if (done) {
				completed = true;
				break;
			}
			size += value.byteLength;
			if (size > maxBytes) throw new Error(`quota response body exceeded ${maxBytes} bytes`);
			chunks.push(value);
		}
	} finally {
		if (!completed) try {
			reader.cancel().catch(() => void 0);
		} catch {}
		reader.releaseLock();
	}
	return Buffer.concat(chunks);
}
/** Bounded JSON read: hard byte ceiling, then a strict JSON parse. */
async function readBoundedJson$1(response, maxBytes, signal) {
	const text = (await readBoundedBytes(response, maxBytes, signal)).toString("utf8").trim();
	if (text.length === 0) throw new Error("quota response body is empty");
	return JSON.parse(text);
}
/**
* Make an unabortable promise (a token-source getAuth, a hung body) actually
* honor the shared budget signal: reject on abort and remove the listener
* once either side settles. The underlying promise keeps running — its owner
* (token source / fetch) is responsible for it, and dispose() aborts the
* shared signal it was handed. Fetch callers also discard any response that
* arrives after the race has already been aborted.
*/
function raceAbort(promise, signal, discard) {
	return new Promise((resolve, reject) => {
		let aborted = false;
		const onAbort = () => {
			aborted = true;
			reject(signal.reason);
		};
		promise.then((value) => {
			signal.removeEventListener("abort", onAbort);
			if (aborted) discard?.(value);
			else resolve(value);
		}, (error) => {
			signal.removeEventListener("abort", onAbort);
			reject(error);
		});
		if (signal.aborted) {
			onAbort();
			return;
		}
		signal.addEventListener("abort", onAbort, { once: true });
	});
}
function quotaRequestInit(signal) {
	return {
		method: "GET",
		headers: {
			accept: "application/json",
			"x-xai-token-auth": GROK_TOKEN_AUTH,
			"x-grok-client-version": GROK_CLIENT_VERSION
		},
		redirect: "error",
		signal
	};
}
/**
* gRPC-web credits probe request. The OAuth bearer is attached by
* fetchWithBearer, which accepts only this exact grok.com path. The
* gRPC-web envelope (empty request message, grok.com origin) matches the
* browser client (GROK-QUOTA-CREDITS-001). Callers with a configured proxy
* must route this exact URL (see isXaiProxyTarget); other grok.com paths
* stay direct.
*/
function grpcCreditsRequestInit(signal) {
	return {
		method: "POST",
		headers: {
			accept: "application/grpc-web+proto",
			"content-type": "application/grpc-web+proto",
			"x-grpc-web": "1",
			origin: "https://grok.com",
			referer: "https://grok.com/?_s=usage",
			"x-xai-token-auth": GROK_TOKEN_AUTH,
			"x-grok-client-version": GROK_CLIENT_VERSION
		},
		body: GROK_GRPC_EMPTY_FRAME,
		redirect: "error",
		signal
	};
}
function cacheUsable(entry, now) {
	const age = now - entry.fetchedAt;
	return age >= 0 && age < 6e4 && (entry.verifiedPeriod === void 0 || activeQuotaPeriod(entry.verifiedPeriod, now));
}
/**
* Process-local owner of the SuperGrok quota cache. One success is cached for
* the current account partition; sign-out, account switches, and unknown
* identities fail closed instead of serving another account's numbers.
*/
var SuperGrokQuotaClient = class {
	tokens;
	fetchImpl;
	now;
	timeoutMs;
	cache;
	/** Bumped by reset()/dispose() so a stale in-flight get cannot re-fill the cache. */
	generation = 0;
	/** Aborted by dispose() so hung token/refresh/body work ends immediately. */
	disposal = new AbortController();
	constructor(options) {
		this.tokens = options.tokens;
		this.fetchImpl = options.fetch;
		this.now = options.now ?? Date.now;
		this.timeoutMs = options.timeoutMs ?? 1e4;
	}
	/** Read the current global fetch lazily so a proxy hook installed after construction still applies. */
	get fetcher() {
		return this.fetchImpl ?? globalThis.fetch;
	}
	/**
	* Drop the cache slot: sign-out, account switches, and identity changes
	* must not leave a request that started under the previous account writing
	* fresh-looking cache entries (nor A→B→A re-serving A's stale numbers).
	* The generation bump also blocks every in-flight get — including the one
	* performing this drop — from re-filling the slot afterwards.
	*/
	reset() {
		this.cache = void 0;
		this.generation += 1;
	}
	/** Same drop as reset(); the bump intentionally also blocks this get's own later cache write. */
	dropCache() {
		this.cache = void 0;
		this.generation += 1;
	}
	/**
	* Drop the cache (as reset) and abort every in-flight get through the
	* shared disposal signal — hung token resolution, refreshes, and body
	* reads end immediately. Gets started after dispose come back as a fixed
	* temporary error state; the route is unregistered by its own lifecycle.
	*/
	dispose() {
		this.reset();
		this.disposal.abort(/* @__PURE__ */ new Error("SuperGrok quota client disposed"));
	}
	/**
	* Serve a cached snapshot for the current account, or probe the billing
	* proxy. Only caller cancellation (route disconnect) propagates as a
	* thrown error; deadline expiry, disposal, and every other failure map to
	* a fixed snapshot state that never carries upstream diagnostics.
	*/
	async get(signal) {
		signal?.throwIfAborted();
		const generation = this.generation;
		if (!this.tokens.available()) {
			this.dropCache();
			return { state: "signed-out" };
		}
		try {
			return await this.probe(generation, signal);
		} catch (error) {
			if (signal?.aborted) throw error;
			return {
				state: "error",
				reason: "temporary"
			};
		}
	}
	async probe(generation, signal) {
		const deadlineAt = performance.now() + this.timeoutMs;
		const deadline = AbortSignal.timeout(this.timeoutMs);
		const combined = signal === void 0 ? AbortSignal.any([deadline, this.disposal.signal]) : AbortSignal.any([
			deadline,
			this.disposal.signal,
			signal
		]);
		const identity = await raceAbort(Promise.resolve(this.tokens.identity?.()), combined);
		if (identity === void 0) {
			this.dropCache();
			return {
				state: "unavailable",
				reason: "auth"
			};
		}
		const cached = this.cache;
		if (cached !== void 0 && cached.identity !== identity) this.dropCache();
		else if (cached !== void 0 && cacheUsable(cached, this.now())) {
			if (await raceAbort(Promise.resolve(this.tokens.identity?.()), combined) !== identity) {
				this.dropCache();
				return { state: "unavailable" };
			}
			if (cacheUsable(cached, this.now())) return cached.snapshot;
		}
		const bearer = await raceAbort(Promise.resolve(this.tokens.resolve(combined)), combined);
		if (bearer === void 0 || bearer.length === 0) {
			this.dropCache();
			return { state: "signed-out" };
		}
		const resolved = await this.resolveBilling(bearer, combined, deadlineAt);
		if ("state" in resolved) return {
			state: "error",
			reason: resolved.reason
		};
		let data;
		try {
			data = normalizeSuperGrokQuota(resolved.body, resolved.settings);
		} catch {
			return {
				state: "error",
				reason: "invalid"
			};
		}
		if (await raceAbort(Promise.resolve(this.tokens.identity?.()), combined) !== identity) return { state: "unavailable" };
		const checkedNow = this.now();
		if (resolved.verifiedPeriod !== void 0 && !activeQuotaPeriod(resolved.verifiedPeriod, checkedNow)) {
			const { usedPercent: _usedPercent, remainingPercent: _remainingPercent, ...details } = data;
			data = details;
		}
		const checkedAt = new Date(checkedNow).toISOString();
		const snapshot = typeof data.usedPercent === "number" && typeof data.remainingPercent === "number" ? {
			...data,
			state: "available",
			usedPercent: data.usedPercent,
			remainingPercent: data.remainingPercent,
			checkedAt
		} : {
			...data,
			state: "partial",
			checkedAt
		};
		if (generation === this.generation) this.cache = {
			identity,
			snapshot,
			fetchedAt: checkedNow,
			...snapshot.state === "available" && resolved.verifiedPeriod !== void 0 ? { verifiedPeriod: resolved.verifiedPeriod } : {}
		};
		return snapshot;
	}
	/**
	* Resolve the billing body and its settings companion. The REST credits
	* shape runs first (with at most one 401 refresh on the shared official
	* chain). HTTP 5xx, transport errors and partial 200 responses fall back to
	* the gRPC-web credits probe on the same bearer before the result is reported
	* (GROK-QUOTA-CREDITS-001). 401/403 never fall back, so a revoked login
	* cannot surface as usage data; 429 and other non-5xx statuses stay on the
	* REST mapping so a rate limit is not amplified by a second probe.
	*/
	async resolveBilling(bearer, signal, deadlineAt) {
		let token = bearer;
		let round;
		try {
			round = await this.fetchRound(token, signal);
		} catch (error) {
			return this.grpcOrRethrow(token, signal, error);
		}
		if (signal.aborted) {
			discardResponse(round.billing);
			signal.throwIfAborted();
		}
		if (round.billing.status === 401) {
			discardResponse(round.billing);
			const refreshed = await raceAbort(Promise.resolve(this.tokens.refresh?.(token, signal)), signal);
			if (refreshed === void 0 || refreshed.length === 0 || refreshed === token) return {
				state: "error",
				reason: "auth"
			};
			token = refreshed;
			try {
				round = await this.fetchRound(token, signal);
			} catch (error) {
				return this.grpcOrRethrow(token, signal, error);
			}
			if (signal.aborted) {
				discardResponse(round.billing);
				signal.throwIfAborted();
			}
			if (round.billing.status === 401) {
				discardResponse(round.billing);
				return {
					state: "error",
					reason: "auth"
				};
			}
		}
		if (!round.billing.ok) {
			const status = round.billing.status;
			discardResponse(round.billing);
			if (status === 403) return {
				state: "error",
				reason: "restricted"
			};
			if (status < 500) return {
				state: "error",
				reason: "temporary"
			};
			const grpcBody = await this.probeCreditsGrpc(token, signal);
			return grpcBody === void 0 ? {
				state: "error",
				reason: "temporary"
			} : {
				body: grpcBody,
				settings: round.settings,
				...grpcBody.implicitUsagePercent ? { verifiedPeriod: grpcBody.config.currentPeriod } : {}
			};
		}
		try {
			const body = await readBoundedJson$1(round.billing, MAX_QUOTA_RESPONSE_BYTES, signal);
			const config = isRecord$6(body) && isRecord$6(body.config) ? body.config : void 0;
			let verifyMissingPercent = isRecord$6(body) && (body.config === void 0 || config !== void 0) && config?.creditUsagePercent === void 0;
			if (verifyMissingPercent) try {
				verifyMissingPercent = normalizeSuperGrokQuota(body, round.settings).usedPercent === void 0;
			} catch {
				verifyMissingPercent = config?.monthlyLimit === void 0 && config?.used === void 0;
			}
			if (verifyMissingPercent && isRecord$6(body)) {
				const grpcBody = await this.verifyCreditsGrpc(token, signal, deadlineAt);
				const percent = grpcBody?.config.creditUsagePercent;
				const period = verifiedCreditsPeriod(config?.currentPeriod, grpcBody?.config.currentPeriod, this.now());
				if (grpcBody !== void 0 && percent !== void 0 && percent >= 0 && percent <= 100 && period !== void 0) return {
					body: {
						...body,
						config: {
							...config,
							creditUsagePercent: percent,
							currentPeriod: period
						}
					},
					settings: round.settings,
					verifiedPeriod: period
				};
			}
			return {
				body,
				settings: round.settings
			};
		} catch (error) {
			if (signal.aborted) throw error;
			return {
				state: "error",
				reason: "invalid"
			};
		}
	}
	/** Optional verification must leave room to return the already-read REST metadata. */
	async verifyCreditsGrpc(bearer, signal, deadlineAt) {
		signal.throwIfAborted();
		const budget = Math.min(QUOTA_VERIFICATION_TIMEOUT_MS, Math.floor((deadlineAt - performance.now()) / 2));
		if (budget <= 0) return void 0;
		const verificationSignal = AbortSignal.any([signal, AbortSignal.timeout(budget)]);
		try {
			return await this.probeCreditsGrpc(bearer, verificationSignal);
		} catch (error) {
			if (signal.aborted) throw error;
			return;
		}
	}
	/** Transport-failure path: the gRPC-web probe may still answer on this bearer. */
	async grpcOrRethrow(token, signal, error) {
		if (signal.aborted) throw error;
		const grpcBody = await this.probeCreditsGrpc(token, signal);
		if (grpcBody === void 0) throw error;
		return {
			body: grpcBody,
			settings: void 0,
			...grpcBody.implicitUsagePercent ? { verifiedPeriod: grpcBody.config.currentPeriod } : {}
		};
	}
	/**
	* gRPC-web credits fallback (GROK-QUOTA-CREDITS-001). Any failure returns
	* undefined so the REST outcome keeps deciding the snapshot state; caller
	* aborts still propagate. Accept the body only when grpc-status is 0 on
	* the HTTP header or the 0x80 trailer, and neither source reports another
	* status. Trailers-only responses are decided by the HTTP header.
	*/
	async probeCreditsGrpc(bearer, signal) {
		try {
			const response = await raceAbort(fetchWithBearer(this.fetcher, GROK_GRPC_CREDITS_URL, bearer, grpcCreditsRequestInit(signal)), signal, discardResponse);
			if (signal.aborted) {
				discardResponse(response);
				signal.throwIfAborted();
			}
			const grpcStatus = response.headers.get("grpc-status");
			if (response.ok && (grpcStatus === null || grpcStatus.trim() === "0")) return parseGrokCreditsGrpcWeb(await readBoundedBytes(response, MAX_QUOTA_RESPONSE_BYTES, signal), {
				headerStatus: grpcStatus,
				now: this.now()
			});
			discardResponse(response);
			return;
		} catch (error) {
			if (signal.aborted) throw error;
			return;
		}
	}
	async fetchRound(bearer, signal) {
		const failed = new AbortController();
		const roundSignal = AbortSignal.any([signal, failed.signal]);
		let billing;
		const discardBilling = () => {
			if (billing !== void 0) {
				discardResponse(billing);
				billing = void 0;
			}
		};
		roundSignal.addEventListener("abort", discardBilling, { once: true });
		try {
			const [response, settings] = await Promise.all([raceAbort(fetchWithBearer(this.fetcher, GROK_BILLING_URL, bearer, quotaRequestInit(roundSignal)), roundSignal, discardResponse).then((response) => {
				billing = response;
				if (roundSignal.aborted) {
					discardBilling();
					roundSignal.throwIfAborted();
				}
				return response;
			}), this.readSettings(bearer, roundSignal)]);
			roundSignal.throwIfAborted();
			return {
				billing: response,
				settings
			};
		} catch (error) {
			failed.abort(error);
			discardBilling();
			throw error;
		} finally {
			roundSignal.removeEventListener("abort", discardBilling);
		}
	}
	/**
	* Optional plan display name: its own budget (≤3s and ≤ half the whole-get
	* budget), raced fetch + body, any failure degrading to undefined — the
	* billing read decides the quota answer.
	*/
	async readSettings(bearer, wholeSignal) {
		const settingsBudget = Math.min(QUOTA_SETTINGS_TIMEOUT_MS, Math.floor(this.timeoutMs / 2));
		const settingsSignal = AbortSignal.any([wholeSignal, AbortSignal.timeout(settingsBudget)]);
		try {
			const response = await raceAbort(fetchWithBearer(this.fetcher, GROK_SETTINGS_URL, bearer, quotaRequestInit(settingsSignal)), settingsSignal, discardResponse);
			if (settingsSignal.aborted) {
				discardResponse(response);
				settingsSignal.throwIfAborted();
			}
			if (response.ok) return await readBoundedJson$1(response, MAX_QUOTA_RESPONSE_BYTES, settingsSignal);
			discardResponse(response);
			return;
		} catch {
			return;
		}
	}
};
//#endregion
//#region src/proxy.ts
/**
* xAI-only outbound proxy — per-plugin setting, no global configuration.
*
* Style matches the other local dsh plugins: this bundle owns one setting
* of its own (stored in `$DSH_HOME/.xai-oauth-proxy.json`, editable on its
* settings page). Nothing global is touched except one transparent
* `globalThis.fetch` hook that routes ONLY `x.ai` origins (api.x.ai / x.ai
* and subdomains, plus the exact cli-chat-proxy.grok.com billing host and
* the exact grok.com GetGrokCreditsConfig path) through this plugin's
* ProxyAgent and passes every other request to the original fetch
* untouched. While the plugin is loaded the hook applies to ALL matching
* requests in this process — including the catalog `xai` API-key route —
* and it is restored on plugin dispose.
*
* Effective URL precedence: stored setting > plugin config `proxyUrl` >
* `DSH_XAI_PROXY` (plugin-scoped env for headless/CLI use). HTTP/HTTPS
* proxy URLs only; undici's ProxyAgent does not speak SOCKS. URLs with
* embedded credentials are rejected and never persisted.
*/
const PROXY_FILE_VERSION = 1;
const PROXY_FILENAME = ".xai-oauth-proxy.json";
/** Absolute path of the plugin-owned proxy setting file. */
function xaiProxyPath(dshHome) {
	return resolve(join(resolveDshHome(dshHome), PROXY_FILENAME));
}
/** Best-effort atomic scrub of a stored proxy file that held credentials. */
function cleanupStoredProxy(file) {
	const tmp = `${file}.cleanup`;
	try {
		writeFileSync(tmp, `${JSON.stringify({
			version: PROXY_FILE_VERSION,
			proxyUrl: ""
		}, null, 2)}\n`, { mode: 384 });
		renameSync(tmp, file);
	} catch {}
}
/**
* Read the plugin's own stored proxy URL ('' = off; invalid/userinfo values
* are dropped AND the disk copy is scrubbed so credentials do not linger).
*/
function readStoredProxySettings() {
	try {
		const file = xaiProxyPath();
		const doc = JSON.parse(readFileSync(file, "utf8"));
		if (doc.version !== PROXY_FILE_VERSION) return void 0;
		const normalized = validProxyUrl(typeof doc.proxyUrl === "string" ? doc.proxyUrl.trim() : "");
		if (normalized === void 0) {
			cleanupStoredProxy(file);
			return {
				proxyUrl: "",
				quotaCompatibilityMode: false
			};
		}
		return {
			proxyUrl: normalized,
			quotaCompatibilityMode: doc.quotaCompatibilityMode === true
		};
	} catch {
		return;
	}
}
function readStoredProxyUrl() {
	return readStoredProxySettings()?.proxyUrl ?? "";
}
/**
* Persist the plugin's own proxy setting. Fail-closed: URLs with embedded
* credentials or invalid proxies are rejected BEFORE anything hits disk.
*/
async function writeStoredProxySettings(settings) {
	const normalized = validProxyUrl(settings.proxyUrl);
	if (normalized === void 0) throw new Error("proxyUrl must be a valid http:// or https:// URL without embedded credentials");
	const file = xaiProxyPath();
	mkdirSync(dirname(file), {
		recursive: true,
		mode: 448
	});
	await writeFileAtomic(file, `${JSON.stringify({
		version: PROXY_FILE_VERSION,
		proxyUrl: normalized,
		quotaCompatibilityMode: settings.quotaCompatibilityMode
	}, null, 2)}\n`, {
		mode: 384,
		dirMode: 448
	});
}
/** Legacy URL-only callers must not silently reset the compatibility choice. */
async function writeStoredProxyUrl(url) {
	await writeStoredProxySettings({
		proxyUrl: url,
		quotaCompatibilityMode: readStoredProxySettings()?.quotaCompatibilityMode ?? false
	});
}
let proxyAgent = null;
let quotaDirectAgent = null;
let quotaCompatibilityMode = false;
function urlHref(input) {
	if (typeof input === "string") return input;
	if (input instanceof URL) return input.href;
	if (input !== null && typeof input === "object" && typeof input.url === "string") return input.url;
	return "";
}
const GROK_CREDITS_PATH = new URL(GROK_GRPC_CREDITS_URL).pathname;
/**
* xAI API origins, the exact official Grok subscription billing proxy, and
* the exact grok.com GetGrokCreditsConfig fallback. Other grok.com paths stay
* direct so a configured proxy is not a general grok.com tunnel
* (GROK-QUOTA-CREDITS-001).
*/
function isXaiProxyTarget(input) {
	if (input === void 0 || input === null) return false;
	try {
		const url = new URL(urlHref(input));
		const host = url.hostname.toLowerCase();
		if (host === "x.ai" || host.endsWith(".x.ai") || host === "cli-chat-proxy.grok.com") return true;
		return host === "grok.com" && url.pathname === GROK_CREDITS_PATH;
	} catch {
		return false;
	}
}
/** Narrow to a URL-bearing value: not '', not the literal spellings 'undefined'/'null'. */
function nonBlank(value) {
	if (value === void 0) return false;
	const trimmed = value.trim();
	return trimmed !== "" && trimmed !== "undefined" && trimmed !== "null";
}
/** Validate an HTTP(S) proxy URL. Returns the trimmed URL, '' for an explicit off, or undefined for an invalid value. */
function validProxyUrl(url) {
	const trimmed = url.trim();
	if (trimmed === "") return "";
	try {
		const parsed = new URL(trimmed);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return void 0;
		if (parsed.hostname.length === 0) return void 0;
		if (parsed.username !== "" || parsed.password !== "") return void 0;
		return trimmed;
	} catch {
		return;
	}
}
/**
* Point the xAI-only hook at a proxy URL; '' clears it (xAI goes direct too).
* Invalid URLs are rejected and never throw — the plugin must not crash on a
* bad stored/env value. Returns true when the value was applied.
*/
function setXaiProxyUrl(url) {
	const normalized = validProxyUrl(url);
	const previous = proxyAgent;
	proxyAgent = null;
	if (previous !== null) previous.close().catch(() => void 0);
	if (normalized === void 0) return false;
	if (normalized !== "") proxyAgent = new ProxyAgent(normalized);
	return true;
}
const QUOTA_ENDPOINTS = /* @__PURE__ */ new Set([
	GROK_BILLING_URL,
	GROK_SETTINGS_URL,
	GROK_GRPC_CREDITS_URL
]);
/** Runtime-only; callers persist the settings before applying a change. */
function setQuotaCompatibilityMode(enabled) {
	quotaCompatibilityMode = enabled;
}
/**
* Quota-only fetch adapter. Off preserves the current global wrapper chain.
* On uses imported Undici plus an explicit current dispatcher (including a
* plugin-owned direct Agent when the URL is blank), not the global dispatcher.
* The quota client supplies URL inputs and only strings/byte-array bodies;
* normalizing headers and wrapping the response stream bridge DOM/Undici types
* without buffering away the client's body ceiling or cancellation semantics.
*/
const fetchGrokQuota = async (input, init) => {
	if (!quotaCompatibilityMode) return globalThis.fetch(input, init);
	if (typeof input !== "string" && !(input instanceof URL)) throw new TypeError("Quota transport requires a URL");
	if (!QUOTA_ENDPOINTS.has(new URL(input).href)) throw new TypeError("Quota transport requires an official quota endpoint");
	const body = init?.body;
	if (body !== void 0 && body !== null && typeof body !== "string" && !(body instanceof Uint8Array)) throw new TypeError("Quota transport requires a string or byte-array body");
	const dispatcher = proxyAgent ?? (quotaDirectAgent ??= new Agent());
	const response = await fetch$1(input, {
		...init,
		body,
		headers: Object.fromEntries(new Headers(init?.headers)),
		dispatcher,
		redirect: "error"
	});
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: Object.fromEntries(response.headers)
	});
};
/**
* Install a transparent global-fetch hook that routes x.ai origins, the
* exact official Grok billing host, and the exact GetGrokCreditsConfig path
* through this plugin's ProxyAgent; every other request goes to the
* original fetch untouched. Reference counted: every install returns its
* OWN idempotent disposer, and the original fetch is restored only after
* the LAST owner releases — and only if our wrapper is still installed
* (a later component that replaced fetch after us is never clobbered).
*/
function installXaiFetchHook() {
	if (hookOwners === 0) {
		originalFetch = globalThis.fetch;
		const base = originalFetch.bind(globalThis);
		const wrapper = ((input, init) => {
			if (proxyAgent !== null && isXaiProxyTarget(input)) return fetch$1(input, {
				...init ?? {},
				dispatcher: proxyAgent
			});
			return base(input, init);
		});
		globalThis.fetch = wrapper;
		installedWrapper = wrapper;
	}
	hookOwners += 1;
	let released = false;
	return () => {
		if (released) return;
		released = true;
		hookOwners -= 1;
		if (hookOwners > 0) return;
		if (installedWrapper !== void 0 && globalThis.fetch === installedWrapper) globalThis.fetch = originalFetch ?? globalThis.fetch;
		const previous = proxyAgent;
		proxyAgent = null;
		if (previous !== null) previous.close().catch(() => void 0);
		const direct = quotaDirectAgent;
		quotaDirectAgent = null;
		if (direct !== null) direct.close().catch(() => void 0);
		quotaCompatibilityMode = false;
		installedWrapper = void 0;
		originalFetch = void 0;
	};
}
let hookOwners = 0;
let installedWrapper;
let originalFetch;
/** Effective settings; show config/env fallback so toggling mode cannot clear an unseen proxy. */
function readXaiProxySettings(configUrl) {
	const stored = readStoredProxySettings();
	if (stored !== void 0) return stored;
	const env = process.env.DSH_XAI_PROXY;
	return {
		proxyUrl: validProxyUrl(nonBlank(configUrl) ? configUrl.trim() : nonBlank(env) ? env.trim() : "") ?? "",
		quotaCompatibilityMode: false
	};
}
/** Effective proxy URL: stored > config > env. Invalid/userinfo values resolve to ''. */
function resolveXaiProxyUrl(configUrl) {
	return readXaiProxySettings(configUrl).proxyUrl;
}
/**
* Apply the effective proxy URL (stored > config > env) to the already
* installed hook. Callers own the hook lifecycle via installXaiFetchHook().
* Returns the effective URL, '' when unset/invalid.
*/
function applyXaiProxy(configUrl) {
	const settings = readXaiProxySettings(configUrl);
	setXaiProxyUrl(settings.proxyUrl);
	setQuotaCompatibilityMode(settings.quotaCompatibilityMode);
	return settings.proxyUrl;
}
//#endregion
//#region src/media-options.ts
/** Explicit local consent and switches for optional media tools. No credentials. */
const MEDIA_TOOL_KEYS = [
	"imagineTool",
	"editTool",
	"videoTool"
];
/** Old media enablement is not inherited; new choices require explicit consent. */
function resolveMediaOptions(config) {
	const mediaRiskAcknowledged = config.mediaRiskAcknowledged === true;
	return {
		imagineTool: mediaRiskAcknowledged && config.imagineTool === true,
		editTool: mediaRiskAcknowledged && config.editTool === true,
		videoTool: mediaRiskAcknowledged && config.videoTool === true,
		mediaRiskAcknowledged
	};
}
/** Every off -> on settings request must carry its own explicit confirmation. */
function mediaEnableNeedsConfirmation(current, next, patch) {
	const requested = typeof patch === "object" && patch !== null && !Array.isArray(patch) ? patch : {};
	return MEDIA_TOOL_KEYS.some((key) => !current[key] && (next[key] || requested[key] === true)) && !(typeof patch === "object" && patch !== null && !Array.isArray(patch) && "mediaRiskAcknowledged" in patch && patch.mediaRiskAcknowledged === true);
}
/** Check at execution time too, including calls requested by old result cards. */
function assertMediaEnabled(enabled, name) {
	if (enabled !== void 0 && !enabled()) throw new Error(`${name} is disabled — enable it in Settings → xAI Grok first`);
}
//#endregion
//#region src/token-source.ts
/**
* OAuth-only bearer source for search, chat 401 retry, and Imagine.
* Refresh runs outside the 2s file lock; compare-and-write is inside it.
* @module dsh-grok-kit/token-source
*/
/** Account partition only, NOT JWT signature verification or an authorization decision. */
function oauthIdentityOf(credential) {
	if (credential?.type !== "oauth") return void 0;
	let subject = credential.accountId;
	if (subject === void 0 && typeof credential.access === "string" && credential.access.length <= 32768) {
		const parts = credential.access.split(".");
		if (parts.length === 3 && /^[A-Za-z0-9_-]+$/.test(parts[1] ?? "")) try {
			const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
			if (typeof claims === "object" && claims !== null && !Array.isArray(claims) && "iss" in claims && claims.iss === "https://auth.x.ai" && "sub" in claims && typeof claims.sub === "string") subject = claims.sub;
		} catch {}
	}
	if (typeof subject !== "string" || subject.trim().length === 0 || subject.length > 1024) return void 0;
	return createHash("sha256").update(`xai-oauth-account:${subject}`).digest("hex");
}
const inFlightRefresh = /* @__PURE__ */ new Map();
/** Stop this caller's wait, not the shared credential read or rotation. */
function waitForCredential(pending, signal) {
	if (signal === void 0) return pending;
	return new Promise((resolve, reject) => {
		const cleanup = () => signal.removeEventListener("abort", onAbort);
		const onAbort = () => {
			cleanup();
			reject(signal.reason);
		};
		pending.then((value) => {
			cleanup();
			resolve(value);
		}, (error) => {
			cleanup();
			reject(error);
		});
		if (signal.aborted) onAbort();
		else signal.addEventListener("abort", onAbort, { once: true });
	});
}
/**
* Build a token source that is OAuth-only by construction, including forced
* refresh after a server-side 401. In-process refreshes for the same rejected
* bearer coalesce onto one `oauth.refresh` call.
*/
function createXaiOAuthSearchTokenSource(session) {
	return {
		available: () => session.store.exists(),
		async identity() {
			return oauthIdentityOf(await session.store.read("xai"));
		},
		async resolve(signal) {
			signal?.throwIfAborted();
			const credential = await waitForCredential(session.store.read("xai"), signal);
			signal?.throwIfAborted();
			if (credential?.type !== "oauth") return void 0;
			const auth = await waitForCredential(session.models.getAuth("xai"), signal);
			signal?.throwIfAborted();
			if (auth?.source !== "OAuth") return void 0;
			const accessToken = auth.auth.apiKey;
			return accessToken === void 0 || accessToken.length === 0 ? void 0 : accessToken;
		},
		async refresh(rejectedAccessToken, signal) {
			signal?.throwIfAborted();
			const storeKey = session.store.filename;
			let refreshes = inFlightRefresh.get(storeKey);
			if (refreshes === void 0) {
				refreshes = /* @__PURE__ */ new Map();
				inFlightRefresh.set(storeKey, refreshes);
			}
			const existing = refreshes.get(rejectedAccessToken);
			if (existing !== void 0) return waitForCredential(existing, signal);
			const pending = refreshRejected(session, rejectedAccessToken).finally(() => {
				if (refreshes.get(rejectedAccessToken) === pending) refreshes.delete(rejectedAccessToken);
				if (refreshes.size === 0) inFlightRefresh.delete(storeKey);
			});
			refreshes.set(rejectedAccessToken, pending);
			return waitForCredential(pending, signal);
		}
	};
}
async function refreshRejected(session, rejectedAccessToken) {
	const oauth = session.models.getProvider("xai")?.auth.oauth;
	if (oauth === void 0) return void 0;
	const refreshSignal = new AbortController().signal;
	const current = await session.store.read("xai");
	refreshSignal.throwIfAborted();
	if (current?.type !== "oauth") return void 0;
	if (current.access !== rejectedAccessToken) return current.access;
	const rotated = await oauth.refresh(current, refreshSignal);
	refreshSignal.throwIfAborted();
	const credential = await session.store.modify("xai", async (candidate) => {
		refreshSignal.throwIfAborted();
		if (candidate?.type !== "oauth") return void 0;
		if (candidate.access !== rejectedAccessToken || candidate.refresh !== current.refresh) return void 0;
		return rotated.accountId === void 0 && candidate.accountId !== void 0 ? {
			...rotated,
			accountId: candidate.accountId
		} : rotated;
	});
	refreshSignal.throwIfAborted();
	if (credential?.type !== "oauth") return void 0;
	return credential.access.length === 0 ? void 0 : credential.access;
}
//#endregion
//#region src/search.ts
/**
* Server-side xAI search tools over the Responses API.
*
* xAI executes the search on its own infrastructure: the request carries
* `tools: [{ type: 'web_search' }]` or `tools: [{ type: 'x_search' }]`
* and the response carries `*_search_call` items with `action.sources`,
* `output_text` with inline `url_citation`/`post_citation` annotations,
* and a top-level `citations` list.
* @module dsh-grok-kit/search
*/
const XAI_RESPONSES_URL = "https://api.x.ai/v1/responses";
/** OAuth-friendly Grok Build model; override via config `searchModel`. */
const DEFAULT_XAI_SEARCH_MODEL = "grok-build-0.1";
const USER_AGENT$1 = "dsh-grok-kit/0.2.9";
const ERROR_BODY_LIMIT = 300;
function isRecord$5(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function nonBlankString(value) {
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : void 0;
}
function validWebUrl(value) {
	const candidate = nonBlankString(value);
	if (candidate === void 0) return void 0;
	try {
		const parsed = new URL(candidate);
		return parsed.protocol === "http:" || parsed.protocol === "https:" ? candidate : void 0;
	} catch {
		return;
	}
}
function sourceFromRecord(value) {
	if (!isRecord$5(value)) return void 0;
	const url = validWebUrl(value["url"]);
	if (url === void 0) return void 0;
	const title = nonBlankString(value["title"]) ?? nonBlankString(value["text"]) ?? nonBlankString(value["post_text"]);
	const snippet = nonBlankString(value["snippet"]) ?? nonBlankString(value["description"]) ?? nonBlankString(value["author"]);
	const publishedAt = nonBlankString(value["publishedAt"]) ?? nonBlankString(value["published_at"]);
	return {
		url,
		...title !== void 0 ? { title } : {},
		...snippet !== void 0 ? { snippet } : {},
		...publishedAt !== void 0 ? { publishedAt } : {}
	};
}
function mergeSources(groups) {
	const byUrl = /* @__PURE__ */ new Map();
	for (const group of groups) for (const source of group) {
		const previous = byUrl.get(source.url);
		if (previous === void 0) {
			byUrl.set(source.url, source);
			continue;
		}
		byUrl.set(source.url, {
			url: source.url,
			...(previous.title ?? source.title) !== void 0 ? { title: previous.title ?? source.title } : {},
			...(previous.snippet ?? source.snippet) !== void 0 ? { snippet: previous.snippet ?? source.snippet } : {},
			...(previous.publishedAt ?? source.publishedAt) !== void 0 ? { publishedAt: previous.publishedAt ?? source.publishedAt } : {}
		});
	}
	return [...byUrl.values()];
}
function outputItems(body) {
	return Array.isArray(body["output"]) ? body["output"] : [];
}
function collectOutputText(body) {
	const texts = [];
	for (const item of outputItems(body)) {
		if (!isRecord$5(item) || item["type"] !== "message" || !Array.isArray(item["content"])) continue;
		for (const chunk of item["content"]) {
			if (!isRecord$5(chunk) || chunk["type"] !== "output_text") continue;
			const text = nonBlankString(chunk["text"]);
			if (text !== void 0) texts.push(text);
		}
	}
	return texts;
}
function isXSearchToolName(name) {
	return typeof name === "string" && /^x[_-]?/.test(name) && /search|fetch|thread|user/i.test(name);
}
function isSearchCall(item) {
	const type = item["type"];
	if (type === "web_search_call" || type === "x_search_call" || typeof type === "string" && type.endsWith("_search_call")) return true;
	return type === "custom_tool_call" && isXSearchToolName(item["name"]);
}
/** Responses `include` values xAI actually accepts. `x_search_call.action.sources` is rejected with HTTP 400. */
function includeForSearchTool(tool) {
	return tool === "web_search" ? ["web_search_call.action.sources", "no_inline_citations"] : ["no_inline_citations"];
}
/**
* Build the server-side tool object xAI expects. Only official filter keys
* are forwarded; empty lists are omitted so a bare `{ type }` stays valid.
*/
function buildSearchToolPayload(tool, request) {
	const payload = { type: tool };
	if (tool === "web_search") {
		if (request.allowedDomains !== void 0 && request.allowedDomains.length > 0) payload["allowed_domains"] = [...request.allowedDomains];
		if (request.excludedDomains !== void 0 && request.excludedDomains.length > 0) payload["excluded_domains"] = [...request.excludedDomains];
		if (request.enableImageSearch === true) payload["enable_image_search"] = true;
		if (request.enableImageUnderstanding === true) payload["enable_image_understanding"] = true;
		return payload;
	}
	if (request.allowedXHandles !== void 0 && request.allowedXHandles.length > 0) payload["allowed_x_handles"] = [...request.allowedXHandles];
	if (request.excludedXHandles !== void 0 && request.excludedXHandles.length > 0) payload["excluded_x_handles"] = [...request.excludedXHandles];
	if (request.fromDate !== void 0) payload["from_date"] = request.fromDate;
	if (request.toDate !== void 0) payload["to_date"] = request.toDate;
	if (request.enableImageUnderstanding === true) payload["enable_image_understanding"] = true;
	if (request.enableVideoUnderstanding === true) payload["enable_video_understanding"] = true;
	return payload;
}
function collectActionSources(body) {
	const sources = [];
	for (const item of outputItems(body)) {
		if (!isRecord$5(item) || !isSearchCall(item) || !isRecord$5(item["action"])) continue;
		const rows = item["action"]["sources"];
		if (!Array.isArray(rows)) continue;
		for (const row of rows) {
			const source = sourceFromRecord(row);
			if (source !== void 0) sources.push(source);
		}
	}
	return sources;
}
function collectAnnotationSources(body) {
	const sources = [];
	for (const item of outputItems(body)) {
		if (!isRecord$5(item) || item["type"] !== "message" || !Array.isArray(item["content"])) continue;
		for (const chunk of item["content"]) {
			if (!isRecord$5(chunk) || chunk["type"] !== "output_text" || !Array.isArray(chunk["annotations"])) continue;
			for (const annotation of chunk["annotations"]) {
				if (!isRecord$5(annotation)) continue;
				if (annotation["type"] !== "url_citation" && annotation["type"] !== "post_citation") continue;
				const url = validWebUrl(annotation["url"]);
				if (url === void 0) continue;
				const title = nonBlankString(annotation["title"]);
				sources.push({
					url,
					...title !== void 0 && title !== url ? { title } : {}
				});
			}
		}
	}
	return sources;
}
function collectCustomToolSources(body) {
	const sources = [];
	for (const item of outputItems(body)) {
		if (!isRecord$5(item) || item["type"] !== "custom_tool_call" || !isXSearchToolName(item["name"])) continue;
		for (const key of [
			"output",
			"result",
			"content"
		]) pushParsedSources(item[key], sources);
	}
	return sources;
}
function pushParsedSources(value, sources) {
	if (Array.isArray(value)) {
		for (const row of value) {
			const source = sourceFromRecord(row);
			if (source !== void 0) sources.push(source);
		}
		return;
	}
	if (typeof value !== "string" || value.trim().length === 0) return;
	try {
		const parsed = JSON.parse(value);
		if (Array.isArray(parsed)) {
			pushParsedSources(parsed, sources);
			return;
		}
		if (isRecord$5(parsed)) {
			for (const key of [
				"sources",
				"posts",
				"results"
			]) if (Array.isArray(parsed[key])) pushParsedSources(parsed[key], sources);
		}
	} catch {}
}
function collectXStatusUrls(body) {
	const sources = [];
	const seen = /* @__PURE__ */ new Set();
	const pattern = /https?:\/\/(?:x|twitter)\.com\/[^\s)\]>'"]+/gi;
	for (const text of collectOutputText(body)) for (const match of text.match(pattern) ?? []) {
		const url = validWebUrl(match.replace(/[.,;:]+$/, ""));
		if (url === void 0 || seen.has(url)) continue;
		seen.add(url);
		sources.push({ url });
	}
	return sources;
}
function collectCitationSources(body) {
	if (!Array.isArray(body["citations"])) return [];
	const sources = [];
	for (const citation of body["citations"]) {
		if (typeof citation === "string") {
			const url = validWebUrl(citation);
			if (url !== void 0) sources.push({ url });
			continue;
		}
		const source = sourceFromRecord(citation);
		if (source !== void 0) sources.push(source);
	}
	return sources;
}
function collectToolUsage(body) {
	const usage = body["usage"];
	if (!isRecord$5(usage)) return void 0;
	const details = usage["server_side_tool_usage_details"];
	if (!isRecord$5(details)) return void 0;
	const counts = {};
	for (const [key, value] of Object.entries(details)) if (typeof value === "number" && Number.isFinite(value)) counts[key] = value;
	return Object.keys(counts).length > 0 ? counts : void 0;
}
/** Map an xAI Responses API envelope into DSH search result shape. */
function mapXaiSearchResponse(body) {
	const content = collectOutputText(body).join("\n\n").trim();
	const sources = mergeSources([
		collectActionSources(body),
		collectCustomToolSources(body),
		collectAnnotationSources(body),
		collectCitationSources(body),
		collectXStatusUrls(body)
	]);
	const toolUsage = collectToolUsage(body);
	return {
		...content.length > 0 ? { content } : {},
		sources,
		truncated: false,
		...toolUsage !== void 0 ? { toolUsage } : {}
	};
}
function xaiApiErrorMessage(body) {
	if (!isRecord$5(body)) return void 0;
	const error = body["error"];
	if (typeof error === "string") return nonBlankString(error);
	if (!isRecord$5(error)) return void 0;
	return nonBlankString(error["message"]) ?? nonBlankString(error["code"]);
}
function isAbortError(error) {
	if (error instanceof DOMException && error.name === "AbortError") return true;
	return isRecord$5(error) && error["name"] === "AbortError";
}
async function parseErrorResponse(response, signal) {
	const mode = response.status === 403 ? "xAI search may be disabled for this account tier or model — try setting searchModel to a chat model such as grok-4.5, or set backendSearch: false if you enabled it" : `xAI search failed (HTTP ${response.status})`;
	try {
		const text = await response.text();
		if (signal?.aborted) throw new XaiOAuthSearchError("xAI search aborted", "WEB_ABORTED");
		if (text.length === 0) return mode;
		try {
			const detail = xaiApiErrorMessage(JSON.parse(text));
			if (detail !== void 0) return `${mode}: ${safeMessage(detail).slice(0, ERROR_BODY_LIMIT)}`;
		} catch {}
		return `${mode}: ${safeMessage(text.trim()).slice(0, ERROR_BODY_LIMIT)}`;
	} catch (error) {
		if (error instanceof XaiOAuthSearchError) throw error;
		if (signal?.aborted || isAbortError(error)) throw new XaiOAuthSearchError("xAI search aborted", "WEB_ABORTED", { cause: error });
		return mode;
	}
}
function buildSearchPrompt(tool, query) {
	return [
		tool === "x_search" ? "Use the x_search tool to research X (Twitter) posts, accounts, and trends for the search topic below." : "Use the web_search tool to research the search topic below.",
		"Return a concise factual summary grounded in the sources you found.",
		`Search topic: ${JSON.stringify(query)}`
	].join("\n");
}
var XaiOAuthSearchError = class extends HarnessError {};
/**
* OAuth-only Grok search provider for one server-side xAI tool.
* Deliberately NOT registered on `ctx.web`: tools call this class directly,
* so the native `web_search` seam (provider selection) is never touched.
*/
var XaiOAuthSearchProvider = class {
	tokens;
	tool;
	id;
	model;
	fetchImpl;
	constructor(tokens, tool, options = {}) {
		this.tokens = tokens;
		this.tool = tool;
		this.id = `xai-oauth:${tool}`;
		this.model = options.model?.trim() || "grok-build-0.1";
		this.fetchImpl = options.fetch ?? globalThis.fetch;
	}
	available() {
		return this.model.length > 0 && this.tokens.available();
	}
	async request(accessToken, request, signal) {
		try {
			return await fetchWithBearer(this.fetchImpl, XAI_RESPONSES_URL, accessToken, {
				method: "POST",
				redirect: "error",
				headers: {
					"content-type": "application/json",
					accept: "application/json",
					"user-agent": USER_AGENT$1
				},
				body: JSON.stringify({
					model: this.model,
					input: [{
						role: "user",
						content: buildSearchPrompt(this.tool, request.query)
					}],
					tools: [buildSearchToolPayload(this.tool, request)],
					include: includeForSearchTool(this.tool),
					store: false
				}),
				...signal !== void 0 ? { signal } : {}
			});
		} catch (error) {
			if (signal?.aborted || isAbortError(error)) throw new XaiOAuthSearchError("xAI search aborted", "WEB_ABORTED", { cause: error });
			throw new XaiOAuthSearchError("Could not reach xAI search", "WEB_PROVIDER_ERROR", { cause: error });
		}
	}
	async search(request, signal) {
		let accessToken;
		try {
			accessToken = await this.tokens.resolve(signal);
		} catch (error) {
			if (signal?.aborted || isAbortError(error)) throw new XaiOAuthSearchError("xAI search aborted", "WEB_ABORTED", { cause: error });
			throw new XaiOAuthSearchError("Could not resolve the SuperGrok OAuth credential", "WEB_PROVIDER_ERROR", { cause: error });
		}
		if (accessToken === void 0 || accessToken.length === 0) throw new XaiOAuthSearchError("xAI search requires a SuperGrok/X OAuth sign-in (Settings → xAI Grok · dsh-grok-kit); API-key fallback is intentionally disabled", "WEB_PROVIDER_ERROR");
		let response = await this.request(accessToken, request, signal);
		if (response.status === 401 && this.tokens.refresh !== void 0) {
			let refreshed;
			try {
				refreshed = await this.tokens.refresh(accessToken, signal);
			} catch (error) {
				response.body?.cancel().catch(() => void 0);
				if (signal?.aborted || isAbortError(error)) throw new XaiOAuthSearchError("xAI search aborted", "WEB_ABORTED", { cause: error });
				throw new XaiOAuthSearchError("Could not refresh the SuperGrok OAuth credential after HTTP 401", "WEB_PROVIDER_ERROR", { cause: error });
			}
			if (refreshed !== void 0 && refreshed.length > 0 && refreshed !== accessToken) {
				response.body?.cancel().catch(() => void 0);
				accessToken = refreshed;
				response = await this.request(accessToken, request, signal);
			}
		}
		if (!response.ok) throw new XaiOAuthSearchError(await parseErrorResponse(response, signal), "WEB_PROVIDER_ERROR");
		let body;
		try {
			body = await response.json();
		} catch (error) {
			if (signal?.aborted || isAbortError(error)) throw new XaiOAuthSearchError("xAI search aborted", "WEB_ABORTED", { cause: error });
			throw new XaiOAuthSearchError("xAI search returned invalid JSON", "WEB_PROVIDER_ERROR", { cause: error });
		}
		if (signal?.aborted) throw new XaiOAuthSearchError("xAI search aborted", "WEB_ABORTED");
		const apiError = xaiApiErrorMessage(body);
		if (apiError !== void 0) throw new XaiOAuthSearchError(`xAI search returned an error: ${safeMessage(apiError)}`, "WEB_PROVIDER_ERROR");
		if (!isRecord$5(body)) throw new XaiOAuthSearchError("xAI search returned an invalid response envelope", "WEB_PROVIDER_ERROR");
		return mapXaiSearchResponse(body);
	}
};
//#endregion
//#region src/video-config.ts
/** Opt-in video defaults shared by host configuration and settings presentation. */
/** Browser-safe shared route contract; no host imports are needed by the client. */
const GROK_VIDEO_FILE_PATH = "/plugins/dsh-grok-kit/video/file";
const DEFAULT_VIDEO_MODEL = "grok-imagine-video-1.5";
const DEFAULT_VIDEO_MAX_BYTES = 104857600;
/** Keep host admission aligned with the bounded browser download path in the first version. */
const MAX_VIDEO_MAX_BYTES = DEFAULT_VIDEO_MAX_BYTES;
function validVideoModel(value) {
	return value === DEFAULT_VIDEO_MODEL;
}
function validVideoMaxBytes(value) {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 1048576 && value <= 104857600;
}
//#endregion
//#region src/response-chain.ts
/**
* Client-side bookkeeping for xAI stateful Responses (store + previous_response_id).
* Fingerprints are hashes of client-originated input items; the search corpus
* itself never lives here.
* @module dsh-grok-kit/response-chain
*/
const CHAINS_VERSION = 1;
const CHAINS_FILENAME = ".dsh-grok-kit-chains.json";
const MAX_CHAINS = 64;
function isRecord$4(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isENOENT$1(error) {
	return error?.code === "ENOENT";
}
function itemRole(item) {
	return typeof item["role"] === "string" ? item["role"] : void 0;
}
function isToolOutputInputItem(item) {
	if (!isRecord$4(item)) return false;
	const type = item["type"];
	return type === "function_call_output" || type === "custom_tool_call_output";
}
function isUserInputItem(item) {
	if (!isRecord$4(item)) return false;
	const role = itemRole(item);
	if (role === "user") return true;
	return item["type"] === "message" && role === "user";
}
/** User / system messages and local tool results — not model output. */
function isClientOriginatedInputItem(item) {
	if (!isRecord$4(item)) return false;
	if (isToolOutputInputItem(item)) return true;
	const role = itemRole(item);
	if (role === "user" || role === "system" || role === "developer") return true;
	if (item["type"] === "message" && (role === "user" || role === "system" || role === "developer")) return true;
	return false;
}
function extractClientInputItems(input) {
	if (!Array.isArray(input)) return [];
	return input.filter(isClientOriginatedInputItem);
}
function fingerprintInputItem(item) {
	return createHash("sha256").update(JSON.stringify(item)).digest("hex");
}
function clientInputDelta(previousFingerprints, currentItems) {
	const currentFingerprints = currentItems.map(fingerprintInputItem);
	if (currentFingerprints.length < previousFingerprints.length) return { kind: "reset" };
	for (let index = 0; index < previousFingerprints.length; index += 1) if (currentFingerprints[index] !== previousFingerprints[index]) return { kind: "reset" };
	const items = currentItems.slice(previousFingerprints.length);
	if (items.length === 0) return { kind: "reset" };
	return {
		kind: "delta",
		items
	};
}
function applyStatefulContinuation(payload, options) {
	const params = {
		...payload,
		store: true
	};
	const currentItems = extractClientInputItems(params["input"]);
	const fingerprints = currentItems.map(fingerprintInputItem);
	if (options.forceFullReplay === true) {
		delete params["previous_response_id"];
		return {
			payload: params,
			fingerprints,
			usedPrevious: false
		};
	}
	const previous = options.store.get(options.sessionId);
	if (previous === void 0 || previous.model !== options.modelId || previous.stopReason !== "stop") {
		delete params["previous_response_id"];
		return {
			payload: params,
			fingerprints,
			usedPrevious: false
		};
	}
	const delta = clientInputDelta(previous.fingerprints, currentItems);
	if (delta.kind === "reset") {
		delete params["previous_response_id"];
		return {
			payload: params,
			fingerprints,
			usedPrevious: false
		};
	}
	if (!delta.items.some(isUserInputItem)) {
		delete params["previous_response_id"];
		return {
			payload: params,
			fingerprints,
			usedPrevious: false
		};
	}
	params["previous_response_id"] = previous.responseId;
	params["input"] = delta.items;
	return {
		payload: params,
		fingerprints,
		usedPrevious: true
	};
}
function chainsPath(dshHome) {
	return resolve(join(resolveDshHome(dshHome), CHAINS_FILENAME));
}
function parseDocument(text) {
	let value;
	try {
		value = JSON.parse(text);
	} catch {
		return {};
	}
	if (!isRecord$4(value) || value["version"] !== CHAINS_VERSION || !isRecord$4(value["sessions"])) return {};
	const sessions = value["sessions"];
	const out = {};
	for (const [sessionId, raw] of Object.entries(sessions)) {
		if (!isRecord$4(raw) || typeof raw["responseId"] !== "string" || typeof raw["model"] !== "string") continue;
		if (!Array.isArray(raw["fingerprints"]) || raw["fingerprints"].some((item) => typeof item !== "string")) continue;
		const updatedAt = typeof raw["updatedAt"] === "number" ? raw["updatedAt"] : 0;
		const stopReason = typeof raw["stopReason"] === "string" ? raw["stopReason"] : "";
		out[sessionId] = {
			responseId: raw["responseId"],
			fingerprints: [...raw["fingerprints"]],
			model: raw["model"],
			updatedAt,
			stopReason,
			...typeof raw["backendSearch"] === "boolean" ? { backendSearch: raw["backendSearch"] } : {}
		};
	}
	return out;
}
/** File-backed chain store. Writes are fire-and-forget after the in-memory map updates. */
function createFileResponseChainStore(dshHome) {
	const file = chainsPath(dshHome);
	let sessions = {};
	try {
		sessions = parseDocument(readFileSync(file, "utf8"));
	} catch (error) {
		if (!isENOENT$1(error)) sessions = {};
	}
	const persist = () => {
		const entries = Object.entries(sessions).sort((left, right) => right[1].updatedAt - left[1].updatedAt);
		if (entries.length > MAX_CHAINS) sessions = Object.fromEntries(entries.slice(0, MAX_CHAINS));
		writeFileAtomic(file, `${JSON.stringify({
			version: CHAINS_VERSION,
			sessions
		}, null, 2)}\n`, { mode: 384 }).catch(() => void 0);
	};
	return {
		get(sessionId) {
			return sessions[sessionId];
		},
		set(sessionId, record) {
			sessions[sessionId] = record;
			persist();
		},
		delete(sessionId) {
			if (sessions[sessionId] === void 0) return;
			delete sessions[sessionId];
			persist();
		}
	};
}
function createMemoryResponseChainStore(initial = {}) {
	const sessions = { ...initial };
	return {
		get(sessionId) {
			return sessions[sessionId];
		},
		set(sessionId, record) {
			sessions[sessionId] = record;
		},
		delete(sessionId) {
			delete sessions[sessionId];
		}
	};
}
//#endregion
//#region src/responses.ts
/**
* Wrap pi-ai's openai-responses stream: encrypted reasoning include, default
* high effort, optional mixed server-side search tools, optional 401 retry.
* @module dsh-grok-kit/responses
*/
const XAI_SERVER_X_SEARCH_REJECT_NAMES = [
	"x_keyword_search",
	"x_semantic_search",
	"x_user_search",
	"x_thread_fetch"
];
/**
* Function tools that collide with xAI built-in server-side tool names.
* Live OAuth probe 2026-08-24: `{type:function,name:"web_search"}` +
* `{type:"web_search"}` → HTTP 400 `Duplicate tool names: web_search`.
* Mixing a *different* function name with `{type:"web_search"}` is HTTP 200.
*/
const XAI_BUILTIN_SEARCH_FUNCTION_NAMES = [
	"web_search",
	"x_search",
	"grok_web_search"
];
const STRIP_FUNCTION_NAMES = /* @__PURE__ */ new Set([...XAI_SERVER_X_SEARCH_REJECT_NAMES, ...XAI_BUILTIN_SEARCH_FUNCTION_NAMES]);
const REJECT_TOOL_NAMES = new Set(XAI_SERVER_X_SEARCH_REJECT_NAMES);
const ENCRYPTED_REASONING = "reasoning.encrypted_content";
function isRecord$3(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
/**
* Read the function name out of any client-tool shape pi-ai may serialize:
* flat `{type:"function", name}` (current Responses), nested
* `{type:"function", function:{name}}` (completions), or `{type:"custom", name}`
* (grammar path). Stripping by name must keep working if upstream changes the
* shape, otherwise the Duplicate-tool-names 400 comes back.
*/
function toolNameOf(tool) {
	if (!isRecord$3(tool) || tool["type"] !== "function" && tool["type"] !== "custom") return void 0;
	if (typeof tool["name"] === "string") return tool["name"];
	const nested = tool["function"];
	return isRecord$3(nested) && typeof nested["name"] === "string" ? nested["name"] : void 0;
}
function isRetriableChat401(event) {
	return event.type === "error" && /\b401\b/.test(event.error.errorMessage ?? "");
}
function isPreviousResponseError(event) {
	if (event.type !== "error") return false;
	const message = event.error.errorMessage ?? "";
	return /\b400\b/.test(message) && /previous_response|unknown.?response|response.?id/i.test(message);
}
/** Drop xAI custom_tool_call stubs so DSH does not start another step and reprint the answer. */
function stripRejectToolCalls(message) {
	const content = message.content.filter((block) => block.type !== "toolCall" || !REJECT_TOOL_NAMES.has(block.name));
	if (content.length === message.content.length) return message;
	const stillTools = content.some((block) => block.type === "toolCall");
	return {
		...message,
		content,
		stopReason: !stillTools && message.stopReason === "toolUse" ? "stop" : message.stopReason
	};
}
function rejectToolCallName(event) {
	if (event.type === "toolcall_end") return event.toolCall.name;
	if (event.type === "toolcall_start" || event.type === "toolcall_delta") {
		const block = event.partial.content[event.contentIndex];
		return block?.type === "toolCall" ? block.name : void 0;
	}
}
function sanitizeRejectToolEvent(event) {
	const name = rejectToolCallName(event);
	if (name !== void 0 && REJECT_TOOL_NAMES.has(name)) return void 0;
	if (event.type === "done") {
		const message = stripRejectToolCalls(event.message);
		const reason = message.stopReason === "stop" || message.stopReason === "length" || message.stopReason === "toolUse" ? message.stopReason : event.reason;
		if (message === event.message && reason === event.reason) return event;
		return {
			...event,
			message,
			reason
		};
	}
	if (event.type === "error") {
		const error = stripRejectToolCalls(event.error);
		return error === event.error ? event : {
			...event,
			error
		};
	}
	if (event.type === "start") {
		const partial = stripRejectToolCalls(event.partial);
		return partial === event.partial ? event : {
			...event,
			partial
		};
	}
	return event;
}
function finishedResponseOf(event) {
	if (event.type !== "done") return void 0;
	const responseId = event.message.responseId;
	if (typeof responseId !== "string" || responseId.length === 0) return void 0;
	return {
		responseId,
		stopReason: event.message.stopReason
	};
}
/**
* Mutate a Responses payload. Never returns undefined (pi-ai only replaces
* params when onPayload's result is defined). Completions models get the
* same object reference back.
*/
function applyXaiResponsesPayload(payload, model, options) {
	if (model.api !== "openai-responses") return payload;
	if (!isRecord$3(payload)) return payload === void 0 ? {} : payload;
	const params = { ...payload };
	const include = Array.isArray(params["include"]) ? params["include"].filter((item) => typeof item === "string") : [];
	if (!include.includes(ENCRYPTED_REASONING)) include.push(ENCRYPTED_REASONING);
	params["include"] = include;
	if (!options.skipDefaultHigh) {
		const reasoning = isRecord$3(params["reasoning"]) ? { ...params["reasoning"] } : {};
		if (typeof reasoning["effort"] !== "string" || reasoning["effort"].length === 0) {
			reasoning["effort"] = "high";
			if (reasoning["summary"] === void 0) reasoning["summary"] = "auto";
		}
		params["reasoning"] = reasoning;
	}
	if (options.backendSearch) {
		const stripped = (Array.isArray(params["tools"]) ? [...params["tools"]] : []).filter((tool) => {
			const name = toolNameOf(tool);
			return name === void 0 || !STRIP_FUNCTION_NAMES.has(name);
		});
		for (const type of ["web_search", "x_search"]) if (!stripped.some((tool) => isRecord$3(tool) && tool["type"] === type)) stripped.push({ type });
		params["tools"] = stripped;
	} else if (options.backendSearchOverride && Array.isArray(params["tools"])) params["tools"] = params["tools"].filter((tool) => !isRecord$3(tool) || tool["type"] !== "web_search" && tool["type"] !== "x_search");
	return params;
}
function rewriteBackendSearchError(event, backendSearch) {
	if (event.type === "error" && event.error.errorMessage !== void 0) event = {
		...event,
		error: {
			...event.error,
			errorMessage: safeMessage(event.error.errorMessage)
		}
	};
	if (!backendSearch || event.type !== "error") return event;
	const message = event.error.errorMessage ?? "";
	if (/\b403\b/.test(message)) return {
		...event,
		error: {
			...event.error,
			errorMessage: "xAI rejected this request (HTTP 403). Server-side web/X search looks unavailable on this account. Turn off Grok search adaptation for this Bot instance, or backendSearch for other DSH chats, then retry."
		}
	};
	if (/\b400\b/.test(message) && /invalid.?tool|unknown.?tool|web_search|x_search|mixed/i.test(message)) return {
		...event,
		error: {
			...event.error,
			errorMessage: "xAI rejected this request (HTTP 400): the payload mixed server-side search tools. Turn off Grok search adaptation for this Bot instance, or backendSearch for other DSH chats, then retry." + (message.length > 0 ? ` Original: ${message}` : "")
		}
	};
	return event;
}
function withPayload(streamOptions, options, continuation) {
	const skipDefaultHigh = streamOptions?.reasoning === "off";
	return {
		...streamOptions,
		onPayload: async (payload, model) => {
			const applied = applyXaiResponsesPayload(await streamOptions?.onPayload?.(payload, model) ?? payload, model, {
				...options,
				skipDefaultHigh
			});
			if (continuation === void 0 || !isRecord$3(applied) || model.api !== "openai-responses") return applied;
			const previous = continuation.store.get(continuation.sessionId);
			const changedSearchMode = previous !== void 0 && (previous.backendSearch === void 0 ? options.backendSearchOverride === true : previous.backendSearch !== options.backendSearch);
			const next = applyStatefulContinuation(applied, {
				sessionId: continuation.sessionId,
				modelId: model.id,
				store: continuation.store,
				forceFullReplay: continuation.forceFullReplay() || changedSearchMode
			});
			continuation.pending.fingerprints = next.fingerprints;
			continuation.pending.usedPrevious = next.usedPrevious;
			return next.payload;
		}
	};
}
/** Always settle result(): ending a pi-ai stream alone leaves that promise pending. */
function streamFailure(error, model, signal) {
	const reason = signal?.aborted === true ? "aborted" : "error";
	return {
		type: "error",
		reason,
		error: {
			role: "assistant",
			content: [],
			api: model.api,
			provider: model.provider,
			model: model.id,
			usage: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 0,
				cost: {
					input: 0,
					output: 0,
					cacheRead: 0,
					cacheWrite: 0,
					total: 0
				}
			},
			stopReason: reason,
			timestamp: Date.now(),
			errorMessage: safeMessage(error)
		}
	};
}
function retryOn401(inner, options) {
	const out = createAssistantMessageEventStream();
	(async () => {
		try {
			const iterator = inner[Symbol.asyncIterator]();
			const first = await iterator.next();
			if (first.done) {
				out.push(streamFailure(/* @__PURE__ */ new Error("xAI chat stream ended without a terminal event"), options.model, options.signal));
				out.end();
				return;
			}
			const event = first.value;
			if (isRetriableChat401(event)) {
				const refreshed = await options.tokenSource.refresh?.(options.rejected, options.signal);
				if (refreshed !== void 0 && refreshed.length > 0 && refreshed !== options.rejected) {
					const second = options.retry(refreshed);
					let retriedTerminal = false;
					for await (const next of second) {
						if (next.type === "done" || next.type === "error") retriedTerminal = true;
						out.push(rewriteBackendSearchError(next, options.backendSearch));
					}
					if (!retriedTerminal) out.push(streamFailure(/* @__PURE__ */ new Error("xAI chat stream ended without a terminal event"), options.model, options.signal));
					out.end();
					return;
				}
			}
			let sawTerminal = event.type === "done" || event.type === "error";
			out.push(rewriteBackendSearchError(event, options.backendSearch));
			while (true) {
				const step = await iterator.next();
				if (step.done) break;
				if (step.value.type === "done" || step.value.type === "error") sawTerminal = true;
				out.push(rewriteBackendSearchError(step.value, options.backendSearch));
			}
			if (!sawTerminal) out.push(streamFailure(/* @__PURE__ */ new Error("xAI chat stream ended without a terminal event"), options.model, options.signal));
			out.end();
		} catch (error) {
			console.error(`dsh-grok-kit: chat stream failed: ${safeMessage(error)}`);
			out.push(streamFailure(error, options.model, options.signal));
			out.end();
		}
	})();
	return out;
}
function forwardStream(inner, backendSearch, model, signal, extras) {
	const out = createAssistantMessageEventStream();
	(async () => {
		try {
			let source = inner;
			let first = true;
			let sawTerminal = false;
			for await (const event of source) {
				if (first && extras?.retryPrevious !== void 0 && extras.usedPrevious?.() === true && isPreviousResponseError(event)) {
					first = false;
					source = extras.retryPrevious();
					let retriedTerminal = false;
					for await (const retried of source) {
						if (retried.type === "done" || retried.type === "error") retriedTerminal = true;
						const sanitized = backendSearch ? sanitizeRejectToolEvent(retried) : retried;
						if (sanitized === void 0) continue;
						const finished = finishedResponseOf(sanitized);
						if (finished !== void 0) extras.remember?.(finished.responseId, finished.stopReason);
						out.push(rewriteBackendSearchError(sanitized, backendSearch));
					}
					if (!retriedTerminal) out.push(streamFailure(/* @__PURE__ */ new Error("xAI chat stream ended without a terminal event"), model, signal));
					out.end();
					return;
				}
				first = false;
				if (event.type === "done" || event.type === "error") sawTerminal = true;
				const sanitized = backendSearch ? sanitizeRejectToolEvent(event) : event;
				if (sanitized === void 0) continue;
				const finished = finishedResponseOf(sanitized);
				if (finished !== void 0) extras?.remember?.(finished.responseId, finished.stopReason);
				out.push(rewriteBackendSearchError(sanitized, backendSearch));
			}
			if (!sawTerminal) out.push(streamFailure(/* @__PURE__ */ new Error("xAI chat stream ended without a terminal event"), model, signal));
			out.end();
		} catch (error) {
			console.error(`dsh-grok-kit: chat stream failed: ${safeMessage(error)}`);
			out.push(streamFailure(error, model, signal));
			out.end();
		}
	})();
	return out;
}
/** Wrap a provider's stream / streamSimple. Outer 401 retry, inner onPayload. */
function wrapXaiResponsesProvider(provider, options) {
	const run = (fn, model, context, streamOptions) => {
		const sessionId = typeof streamOptions?.sessionId === "string" && streamOptions.sessionId.length > 0 ? streamOptions.sessionId : void 0;
		const override = sessionId === void 0 ? void 0 : options.resolveBackendSearch?.(sessionId);
		const requestOptions = {
			...options,
			backendSearch: override ?? options.backendSearch,
			backendSearchOverride: override !== void 0
		};
		const stateful = options.statefulResponses === true && options.chainStore !== void 0 && sessionId !== void 0;
		let forceFullReplay = false;
		const pending = {};
		const continuation = stateful ? {
			sessionId,
			forceFullReplay: () => forceFullReplay,
			pending,
			store: options.chainStore
		} : void 0;
		if (model.baseUrl.length > 0) assertBearerDestination(model.baseUrl);
		const injected = {
			...withPayload(streamOptions, requestOptions, continuation),
			fetch: guardBearerFetch(streamOptions?.fetch ?? ((input, init) => globalThis.fetch(input, init)))
		};
		const begin = (apiKey) => fn.call(provider, model, context, apiKey === void 0 ? injected : {
			...injected,
			apiKey
		});
		let currentKey = streamOptions?.apiKey;
		const extras = stateful ? {
			remember: (responseId, stopReason) => {
				if (pending.fingerprints === void 0) return;
				options.chainStore?.set(sessionId, {
					responseId,
					fingerprints: pending.fingerprints,
					model: model.id,
					updatedAt: Date.now(),
					stopReason,
					backendSearch: requestOptions.backendSearch
				});
			},
			retryPrevious: () => {
				forceFullReplay = true;
				options.chainStore?.delete(sessionId);
				pending.usedPrevious = false;
				return begin(currentKey);
			},
			usedPrevious: () => pending.usedPrevious === true
		} : void 0;
		const decorate = (inner) => forwardStream(inner, requestOptions.backendSearch, model, streamOptions?.signal, extras);
		if (!options.retry401 || options.tokenSource === void 0) return decorate(begin(currentKey));
		const rejected = currentKey;
		if (rejected === void 0 || rejected.length === 0) return decorate(begin(currentKey));
		return decorate(retryOn401(begin(rejected), {
			retry: (apiKey) => {
				currentKey = apiKey;
				return begin(apiKey);
			},
			tokenSource: options.tokenSource,
			rejected,
			signal: streamOptions?.signal,
			backendSearch: requestOptions.backendSearch,
			model
		}));
	};
	return {
		...provider,
		stream: (model, context, streamOptions) => run(provider.stream, model, context, streamOptions),
		streamSimple: (model, context, streamOptions) => run(provider.streamSimple, model, context, streamOptions)
	};
}
//#endregion
//#region src/tools.ts
/** Default upper bound on returned sources per call. */
const DEFAULT_SEARCH_MAX_RESULTS = 8;
/** Cooperative budget for `grok_web_search` (xAI web_search measured ~5-12s). */
const DEFAULT_WEB_SEARCH_TIMEOUT_MS = 6e4;
/** Cooperative budget for `x_search` (xAI x_search measured ~24-45s; docs advise >=120s). */
const DEFAULT_X_SEARCH_TIMEOUT_MS = 12e4;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const X_HANDLE = /^[A-Za-z0-9_]{1,15}$/;
const MAX_X_HANDLES = 20;
const MAX_DOMAINS = 5;
function parseQuery(args) {
	if (typeof args !== "object" || args === null || typeof args.query !== "string") throw new Error("query must be a string");
	const query = args.query;
	if (query.trim().length === 0) throw new Error("query must be a non-empty string");
	return query;
}
function parseStringList(value, name, max) {
	if (value === void 0) return void 0;
	if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new Error(`${name} must be an array of strings`);
	if (value.length > max) throw new Error(`${name} accepts at most ${max} entries`);
	return value;
}
function parseIsoDate(value, name) {
	if (value === void 0) return void 0;
	if (typeof value !== "string" || !ISO_DATE.test(value)) throw new Error(`${name} must be YYYY-MM-DD`);
	const parsed = /* @__PURE__ */ new Date(`${value}T00:00:00Z`);
	if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error(`${name} must be a valid date`);
	return value;
}
function normalizeHandle(raw) {
	const handle = raw.trim().replace(/^@+/, "");
	if (!X_HANDLE.test(handle)) throw new Error(`invalid X handle "${raw}" — use 1-15 letters, digits, or underscore`);
	return handle;
}
function normalizeDomain(raw) {
	const trimmed = raw.trim();
	if (trimmed.length === 0) throw new Error("domain entries must be non-empty");
	try {
		const host = (trimmed.includes("://") ? new URL(trimmed) : new URL(`https://${trimmed}`)).hostname;
		if (host.length === 0) throw new Error(`invalid domain "${raw}"`);
		return host.toLowerCase();
	} catch (error) {
		if (error instanceof Error && error.message.startsWith("invalid domain")) throw error;
		throw new Error(`invalid domain "${raw}"`);
	}
}
function unique(values) {
	return [...new Set(values)];
}
function parseOptionalTrue(value, name) {
	if (value === void 0) return void 0;
	if (value !== true) throw new Error(`${name} must be true when set`);
	return true;
}
/** Validate model-facing `grok_web_search` args into a provider request. */
function parseGrokWebSearchArgs(args) {
	const query = parseQuery(args);
	const record = args;
	const allowed = parseStringList(record.allowed_domains, "allowed_domains", MAX_DOMAINS);
	const excluded = parseStringList(record.excluded_domains, "excluded_domains", MAX_DOMAINS);
	return {
		query,
		...allowed !== void 0 ? { allowedDomains: unique(allowed.map(normalizeDomain)) } : {},
		...excluded !== void 0 ? { excludedDomains: unique(excluded.map(normalizeDomain)) } : {},
		...parseOptionalTrue(record.enable_image_search, "enable_image_search") !== void 0 ? { enableImageSearch: true } : {},
		...parseOptionalTrue(record.enable_image_understanding, "enable_image_understanding") !== void 0 ? { enableImageUnderstanding: true } : {}
	};
}
/** Validate model-facing `x_search` args into a provider request. */
function parseXSearchArgs(args) {
	const query = parseQuery(args);
	const record = args;
	const allowed = parseStringList(record.allowed_x_handles, "allowed_x_handles", MAX_X_HANDLES);
	const excluded = parseStringList(record.excluded_x_handles, "excluded_x_handles", MAX_X_HANDLES);
	if (allowed !== void 0 && excluded !== void 0) throw new Error("allowed_x_handles and excluded_x_handles cannot be set together");
	const fromDate = parseIsoDate(record.from_date, "from_date");
	const toDate = parseIsoDate(record.to_date, "to_date");
	if (fromDate !== void 0 && toDate !== void 0 && fromDate > toDate) throw new Error("from_date must be on or before to_date");
	return {
		query,
		...allowed !== void 0 ? { allowedXHandles: unique(allowed.map(normalizeHandle)) } : {},
		...excluded !== void 0 ? { excludedXHandles: unique(excluded.map(normalizeHandle)) } : {},
		...fromDate !== void 0 ? { fromDate } : {},
		...toDate !== void 0 ? { toDate } : {},
		...parseOptionalTrue(record.enable_image_understanding, "enable_image_understanding") !== void 0 ? { enableImageUnderstanding: true } : {},
		...parseOptionalTrue(record.enable_video_understanding, "enable_video_understanding") !== void 0 ? { enableVideoUnderstanding: true } : {}
	};
}
/** Display label for a source: its title, else its hostname. */
function sourceLabel(url, title) {
	if (title !== void 0 && title.length > 0) return title;
	try {
		return new URL(url).hostname;
	} catch {
		return url;
	}
}
/** Format a search result as one model-facing text block (web and X posts alike). */
function formatGrokSearchOutput(result) {
	const parts = [];
	if (result.content !== void 0 && result.content.length > 0) parts.push(result.content);
	if (result.sources.length > 0) {
		const lines = result.sources.map((source) => {
			const label = sourceLabel(source.url, source.title);
			const meta = [];
			if (source.snippet !== void 0 && source.snippet.length > 0) meta.push(source.snippet);
			if (source.publishedAt !== void 0 && source.publishedAt.length > 0) meta.push(`(${source.publishedAt})`);
			const suffix = meta.length > 0 ? ` — ${meta.join(" ")}` : "";
			return `- [${label}](${source.url})${suffix}`;
		});
		parts.push(`Sources:\n${lines.join("\n")}`);
	} else if (result.content === void 0 || result.content.length === 0) parts.push("No results found.");
	if (result.truncated) parts.push(`(Showing the first ${result.sources.length} sources. Refine the query for more.)`);
	parts.push("Cite the relevant URLs above as markdown links in your answer.");
	return parts.join("\n\n");
}
/** Project one source to a plain object omitting absent optional fields. */
function projectSearchSource(source) {
	return {
		url: source.url,
		...source.title !== void 0 ? { title: source.title } : {},
		...source.snippet !== void 0 ? { snippet: source.snippet } : {},
		...source.publishedAt !== void 0 ? { publishedAt: source.publishedAt } : {}
	};
}
const SEARCH_OUTPUT_SCHEMA = {
	type: "object",
	additionalProperties: false,
	properties: {
		content: { type: "string" },
		sources: {
			type: "array",
			required: true,
			items: {
				type: "object",
				additionalProperties: false,
				properties: {
					url: {
						type: "string",
						required: true
					},
					title: { type: "string" },
					snippet: { type: "string" },
					publishedAt: { type: "string" }
				}
			}
		},
		truncated: {
			type: "boolean",
			required: true
		}
	}
};
/** Pending-call presentation: a search card titled by the query. */
function presentSearchCall(query) {
	return {
		card: "generic",
		title: query,
		kind: "search",
		rawInput: query
	};
}
function searchMetaFromValue(value) {
	return {
		sources: value.sources.map(projectSearchSource),
		truncated: value.truncated,
		...value.content !== void 0 ? { answer: value.content } : {}
	};
}
function validHttpUrl(value) {
	try {
		const parsed = new URL(value);
		return parsed.protocol === "http:" || parsed.protocol === "https:";
	} catch {
		return false;
	}
}
function searchMetaFromResult(meta) {
	if (typeof meta !== "object" || meta === null || Array.isArray(meta)) return void 0;
	const { sources, truncated, answer } = meta;
	if (!Array.isArray(sources)) return void 0;
	const validated = [];
	for (const source of sources) {
		if (typeof source !== "object" || source === null || Array.isArray(source)) return void 0;
		const record = source;
		if (typeof record["url"] !== "string" || !validHttpUrl(record["url"])) return void 0;
		validated.push({
			url: record["url"],
			...typeof record["title"] === "string" ? { title: record["title"] } : {},
			...typeof record["snippet"] === "string" ? { snippet: record["snippet"] } : {},
			...typeof record["publishedAt"] === "string" ? { publishedAt: record["publishedAt"] } : {}
		});
	}
	if (typeof truncated !== "boolean") return void 0;
	return {
		sources: validated,
		truncated,
		...typeof answer === "string" ? { answer } : {}
	};
}
function presentSearchResult(query, result) {
	if (result.isError) return void 0;
	const meta = searchMetaFromResult(result.meta);
	if (meta === void 0) return void 0;
	return {
		card: "web",
		kind: "search",
		title: query,
		sources: meta.sources,
		truncated: meta.truncated,
		...meta.answer !== void 0 ? { answer: meta.answer } : {}
	};
}
/**
* Register `grok_web_search` and `x_search` plus their system-prompt guidance.
* Both stay visible when the OAuth login is missing and fail with a clear
* structured error at execution time — the standard dsh tool contract.
*/
function applyGrokSearchTools(ctx, options) {
	if (options.backendSearch === true) ctx.systemPrompt.section({
		name: "tool:xai-backend-search",
		order: 104,
		text: "The main chat request already mixes xAI server-side web_search and x_search. Do not call grok_web_search or x_search for the same query. Use those nested tools only when you need allowed_domains / allowed_x_handles / a date window, or the user explicitly wants a citation-heavy Grok summary."
	});
	ctx.systemPrompt.section({
		name: "tool:grok_web_search",
		order: 105,
		text: "Use grok_web_search when you need a Grok-grounded summary plus citations. Native web_search is faster URL discovery only (no summary) — prefer it for cheap lookup, then web_fetch. Pin or drop sites with allowed_domains / excluded_domains (hostnames, max 5). Do not use grok_web_search as a fallback for a failed x_search."
	});
	ctx.systemPrompt.section({
		name: "tool:x_search",
		order: 106,
		text: "Use the x_search tool to search X (Twitter) posts, accounts, and trends through Grok. It is comparatively slow (about 10-45 seconds, sometimes longer) and returns post URLs; cite them as markdown links. Prefer allowed_x_handles / excluded_x_handles (no @, max 20) and from_date / to_date (YYYY-MM-DD) over stuffing operators into the query. allowed_x_handles and excluded_x_handles cannot be set together. The query may still use X operators (from:handle, since:YYYY-MM-DD) when a structured filter does not apply. If x_search fails or times out, do NOT retry with web_search or grok_web_search — report the partial result and the reason instead."
	});
	ctx.tools.register(defineTool({
		name: "grok_web_search",
		description: "Search the web through Grok using your SuperGrok / X Premium subscription. Returns an optional Grok summary and a list of source URLs. Use for current information when a grounded summary is useful. Optional allowed_domains / excluded_domains pin or drop sites.",
		parameters: {
			query: {
				type: "string",
				required: true,
				description: "The search query."
			},
			allowed_domains: {
				type: "array",
				items: { type: "string" },
				description: "Optional hostnames to search (max 5). Example: x.ai"
			},
			excluded_domains: {
				type: "array",
				items: { type: "string" },
				description: "Optional hostnames to exclude (max 5)."
			},
			enable_image_search: {
				type: "boolean",
				description: "When true, include image search results."
			},
			enable_image_understanding: {
				type: "boolean",
				description: "When true, analyze images found while browsing."
			}
		},
		output: {
			schema: SEARCH_OUTPUT_SCHEMA,
			render: (_args, value) => [{
				type: "text",
				text: formatGrokSearchOutput(value)
			}],
			presentationMeta: (_args, value) => searchMetaFromValue(value)
		},
		timeoutMs: options.webTimeoutMs,
		isConcurrencySafe: () => true,
		async execute(args, exec) {
			const request = parseGrokWebSearchArgs(args);
			const capped = capSources(await options.web.search(request, exec.signal), options.maxResults);
			return {
				...capped.content !== void 0 ? { content: capped.content } : {},
				sources: capped.sources.map(projectSearchSource),
				truncated: capped.truncated
			};
		},
		presentCall: (args) => presentSearchCall(args.query),
		presentResult: (args, result) => presentSearchResult(args.query, result)
	}));
	ctx.tools.register(defineTool({
		name: "x_search",
		description: "Search X (Twitter) posts, accounts, and trends through Grok using your SuperGrok / X Premium subscription. Returns post URLs and an optional summary. Comparatively slow (about 10-45 seconds). Prefer allowed_x_handles and from_date / to_date over query operators.",
		parameters: {
			query: {
				type: "string",
				required: true,
				description: "The X search query, e.g. an account handle or topic."
			},
			allowed_x_handles: {
				type: "array",
				items: { type: "string" },
				description: "Optional X handles to search, without @ (max 20). Cannot be combined with excluded_x_handles."
			},
			excluded_x_handles: {
				type: "array",
				items: { type: "string" },
				description: "Optional X handles to exclude, without @ (max 20). Cannot be combined with allowed_x_handles."
			},
			enable_image_understanding: {
				type: "boolean",
				description: "When true, analyze images in matching posts."
			},
			enable_video_understanding: {
				type: "boolean",
				description: "When true, analyze videos in matching posts."
			},
			from_date: {
				type: "string",
				description: "Optional inclusive start date, YYYY-MM-DD."
			},
			to_date: {
				type: "string",
				description: "Optional inclusive end date, YYYY-MM-DD."
			}
		},
		output: {
			schema: SEARCH_OUTPUT_SCHEMA,
			render: (_args, value) => [{
				type: "text",
				text: formatGrokSearchOutput(value)
			}],
			presentationMeta: (_args, value) => searchMetaFromValue(value)
		},
		timeoutMs: options.xTimeoutMs,
		isConcurrencySafe: () => true,
		async execute(args, exec) {
			const request = parseXSearchArgs(args);
			const capped = capSources(await options.x.search(request, exec.signal), options.maxResults);
			return {
				...capped.content !== void 0 ? { content: capped.content } : {},
				sources: capped.sources.map(projectSearchSource),
				truncated: capped.truncated
			};
		},
		presentCall: (args) => presentSearchCall(args.query),
		presentResult: (args, result) => presentSearchResult(args.query, result)
	}));
}
const REJECT_TOOL_DESCRIPTION = "Do not call this tool. It exists only to complete an xAI server-side x_search custom_tool_call; the search already ran.";
const REJECT_TOOL_OUTPUT = "xAI already ran server-side x_search on this turn. Continue from the assistant text. Do not mention this tool name to the user.";
/** Register execute-only reject tools. Callers must strip them from Responses params.tools. */
function applyXaiServerSearchRejectTools(ctx) {
	ctx.systemPrompt?.section({
		name: "tool:xai-backend-search",
		order: 104,
		text: "The main chat request already includes xAI server-side web_search and x_search. Web lookup happens inside the model turn (shown as thinking). x_keyword_search, x_semantic_search, x_user_search, and x_thread_fetch are completion stubs for xAI custom_tool_call — never advertise them as tools you chose to call."
	});
	for (const name of XAI_SERVER_X_SEARCH_REJECT_NAMES) ctx.tools.register(defineTool({
		name,
		description: REJECT_TOOL_DESCRIPTION,
		parameters: {},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: { message: {
					type: "string",
					required: true
				} }
			},
			render: () => [{
				type: "text",
				text: REJECT_TOOL_OUTPUT
			}]
		},
		isConcurrencySafe: () => true,
		presentCall: () => ({
			card: "generic",
			title: "X search",
			kind: "search"
		}),
		presentResult: () => ({
			card: "generic",
			title: "X search"
		}),
		async execute() {
			return { message: REJECT_TOOL_OUTPUT };
		}
	}));
}
/** Enforce the consumer-side source cap, mirroring the ctx.web seam contract. */
function capSources(result, maxResults) {
	if (maxResults <= 0) return result.sources.length === 0 ? result : {
		...result,
		sources: [],
		truncated: true
	};
	if (result.sources.length <= maxResults) return result;
	return {
		...result,
		sources: result.sources.slice(0, maxResults),
		truncated: true
	};
}
//#endregion
//#region src/options.ts
/**
* Plugin-owned runtime options UI: persisted overrides for the optional
* Config keys. Precedence per key: explicit stored value (settings page) >
* Cordis config value > schema default. Keys left untouched keep following
* the bundle/Cordis defaults — the file only holds deliberate choices.
* @module dsh-grok-kit/options
*/
const OPTIONS_VERSION = 1;
const OPTIONS_FILENAME = ".dsh-grok-kit-options.json";
/** Bounded numeric ranges: anything outside is dropped, never persisted. */
const SEARCH_MAX_RESULTS_FLOOR = 1;
const SEARCH_MAX_RESULTS_CEILING = 100;
const TIMEOUT_FLOOR_MS = 1e3;
const TIMEOUT_CEILING_MS = 6e5;
const SEARCH_MODEL_MAX_LENGTH = 128;
const OPTION_SOURCE_KEYS = [
	"backendSearch",
	"nestedSearchTools",
	"statefulResponses",
	"imagineTool",
	"editTool",
	"videoTool",
	"mediaRiskAcknowledged",
	"videoModel",
	"videoMaxBytes",
	"searchModel",
	"searchMaxResults",
	"webSearchTimeoutMs",
	"xSearchTimeoutMs"
];
function optionSource(key, stored, cordis) {
	if (stored[key] !== void 0) return "stored";
	if (cordis[key] !== void 0) return "cordis";
	return "default";
}
function isRecord$2(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function boundedInteger(value, floor, ceiling) {
	return typeof value === "number" && Number.isInteger(value) && value >= floor && value <= ceiling ? value : void 0;
}
/**
* Fail-closed parsing: unknown keys are dropped, wrong types are dropped,
* out-of-range numbers are dropped. Never throws.
*/
function sanitizeStoredOptions(value) {
	if (!isRecord$2(value) || value["version"] !== OPTIONS_VERSION) return {};
	const raw = isRecord$2(value["options"]) ? value["options"] : {};
	const out = {};
	for (const key of [
		"backendSearch",
		"nestedSearchTools",
		"statefulResponses",
		"imagineTool",
		"editTool",
		"videoTool",
		"mediaRiskAcknowledged"
	]) if (typeof raw[key] === "boolean") out[key] = raw[key];
	if (typeof raw["searchModel"] === "string" && raw["searchModel"].trim().length > 0 && raw["searchModel"].trim().length <= SEARCH_MODEL_MAX_LENGTH) out["searchModel"] = raw["searchModel"].trim();
	if (validVideoModel(raw["videoModel"])) out.videoModel = raw["videoModel"];
	if (validVideoMaxBytes(raw["videoMaxBytes"])) out.videoMaxBytes = raw["videoMaxBytes"];
	const maxResults = boundedInteger(raw["searchMaxResults"], SEARCH_MAX_RESULTS_FLOOR, SEARCH_MAX_RESULTS_CEILING);
	if (maxResults !== void 0) out["searchMaxResults"] = maxResults;
	const webTimeout = boundedInteger(raw["webSearchTimeoutMs"], TIMEOUT_FLOOR_MS, TIMEOUT_CEILING_MS);
	if (webTimeout !== void 0) out["webSearchTimeoutMs"] = webTimeout;
	const xTimeout = boundedInteger(raw["xSearchTimeoutMs"], TIMEOUT_FLOOR_MS, TIMEOUT_CEILING_MS);
	if (xTimeout !== void 0) out["xSearchTimeoutMs"] = xTimeout;
	return out;
}
function optionsPath(dshHome) {
	return resolve(join(resolveDshHome(dshHome), OPTIONS_FILENAME));
}
/** Read the stored overrides; corrupt/missing files yield empty options. */
function readStoredOptions() {
	try {
		return sanitizeStoredOptions(JSON.parse(readFileSync(optionsPath(), "utf8")));
	} catch {
		return {};
	}
}
/** Persist the whole overrides document (merge decisions happen in the UI). */
async function writeStoredOptions(options) {
	const file = optionsPath();
	mkdirSync(dirname(file), {
		recursive: true,
		mode: 448
	});
	await writeFileAtomic(file, `${JSON.stringify({
		version: OPTIONS_VERSION,
		options: sanitizeStoredOptions({
			version: OPTIONS_VERSION,
			options
		})
	}, null, 2)}\n`, {
		mode: 384,
		dirMode: 448
	});
}
/** Apply stored overrides on top of the Cordis config (explicit keys win). */
function mergePluginOptions(config, stored) {
	return {
		...config,
		...stored.backendSearch === void 0 ? {} : { backendSearch: stored.backendSearch },
		...stored.nestedSearchTools === void 0 ? {} : { nestedSearchTools: stored.nestedSearchTools },
		...stored.statefulResponses === void 0 ? {} : { statefulResponses: stored.statefulResponses },
		...stored.imagineTool === void 0 ? {} : { imagineTool: stored.imagineTool },
		...stored.editTool === void 0 ? {} : { editTool: stored.editTool },
		...stored.videoTool === void 0 ? {} : { videoTool: stored.videoTool },
		...stored.mediaRiskAcknowledged === void 0 ? {} : { mediaRiskAcknowledged: stored.mediaRiskAcknowledged },
		...stored.videoModel === void 0 ? {} : { videoModel: stored.videoModel },
		...stored.videoMaxBytes === void 0 ? {} : { videoMaxBytes: stored.videoMaxBytes },
		...stored.searchModel === void 0 ? {} : { searchModel: stored.searchModel },
		...stored.searchMaxResults === void 0 ? {} : { searchMaxResults: stored.searchMaxResults },
		...stored.webSearchTimeoutMs === void 0 ? {} : { webSearchTimeoutMs: stored.webSearchTimeoutMs },
		...stored.xSearchTimeoutMs === void 0 ? {} : { xSearchTimeoutMs: stored.xSearchTimeoutMs }
	};
}
/**
* Values the settings page should show: stored override, else Cordis/profile,
* else schema defaults (including nestedSearchTools = !backendSearch).
*/
function presentPluginOptions(cordis, stored) {
	const merged = mergePluginOptions(cordis, stored);
	const backendSearch = typeof merged["backendSearch"] === "boolean" ? merged["backendSearch"] : false;
	const nestedSearchTools = typeof merged["nestedSearchTools"] === "boolean" ? merged["nestedSearchTools"] : !backendSearch;
	const sources = {};
	for (const key of OPTION_SOURCE_KEYS) sources[key] = optionSource(key, stored, cordis);
	return {
		stored,
		effective: {
			backendSearch,
			nestedSearchTools,
			statefulResponses: typeof merged["statefulResponses"] === "boolean" ? merged["statefulResponses"] : false,
			...resolveMediaOptions(merged),
			videoModel: validVideoModel(merged["videoModel"]) ? merged["videoModel"] : DEFAULT_VIDEO_MODEL,
			videoMaxBytes: validVideoMaxBytes(merged["videoMaxBytes"]) ? merged["videoMaxBytes"] : DEFAULT_VIDEO_MAX_BYTES,
			searchModel: typeof merged["searchModel"] === "string" && merged["searchModel"].trim().length > 0 ? merged["searchModel"] : DEFAULT_XAI_SEARCH_MODEL,
			searchMaxResults: typeof merged["searchMaxResults"] === "number" ? merged["searchMaxResults"] : 8,
			webSearchTimeoutMs: typeof merged["webSearchTimeoutMs"] === "number" ? merged["webSearchTimeoutMs"] : DEFAULT_WEB_SEARCH_TIMEOUT_MS,
			xSearchTimeoutMs: typeof merged["xSearchTimeoutMs"] === "number" ? merged["xSearchTimeoutMs"] : DEFAULT_X_SEARCH_TIMEOUT_MS
		},
		sources
	};
}
//#endregion
//#region src/auth-routes.ts
const XAI_OAUTH_AUTH_STATUS_PATH = "/plugins/dsh-grok-kit/auth/status";
const XAI_OAUTH_AUTH_LOGIN_PATH = "/plugins/dsh-grok-kit/auth/login";
const XAI_OAUTH_AUTH_IMPORT_PATH = "/plugins/dsh-grok-kit/auth/import";
const XAI_OAUTH_AUTH_LOGOUT_PATH = "/plugins/dsh-grok-kit/auth/logout";
const XAI_OAUTH_AUTH_MODELS_PATH = "/plugins/dsh-grok-kit/auth/models";
const XAI_OAUTH_AUTH_PROXY_PATH = "/plugins/dsh-grok-kit/auth/proxy";
const XAI_OAUTH_AUTH_OPTIONS_PATH = "/plugins/dsh-grok-kit/auth/options";
/** Known option keys; POST accepts null / '' to remove an explicit override. */
const OPTION_KEYS = [
	"backendSearch",
	"nestedSearchTools",
	"statefulResponses",
	"imagineTool",
	"editTool",
	"videoTool",
	"mediaRiskAcknowledged",
	"videoModel",
	"videoMaxBytes",
	"searchModel",
	"searchMaxResults",
	"webSearchTimeoutMs",
	"xSearchTimeoutMs"
];
/** Merge a partial POST body over the stored overrides (null / '' removes). */
function mergeStoredOptionsPatch(current, patch) {
	if (typeof patch !== "object" || patch === null || Array.isArray(patch)) return current;
	const next = { ...current };
	for (const key of OPTION_KEYS) {
		if (!(key in patch)) continue;
		const value = patch[key];
		if (key === "mediaRiskAcknowledged" && (value === null || value === void 0 || value === "")) next[key] = false;
		else if (value === null || value === void 0 || value === "") delete next[key];
		else next[key] = value;
	}
	return next;
}
function waitForPromptAbort(prompt) {
	const signal = prompt.signal;
	if (signal === void 0) return new Promise(() => {});
	if (signal.aborted) return Promise.reject(signal.reason);
	return new Promise((_resolve, reject) => {
		signal.addEventListener("abort", () => {
			reject(signal.reason);
		}, { once: true });
	});
}
async function grokImportAvailable() {
	return (await probeGrokAuth()).available;
}
/** One lifecycle owner for the device-code poller, challenge, and public status. */
var XaiOAuthWebAuth = class {
	session;
	onAccountChange;
	state = {
		status: "signed-out",
		grokImportAvailable: false,
		sharedGrokAuth: false
	};
	operation;
	cancellation;
	challenge;
	challengeWaiters = [];
	/** Serializes import/logout against each other and against an in-flight login. */
	exclusive = Promise.resolve();
	exclusivePending = 0;
	/** Retained across status/catalog reads; cleared by the next auth action. */
	loginError;
	constructor(session, onAccountChange = () => void 0) {
		this.session = session;
		this.onAccountChange = onAccountChange;
	}
	async status() {
		if (this.operation !== void 0) return this.state;
		if (this.state.status === "error") {
			const failed = this.state;
			const stored = await this.readStoredStatus();
			if (this.operation !== void 0 || this.state !== failed) return this.state;
			if (stored.status === "signed-in") {
				this.state = stored;
				return this.state;
			}
			return {
				...failed,
				grokImportAvailable: stored.grokImportAvailable,
				sharedGrokAuth: stored.sharedGrokAuth
			};
		}
		return this.readStoredStatus();
	}
	async signIn() {
		while (this.exclusivePending > 0) await this.exclusive;
		if (this.operation === void 0) this.start();
		if (this.challenge !== void 0) return this.challenge;
		return new Promise((resolve, reject) => {
			this.challengeWaiters.push({
				resolve,
				reject
			});
		});
	}
	async importGrok() {
		await this.runExclusive(async () => {
			await importXaiOAuthSession(this.session);
			this.challenge = void 0;
			this.state = await this.readStoredStatus();
		});
	}
	async setModels(ids) {
		await this.session.setSelectedModels(ids);
		this.state = await this.readStoredStatus();
	}
	async signOut() {
		await this.runExclusive(async () => {
			await this.session.logout();
			this.state = {
				status: "signed-out",
				grokImportAvailable: await grokImportAvailable() && !this.session.store.sharedWithGrokCli,
				sharedGrokAuth: this.session.store.sharedWithGrokCli
			};
			this.challenge = void 0;
		});
	}
	async dispose() {
		this.cancellation?.abort(/* @__PURE__ */ new Error("xAI Grok plugin disposed"));
		await this.operation?.catch(() => void 0);
	}
	/** Cancel any running login, then run one credential-mutating action exclusively. */
	runExclusive(fn) {
		const run = this.exclusive.then(async () => {
			this.cancellation?.abort(/* @__PURE__ */ new Error("xAI Grok sign-in cancelled"));
			await this.operation?.catch(() => void 0);
			this.loginError = void 0;
			this.onAccountChange();
			try {
				await fn();
			} finally {
				this.onAccountChange();
			}
		});
		this.exclusivePending += 1;
		this.exclusive = run.catch(() => void 0);
		return run.finally(() => {
			this.exclusivePending -= 1;
		});
	}
	start() {
		this.loginError = void 0;
		this.onAccountChange();
		const cancellation = new AbortController();
		this.cancellation = cancellation;
		this.challenge = void 0;
		this.state = {
			status: "signing-in",
			grokImportAvailable: false,
			sharedGrokAuth: this.session.store.sharedWithGrokCli
		};
		this.operation = loginXaiOAuthSession({
			signal: cancellation.signal,
			prompt: (prompt) => prompt.type === "select" ? Promise.resolve(prompt.options.some((option) => option.id === "oauth") ? "oauth" : prompt.options[0]?.id ?? "oauth") : waitForPromptAbort(prompt),
			notify: (event) => {
				this.onEvent(event);
			}
		}, this.session).then(async () => {
			this.state = await this.readStoredStatus();
		}, (error) => {
			this.rejectChallenge(error);
			const message = safeMessage(error);
			this.loginError = message;
			this.state = {
				status: "error",
				message,
				grokImportAvailable: false,
				sharedGrokAuth: this.session.store.sharedWithGrokCli
			};
		}).finally(() => {
			this.onAccountChange();
			this.operation = void 0;
			this.cancellation = void 0;
		});
	}
	onEvent(event) {
		if (event.type === "device_code") {
			this.acceptChallenge({
				url: event.verificationUri,
				...event.userCode.length > 0 ? { userCode: event.userCode } : {}
			});
			return;
		}
		if (event.type === "auth_url") this.acceptChallenge({ url: event.url });
	}
	acceptChallenge(challenge) {
		try {
			if (new URL(challenge.url).protocol !== "https:") {
				const error = /* @__PURE__ */ new Error("xAI returned an unsafe authorization URL");
				this.cancellation?.abort(error);
				this.rejectChallenge(error);
				return;
			}
		} catch {
			const error = /* @__PURE__ */ new Error("xAI returned an invalid authorization URL");
			this.cancellation?.abort(error);
			this.rejectChallenge(error);
			return;
		}
		this.challenge = challenge;
		this.state = {
			status: "signing-in",
			url: challenge.url,
			grokImportAvailable: false,
			sharedGrokAuth: this.session.store.sharedWithGrokCli,
			...challenge.userCode === void 0 ? {} : { userCode: challenge.userCode }
		};
		for (const waiter of this.challengeWaiters.splice(0)) waiter.resolve(challenge);
	}
	async readStoredStatus() {
		const [stored, grok] = await Promise.all([xaiOAuthAuthStatus(this.session.store), grokImportAvailable()]);
		const shared = this.session.store.sharedWithGrokCli;
		if (!stored.authenticated) return {
			status: "signed-out",
			grokImportAvailable: grok && !shared,
			sharedGrokAuth: shared
		};
		const available = this.session.availableModels().map((model) => model.id);
		const selected = this.session.selectedModelIds();
		return {
			status: "signed-in",
			models: this.session.visibleModels().map((model) => model.id),
			available,
			selected: selected ?? available,
			catalogSource: this.session.catalogSource,
			grokImportAvailable: grok && !shared,
			sharedGrokAuth: shared,
			...this.session.catalogError === void 0 ? {} : { catalogError: this.session.catalogError },
			...this.loginError === void 0 ? {} : { loginError: this.loginError }
		};
	}
	rejectChallenge(error) {
		for (const waiter of this.challengeWaiters.splice(0)) waiter.reject(error);
	}
};
function loopbackHostname(hostHeader) {
	const hostname = hostHeader.startsWith("[") ? hostHeader.slice(1, hostHeader.indexOf("]")) : hostHeader.split(":")[0];
	if (hostname === void 0 || hostname.length === 0) return void 0;
	const lower = hostname.toLowerCase();
	return lower === "127.0.0.1" || lower === "localhost" || lower === "::1" ? lower : void 0;
}
function trustedRequest$2(req) {
	return isTrustedRequest(req.socket.remoteAddress, req.headers, req.method ?? "GET");
}
/** Trust header/remote shape for the plugin's Web routes. Exported for tests. */
function isTrustedRequest(remote, headers, method) {
	if (remote !== "127.0.0.1" && remote !== "::1" && remote !== "::ffff:127.0.0.1") return false;
	const host = headers.host;
	if (host === void 0) return false;
	if (loopbackHostname(host) === void 0) return false;
	const origin = headers.origin;
	if (origin !== void 0 && origin.trim().toLowerCase() === "dsh-app://app") return true;
	if (headers["sec-fetch-site"] === "cross-site") return false;
	if (origin === void 0) {
		if (method === "GET") return true;
		return (headers["sec-fetch-mode"] ?? "") !== "";
	}
	try {
		return new URL(origin).host === new URL(`http://${host}`).host;
	} catch {
		return false;
	}
}
/** Client-side request error (bad content-type / bad body); reported as 400. */
var BadRequestError = class extends Error {};
/** Request body exceeded the read ceiling; reported as 413. */
var PayloadTooLargeError = class extends Error {};
const MAX_JSON_BODY_BYTES = 1048576;
/**
* Accept a JSON body: no content-type header (no body) or application/json.
* A cross-site form cannot send application/json, so this rejects form posts;
* same-origin checks in trustedRequest() are the primary CSRF gate.
*/
function jsonContentTypeAccepted(contentType) {
	if (contentType === "") return true;
	return contentType.toLowerCase().split(";")[0].trim() === "application/json";
}
/** Shared JSON admission error classification for plugin-owned Web routes. */
function errorStatus(error) {
	if (error instanceof PayloadTooLargeError) return 413;
	if (error instanceof BadRequestError) return 400;
	if (error instanceof SyntaxError) return 400;
	return 500;
}
/** Read a JSON body with a hard size ceiling (exported for tests). */
async function readJson(req) {
	if (!jsonContentTypeAccepted(req.headers["content-type"] ?? "")) throw new BadRequestError("content-type must be application/json");
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		size += buf.byteLength;
		if (size > MAX_JSON_BODY_BYTES) throw new PayloadTooLargeError("request body too large");
		chunks.push(buf);
	}
	const text = Buffer.concat(chunks).toString("utf8").trim();
	if (text.length === 0) return {};
	return JSON.parse(text);
}
function json$2(res, status, value) {
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
		"x-content-type-options": "nosniff"
	});
	res.end(JSON.stringify(value));
}
function optionsResponse(cordisConfig, stored) {
	const presented = presentPluginOptions(cordisConfig, stored);
	return {
		options: presented.effective,
		stored: presented.stored,
		effective: presented.effective,
		sources: presented.sources
	};
}
/** Register the plugin-owned OAuth routes when the Web server is composed. */
function registerXaiOAuthAuthRoutes(ctx, session, cordisConfig = {}, onAccountChange, onNetworkChange) {
	const auth = new XaiOAuthWebAuth(session, onAccountChange);
	const configProxyUrl = typeof cordisConfig.proxyUrl === "string" ? cordisConfig.proxyUrl : void 0;
	let proxyWrite = Promise.resolve();
	let disposed = false;
	const networkActive = () => !disposed;
	const saveProxySettings = (proxyUrl, mode) => {
		const pending = proxyWrite.then(async () => {
			if (!networkActive()) throw new Error("Network settings are no longer active");
			const settings = {
				proxyUrl,
				quotaCompatibilityMode: mode ?? readXaiProxySettings(configProxyUrl).quotaCompatibilityMode
			};
			await writeStoredProxySettings(settings);
			if (networkActive()) {
				setXaiProxyUrl(settings.proxyUrl);
				setQuotaCompatibilityMode(settings.quotaCompatibilityMode);
				onNetworkChange?.();
			}
			return settings;
		});
		proxyWrite = pending.then(() => void 0, () => void 0);
		return pending;
	};
	let optionsWrite = Promise.resolve();
	const saveOptionsPatch = (body) => {
		const pending = optionsWrite.then(async () => {
			const current = readStoredOptions();
			const previous = presentPluginOptions(cordisConfig, current).effective;
			const merged = sanitizeStoredOptions({
				version: 1,
				options: mergeStoredOptionsPatch(current, body)
			});
			if (!previous.mediaRiskAcknowledged && typeof body === "object" && body !== null && !Array.isArray(body) && "mediaRiskAcknowledged" in body && body.mediaRiskAcknowledged === true) for (const key of MEDIA_TOOL_KEYS) merged[key] = key in body && body[key] === true;
			if (mediaEnableNeedsConfirmation(previous, presentPluginOptions(cordisConfig, merged).effective, body)) throw new BadRequestError("Enabling media tools requires explicit mediaRiskAcknowledged: true in this request after reviewing the media risks.");
			await writeStoredOptions(merged);
			return merged;
		});
		optionsWrite = pending.then(() => void 0, () => void 0);
		return pending;
	};
	ctx.effect(() => {
		const routes = [
			ctx.webServer.register({
				kind: "exact",
				path: XAI_OAUTH_AUTH_STATUS_PATH,
				handler: async (req, res) => {
					if (req.method !== "GET") return json$2(res, 405, { error: "method not allowed" });
					if (!trustedRequest$2(req)) return json$2(res, 403, { error: "forbidden" });
					json$2(res, 200, await auth.status());
				}
			}),
			ctx.webServer.register({
				kind: "exact",
				path: XAI_OAUTH_AUTH_LOGIN_PATH,
				handler: async (req, res) => {
					if (req.method !== "POST") return json$2(res, 405, { error: "method not allowed" });
					if (!trustedRequest$2(req)) return json$2(res, 403, { error: "forbidden" });
					try {
						json$2(res, 200, await auth.signIn());
					} catch (error) {
						json$2(res, errorStatus(error), { error: safeMessage(error) });
					}
				}
			}),
			ctx.webServer.register({
				kind: "exact",
				path: XAI_OAUTH_AUTH_IMPORT_PATH,
				handler: async (req, res) => {
					if (req.method !== "POST") return json$2(res, 405, { error: "method not allowed" });
					if (!trustedRequest$2(req)) return json$2(res, 403, { error: "forbidden" });
					try {
						await auth.importGrok();
						json$2(res, 200, await auth.status());
					} catch (error) {
						json$2(res, errorStatus(error), { error: safeMessage(error) });
					}
				}
			}),
			ctx.webServer.register({
				kind: "exact",
				path: XAI_OAUTH_AUTH_MODELS_PATH,
				handler: async (req, res) => {
					if (req.method !== "POST") return json$2(res, 405, { error: "method not allowed" });
					if (!trustedRequest$2(req)) return json$2(res, 403, { error: "forbidden" });
					try {
						const body = await readJson(req);
						const selected = typeof body === "object" && body !== null && "selected" in body ? body.selected : void 0;
						if (!Array.isArray(selected) || selected.some((id) => typeof id !== "string")) return json$2(res, 400, { error: "selected must be an array of model ids" });
						await auth.setModels(selected);
						json$2(res, 200, await auth.status());
					} catch (error) {
						json$2(res, errorStatus(error), { error: safeMessage(error) });
					}
				}
			}),
			ctx.webServer.register({
				kind: "exact",
				path: XAI_OAUTH_AUTH_PROXY_PATH,
				handler: async (req, res) => {
					if (!trustedRequest$2(req)) return json$2(res, 403, { error: "forbidden" });
					if (req.method === "GET") return json$2(res, 200, readXaiProxySettings(configProxyUrl));
					if (req.method !== "POST") return json$2(res, 405, { error: "method not allowed" });
					try {
						const body = await readJson(req);
						const proxyUrl = typeof body === "object" && body !== null && "proxyUrl" in body ? body.proxyUrl : void 0;
						if (typeof proxyUrl !== "string") return json$2(res, 400, { error: "proxyUrl must be a string" });
						const normalized = validProxyUrl(proxyUrl);
						if (normalized === void 0) return json$2(res, 400, { error: "proxyUrl must be a valid http:// or https:// URL" });
						const mode = typeof body === "object" && body !== null && "quotaCompatibilityMode" in body ? body.quotaCompatibilityMode : void 0;
						if (mode !== void 0 && typeof mode !== "boolean") return json$2(res, 400, { error: "quotaCompatibilityMode must be a boolean" });
						json$2(res, 200, await saveProxySettings(normalized, mode));
					} catch (error) {
						json$2(res, errorStatus(error), { error: safeMessage(error) });
					}
				}
			}),
			ctx.webServer.register({
				kind: "exact",
				path: XAI_OAUTH_AUTH_OPTIONS_PATH,
				handler: async (req, res) => {
					if (!trustedRequest$2(req)) return json$2(res, 403, { error: "forbidden" });
					if (req.method === "GET") return json$2(res, 200, optionsResponse(cordisConfig, readStoredOptions()));
					if (req.method !== "POST") return json$2(res, 405, { error: "method not allowed" });
					try {
						const body = await readJson(req);
						json$2(res, 200, optionsResponse(cordisConfig, await saveOptionsPatch(body)));
					} catch (error) {
						json$2(res, errorStatus(error), { error: safeMessage(error) });
					}
				}
			}),
			ctx.webServer.register({
				kind: "exact",
				path: XAI_OAUTH_AUTH_LOGOUT_PATH,
				handler: async (req, res) => {
					if (req.method !== "POST") return json$2(res, 405, { error: "method not allowed" });
					if (!trustedRequest$2(req)) return json$2(res, 403, { error: "forbidden" });
					try {
						await auth.signOut();
						json$2(res, 200, await auth.status());
					} catch (error) {
						json$2(res, errorStatus(error), { error: safeMessage(error) });
					}
				}
			})
		];
		return async () => {
			disposed = true;
			for (const dispose of routes) dispose();
			await Promise.all([proxyWrite, auth.dispose()]);
		};
	}, "dsh-grok-kit: Web OAuth routes");
}
//#endregion
//#region src/session.ts
/**
* Shared OAuth store + live catalog for the host plugin and CLI.
* @module dsh-grok-kit/session
*/
const MODELS_CACHE_VERSION = 2;
const MODELS_CACHE_FILENAME = ".xai-oauth-models.json";
/**
* Background retry cadence after a failed live-catalog refresh (credential
* resolution or listing). The first retry exists for the leftover-writer-lock
* incident: a leftover writer lock (including one whose owner cannot be
* proven) wedges the startup refresh for its 2s wait budget, and the next try
* may succeed once the lock is released or cleared. Sized to stay quiet:
* three attempts over ~2.5 minutes, then give up until the next explicit
* trigger.
*/
const CATALOG_RETRY_DELAYS_MS = [
	5e3,
	3e4,
	12e4
];
function isENOENT(error) {
	return error?.code === "ENOENT";
}
function modelsCachePath(dshHome) {
	return resolve(join(resolveDshHome(dshHome), MODELS_CACHE_FILENAME));
}
function parseIdList(value) {
	if (!Array.isArray(value)) return [];
	return [...new Set(value.filter((id) => typeof id === "string" && id.length > 0))];
}
function parseCache(text) {
	let value;
	try {
		value = JSON.parse(text);
	} catch {
		return;
	}
	if (typeof value !== "object" || value === null || Array.isArray(value)) return void 0;
	const document = value;
	if (document["version"] !== 1 && document["version"] !== MODELS_CACHE_VERSION) return void 0;
	const ids = parseIdList(document["ids"]);
	const selected = parseIdList(document["selected"]);
	if (ids.length === 0 && selected.length === 0) return void 0;
	return {
		ids,
		...selected.length === 0 ? {} : { selected }
	};
}
function asHarnessModels(models) {
	return models.map((model) => model.provider === "xai-oauth" ? model : {
		...model,
		provider: XAI_OAUTH_ROUTE
	});
}
function requestProvider(provider) {
	return {
		...provider,
		auth: {
			...provider.auth,
			apiKey: {
				name: "xAI Grok OAuth bearer token",
				async resolve({ credential }) {
					const apiKey = credential?.key;
					return apiKey === void 0 || apiKey.length === 0 ? void 0 : {
						auth: { apiKey },
						source: "OAuth"
					};
				}
			}
		}
	};
}
/** xAI refresh responses omit account metadata; retain it only across that same-account refresh. */
function withStableOAuthAccount(provider) {
	const oauth = provider.auth?.oauth;
	if (oauth === void 0) return provider;
	return {
		...provider,
		auth: {
			...provider.auth,
			oauth: {
				...oauth,
				async refresh(credential, signal) {
					const refreshed = await oauth.refresh(credential, signal);
					return refreshed.accountId === void 0 && credential.accountId !== void 0 ? {
						...refreshed,
						accountId: credential.accountId
					} : refreshed;
				}
			}
		}
	};
}
/** One process-local owner of the credential and the account model list. */
var XaiOAuthSession = class {
	store;
	models;
	wrapOptions = {
		backendSearch: false,
		retry401: false
	};
	baseline;
	liveIds;
	selectedIds;
	source = "fallback";
	listingError;
	cacheFile;
	onCatalogChange;
	cachedProvider;
	catalogRetryDelaysMs;
	catalogRetryTimer;
	catalogRetryAttempt = 0;
	disposed = false;
	/** Bumped on every refresh start, logout, and dispose so in-flight work cannot commit. */
	catalogGeneration = 0;
	catalogInFlight;
	constructor(store = new XaiOAuthCredentialStore(), onCatalogChange, options = {}) {
		this.store = store;
		this.cacheFile = modelsCachePath();
		this.baseline = withStableOAuthAccount(xaiProvider());
		this.models = createModels({ credentials: store });
		this.models.setProvider(this.baseline);
		this.onCatalogChange = onCatalogChange;
		this.catalogRetryDelaysMs = options.catalogRetryDelaysMs ?? CATALOG_RETRY_DELAYS_MS;
	}
	setWrapOptions(next) {
		this.wrapOptions = next;
		this.cachedProvider = void 0;
		this.onCatalogChange?.();
	}
	invalidateProvider() {
		this.cachedProvider = void 0;
	}
	/**
	* Schedule the next background catalog retry after a failed refresh. Only
	* while a credential file exists — a logged-out store cannot succeed — and
	* with an unref'd timer so the CLI one-shots (bin.ts) still exit on time.
	* The retry reuses `refreshLiveCatalog`, so a transient lock timeout can be
	* retried after the lock is released or cleared. Writer locks delegate
	* exited-holder recovery to the official atomic-write protocol; live and
	* unverified locks remain fail-closed.
	*/
	scheduleCatalogRetry(signal) {
		if (this.disposed || signal?.aborted) return;
		if (this.catalogRetryTimer !== void 0) return;
		if (this.catalogRetryAttempt >= this.catalogRetryDelaysMs.length) return;
		if (!this.store.exists()) return;
		const delay = this.catalogRetryDelaysMs[this.catalogRetryAttempt];
		this.catalogRetryAttempt += 1;
		this.catalogRetryTimer = setTimeout(() => {
			this.catalogRetryTimer = void 0;
			this.refreshLiveCatalog(signal);
		}, delay);
		this.catalogRetryTimer.unref?.();
	}
	/** Cancel a pending retry and restart the backoff episode from zero. */
	clearCatalogRetry() {
		if (this.catalogRetryTimer !== void 0) {
			clearTimeout(this.catalogRetryTimer);
			this.catalogRetryTimer = void 0;
		}
		this.catalogRetryAttempt = 0;
	}
	/** Stop background retries and invalidate every in-flight catalog refresh. */
	dispose() {
		this.disposed = true;
		this.invalidateInFlightCatalog();
		this.clearCatalogRetry();
	}
	/** Drop timers and in-flight fetches so their results cannot commit. */
	invalidateInFlightCatalog() {
		this.catalogGeneration += 1;
		this.catalogInFlight?.abort();
		this.catalogInFlight = void 0;
	}
	/** Secret-free listing diagnostic from the last refresh. */
	get catalogError() {
		return this.listingError;
	}
	get catalogSource() {
		return this.source;
	}
	availableModels() {
		return mergeLiveCatalog(catalogModels(this.baseline.getModels()), this.liveIds);
	}
	/** Unfiltered live ids (includes Imagine models used by grok_imagine). */
	liveModelIds() {
		return this.liveIds;
	}
	selectedModelIds() {
		return this.selectedIds;
	}
	visibleModels() {
		const available = this.availableModels();
		if (this.selectedIds === void 0 || this.selectedIds.length === 0) return available;
		const byId = new Map(available.map((model) => [model.id, model]));
		const catalog = catalogModels(this.baseline.getModels());
		return this.selectedIds.filter((id) => isComposerChatModel(id)).map((id) => byId.get(id) ?? materializeLiveModel(id, catalog));
	}
	/** Provider whose id matches the harness route so PiAiAdapter can list models. */
	provider() {
		if (this.cachedProvider !== void 0) return this.cachedProvider;
		const inner = {
			...requestProvider(this.baseline),
			id: XAI_OAUTH_ROUTE,
			name: "xAI Grok",
			getModels: () => asHarnessModels(this.visibleModels())
		};
		this.cachedProvider = wrapXaiResponsesProvider(inner, this.wrapOptions);
		return this.cachedProvider;
	}
	async loadCachedCatalog() {
		try {
			const cache = parseCache(await readFile(this.cacheFile, "utf8"));
			if (cache === void 0) return;
			if (cache.ids.length > 0) {
				this.liveIds = cache.ids;
				this.source = "cache";
			}
			this.selectedIds = cache.selected === void 0 ? void 0 : filterSelectedChatModelIds(cache.selected) ?? [preferredXaiOAuthModelFrom(this.availableModels())];
			this.invalidateProvider();
		} catch (error) {
			if (!isENOENT(error)) throw error;
		}
	}
	async refreshLiveCatalog(signal) {
		if (this.disposed) return;
		const generation = ++this.catalogGeneration;
		this.catalogInFlight?.abort();
		const local = new AbortController();
		this.catalogInFlight = local;
		const onOuterAbort = () => local.abort();
		if (signal !== void 0) {
			if (signal.aborted) local.abort();
			else signal.addEventListener("abort", onOuterAbort, { once: true });
		}
		const combined = signal === void 0 ? local.signal : AbortSignal.any([local.signal, signal]);
		const isStale = () => this.disposed || generation !== this.catalogGeneration || local.signal.aborted;
		try {
			let access;
			try {
				const stored = await this.store.read("xai");
				if (stored?.type === "oauth" && stored.access.length > 0) access = stored.access;
				if (stored?.type === "oauth" && Date.now() >= stored.expires || access === void 0) {
					const refreshed = (await this.models.getAuth("xai"))?.auth.apiKey;
					if (refreshed !== void 0 && refreshed.length > 0) access = refreshed;
				}
			} catch (error) {
				if (isStale()) return;
				this.listingError = safeMessage(error instanceof Error ? error.message : String(error));
				if (this.liveIds === void 0) this.source = "fallback";
				this.scheduleCatalogRetry(signal);
				if (access === void 0) return;
			}
			if (isStale()) return;
			if (access === void 0 || access.length === 0) {
				this.clearCatalogRetry();
				this.listingError = void 0;
				return;
			}
			try {
				const ids = await fetchLiveModelIds(access, combined);
				if (isStale()) return;
				this.liveIds = ids;
				this.source = "live";
				this.listingError = void 0;
				await this.writeCache();
				if (isStale()) {
					if (this.liveIds === void 0 || this.liveIds === ids) {
						this.liveIds = void 0;
						this.source = "fallback";
						this.invalidateProvider();
						try {
							await rm(this.cacheFile, { force: true });
						} catch {}
					}
					return;
				}
				this.invalidateProvider();
				this.clearCatalogRetry();
				this.onCatalogChange?.();
			} catch (error) {
				if (isStale()) return;
				this.listingError = safeMessage(error instanceof Error ? error.message : String(error));
				if (this.liveIds === void 0) this.source = "fallback";
				this.scheduleCatalogRetry(signal);
			}
		} finally {
			signal?.removeEventListener("abort", onOuterAbort);
			if (this.catalogInFlight === local) this.catalogInFlight = void 0;
		}
	}
	async setSelectedModels(ids) {
		this.selectedIds = ids.length === 0 ? void 0 : filterSelectedChatModelIds(ids) ?? [preferredXaiOAuthModelFrom(this.availableModels())];
		this.invalidateProvider();
		await this.writeCache();
		this.onCatalogChange?.();
	}
	async logout() {
		this.invalidateInFlightCatalog();
		this.clearCatalogRetry();
		await this.store.delete("xai");
		this.liveIds = void 0;
		this.selectedIds = void 0;
		this.source = "fallback";
		this.listingError = void 0;
		this.invalidateProvider();
		await mkdir(dirname(this.cacheFile), {
			recursive: true,
			mode: 448
		});
		await rm(this.cacheFile, { force: true });
		this.onCatalogChange?.();
	}
	async writeCache() {
		const document = {
			version: MODELS_CACHE_VERSION,
			ids: this.liveIds === void 0 ? [] : [...this.liveIds],
			fetchedAt: Date.now(),
			...this.selectedIds === void 0 ? {} : { selected: [...this.selectedIds] }
		};
		await mkdir(dirname(this.cacheFile), {
			recursive: true,
			mode: 448
		});
		await writeFileAtomic(this.cacheFile, `${JSON.stringify(document)}\n`, {
			mode: 384,
			dirMode: 448
		});
	}
};
//#endregion
//#region src/imagine.ts
const XAI_IMAGES_URL = "https://api.x.ai/v1/images/generations";
const DEFAULT_IMAGINE_MODEL = "grok-imagine-image-2.0";
const FALLBACK_IMAGINE_MODEL = "grok-imagine-image";
const USER_AGENT = "dsh-grok-kit/0.2.9";
/** v1 renders exactly one image per call (the API bills per n). */
const MAX_N$1 = 1;
const PNG$1 = Uint8Array.from([
	137,
	80,
	78,
	71,
	13,
	10,
	26,
	10
]);
const JPEG$1 = Uint8Array.from([
	255,
	216,
	255
]);
const GIF87 = new TextEncoder().encode("GIF87a");
const GIF89 = new TextEncoder().encode("GIF89a");
function sniffImageMediaType(bytes) {
	if (startsWith$1(bytes, PNG$1)) return "image/png";
	if (startsWith$1(bytes, JPEG$1)) return "image/jpeg";
	if (startsWith$1(bytes, GIF87) || startsWith$1(bytes, GIF89)) return "image/gif";
	if (bytes.length >= 12 && bytes[0] === 82 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 70 && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80) return "image/webp";
}
function startsWith$1(bytes, prefix) {
	if (bytes.length < prefix.length) return false;
	return prefix.every((value, index) => bytes[index] === value);
}
function extensionFor$1(mediaType) {
	switch (mediaType) {
		case "image/jpeg": return "jpg";
		case "image/png": return "png";
		case "image/webp": return "webp";
		case "image/gif": return "gif";
		default: return "png";
	}
}
function imagineModelId(liveIds) {
	if (liveIds === void 0) return DEFAULT_IMAGINE_MODEL;
	if (liveIds.includes("grok-imagine-image-2.0")) return DEFAULT_IMAGINE_MODEL;
	if (liveIds.includes(FALLBACK_IMAGINE_MODEL)) return FALLBACK_IMAGINE_MODEL;
	return DEFAULT_IMAGINE_MODEL;
}
function attachmentFromValue$1(value) {
	if (value.attachmentId === void 0 || value.mediaType === void 0) return void 0;
	if (value.bytes === void 0 || value.width === void 0 || value.height === void 0) return void 0;
	return {
		attachmentId: value.attachmentId,
		mediaType: value.mediaType,
		bytes: value.bytes,
		width: value.width,
		height: value.height,
		...value.name === void 0 ? {} : { name: value.name }
	};
}
async function requestImage(tokens, body, fetchImpl, signal) {
	let access = await tokens.resolve(signal);
	if (access === void 0 || access.length === 0) throw new Error("grok_imagine requires a SuperGrok/X OAuth sign-in (Settings → xAI Grok)");
	const post = (bearer) => fetchWithBearer(fetchImpl, XAI_IMAGES_URL, bearer, {
		method: "POST",
		redirect: "error",
		headers: {
			"content-type": "application/json",
			accept: "application/json",
			"user-agent": USER_AGENT
		},
		body: JSON.stringify(body),
		...signal !== void 0 ? { signal } : {}
	});
	let response = await post(access);
	if (response.status === 401 && tokens.refresh !== void 0) {
		let refreshed;
		try {
			refreshed = await tokens.refresh(access, signal);
		} catch (error) {
			response.body?.cancel().catch(() => void 0);
			throw error;
		}
		if (refreshed !== void 0 && refreshed.length > 0 && refreshed !== access) {
			response.body?.cancel().catch(() => void 0);
			response = await post(refreshed);
		}
	}
	return response;
}
function applyGrokImagineTool(ctx, options) {
	const fetchImpl = options.fetch ?? globalThis.fetch;
	ctx.tools.register(defineTool({
		name: "grok_imagine",
		description: "Generate an image with xAI Imagine using the SuperGrok / X Premium subscription. Returns the image in the tool result.",
		parameters: {
			prompt: {
				type: "string",
				required: true,
				description: "Image generation prompt."
			},
			aspect_ratio: {
				type: "string",
				description: "Optional aspect ratio, e.g. 16:9."
			},
			resolution: {
				type: "string",
				description: "Optional resolution: 1k or 2k."
			},
			n: {
				type: "number",
				description: "Number of images: must be 1 (one image is rendered per call)."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					text: {
						type: "string",
						required: true
					},
					attachmentId: { type: "string" },
					mediaType: { type: "string" },
					bytes: { type: "number" },
					width: { type: "number" },
					height: { type: "number" },
					name: { type: "string" },
					path: { type: "string" }
				}
			},
			presentationMeta: (_args, value) => ({ ...value }),
			render(_args, raw) {
				const value = raw;
				const attachment = attachmentFromValue$1(value);
				return attachment === void 0 ? [{
					type: "text",
					text: value.text
				}] : [{
					type: "text",
					text: value.text
				}, {
					type: "image",
					attachment
				}];
			}
		},
		isConcurrencySafe: () => true,
		presentCall: (args) => ({
			card: "generic",
			title: args.prompt,
			kind: "other"
		}),
		presentResult: (args, result) => {
			if (result.isError) return void 0;
			const value = result.meta;
			const attachment = value === void 0 ? void 0 : attachmentFromValue$1(value);
			return {
				card: "generic",
				title: args.prompt,
				...attachment === void 0 ? {} : { content: [{
					type: "image",
					attachment
				}] }
			};
		},
		async execute(args, exec) {
			assertMediaEnabled(options.enabled, "grok_imagine");
			const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
			if (prompt.length === 0) throw new Error("prompt must be a non-empty string");
			const n = args.n ?? 1;
			if (!Number.isSafeInteger(n) || n < 1 || n > MAX_N$1) throw new Error("n must be 1: this plugin renders one image per call (the API bills per n)");
			const resolution = args.resolution;
			if (resolution !== void 0 && resolution !== "1k" && resolution !== "2k") throw new Error("resolution must be 1k or 2k");
			exec.signal?.throwIfAborted();
			const attachments = options.resolveAttachments();
			if (attachments === void 0) throw new Error("grok_imagine requires the DSH attachment service to save results");
			const body = {
				model: imagineModelId(options.session.liveModelIds()),
				prompt,
				n,
				response_format: "b64_json",
				...typeof args.aspect_ratio === "string" && args.aspect_ratio.length > 0 ? { aspect_ratio: args.aspect_ratio } : {},
				...resolution !== void 0 ? { resolution } : {}
			};
			assertMediaEnabled(options.enabled, "grok_imagine");
			const response = await requestImage(options.tokens, body, fetchImpl, exec.signal);
			if (!response.ok) {
				const detail = safeMessage(await response.text().catch(() => "")).slice(0, 300);
				throw new Error(`xAI image generation failed (HTTP ${response.status})${detail.length === 0 ? "" : `: ${detail}`}`);
			}
			const b64 = (await response.json()).data?.[0]?.b64_json;
			if (typeof b64 !== "string" || b64.length === 0) throw new Error("xAI image generation returned no b64_json");
			const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
			const mediaType = sniffImageMediaType(bytes);
			if (mediaType === void 0) throw new Error("grok_imagine: generated bytes are not a supported image type");
			exec.signal?.throwIfAborted();
			{
				const ref = await attachments.saveImage({
					data: bytes,
					mediaType,
					name: `grok-imagine.${extensionFor$1(mediaType)}`
				});
				return {
					text: `Generated image. attachment=${JSON.stringify(ref)}`,
					attachmentId: ref.attachmentId,
					mediaType: ref.mediaType,
					bytes: ref.bytes,
					width: ref.width,
					height: ref.height,
					...ref.name === void 0 ? {} : { name: ref.name }
				};
			}
		}
	}));
}
//#endregion
//#region src/imagine-edit-core.ts
/**
* Grok Imagine image-edit pure logic (image-to-image over POST /v1/images/edits).
*
* Source-image parsing (path / URL / data URI / DSH attachment handle) →
* request-body building → response decoding. OAuth tokens and result saving
* are injected by the caller, so this module stays dependency-free and can be
* exercised offline with a fake fetch.
*
* Merged from the former standalone plugin `dsh-grok-imagine-edit` (v0.1.0).
* @module dsh-grok-kit/imagine-edit-core
*/
/** xAI image-edit endpoint (sibling of the generations endpoint in imagine.ts). */
const XAI_IMAGES_EDIT_URL = "https://api.x.ai/v1/images/edits";
/** Same default/fallback model choice as the generations path. */
const DEFAULT_EDIT_MODEL = "grok-imagine-image-2.0";
/** Default per-source byte cap. */
const DEFAULT_MAX_IMAGE_BYTES = 20971520;
/** xAI supports n; we keep only the first returned image. */
const MAX_N = 4;
const PNG = Uint8Array.from([
	137,
	80,
	78,
	71,
	13,
	10,
	26,
	10
]);
const JPEG = Uint8Array.from([
	255,
	216,
	255
]);
function startsWith(bytes, prefix) {
	if (bytes.length < prefix.length) return false;
	return prefix.every((value, index) => bytes[index] === value);
}
/** Media-type sniffing by magic bytes, restricted to edit-accepted formats. */
function sniffEditableImageMediaType(bytes) {
	if (startsWith(bytes, PNG)) return "image/png";
	if (startsWith(bytes, JPEG)) return "image/jpeg";
	if (bytes.length >= 12 && bytes[0] === 82 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 70 && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80) return "image/webp";
}
/** File extension for a saved result. */
function extensionFor(mediaType) {
	switch (mediaType) {
		case "image/jpeg": return "jpg";
		case "image/png": return "png";
		case "image/webp": return "webp";
		default: return "png";
	}
}
/** Encode bytes into the data-URI form xAI accepts. */
function dataUriFor(bytes, mediaType) {
	return `data:${mediaType};base64,${Buffer.from(bytes).toString("base64")}`;
}
/**
* Keep the save-path extension truthful about the returned media type.
* xAI edit results are often JPEG while the caller asked for `.png` — writing
* as-is would produce a mislabeled file other tools refuse to open. Only the
* extension changes; directory and stem stay untouched.
*/
function alignExtension(target, mediaType) {
	const expected = extensionFor(mediaType);
	const current = extname(target);
	const currentLower = current.slice(1).toLowerCase();
	if (currentLower === expected || expected === "jpg" && currentLower === "jpeg") return { path: target };
	return {
		path: `${current.length === 0 ? target : target.slice(0, -current.length)}.${expected}`,
		note: `Adjusted the save_path extension from ${current.length === 0 ? "(none)" : current} to .${expected} to match the returned ${mediaType}.`
	};
}
function isHttpUrl(value) {
	return /^https?:\/\//iu.test(value);
}
/** Canonical `data:image/<png|jpeg|webp>;base64,…` form. */
function normalizeDataImageUri(value) {
	const match = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=\s]+)$/iu.exec(value.trim());
	if (match === null) return void 0;
	const raw = match[1].toLowerCase();
	return {
		url: `data:${raw === "png" ? "image/png" : raw === "webp" ? "image/webp" : "image/jpeg"};base64,${match[2].replace(/\s+/gu, "")}`,
		origin: "data-uri"
	};
}
const ATTACHMENT_ID = /sha256:[a-f0-9]{64}/u;
const ATTACHMENT_ID_ONLY = /^sha256:[a-f0-9]{64}$/u;
/** Extract a valid DSH attachment reference from a candidate object. */
function attachmentRefFrom(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return void 0;
	const record = value;
	const id = typeof record.attachmentId === "string" ? record.attachmentId.trim() : "";
	if (!ATTACHMENT_ID_ONLY.test(id)) return void 0;
	if (!(typeof record.mediaType === "string" && typeof record.bytes === "number" && Number.isSafeInteger(record.bytes) && record.bytes > 0 && typeof record.width === "number" && Number.isSafeInteger(record.width) && record.width > 0 && typeof record.height === "number" && Number.isSafeInteger(record.height) && record.height > 0)) return { attachmentId: id };
	return {
		attachmentId: id,
		ref: {
			attachmentId: id,
			mediaType: record.mediaType,
			bytes: record.bytes,
			width: record.width,
			height: record.height,
			...typeof record.name === "string" ? { name: record.name } : {}
		}
	};
}
/**
* Parse a session image handle into an attachment reference.
*
* Accepted shapes (everything the model actually sees):
*   - full attachment JSON: `{"attachmentId":"sha256:…","mediaType":"image/png",…}`
*   - handle-line fragment: `[Codex Connect image 1 … attachment={…}]`
*   - labeled form: `attachmentId=sha256:…`
*   - bare id: `sha256:…`
*
* Only a full reference carries `ref` — then the caller can use the attachment
* service's `readImage` and let the store verify bytes; otherwise fall back to
* reading the host object path by id.
*/
function parseAttachmentSpec(value) {
	const text = value.trim();
	if (text.length === 0) return void 0;
	if (ATTACHMENT_ID_ONLY.test(text)) return { attachmentId: text };
	if (text.startsWith("{")) try {
		const parsed = attachmentRefFrom(JSON.parse(text));
		if (parsed !== void 0) return parsed;
	} catch {}
	const embedded = /attachment=(\{[^}]*\})/u.exec(text);
	if (embedded !== null) try {
		const parsed = attachmentRefFrom(JSON.parse(embedded[1]));
		if (parsed !== void 0) return parsed;
	} catch {}
	const labeled = /attachmentId\s*=\s*(sha256:[a-f0-9]{64})/u.exec(text);
	if (labeled !== null) return { attachmentId: labeled[1] };
	const bare = ATTACHMENT_ID.exec(text);
	if (bare !== null && text.replace(ATTACHMENT_ID, "").replace(/attachmentId\s*=/u, "").trim().length === 0) return { attachmentId: bare[0] };
}
/**
* Resolve each caller-provided source into an xAI-ready `{ url }`.
* Public http(s) URLs, data URIs, and local file paths (absolute or relative
* to the session cwd) are supported, plus DSH session attachments.
*/
async function resolveImageSources(specs, options = {}) {
	const { cwd, maxBytes = DEFAULT_MAX_IMAGE_BYTES, maxSourceImages = 5, readFile, readAttachmentBytes } = options;
	const reader = readFile ?? (await import("node:fs/promises")).readFile;
	const { isAbsolute, resolve } = await import("node:path");
	const list = specs.filter((value) => typeof value === "string" && value.trim().length > 0);
	if (list.length === 0) throw new Error("at least one source image is required (image or images)");
	if (list.length > maxSourceImages) throw new Error(`too many source images: ${list.length} (xAI accepts at most ${maxSourceImages})`);
	const resolved = [];
	for (const spec of list) {
		const trimmed = spec.trim();
		if (isHttpUrl(trimmed)) {
			resolved.push({
				url: trimmed,
				origin: "url"
			});
			continue;
		}
		if (/^data:/iu.test(trimmed)) {
			const normalized = normalizeDataImageUri(trimmed);
			if (normalized === void 0) throw new Error("data URI must be a base64 image/png, image/jpeg or image/webp payload");
			const payload = normalized.url.slice(normalized.url.indexOf(",") + 1);
			const decodedSize = Math.floor(payload.replace(/=+$/u, "").length * 3 / 4);
			if (decodedSize > maxBytes) throw new Error(`data URI is ${decodedSize} bytes, over the ${maxBytes}-byte limit`);
			const bytes = Buffer.from(payload, "base64");
			if (bytes.toString("base64").replace(/=+$/u, "") !== payload.replace(/=+$/u, "") || !/^[A-Za-z0-9+/]+={0,2}$/u.test(payload) || payload.includes("=") && payload.length % 4 !== 0) throw new Error("data URI must contain valid base64 image bytes");
			if (bytes.byteLength > maxBytes) throw new Error(`data URI is ${bytes.byteLength} bytes, over the ${maxBytes}-byte limit`);
			const mediaType = sniffEditableImageMediaType(bytes);
			if (mediaType === void 0) throw new Error("data URI is not a PNG, JPEG or WebP image");
			if (mediaType !== normalized.url.slice(5, normalized.url.indexOf(";"))) throw new Error("data URI media type does not match its image bytes");
			resolved.push({
				url: dataUriFor(bytes, mediaType),
				origin: "data-uri",
				mediaType,
				bytes: bytes.byteLength
			});
			continue;
		}
		const attachment = parseAttachmentSpec(trimmed);
		if (attachment !== void 0) {
			if (typeof readAttachmentBytes !== "function") throw new Error("attachment input needs the DSH attachment service, which is not mounted in this context");
			const bytes = await readAttachmentBytes(attachment);
			if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) throw new Error(`attachment ${attachment.attachmentId} could not be read as image bytes`);
			if (bytes.byteLength > maxBytes) throw new Error(`attachment ${attachment.attachmentId} is ${bytes.byteLength} bytes, over the ${maxBytes}-byte limit`);
			const mediaType = sniffEditableImageMediaType(bytes);
			if (mediaType === void 0) throw new Error(`attachment ${attachment.attachmentId} is not a PNG, JPEG or WebP image`);
			resolved.push({
				url: dataUriFor(bytes, mediaType),
				origin: "attachment",
				mediaType,
				bytes: bytes.byteLength
			});
			continue;
		}
		const path = isAbsolute(trimmed) ? trimmed : resolve(cwd ?? process.cwd(), trimmed);
		let bytes;
		try {
			bytes = await reader(path);
		} catch (error) {
			const code = error?.code;
			const codeText = code === void 0 ? "" : ` (${code})`;
			throw new Error(`cannot read source image ${JSON.stringify(trimmed)}${codeText}: ${error?.message ?? String(error)}`);
		}
		if (bytes.byteLength > maxBytes) throw new Error(`source image ${JSON.stringify(trimmed)} is ${bytes.byteLength} bytes, over the ${maxBytes}-byte limit`);
		const mediaType = sniffEditableImageMediaType(bytes);
		if (mediaType === void 0) throw new Error(`source image ${JSON.stringify(trimmed)} is not a PNG, JPEG or WebP image`);
		resolved.push({
			url: dataUriFor(bytes, mediaType),
			origin: "file",
			mediaType,
			bytes: bytes.byteLength
		});
	}
	return resolved;
}
/**
* Build the /v1/images/edits request body.
* One image uses `image`, several use `images` (mutually exclusive per xAI).
*/
function buildEditRequestBody(input) {
	const { model = DEFAULT_EDIT_MODEL, prompt, images, n = 1, aspectRatio, resolution, responseFormat = "b64_json" } = input;
	if (typeof prompt !== "string" || prompt.trim().length === 0) throw new Error("prompt must be a non-empty string");
	if (!Array.isArray(images) || images.length === 0) throw new Error("at least one source image is required");
	const body = {
		model,
		prompt: prompt.trim(),
		n,
		response_format: responseFormat
	};
	if (images.length === 1) body.image = {
		url: images[0].url,
		type: "image_url"
	};
	else body.images = images.map((image) => ({
		url: image.url,
		type: "image_url"
	}));
	if (typeof aspectRatio === "string" && aspectRatio.length > 0) body.aspect_ratio = aspectRatio;
	if (typeof resolution === "string" && resolution.length > 0) body.resolution = resolution;
	return body;
}
/** Take the first returned image and sniff its real type. */
function decodeFirstImage(parsed) {
	const data = Array.isArray(parsed?.data) ? parsed.data : [];
	const b64 = data[0]?.b64_json;
	if (typeof b64 !== "string" || b64.length === 0) throw new Error("xAI image edit returned no b64_json");
	const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
	const mediaType = sniffEditableImageMediaType(bytes);
	if (mediaType === void 0) throw new Error("xAI image edit returned unsupported image bytes");
	return {
		bytes,
		mediaType,
		returned: data.length
	};
}
/** Keep only the diagnostics-worthy fragment; never echo credentials. */
function safeDetail(text) {
	return safeMessage(text ?? "").replace(/\s+/gu, " ").slice(0, 300);
}
/**
* Run one image edit: parse sources → POST → decode → hand to `save`.
*
* The default fetch is the host-global one (already wrapped by dsh-grok-kit's
* xAI proxy hook, which covers api.x.ai).
*/
async function runImageEdit(options) {
	const { tokens, prompt, imageSpecs, cwd, fetchImpl, save, signal, model = DEFAULT_EDIT_MODEL, n = 1, aspectRatio, resolution, maxSourceImages = 5, maxBytes = DEFAULT_MAX_IMAGE_BYTES, readFile, readAttachmentBytes, logger } = options;
	if (save === void 0 || typeof save !== "function") throw new Error("save callback is required");
	signal?.throwIfAborted();
	const doFetch = fetchImpl ?? globalThis.fetch;
	const images = await resolveImageSources(imageSpecs, {
		cwd,
		maxBytes,
		maxSourceImages,
		readFile,
		readAttachmentBytes
	});
	const body = buildEditRequestBody({
		model,
		prompt,
		images,
		n,
		aspectRatio,
		resolution
	});
	const access = await tokens.resolve(signal);
	if (typeof access !== "string" || access.length === 0) throw new Error("grok_imagine_edit requires a SuperGrok/X OAuth sign-in (Settings → xAI Grok)");
	const post = (bearer) => fetchWithBearer(doFetch, XAI_IMAGES_EDIT_URL, bearer, {
		method: "POST",
		redirect: "error",
		headers: {
			"content-type": "application/json",
			accept: "application/json",
			"user-agent": "dsh-grok-kit/0.2.9"
		},
		body: JSON.stringify(body),
		...signal === void 0 ? {} : { signal }
	});
	let response = await post(access);
	if (response.status === 401 && tokens.refresh !== void 0) {
		let refreshed;
		try {
			refreshed = await tokens.refresh(access, signal);
		} catch (error) {
			response.body?.cancel().catch(() => void 0);
			throw error;
		}
		if (typeof refreshed === "string" && refreshed.length > 0 && refreshed !== access) {
			response.body?.cancel().catch(() => void 0);
			logger?.("grok_imagine_edit: retrying once after 401 with a refreshed token");
			response = await post(refreshed);
		}
	}
	if (!response.ok) {
		const detail = safeDetail(await response.text().catch(() => ""));
		throw new Error(`xAI image edit failed (HTTP ${response.status})${detail.length === 0 ? "" : `: ${detail}`}`);
	}
	const { bytes, mediaType, returned } = decodeFirstImage(await response.json());
	signal?.throwIfAborted();
	const saved = await save(bytes, mediaType, {
		model: body.model,
		n,
		returned
	});
	const savedMediaType = saved.mediaType ?? mediaType;
	const savedBytes = saved.bytes ?? bytes.byteLength;
	const sources = images.map((image) => image.origin === "file" ? `file:${image.mediaType}` : image.origin);
	const lines = [`Edited with ${String(body.model)}${returned > 1 ? ` (kept 1 of ${returned} returned images)` : ""}.`, `Sources: ${images.length} (${sources.join(", ")}).`];
	if (saved.path !== void 0) lines.push(`Saved to ${saved.path}`);
	if (typeof saved.note === "string" && saved.note.length > 0) lines.push(saved.note);
	if (saved.attachmentId !== void 0) {
		lines.push(`attachmentId=${String(saved.attachmentId)}`);
		if (saved.width !== void 0 && saved.height !== void 0) lines.push(`attachment=${JSON.stringify({
			attachmentId: saved.attachmentId,
			mediaType: savedMediaType,
			bytes: savedBytes,
			width: saved.width,
			height: saved.height,
			...saved.name === void 0 ? {} : { name: saved.name }
		})}`);
	}
	lines.push(`Image: ${savedMediaType}, ${savedBytes} bytes.`);
	return {
		text: lines.join(" "),
		...saved,
		mediaType: savedMediaType,
		bytes: savedBytes,
		model: body.model,
		sourceCount: images.length,
		requestBodyKeys: Object.keys(body)
	};
}
//#endregion
//#region src/imagine-edit.ts
/**
* DSH grok_imagine_edit tool over POST /v1/images/edits (image-to-image).
*
* Merged from the former standalone plugin `dsh-grok-imagine-edit` (v0.1.0).
* Unlike the standalone version this reuses the host plugin's single OAuth
* session, credential store, and token source instead of building a second
* one against the same auth file.
* @module dsh-grok-kit/imagine-edit
*/
const TOOL_NAME = "grok_imagine_edit";
const RESOLUTIONS = [
	"1k",
	"1.5k",
	"2k"
];
function isNonEmptyString$1(value) {
	return typeof value === "string" && value.trim().length > 0;
}
function attachmentFromValue(value) {
	if (value === void 0) return void 0;
	if (value.attachmentId === void 0 || value.mediaType === void 0) return void 0;
	if (value.bytes === void 0 || value.width === void 0 || value.height === void 0) return void 0;
	return {
		attachmentId: value.attachmentId,
		mediaType: value.mediaType,
		bytes: value.bytes,
		width: value.width,
		height: value.height,
		...value.name === void 0 ? {} : { name: value.name }
	};
}
/** Register grok_imagine_edit. Independent of imagineTool: either may be off. */
function applyGrokImagineEditTool(ctx, options) {
	const fetchImpl = options.fetch ?? globalThis.fetch;
	const maxSourceImages = Number.isSafeInteger(options.maxSourceImages) ? Math.min(Math.max(options.maxSourceImages, 1), 5) : 5;
	const maxImageBytes = Number.isSafeInteger(options.maxImageBytes) && options.maxImageBytes > 0 ? options.maxImageBytes : DEFAULT_MAX_IMAGE_BYTES;
	const editModel = isNonEmptyString$1(options.editModel) ? options.editModel.trim() : void 0;
	/**
	* Read a session image attachment into bytes (the handle the model holds
	* after read_image / view_image). Two paths, neither guesses paths:
	*   1. full reference → attachments.readImage(ref); the store verifies the
	*      digest and metadata itself;
	*   2. bare attachmentId → attachments.imageHostPath(ref), then a local
	*      sha256 self-check (the attachment id IS the content digest).
	*/
	const readAttachmentBytes = async (attachment) => {
		const attachments = options.resolveAttachments();
		if (attachments === void 0) throw new Error("grok_imagine_edit: the DSH attachment service is not mounted, so the session image cannot be read");
		if (attachment.ref !== void 0 && typeof attachments.readImage === "function") {
			const data = (await attachments.readImage(attachment.ref))?.data;
			if (data instanceof Uint8Array && data.byteLength > 0) return data;
			throw new Error(`grok_imagine_edit: attachment ${attachment.attachmentId} returned no bytes`);
		}
		const hostPath = typeof attachments.imageHostPath === "function" ? attachments.imageHostPath({ attachmentId: attachment.attachmentId }) : void 0;
		if (typeof hostPath !== "string" || hostPath.length === 0) throw new Error(`grok_imagine_edit: attachment ${attachment.attachmentId} is not backed by a readable host object`);
		const bytes = new Uint8Array(await readFile(hostPath));
		if (`sha256:${createHash("sha256").update(bytes).digest("hex")}` !== attachment.attachmentId) throw new Error(`grok_imagine_edit: attachment ${attachment.attachmentId} failed integrity verification`);
		return bytes;
	};
	/** Store results through the host; file exports belong to sandboxed host tools. */
	const makeSaver = (attachments) => async (bytes, mediaType) => attachments.saveImage({
		data: bytes,
		mediaType,
		name: `grok-imagine-edit.${extensionFor(mediaType)}`
	});
	ctx.tools.register(defineTool({
		name: TOOL_NAME,
		description: "Edit or restyle an existing image with xAI Imagine (POST /v1/images/edits), using the SuperGrok / X Premium subscription. A source image may be a DSH attachment reference from this session (pass the attachmentId=sha256:... handle or the full attachment={...} JSON that read_image / view_image returns), a local file path, an http(s) URL, or a base64 data URI; up to 5 source images. Returns the image in the tool result.",
		parameters: {
			prompt: {
				type: "string",
				required: true,
				description: "Edit instruction, e.g. \"render this as a pencil sketch\" or \"keep the character, move them into a snowy forest at dusk\"."
			},
			image: {
				type: "string",
				required: true,
				description: "Source image: a session attachment from read_image / view_image (pass attachmentId=sha256:... or the whole attachment={...} JSON line), a local file path, an http(s) URL, or a base64 data URI (PNG/JPEG/WebP)."
			},
			images: {
				type: "array",
				items: { type: "string" },
				description: "Optional extra reference images (same accepted forms, session attachments included). image + images together: at most 5."
			},
			aspect_ratio: {
				type: "string",
				description: "Optional output aspect ratio, e.g. 16:9 or 1:1 (default follows the first source image)."
			},
			resolution: {
				type: "string",
				description: "Optional output resolution: 1k, 1.5k or 2k."
			},
			n: {
				type: "number",
				description: `Number of edited images to request (1-${String(4)}). Default 1; only the first is kept.`
			},
			save_path: {
				type: "string",
				description: "Unsupported: results are saved to the DSH attachment library. Use the host file tools to export an attachment."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					text: { type: "string" },
					attachmentId: { type: "string" },
					mediaType: { type: "string" },
					bytes: { type: "number" },
					width: { type: "number" },
					height: { type: "number" },
					name: { type: "string" },
					path: { type: "string" }
				}
			},
			presentationMeta: (_args, value) => ({ ...value }),
			render(_args, raw) {
				const value = raw;
				const attachment = attachmentFromValue(value);
				return attachment === void 0 ? [{
					type: "text",
					text: String(value?.text ?? "")
				}] : [{
					type: "text",
					text: String(value?.text ?? "")
				}, {
					type: "image",
					attachment
				}];
			}
		},
		isConcurrencySafe: () => true,
		presentCall: (args) => ({
			card: "generic",
			title: String(args?.prompt ?? TOOL_NAME),
			kind: "other"
		}),
		presentResult: (args, result) => {
			if (result.isError) return void 0;
			const attachment = attachmentFromValue(result?.meta);
			if (attachment === void 0) return void 0;
			return {
				card: "generic",
				title: String(args?.prompt ?? TOOL_NAME),
				content: [{
					type: "image",
					attachment
				}]
			};
		},
		async execute(args, exec) {
			assertMediaEnabled(options.enabled, "grok_imagine_edit");
			const prompt = isNonEmptyString$1(args?.prompt) ? args.prompt.trim() : "";
			if (prompt.length === 0) throw new Error("prompt must be a non-empty string");
			const primary = isNonEmptyString$1(args?.image) ? args.image.trim() : "";
			if (primary.length === 0) throw new Error("image must be a non-empty source (file path, URL or data URI)");
			if (args?.save_path !== void 0) throw new Error("grok_imagine_edit: save_path is unsupported; use the host file tools to export the saved attachment");
			const attachments = options.resolveAttachments();
			if (attachments === void 0) throw new Error("grok_imagine_edit requires the DSH attachment service to save results");
			if (args?.images !== void 0 && (!Array.isArray(args.images) || args.images.some((image) => !isNonEmptyString$1(image)))) throw new Error("images must be an array of non-empty source images");
			const imageSpecs = [primary, ...args?.images ?? []];
			if (imageSpecs.length > maxSourceImages) throw new Error(`too many source images: ${imageSpecs.length} (at most ${maxSourceImages})`);
			const n = args?.n ?? 1;
			if (!Number.isSafeInteger(n) || n < 1 || n > 4) throw new Error(`n must be an integer between 1 and ${String(4)}`);
			const resolution = args?.resolution;
			if (resolution !== void 0 && !RESOLUTIONS.includes(resolution)) throw new Error(`resolution must be one of ${RESOLUTIONS.join(", ")}`);
			const aspectRatio = isNonEmptyString$1(args?.aspect_ratio) ? args.aspect_ratio.trim() : void 0;
			const cwd = exec.agent?.session?.header?.cwd;
			assertMediaEnabled(options.enabled, "grok_imagine_edit");
			const result = await runImageEdit({
				tokens: options.tokens,
				prompt,
				imageSpecs,
				cwd,
				fetchImpl,
				model: editModel ?? imagineModelId(options.session.liveModelIds()),
				n,
				aspectRatio,
				resolution: typeof resolution === "string" ? resolution : void 0,
				maxSourceImages,
				maxBytes: maxImageBytes,
				readAttachmentBytes,
				readFile: async (path) => {
					const fs = exec.agent?.ctx?.fs ?? ctx.fs;
					if (fs === void 0) throw new Error("grok_imagine_edit: the DSH filesystem service is required for local source images");
					const target = await fs.resolve(path, {
						cwd,
						signal: exec.signal
					});
					return fs.readBytes(target, exec.signal, maxImageBytes);
				},
				save: makeSaver(attachments),
				logger: (message) => ctx.logger?.info?.(message),
				signal: exec?.signal
			});
			ctx.logger?.info?.(`grok_imagine_edit: ${String(result.text)}`);
			return {
				text: String(result.text),
				...result.attachmentId === void 0 ? {} : { attachmentId: result.attachmentId },
				...result.mediaType === void 0 ? {} : { mediaType: result.mediaType },
				...result.bytes === void 0 ? {} : { bytes: result.bytes },
				...result.width === void 0 ? {} : { width: result.width },
				...result.height === void 0 ? {} : { height: result.height },
				...result.name === void 0 ? {} : { name: result.name },
				...result.path === void 0 ? {} : { path: result.path }
			};
		}
	}));
	ctx.logger?.info?.(`dsh-grok-kit: registered ${TOOL_NAME} (model ${editModel ?? "auto"}, source-image cap ${String(maxSourceImages)})`);
}
//#endregion
//#region src/video-core.ts
/**
* Grok Imagine video task core (image-to-video over POST /v1/videos/generations).
*
* Task lifecycle only: submit once → poll once per call → download the finished
* MP4 into the DSH attachment store. Local JSON state (never tokens, never the
* signed remote URL) survives restarts so `grok_video_status` can resume.
*
* Safety rules baked in here:
*   - submission results that never reached the client are recorded as
*     `submission-unknown` and are NEVER re-POSTed automatically (no double billing);
*   - downloads use a separate token-free fetch against an exact official host
*     allowlist, refuse redirects, enforce a streamed byte cap, and check the
*     MP4 signature before anything is committed;
*   - the remote signed URL is never persisted, returned, or echoed in errors;
*   - tasks are partitioned by OAuth identity: switching accounts mid-operation
*     aborts the operation instead of leaking results across accounts.
*
* Source images reuse imagine-edit-core's resolver (attachment handle / local
* path / data URI). Local paths need a caller-provided reader (the tool layer
* passes the sandboxed host fs); this module never falls back to bare node fs.
* @module dsh-grok-kit/video-core
*/
/** xAI video submission endpoint (async: returns a request id for polling). */
const XAI_VIDEO_GENERATIONS_URL = "https://api.x.ai/v1/videos/generations";
/** xAI video status endpoint; the request id is an opaque remote handle, never a local path. */
function xaiVideoStatusUrl(requestId) {
	return `https://api.x.ai/v1/videos/${encodeURIComponent(requestId)}`;
}
/** First-version supported durations (official contract allows 1–15s). */
const SUPPORTED_VIDEO_DURATIONS = [6, 10];
/** First-version supported resolutions (official contract also offers 1080p). */
const SUPPORTED_VIDEO_RESOLUTIONS = ["480p", "720p"];
/**
* Exact https hosts whose signed video URLs may be downloaded. Anything else
* is refused outright, which keeps the first version free of generic
* DNS/SSRF handling; redirects are disabled below as the second layer.
*/
const ALLOWED_VIDEO_DOWNLOAD_HOSTS = ["vidgen.x.ai"];
const VIDEO_SUBMIT_TIMEOUT_MS = 12e4;
const VIDEO_POLL_TIMEOUT_MS = 3e4;
const VIDEO_DOWNLOAD_TIMEOUT_MS = 3e5;
/** Bounded store read; a bigger file is treated as corruption, not silently truncated. */
const MAX_STORE_BYTES = 2097152;
/** Retention: the newest tasks survive, older records are pruned on write. */
const MAX_STORE_TASKS = 50;
/** Bounded JSON body read for submission/status responses. */
const MAX_JSON_RESPONSE_BYTES = 262144;
const MAX_PROMPT_CHARS = 4e3;
const MAX_ERROR_CHARS = 1e3;
const STORE_VERSION = 1;
const STORE_DIRNAME = "dsh-grok-kit";
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const VIDEO_TASK_STATES = [
	"pending",
	"downloading",
	"done",
	"failed",
	"interrupted",
	"submission-unknown"
];
function isRecord$1(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
function boundedString(value, max) {
	if (typeof value !== "string") return void 0;
	return value.length > max ? value.slice(0, max) : value;
}
/** Strip anything URL-shaped so signed remote links never reach disk or the UI. */
function redactRemoteUrls(text) {
	return text.replace(/https?:\/\/\S+/giu, "[link redacted]");
}
function errorText(error) {
	return redactRemoteUrls(sanitizeDiagnosticMessage(safeMessage(error))).slice(0, MAX_ERROR_CHARS);
}
function isVideoTaskState(value) {
	return typeof value === "string" && VIDEO_TASK_STATES.includes(value);
}
/** Accept only well-formed persisted records; anything else is skipped. */
function sanitizeRecord(value) {
	if (!isRecord$1(value)) return void 0;
	const taskId = boundedString(value.taskId, 128);
	const identity = boundedString(value.identity, 256);
	const state = value.state;
	const model = boundedString(value.model, 128);
	const createdAt = boundedString(value.createdAt, 64);
	const updatedAt = boundedString(value.updatedAt, 64);
	const prompt = boundedString(value.prompt, 4016);
	if (taskId === void 0 || taskId.length === 0 || identity === void 0 || identity.length === 0 || !isVideoTaskState(state) || model === void 0 || createdAt === void 0 || updatedAt === void 0 || prompt === void 0) return void 0;
	const record = {
		taskId,
		identity,
		state,
		model,
		createdAt,
		updatedAt,
		prompt
	};
	const requestId = boundedString(value.requestId, 256);
	if (requestId !== void 0 && REQUEST_ID_PATTERN.test(requestId)) record.requestId = requestId;
	if (typeof value.duration === "number" && Number.isSafeInteger(value.duration)) record.duration = value.duration;
	if (typeof value.resolution === "string") record.resolution = value.resolution;
	if (isRecord$1(value.attachment)) {
		const attachmentId = boundedString(value.attachment.attachmentId, 256);
		const name = boundedString(value.attachment.name, 256);
		if (attachmentId !== void 0 && name !== void 0 && typeof value.attachment.bytes === "number" && Number.isSafeInteger(value.attachment.bytes)) record.attachment = {
			attachmentId,
			name,
			bytes: value.attachment.bytes
		};
	}
	const error = boundedString(value.error, MAX_ERROR_CHARS);
	if (error !== void 0) record.error = error;
	return record;
}
function toResult(record) {
	const result = {
		taskId: record.taskId,
		state: record.state,
		model: record.model,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
		prompt: record.prompt
	};
	if (record.duration !== void 0) result.duration = record.duration;
	if (record.resolution !== void 0) result.resolution = record.resolution;
	if (record.attachment !== void 0) result.attachment = record.attachment;
	if (record.error !== void 0) result.error = record.error;
	return result;
}
/** Structured timeout/abort bundle: one request = one timeout, no background timers. */
function withTimeout(signals, ms, label) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(/* @__PURE__ */ new Error(`${label} timed out after ${String(ms)}ms`)), ms);
	const cleanups = [() => clearTimeout(timer)];
	for (const signal of signals) {
		if (signal === void 0) continue;
		const onAbort = () => controller.abort(signal.reason);
		if (signal.aborted) controller.abort(signal.reason);
		else {
			signal.addEventListener("abort", onAbort, { once: true });
			cleanups.push(() => signal.removeEventListener("abort", onAbort));
		}
	}
	return {
		signal: controller.signal,
		cancel: () => {
			for (const cleanup of cleanups) cleanup();
		}
	};
}
/** Await a shared task operation while still honouring a caller's own cancellation. */
function waitForOperation(pending, signal) {
	signal?.throwIfAborted();
	if (signal === void 0) return pending;
	return new Promise((resolvePromise, rejectPromise) => {
		const onAbort = () => rejectPromise(signal.reason);
		signal.addEventListener("abort", onAbort, { once: true });
		pending.then(resolvePromise, rejectPromise).finally(() => signal.removeEventListener("abort", onAbort));
	});
}
function chunkReaderOf(body) {
	if (body === null || typeof body !== "object") return void 0;
	const getReader = body.getReader;
	if (typeof getReader !== "function") return void 0;
	return getReader.call(body);
}
function chunkToBytes(value) {
	if (value instanceof Uint8Array) return value;
	if (value instanceof ArrayBuffer) return new Uint8Array(value);
	if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
	throw new Error("video download returned a non-binary chunk");
}
/**
* Stream the body under a byte cap, checking the ISO-BMFF signature
* (`ftyp`/`styp`/`moov` at offset 4) before yielding anything, so a non-MP4
* payload never reaches the attachment store.
*/
function verifiedMp4Stream(reader, maxBytes) {
	const tooLarge = () => /* @__PURE__ */ new Error(`video exceeds the ${String(maxBytes)}-byte download limit`);
	let completed = false;
	let closed = false;
	const close = async () => {
		if (closed) return;
		closed = true;
		try {
			if (!completed) await reader.cancel?.(/* @__PURE__ */ new Error("video stream consumption ended early")).catch(() => void 0);
		} finally {
			reader.releaseLock?.();
		}
	};
	async function* chunks() {
		try {
			const head = [];
			let headLength = 0;
			let total = 0;
			while (headLength < 12) {
				const { done, value } = await reader.read();
				if (done) {
					completed = true;
					break;
				}
				const chunk = chunkToBytes(value);
				total += chunk.byteLength;
				if (total > maxBytes) throw tooLarge();
				head.push(chunk);
				headLength += chunk.byteLength;
			}
			const prefix = new Uint8Array(Math.min(headLength, 12));
			let offset = 0;
			for (const chunk of head) {
				const take = Math.min(chunk.byteLength, prefix.byteLength - offset);
				prefix.set(chunk.subarray(0, take), offset);
				offset += take;
				if (offset >= prefix.byteLength) break;
			}
			const box = String.fromCharCode(...prefix.subarray(4, 8));
			if (prefix.byteLength < 12 || box !== "ftyp" && box !== "styp" && box !== "moov") throw new Error("downloaded video is not an MP4 file (missing ISO-BMFF signature)");
			for (const chunk of head) yield chunk;
			for (;;) {
				const { done, value } = await reader.read();
				if (done) {
					completed = true;
					return;
				}
				const chunk = chunkToBytes(value);
				total += chunk.byteLength;
				if (total > maxBytes) throw tooLarge();
				yield chunk;
			}
		} finally {
			await close();
		}
	}
	return {
		data: chunks(),
		close
	};
}
/** Allowlist check for signed video download URLs (exact official https hosts only). */
function isAllowedVideoDownloadUrl(raw) {
	if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) return false;
	let url;
	try {
		url = new URL(raw);
	} catch {
		return false;
	}
	if (url.protocol !== "https:") return false;
	if (url.username.length > 0 || url.password.length > 0) return false;
	const host = url.hostname.toLowerCase();
	if (!ALLOWED_VIDEO_DOWNLOAD_HOSTS.includes(host)) return false;
	return url.port === "" || url.port === "443";
}
/**
* Attachment bytes reader for source images, mirroring the imagine-edit tool:
* a full reference goes through `readImage` (store-verified); a bare id falls
* back to the host object path plus a sha256 self-check.
*/
function createAttachmentBytesReader(resolveAttachments, label) {
	return async (attachment) => {
		const attachments = resolveAttachments();
		if (attachments === void 0) throw new Error(`${label}: the DSH attachment service is not mounted, so the source image cannot be read`);
		if (attachment.ref !== void 0 && typeof attachments.readImage === "function") {
			const data = (await attachments.readImage(attachment.ref))?.data;
			if (data instanceof Uint8Array && data.byteLength > 0) return data;
			throw new Error(`${label}: attachment ${attachment.attachmentId} returned no bytes`);
		}
		const hostPath = typeof attachments.imageHostPath === "function" ? attachments.imageHostPath({ attachmentId: attachment.attachmentId }) : void 0;
		if (typeof hostPath !== "string" || hostPath.length === 0) throw new Error(`${label}: attachment ${attachment.attachmentId} is not backed by a readable host object`);
		const info = await stat(hostPath);
		if (info.size > 20971520) throw new Error(`${label}: attachment ${attachment.attachmentId} is ${String(info.size)} bytes, over the ${String(DEFAULT_MAX_IMAGE_BYTES)}-byte limit`);
		const bytes = new Uint8Array(await readFile(hostPath));
		if (`sha256:${createHash("sha256").update(bytes).digest("hex")}` !== attachment.attachmentId) throw new Error(`${label}: attachment ${attachment.attachmentId} failed integrity verification`);
		return bytes;
	};
}
/** Drop an unread error body without buffering it (error text never echoes bodies). */
async function discardBody(response) {
	try {
		await response.body?.cancel();
	} catch {}
}
/** Stream a response body under a hard byte cap; overflow cancels the reader. */
async function readBoundedText(response, what) {
	const overLimit = () => /* @__PURE__ */ new Error(`${what} response body is over the ${String(MAX_JSON_RESPONSE_BYTES)}-byte limit`);
	const declared = response.headers?.get?.("content-length");
	if (declared !== null && declared !== void 0 && Number(declared) > MAX_JSON_RESPONSE_BYTES) {
		await discardBody(response);
		throw overLimit();
	}
	const reader = chunkReaderOf(response.body);
	if (reader === void 0) throw new Error(`${what} response body is not streamable; refusing unbounded buffering`);
	const chunks = [];
	let total = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			const chunk = chunkToBytes(value);
			total += chunk.byteLength;
			if (total > MAX_JSON_RESPONSE_BYTES) throw overLimit();
			chunks.push(chunk);
		}
	} catch (error) {
		await reader.cancel?.(error).catch(() => void 0);
		throw error;
	} finally {
		reader.releaseLock?.();
	}
	return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
}
async function readBoundedJson(response, what) {
	const text = await readBoundedText(response, what);
	let parsed;
	try {
		parsed = text.length === 0 ? {} : JSON.parse(text);
	} catch {
		throw new Error(`${what} response was not valid JSON`);
	}
	if (!isRecord$1(parsed)) throw new Error(`${what} response was not a JSON object`);
	return parsed;
}
var VideoTaskManager = class {
	options;
	fetchImpl;
	model;
	maxVideoBytes;
	disposeController = new AbortController();
	polls = /* @__PURE__ */ new Map();
	disposed = false;
	constructor(options) {
		if (!isRecord$1(options)) throw new TypeError("VideoTaskManager requires an options object");
		if (typeof options.tokens?.resolve !== "function") throw new TypeError("VideoTaskManager requires a tokens source");
		if (typeof options.resolveAttachments !== "function") throw new TypeError("VideoTaskManager requires resolveAttachments");
		if (options.identity !== void 0 && typeof options.identity !== "function") throw new TypeError("VideoTaskManager identity must be a function");
		if (options.storePath !== void 0 && (typeof options.storePath !== "string" || options.storePath.trim().length === 0)) throw new TypeError("VideoTaskManager storePath must be a non-empty string");
		this.model = typeof options.model === "string" && options.model.trim().length > 0 ? options.model.trim() : DEFAULT_VIDEO_MODEL;
		const maxVideoBytes = options.maxVideoBytes ?? 104857600;
		if (!Number.isSafeInteger(maxVideoBytes) || maxVideoBytes <= 0 || maxVideoBytes > 104857600) throw new TypeError(`VideoTaskManager maxVideoBytes must be an integer between 1 and ${String(MAX_VIDEO_MAX_BYTES)}`);
		this.maxVideoBytes = maxVideoBytes;
		this.fetchImpl = options.fetch ?? globalThis.fetch;
		this.options = options;
	}
	/** Submit one image-to-video task. POSTs exactly once; never re-POSTs an unknown outcome. */
	async generate(input, signal, source) {
		this.assertNotDisposed();
		if (!isRecord$1(input)) throw new TypeError("generate requires an input object");
		const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
		if (prompt.length === 0) throw new Error("prompt must be a non-empty string");
		if (prompt.length > MAX_PROMPT_CHARS) throw new Error(`prompt must be at most ${String(MAX_PROMPT_CHARS)} characters`);
		const imageSpec = typeof input.image === "string" ? input.image.trim() : "";
		if (imageSpec.length === 0) throw new Error("image must be a non-empty source (attachment handle, local path or data URI)");
		const duration = input.duration ?? void 0;
		if (duration !== void 0 && !SUPPORTED_VIDEO_DURATIONS.includes(duration)) throw new Error(`duration must be one of ${SUPPORTED_VIDEO_DURATIONS.join(", ")}`);
		const resolution = input.resolution ?? void 0;
		if (resolution !== void 0 && !SUPPORTED_VIDEO_RESOLUTIONS.includes(resolution)) throw new Error(`resolution must be one of ${SUPPORTED_VIDEO_RESOLUTIONS.join(", ")}`);
		signal?.throwIfAborted();
		const identity = await this.requireIdentity();
		const outputStore = this.options.resolveAttachments();
		if (outputStore === void 0 || typeof outputStore.saveFileStream !== "function") throw new Error("video generation requires file attachment storage before submitting a paid request");
		const readAttachmentBytes = createAttachmentBytesReader(this.options.resolveAttachments, "grok_video");
		const rejectLocalPaths = async () => {
			throw new Error("local source-image paths need the host filesystem; none was provided to grok_video");
		};
		const images = await resolveImageSources([imageSpec], {
			...source?.cwd === void 0 ? {} : { cwd: source.cwd },
			maxBytes: DEFAULT_MAX_IMAGE_BYTES,
			maxSourceImages: 1,
			readFile: source?.readFile ?? rejectLocalPaths,
			readAttachmentBytes
		});
		if (images[0].origin === "url") throw new Error("remote source-image URLs are not accepted in this version; use a session attachment, a local path or a data URI");
		const body = {
			model: this.model,
			prompt,
			image: { url: images[0].url }
		};
		if (duration !== void 0) body.duration = duration;
		if (resolution !== void 0) body.resolution = resolution;
		await this.assertIdentity(identity);
		const timed = withTimeout([signal, this.disposeController.signal], VIDEO_SUBMIT_TIMEOUT_MS, "video submission");
		try {
			const access = await waitForOperation(this.options.tokens.resolve(timed.signal), timed.signal);
			if (typeof access !== "string" || access.length === 0) throw new Error("grok_video_generate requires a SuperGrok/X OAuth sign-in (Settings → xAI Grok)");
			timed.signal.throwIfAborted();
			const post = (bearer) => fetchWithBearer(this.fetchImpl, XAI_VIDEO_GENERATIONS_URL, bearer, {
				method: "POST",
				redirect: "error",
				headers: {
					"content-type": "application/json",
					accept: "application/json",
					"user-agent": "dsh-grok-kit/0.2.9"
				},
				body: JSON.stringify(body),
				signal: timed.signal
			});
			const now = () => (/* @__PURE__ */ new Date()).toISOString();
			const startedAt = now();
			const base = {
				taskId: randomUUID(),
				identity,
				state: "submission-unknown",
				model: this.model,
				createdAt: startedAt,
				updatedAt: startedAt,
				prompt,
				...duration === void 0 ? {} : { duration },
				...resolution === void 0 ? {} : { resolution },
				error: "submission started; outcome not recorded yet (never re-POSTed automatically)"
			};
			await this.assertIdentity(identity);
			await this.persistRecord(identity, base);
			const update = async (patch) => {
				const record = {
					...base,
					...patch,
					updatedAt: now()
				};
				if (record.state === "pending") delete record.error;
				await this.assertIdentity(identity);
				await this.persistRecord(identity, record);
				return toResult(record);
			};
			try {
				await this.assertIdentity(identity);
				let response = await post(access);
				if (response.status === 401 && this.options.tokens.refresh !== void 0) {
					const refreshed = await this.options.tokens.refresh(access, timed.signal);
					if (typeof refreshed === "string" && refreshed.length > 0 && refreshed !== access) {
						await this.assertIdentity(identity);
						response = await post(refreshed);
					}
				}
				if (!response.ok) {
					await discardBody(response);
					const detail = `HTTP ${String(response.status)}`;
					if (response.status === 403) this.emitCapability(identity, "restricted", response.status, detail);
					else this.emitCapability(identity, "temporary-error", response.status, detail);
					if (response.status >= 500) return await update({
						state: "submission-unknown",
						error: `submission result unknown (${detail}); never re-POSTed automatically to avoid double billing`
					});
					return await update({
						state: "failed",
						error: `xAI video submission failed (${detail})`
					});
				}
				const parsed = await readBoundedJson(response, "video submission");
				const requestId = typeof parsed.request_id === "string" ? parsed.request_id.trim() : "";
				if (!REQUEST_ID_PATTERN.test(requestId)) {
					this.emitCapability(identity, "available", 200, void 0);
					return await update({
						state: "submission-unknown",
						error: "submission response carried no usable request id; never re-POSTed automatically to avoid double billing"
					});
				}
				this.emitCapability(identity, "available", 200, void 0);
				return await update({
					state: "pending",
					requestId
				});
			} catch (error) {
				const record = await update({
					state: "submission-unknown",
					error: `submission result unknown (${errorText(error)}); never re-POSTed automatically to avoid double billing`
				});
				this.emitCapability(identity, "temporary-error", void 0, "video submission outcome unknown");
				if (signal?.aborted === true) throw signal.reason;
				return record;
			}
		} finally {
			timed.cancel();
		}
	}
	/** One status poll (concurrent calls for one task merge into a single poll/download). */
	async status(taskId, signal) {
		this.assertNotDisposed();
		const id = typeof taskId === "string" ? taskId.trim() : "";
		if (id.length === 0 || id.length > 128) throw new Error("task_id must be a non-empty task id");
		const identity = await this.requireIdentity();
		const key = `${identity}:${id}`;
		signal?.throwIfAborted();
		let operation = this.polls.get(key);
		if (operation === void 0) {
			const controller = new AbortController();
			const created = {
				controller,
				waiters: 0,
				settled: false,
				promise: this.runStatus(identity, id, controller.signal).finally(() => {
					created.settled = true;
					if (this.polls.get(key) === created) this.polls.delete(key);
				})
			};
			this.polls.set(key, created);
			operation = created;
		}
		operation.waiters += 1;
		try {
			const result = await waitForOperation(operation.promise, signal);
			await this.assertIdentity(identity);
			return result;
		} finally {
			operation.waiters -= 1;
			if (operation.waiters === 0 && !operation.settled) operation.controller.abort(/* @__PURE__ */ new Error("All video status waiters cancelled"));
		}
	}
	/** Resume is the same single-poll continuation as status (frozen contract). */
	async resume(taskId, signal) {
		return this.status(taskId, signal);
	}
	/** Local-only listing: reads the store, never the network. */
	async list() {
		this.assertNotDisposed();
		const identity = await this.optionalIdentity();
		if (identity === void 0) return [];
		const mine = await this.readRecordsFor(identity);
		await this.assertIdentity(identity);
		return mine.map(toResult).sort((a, b) => a.createdAt === b.createdAt ? a.taskId.localeCompare(b.taskId) : b.createdAt.localeCompare(a.createdAt));
	}
	/**
	* Cancel local operations only. The remote generation is NOT cancelled and
	* may still complete and bill the account; persisted tasks stay for restart.
	*/
	async dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.disposeController.abort(/* @__PURE__ */ new Error("VideoTaskManager was disposed"));
		this.polls.clear();
	}
	assertNotDisposed() {
		if (this.disposed) throw new Error("VideoTaskManager is disposed");
	}
	async optionalIdentity() {
		if (this.options.identity === void 0) return void 0;
		const identity = await this.options.identity();
		if (typeof identity !== "string" || identity.trim().length === 0) return void 0;
		return identity;
	}
	/** Fail closed: without a stable account identity no task data may be touched. */
	async requireIdentity() {
		const identity = await this.optionalIdentity();
		if (identity === void 0) throw new Error("video tasks require a stable OAuth identity; none is available (fail closed)");
		return identity;
	}
	/** Re-check the identity; a mid-operation account switch aborts the operation. */
	async assertIdentity(expected) {
		if (await this.requireIdentity() !== expected) throw new Error("video task identity changed during the operation; aborted to keep accounts isolated");
	}
	emitCapability(identity, state, httpStatus, message) {
		const onCapability = this.options.onCapability;
		if (typeof onCapability !== "function") return;
		const event = {
			identity,
			state,
			checkedAt: (/* @__PURE__ */ new Date()).toISOString(),
			model: this.model,
			...httpStatus === void 0 ? {} : { httpStatus },
			...message === void 0 || message.length === 0 ? {} : { message: errorText(message) }
		};
		try {
			onCapability(event);
		} catch {}
	}
	async storeFileFor(identity) {
		const explicit = this.options.storePath;
		if (explicit !== void 0 && explicit.trim().length > 0) return resolve(explicit);
		const digest = createHash("sha256").update(identity).digest("hex").slice(0, 16);
		return resolve(join(resolveDshHome(), STORE_DIRNAME, `video-tasks-${digest}.json`));
	}
	/** Bounded, lock-free read of one identity's records (others' records are never returned). */
	async readRecordsFor(identity) {
		const file = await this.storeFileFor(identity);
		let text;
		try {
			if ((await stat(file)).size > MAX_STORE_BYTES) throw new Error(`video task store exceeds the ${String(MAX_STORE_BYTES)}-byte read limit (${file})`);
			text = await readFile(file, "utf8");
		} catch (error) {
			if (error?.code === "ENOENT") return [];
			throw error;
		}
		let parsed;
		try {
			parsed = JSON.parse(text);
		} catch {
			throw new Error(`video task store is corrupt JSON (${file})`);
		}
		if (!isRecord$1(parsed) || parsed.version !== STORE_VERSION || !Array.isArray(parsed.tasks)) throw new Error(`video task store has an unsupported shape (${file})`);
		return parsed.tasks.map(sanitizeRecord).filter((record) => record !== void 0 && record.identity === identity);
	}
	/** Read-modify-write under the cross-process lock, with identity partitioning and retention. */
	async persistRecord(identity, record) {
		const file = await this.storeFileFor(identity);
		await mkdir(dirname(file), {
			recursive: true,
			mode: 448
		});
		await withFileLock(file, async () => {
			const all = await this.readAllRecords(file);
			const others = all.filter((candidate) => candidate.identity !== identity);
			const replaced = all.filter((candidate) => candidate.identity === identity).filter((candidate) => candidate.taskId !== record.taskId);
			replaced.unshift(record);
			const newest = replaced.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, MAX_STORE_TASKS);
			const pruned = [...others, ...newest];
			const serialized = `${JSON.stringify({
				version: STORE_VERSION,
				tasks: pruned
			}, null, 2)}\n`;
			if (Buffer.byteLength(serialized, "utf8") > MAX_STORE_BYTES) throw new Error(`video task store would exceed the ${String(MAX_STORE_BYTES)}-byte limit`);
			await writeFileAtomic(file, serialized, {
				mode: 384,
				dirMode: 448
			});
		}, { waitMs: 1e4 });
	}
	async readAllRecords(file) {
		try {
			if ((await stat(file)).size > MAX_STORE_BYTES) throw new Error(`video task store exceeds the ${String(MAX_STORE_BYTES)}-byte read limit (${file})`);
			const text = await readFile(file, "utf8");
			const parsed = JSON.parse(text);
			if (!isRecord$1(parsed) || parsed.version !== STORE_VERSION || !Array.isArray(parsed.tasks)) throw new Error(`video task store has an unsupported shape (${file})`);
			return parsed.tasks.map(sanitizeRecord).filter((record) => record !== void 0);
		} catch (error) {
			if (error?.code === "ENOENT") return [];
			if (error instanceof SyntaxError) throw new Error(`video task store is corrupt JSON (${file})`);
			throw error;
		}
	}
	async runStatus(identity, taskId, signal) {
		await this.assertIdentity(identity);
		const record = (await this.readRecordsFor(identity)).find((candidate) => candidate.taskId === taskId);
		if (record === void 0) throw new Error(`unknown video task ${JSON.stringify(taskId)}`);
		if (record.state === "done" || record.state === "failed" || record.state === "submission-unknown") return toResult(record);
		if (record.requestId === void 0) {
			const updated = {
				...record,
				state: "interrupted",
				updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
				error: "task has no usable remote request id; resume cannot continue"
			};
			await this.assertIdentity(identity);
			await this.persistRecord(identity, updated);
			return toResult(updated);
		}
		const pollTimed = withTimeout([signal, this.disposeController.signal], VIDEO_POLL_TIMEOUT_MS, "video status check");
		let parsed;
		try {
			await this.assertIdentity(identity);
			const access = await waitForOperation(this.options.tokens.resolve(pollTimed.signal), pollTimed.signal);
			if (typeof access !== "string" || access.length === 0) throw new Error("grok_video_status requires a SuperGrok/X OAuth sign-in (Settings → xAI Grok)");
			const get = (bearer) => fetchWithBearer(this.fetchImpl, xaiVideoStatusUrl(record.requestId), bearer, {
				method: "GET",
				redirect: "error",
				headers: {
					accept: "application/json",
					"user-agent": "dsh-grok-kit/0.2.9"
				},
				signal: pollTimed.signal
			});
			await this.assertIdentity(identity);
			let response = await get(access);
			if (response.status === 401 && this.options.tokens.refresh !== void 0) {
				const refreshed = await this.options.tokens.refresh(access, pollTimed.signal);
				if (typeof refreshed === "string" && refreshed.length > 0 && refreshed !== access) {
					await this.assertIdentity(identity);
					response = await get(refreshed);
				}
			}
			if (!response.ok) {
				await discardBody(response);
				const detail = `HTTP ${String(response.status)}`;
				if (response.status === 403) this.emitCapability(identity, "restricted", response.status, detail);
				else this.emitCapability(identity, "temporary-error", response.status, detail);
				const updated = {
					...record,
					state: "interrupted",
					updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
					error: `status check failed (${detail}); call resume to retry`
				};
				await this.assertIdentity(identity);
				await this.persistRecord(identity, updated);
				return toResult(updated);
			}
			parsed = await readBoundedJson(response, "video status");
		} catch (error) {
			if (signal?.aborted === true || this.disposeController.signal.aborted) {
				await this.markInterruptedQuietly(identity, record, `cancelled locally (${errorText(error)}); the remote generation is NOT cancelled`);
				throw signal?.aborted ? signal.reason : this.disposeController.signal.reason;
			}
			this.emitCapability(identity, "temporary-error", void 0, "video status check failed");
			const updated = {
				...record,
				state: "interrupted",
				updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
				error: `${errorText(error)}; call resume to retry`
			};
			await this.assertIdentity(identity);
			await this.persistRecord(identity, updated);
			return toResult(updated);
		} finally {
			pollTimed.cancel();
		}
		const remoteStatus = typeof parsed.status === "string" ? parsed.status.trim() : "";
		if (remoteStatus === "failed" || remoteStatus === "expired") {
			this.emitCapability(identity, "available", 200, void 0);
			const updated = {
				...record,
				state: "failed",
				updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
				error: `video generation ${remoteStatus}`
			};
			await this.assertIdentity(identity);
			await this.persistRecord(identity, updated);
			return toResult(updated);
		}
		if (remoteStatus !== "done") {
			if (remoteStatus === "pending") {
				this.emitCapability(identity, "available", 200, void 0);
				const updated = {
					...record,
					state: "pending",
					updatedAt: (/* @__PURE__ */ new Date()).toISOString()
				};
				delete updated.error;
				await this.assertIdentity(identity);
				await this.persistRecord(identity, updated);
				return toResult(updated);
			}
			this.emitCapability(identity, "temporary-error", void 0, "unexpected video status");
			const updated = {
				...record,
				state: "interrupted",
				updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
				error: "unexpected video status; call resume to retry"
			};
			await this.assertIdentity(identity);
			await this.persistRecord(identity, updated);
			return toResult(updated);
		}
		this.emitCapability(identity, "available", 200, void 0);
		return this.downloadCompleted(identity, record, parsed, signal);
	}
	/** Download the finished MP4 (token-free, allowlisted host, bounded, signature-checked) and store it. */
	async downloadCompleted(identity, record, parsed, signal) {
		const video = isRecord$1(parsed.video) ? parsed.video : void 0;
		const remoteUrl = typeof video?.url === "string" ? video.url : "";
		const startedAt = (/* @__PURE__ */ new Date()).toISOString();
		if (!isAllowedVideoDownloadUrl(remoteUrl)) {
			const updated = {
				...record,
				state: "interrupted",
				updatedAt: startedAt,
				error: "completed video URL is missing or not on the allowed official host; call resume to retry"
			};
			await this.assertIdentity(identity);
			await this.persistRecord(identity, updated);
			return toResult(updated);
		}
		const downloading = {
			...record,
			state: "downloading",
			updatedAt: startedAt
		};
		await this.assertIdentity(identity);
		await this.persistRecord(identity, downloading);
		const attachments = this.options.resolveAttachments();
		if (attachments === void 0 || typeof attachments.saveFileStream !== "function") {
			const updated = {
				...downloading,
				state: "interrupted",
				updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
				error: "the DSH attachment service cannot store the finished video; call resume to retry"
			};
			await this.assertIdentity(identity);
			await this.persistRecord(identity, updated);
			return toResult(updated);
		}
		const timed = withTimeout([signal, this.disposeController.signal], VIDEO_DOWNLOAD_TIMEOUT_MS, "video download");
		let stream;
		try {
			const response = await this.fetchImpl(remoteUrl, {
				method: "GET",
				redirect: "error",
				headers: {
					accept: "video/mp4",
					"user-agent": "dsh-grok-kit/0.2.9"
				},
				signal: timed.signal
			});
			if (!response.ok) {
				await discardBody(response);
				throw new Error(`video download failed (HTTP ${String(response.status)})`);
			}
			const reader = chunkReaderOf(response.body);
			if (reader === void 0) {
				await discardBody(response);
				throw new Error("video download body is not streamable; refusing unbounded buffering");
			}
			stream = verifiedMp4Stream(reader, this.maxVideoBytes);
			const attachment = await attachments.saveFileStream({
				data: stream.data,
				name: `grok-video-${record.taskId.slice(0, 8)}.mp4`,
				...timed.signal === void 0 ? {} : { signal: timed.signal }
			});
			await this.assertIdentity(identity);
			const updated = {
				...downloading,
				state: "done",
				updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
				attachment
			};
			delete updated.error;
			await this.persistRecord(identity, updated);
			return toResult(updated);
		} catch (error) {
			if (signal?.aborted === true) {
				await this.markInterruptedQuietly(identity, downloading, `cancelled locally (${errorText(error)}); the remote generation is NOT cancelled`);
				throw signal.reason;
			}
			if (this.disposeController.signal.aborted) {
				await this.markInterruptedQuietly(identity, downloading, `manager disposed mid-download (${errorText(error)}); call resume after restart to retry`);
				throw this.disposeController.signal.reason;
			}
			const updated = {
				...downloading,
				state: "interrupted",
				updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
				error: `${errorText(error)}; call resume to retry`
			};
			await this.assertIdentity(identity);
			await this.persistRecord(identity, updated);
			return toResult(updated);
		} finally {
			try {
				await stream?.close();
			} finally {
				timed.cancel();
			}
		}
	}
	/** Best-effort interrupted mark used on cancellation paths (an identity switch just drops it). */
	async markInterruptedQuietly(identity, record, message) {
		try {
			await this.assertIdentity(identity);
			await this.persistRecord(identity, {
				...record,
				state: "interrupted",
				updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
				error: message.slice(0, MAX_ERROR_CHARS)
			});
		} catch {}
	}
};
//#endregion
//#region src/video-tools.ts
const GENERATE_TOOL = "grok_video_generate";
const STATUS_TOOL = "grok_video_status";
const RESUME_TOOL = "grok_video_resume";
const BILLING_NOTE = "Submitting starts a paid xAI video generation: stopping/aborting this tool only stops waiting, it does NOT cancel the remote generation and does not stop billing. Use grok_video_status later to fetch the result.";
function isNonEmptyString(value) {
	return typeof value === "string" && value.trim().length > 0;
}
/** Model-facing summary text; carries the full file attachment reference when done. */
function renderTaskText(result) {
	const lines = [`Video task ${result.taskId} is ${result.state} (model ${result.model}).`, `Prompt: ${result.prompt.length > 200 ? `${result.prompt.slice(0, 200)}…` : result.prompt}`];
	if (result.duration !== void 0 || result.resolution !== void 0) lines.push(`Output: ${result.duration === void 0 ? "default duration" : `${String(result.duration)}s`}${result.resolution === void 0 ? "" : ` ${result.resolution}`}.`);
	if (result.state === "done" && result.attachment !== void 0) {
		lines.push(`Video saved. attachmentId=${result.attachment.attachmentId}`);
		lines.push(`attachment=${JSON.stringify(result.attachment)}`);
		lines.push("Use the host file tools to export the attachment; the remote download URL is intentionally not exposed.");
	}
	if (result.state === "pending" || result.state === "downloading") lines.push("Still processing upstream: call grok_video_status later (one poll per call).");
	if (result.state === "interrupted") lines.push("Interrupted locally: call grok_video_resume to retry the check/download.");
	if (result.state === "submission-unknown") lines.push("Submission outcome unknown and NO request id was recorded: grok_video_status cannot recover or poll this task — it only reports it as unknown. Do NOT submit the same request again and do NOT keep polling this task.");
	if (result.state === "failed") lines.push("Generation failed upstream.");
	if (result.error !== void 0) lines.push(`Error: ${result.error}`);
	lines.push("Stopping the wait is not cancelling: the remote generation keeps running and may still bill.");
	return lines.join(" ");
}
function valueFromResult(result) {
	const value = {
		text: renderTaskText(result),
		taskId: result.taskId,
		state: result.state,
		model: result.model,
		createdAt: result.createdAt,
		updatedAt: result.updatedAt,
		prompt: result.prompt
	};
	if (result.duration !== void 0) value.duration = result.duration;
	if (result.resolution !== void 0) value.resolution = result.resolution;
	if (result.attachment !== void 0) value.attachment = result.attachment;
	if (result.error !== void 0) value.error = result.error;
	return value;
}
/** The presentationMeta projection: exactly the VideoTaskResult (no text, no remote URL). */
function taskResultFromValue(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return void 0;
	const record = value;
	if (!isNonEmptyString(record.taskId) || !isNonEmptyString(record.state) || !isNonEmptyString(record.model) || !isNonEmptyString(record.createdAt) || !isNonEmptyString(record.updatedAt) || !isNonEmptyString(record.prompt)) return;
	const result = {
		taskId: record.taskId,
		state: record.state,
		model: record.model,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
		prompt: record.prompt
	};
	if (typeof record.duration === "number") result.duration = record.duration;
	if (typeof record.resolution === "string") result.resolution = record.resolution;
	if (record.attachment !== null && typeof record.attachment === "object" && !Array.isArray(record.attachment)) {
		const attachment = record.attachment;
		if (isNonEmptyString(attachment.attachmentId) && isNonEmptyString(attachment.name) && typeof attachment.bytes === "number") result.attachment = {
			attachmentId: attachment.attachmentId,
			name: attachment.name,
			bytes: attachment.bytes
		};
	}
	if (typeof record.error === "string") result.error = record.error;
	return result;
}
/**
* Model-facing render: the summary text always (including the full file
* attachment reference) plus the real harness FileBlock for a done task, so the
* session log can reference the stored attachment. Never a fictional video block.
*/
function renderOutput(_args, raw) {
	const value = raw;
	const blocks = [{
		type: "text",
		text: String(value?.text ?? "")
	}];
	const task = taskResultFromValue(value);
	if (task?.attachment !== void 0) blocks.push({
		type: "file",
		attachment: task.attachment
	});
	return blocks;
}
const OUTPUT_SCHEMA = {
	type: "object",
	additionalProperties: false,
	properties: {
		text: { type: "string" },
		taskId: { type: "string" },
		state: { type: "string" },
		model: { type: "string" },
		createdAt: { type: "string" },
		updatedAt: { type: "string" },
		prompt: { type: "string" },
		duration: { type: "number" },
		resolution: { type: "string" },
		attachment: {
			type: "object",
			additionalProperties: false,
			properties: {
				attachmentId: { type: "string" },
				name: { type: "string" },
				bytes: { type: "number" }
			}
		},
		error: { type: "string" }
	}
};
/**
* Register the three video tools. The manager is supplied by the host entry
* (feature-flagged there); this layer only adapts tool IO.
*/
function applyGrokVideoTools(ctx, options) {
	const manager = options.manager;
	if (manager === void 0 || typeof manager.generate !== "function") throw new TypeError("applyGrokVideoTools requires a VideoTaskManager");
	const taskTitle = (args, fallback) => {
		const prompt = args?.prompt;
		if (typeof prompt === "string" && prompt.trim().length > 0) return prompt.trim().length > 80 ? `${prompt.trim().slice(0, 80)}…` : prompt.trim();
		const taskId = args?.task_id;
		if (typeof taskId === "string" && taskId.trim().length > 0) return `video ${taskId.trim()}`;
		return fallback;
	};
	ctx.tools.register(defineTool({
		name: GENERATE_TOOL,
		description: `Generate a short video from one source image with xAI Imagine Video (POST /v1/videos/generations, image-to-video, SuperGrok / X Premium subscription). The source image may be a DSH attachment reference from this session (pass the attachmentId=sha256:... handle or the full attachment={...} JSON that read_image / view_image returns), a local file path, or a base64 data URI (PNG/JPEG/WebP); remote http(s) image URLs are rejected in this version. ${BILLING_NOTE} Returns the task; when done the tool result carries the full file attachment reference of the saved MP4.`,
		parameters: {
			prompt: {
				type: "string",
				required: true,
				description: "Text prompt describing how the still image should animate, e.g. \"Make the water crash down and slowly pan out the camera\"."
			},
			image: {
				type: "string",
				required: true,
				description: "Source image: a session attachment from read_image / view_image (attachmentId=sha256:... or the whole attachment={...} JSON line), a local file path, or a base64 data URI (PNG/JPEG/WebP). Remote http(s) URLs are rejected in this version."
			},
			duration: {
				type: "number",
				description: `Video duration in seconds: ${SUPPORTED_VIDEO_DURATIONS.join(" or ")} (default 6).`
			},
			resolution: {
				type: "string",
				description: `Output resolution: ${SUPPORTED_VIDEO_RESOLUTIONS.join(" or ")} (default 480p).`
			}
		},
		output: {
			schema: OUTPUT_SCHEMA,
			presentationMeta: (_args, value) => {
				return taskResultFromValue(value) ?? { ...value };
			},
			render: renderOutput
		},
		isConcurrencySafe: () => true,
		presentCall: (args) => ({
			card: "generic",
			title: taskTitle(args, GENERATE_TOOL),
			kind: "other"
		}),
		presentResult: (args, result) => {
			if (result.isError) return void 0;
			const task = taskResultFromValue(result?.meta);
			if (task?.attachment === void 0) return void 0;
			return {
				card: "generic",
				title: taskTitle(args, GENERATE_TOOL),
				content: [{
					type: "file",
					attachment: task.attachment
				}]
			};
		},
		async execute(args, exec) {
			assertMediaEnabled(options.enabled, GENERATE_TOOL);
			const prompt = isNonEmptyString(args?.prompt) ? args.prompt.trim() : "";
			if (prompt.length === 0) throw new Error("prompt must be a non-empty string");
			const image = isNonEmptyString(args?.image) ? args.image.trim() : "";
			if (image.length === 0) throw new Error("image must be a non-empty source (attachment handle, local path or data URI)");
			const duration = args?.duration ?? 6;
			if (typeof duration !== "number" || !SUPPORTED_VIDEO_DURATIONS.includes(duration)) throw new Error(`duration must be one of ${SUPPORTED_VIDEO_DURATIONS.join(", ")}`);
			const resolution = args?.resolution ?? "480p";
			if (typeof resolution !== "string" || !SUPPORTED_VIDEO_RESOLUTIONS.includes(resolution)) throw new Error(`resolution must be one of ${SUPPORTED_VIDEO_RESOLUTIONS.join(", ")}`);
			const cwd = exec.agent?.session?.header?.cwd;
			const result = await manager.generate({
				prompt,
				image,
				duration,
				resolution
			}, exec.signal, {
				...cwd === void 0 ? {} : { cwd },
				readFile: async (path) => {
					const fs = exec.agent?.ctx?.fs ?? ctx.fs;
					if (fs === void 0) throw new Error("grok_video_generate: the DSH filesystem service is required for local source images");
					const target = await fs.resolve(path, {
						cwd,
						signal: exec.signal
					});
					return fs.readBytes(target, exec.signal, DEFAULT_MAX_IMAGE_BYTES);
				}
			});
			ctx.logger?.info?.(`${GENERATE_TOOL}: task ${result.taskId} is ${result.state}`);
			return valueFromResult(result);
		}
	}));
	const registerStatusTool = (name, run, description) => {
		ctx.tools.register(defineTool({
			name,
			description,
			parameters: { task_id: {
				type: "string",
				required: true,
				description: "Task id returned by grok_video_generate."
			} },
			output: {
				schema: OUTPUT_SCHEMA,
				presentationMeta: (_args, value) => {
					return taskResultFromValue(value) ?? { ...value };
				},
				render: renderOutput
			},
			isConcurrencySafe: () => true,
			presentCall: (args) => ({
				card: "generic",
				title: taskTitle(args, name),
				kind: "other"
			}),
			presentResult: (args, result) => {
				if (result.isError) return void 0;
				const task = taskResultFromValue(result?.meta);
				if (task?.attachment === void 0) return void 0;
				return {
					card: "generic",
					title: taskTitle(args, name),
					content: [{
						type: "file",
						attachment: task.attachment
					}]
				};
			},
			async execute(args, exec) {
				assertMediaEnabled(options.enabled, name);
				const taskId = isNonEmptyString(args?.task_id) ? args.task_id.trim() : "";
				if (taskId.length === 0) throw new Error("task_id must be a non-empty task id");
				const result = await run(taskId, exec.signal);
				ctx.logger?.info?.(`${name}: task ${result.taskId} is ${result.state}`);
				return valueFromResult(result);
			}
		}));
	};
	registerStatusTool(STATUS_TOOL, (taskId, signal) => manager.status(taskId, signal), `Check one xAI video task with a single poll (GET /v1/videos/{request_id}); a done task downloads the MP4 into the DSH attachment store once and never re-downloads. ${BILLING_NOTE} Local errors are reported as an interrupted state that grok_video_resume can retry.`);
	registerStatusTool(RESUME_TOOL, (taskId, signal) => manager.resume(taskId, signal), `Continue one xAI video task after an interruption or restart (same single-poll logic as grok_video_status). Unknown submission results are never re-POSTed here. ${BILLING_NOTE}`);
	ctx.logger?.info?.(`dsh-grok-kit: registered ${GENERATE_TOOL}, ${STATUS_TOOL}, ${RESUME_TOOL}`);
}
//#endregion
//#region src/capability-routes.ts
const GROK_CAPABILITIES_PATH = "/plugins/dsh-grok-kit/capabilities";
const GROK_VIDEO_TASKS_PATH = "/plugins/dsh-grok-kit/video/tasks";
const GROK_VIDEO_RESUME_PATH = "/plugins/dsh-grok-kit/video/resume";
function trustedRequest$1(req) {
	return isTrustedRequest(req.socket.remoteAddress, req.headers, req.method ?? "GET");
}
function json$1(res, status, value) {
	if (res.destroyed) return;
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
		"x-content-type-options": "nosniff"
	});
	res.end(JSON.stringify(value));
}
function guarded(handler) {
	return async (req, res) => {
		try {
			await handler(req, res);
		} catch (error) {
			const status = errorStatus(error);
			json$1(res, status, { error: status === 413 ? "request body too large" : status === 400 ? "invalid video task request" : "video task request failed" });
		}
	};
}
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseResumeBody(body) {
	if (!isRecord(body) || Object.keys(body).length !== 1 || !("taskId" in body)) return void 0;
	return typeof body.taskId === "string" && UUID_PATTERN.test(body.taskId) ? { taskId: body.taskId } : void 0;
}
/** Defense-in-depth projection: adding internal task fields must never expand the Web response. */
function publicTask(value) {
	if (!isRecord(value) || typeof value.taskId !== "string" || !UUID_PATTERN.test(value.taskId)) throw new Error("invalid task summary");
	const result = {};
	for (const key of [
		"taskId",
		"state",
		"model",
		"createdAt",
		"updatedAt",
		"prompt",
		"resolution"
	]) if (typeof value[key] === "string") result[key] = value[key];
	if (typeof value.duration === "number" && Number.isSafeInteger(value.duration)) result.duration = value.duration;
	if (typeof value.error === "string") result.error = sanitizeDiagnosticMessage(value.error);
	const ref = value.attachment;
	if (isRecord(ref) && typeof ref.attachmentId === "string" && typeof ref.name === "string" && typeof ref.bytes === "number" && Number.isSafeInteger(ref.bytes) && ref.bytes > 0) result.attachment = {
		attachmentId: ref.attachmentId,
		name: ref.name,
		bytes: ref.bytes
	};
	return result;
}
function registerGrokCapabilityRoutes(ctx, options) {
	const { tracker } = options;
	const videoEnabled = () => typeof options.videoEnabled === "function" ? options.videoEnabled() : options.videoEnabled;
	const resumeAborts = /* @__PURE__ */ new Set();
	const unchanged = async (identity) => options.identity === void 0 || identity !== void 0 && await options.identity() === identity;
	ctx.effect(() => {
		const routes = [
			ctx.webServer.register({
				kind: "exact",
				path: GROK_CAPABILITIES_PATH,
				handler: guarded(async (req, res) => {
					if (req.method !== "GET") return json$1(res, 405, { error: "method not allowed" });
					if (!trustedRequest$1(req)) return json$1(res, 403, { error: "forbidden" });
					if (!await options.authenticated()) tracker.reset();
					json$1(res, 200, tracker.snapshot(videoEnabled()));
				})
			}),
			ctx.webServer.register({
				kind: "exact",
				path: GROK_VIDEO_TASKS_PATH,
				handler: guarded(async (req, res) => {
					if (req.method !== "GET") return json$1(res, 405, { error: "method not allowed" });
					if (!trustedRequest$1(req)) return json$1(res, 403, { error: "forbidden" });
					if (!videoEnabled()) return json$1(res, 409, { error: "video is disabled by the plugin configuration" });
					if (!await options.authenticated()) {
						tracker.reset();
						return json$1(res, 403, { error: "forbidden" });
					}
					const identity = await options.identity?.();
					const tasks = await options.tasks();
					if (!await unchanged(identity)) return json$1(res, 403, { error: "account changed or cannot be identified" });
					json$1(res, 200, { tasks: tasks.map(publicTask) });
				})
			}),
			ctx.webServer.register({
				kind: "exact",
				path: GROK_VIDEO_RESUME_PATH,
				handler: guarded(async (req, res) => {
					if (req.method !== "POST") return json$1(res, 405, { error: "method not allowed" });
					if (!trustedRequest$1(req)) return json$1(res, 403, { error: "forbidden" });
					if (!videoEnabled()) return json$1(res, 409, { error: "video is disabled by the plugin configuration" });
					if (!await options.authenticated()) {
						tracker.reset();
						return json$1(res, 403, { error: "forbidden" });
					}
					const parsed = parseResumeBody(await readJson(req));
					if (parsed === void 0) return json$1(res, 400, { error: "body must be exactly { taskId: <uuid> }" });
					const identity = await options.identity?.();
					if (!await unchanged(identity)) return json$1(res, 403, { error: "account cannot be identified" });
					if (!videoEnabled()) return json$1(res, 409, { error: "video is disabled by the plugin configuration" });
					const abort = new AbortController();
					resumeAborts.add(abort);
					const onClose = () => {
						if (!res.writableEnded) abort.abort(/* @__PURE__ */ new Error("client disconnected"));
					};
					res.on("close", onClose);
					try {
						const result = await options.resume(parsed.taskId, abort.signal);
						if (!await unchanged(identity)) return json$1(res, 403, { error: "account changed" });
						json$1(res, 200, publicTask(result));
					} finally {
						res.off("close", onClose);
						resumeAborts.delete(abort);
					}
				})
			})
		];
		return () => {
			for (const abort of resumeAborts) abort.abort(/* @__PURE__ */ new Error("capability routes disposed"));
			resumeAborts.clear();
			for (const dispose of routes) dispose();
		};
	}, "dsh-grok-kit: capability routes");
}
//#endregion
//#region src/video-file-route.ts
function fail(res, status, error) {
	if (res.destroyed) return;
	if (res.headersSent) {
		res.destroy();
		return;
	}
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
		"x-content-type-options": "nosniff"
	});
	res.end(JSON.stringify({ error }));
}
async function drain(res, signal) {
	signal.throwIfAborted();
	await new Promise((resolve, reject) => {
		const clean = () => {
			res.off("drain", onDrain);
			res.off("close", onClose);
			signal.removeEventListener("abort", onAbort);
		};
		const onDrain = () => {
			clean();
			resolve();
		};
		const onClose = () => {
			clean();
			reject(/* @__PURE__ */ new Error("download closed"));
		};
		const onAbort = () => {
			clean();
			reject(signal.reason);
		};
		res.once("drain", onDrain);
		res.once("close", onClose);
		signal.addEventListener("abort", onAbort, { once: true });
		if (res.destroyed) onClose();
		else if (signal.aborted) onAbort();
	});
}
function registerGrokVideoFileRoute(ctx, options) {
	const enabled = () => typeof options.enabled === "function" ? options.enabled() : options.enabled;
	const active = /* @__PURE__ */ new Set();
	let disposed = false;
	ctx.effect(() => {
		const unregister = ctx.webServer.register({
			kind: "exact",
			path: GROK_VIDEO_FILE_PATH,
			handler: async (req, res) => {
				if (req.method !== "GET") return fail(res, 405, "method not allowed");
				if (!isTrustedRequest(req.socket.remoteAddress, req.headers, req.method)) return fail(res, 403, "forbidden");
				if (disposed) return fail(res, 503, "video downloads are unavailable");
				if (!enabled()) return fail(res, 409, "video generation is disabled");
				const controller = new AbortController();
				const signal = controller.signal;
				active.add(controller);
				const onClose = () => {
					if (!res.writableEnded) controller.abort(/* @__PURE__ */ new Error("client disconnected"));
				};
				res.on("close", onClose);
				try {
					const url = new URL(req.url ?? "", "http://localhost");
					const ids = url.searchParams.getAll("taskId");
					if (ids.length !== 1 || [...url.searchParams.keys()].some((key) => key !== "taskId") || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ids[0])) return fail(res, 400, "a single taskId UUID is required");
					const identity = await options.identity();
					if (identity === void 0) return fail(res, 403, "sign in with an identifiable xAI account");
					const task = (await options.tasks()).find((candidate) => candidate.taskId === ids[0]);
					signal.throwIfAborted();
					if (await options.identity() !== identity) return fail(res, 403, "account changed");
					if (!enabled()) return fail(res, 409, "video generation is disabled");
					if (task === void 0) return fail(res, 404, "video task not found");
					if (task.state !== "done" || task.attachment === void 0) return fail(res, 409, "video is not saved yet");
					const maxBytes = options.maxBytes ?? 104857600;
					const ref = task.attachment;
					if (!Number.isSafeInteger(ref.bytes) || ref.bytes <= 0 || ref.bytes > maxBytes) return fail(res, 413, "video exceeds the download limit");
					const attachments = options.resolveAttachments();
					if (attachments === void 0) return fail(res, 503, "file attachment storage is unavailable");
					let total = 0;
					for await (const chunk of attachments.readFileStream(ref, signal)) {
						signal.throwIfAborted();
						if (await options.identity() !== identity) throw new Error("account changed");
						if (!(chunk instanceof Uint8Array)) throw new Error("invalid attachment chunk");
						total += chunk.byteLength;
						if (total > maxBytes || total > ref.bytes) throw new Error("video exceeds the download limit");
						if (chunk.byteLength === 0) continue;
						if (!res.headersSent) res.writeHead(200, {
							"content-type": "video/mp4",
							"content-disposition": `attachment; filename="grok-video-${task.taskId}.mp4"`,
							"cache-control": "no-store",
							"x-content-type-options": "nosniff"
						});
						if (!res.write(chunk)) await drain(res, signal);
					}
					signal.throwIfAborted();
					if (total !== ref.bytes || await options.identity() !== identity) throw new Error("video attachment verification failed");
					res.end();
				} catch {
					fail(res, 500, "video download failed; the saved task can be retried");
				} finally {
					active.delete(controller);
					res.off("close", onClose);
				}
			}
		});
		return () => {
			disposed = true;
			unregister();
			for (const controller of active) controller.abort(/* @__PURE__ */ new Error("video downloads disposed"));
			active.clear();
		};
	}, "dsh-grok-kit: task-scoped video downloads");
}
//#endregion
//#region src/quota-routes.ts
const GROK_QUOTA_PATH = "/plugins/dsh-grok-kit/quota";
function trustedRequest(req) {
	return isTrustedRequest(req.socket.remoteAddress, req.headers, req.method ?? "GET");
}
function json(res, status, value) {
	if (res.destroyed) return;
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
		"x-content-type-options": "nosniff"
	});
	res.end(JSON.stringify(value));
}
/**
* Register GET /plugins/dsh-grok-kit/quota. The client performs its own
* identity partitioning and never returns another account's data; this route
* only adds the same-origin gate, the disconnect abort, and a fixed error
* body — no upstream diagnostic, response body, or credential ever reaches
* the response.
*/
function registerGrokQuotaRoute(ctx, client) {
	ctx.effect(() => {
		const inFlight = /* @__PURE__ */ new Set();
		const dispose = ctx.webServer.register({
			kind: "exact",
			path: GROK_QUOTA_PATH,
			handler: async (req, res) => {
				try {
					if (req.method !== "GET") return json(res, 405, { error: "method not allowed" });
					if (!trustedRequest(req)) return json(res, 403, { error: "forbidden" });
					const abort = new AbortController();
					inFlight.add(abort);
					const onClose = () => {
						if (!res.writableEnded) abort.abort(/* @__PURE__ */ new Error("client disconnected"));
					};
					res.on("close", onClose);
					try {
						json(res, 200, await client.get(abort.signal));
					} finally {
						res.off("close", onClose);
						inFlight.delete(abort);
					}
				} catch {
					json(res, 503, { error: "quota request failed" });
				}
			}
		});
		return () => {
			for (const abort of inFlight) abort.abort(/* @__PURE__ */ new Error("quota route disposed"));
			inFlight.clear();
			dispose();
		};
	}, "dsh-grok-kit: quota route");
}
//#endregion
//#region src/lock-rescue.ts
/**
* Writer-lock helpers. Supplementary plugin-level stale-lock recovery is
* intentionally a no-op: any check-then-rename/rm on a path cannot bind
* the inspected generation to the directory entry and risks moving a live
* writer's lock (GROK-WRITER-LOCK-002). Store operations delegate cross-process
* writer coordination and dead-PID reclamation to the official dsh-atomic-write
* claim-file protocol; this extra rescue helper never mutates locks.
* @module dsh-grok-kit/lock-rescue
*/
/** Extract the owner pid from a dsh-atomic-write lock (`${pid}\n` and nothing else). */
function parseLockPid(text) {
	const match = /^(\d{1,10})\n$/.exec(text);
	if (match === null) return void 0;
	const pid = Number(match[1]);
	return pid > 0 ? pid : void 0;
}
/** Whether `pid` is running: `true` alive, `false` provably dead, `undefined` unknown. */
function isPidAlive(pid) {
	if (!Number.isSafeInteger(pid) || pid <= 0) return void 0;
	if (pid === process.pid) return true;
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		const code = error?.code;
		if (code === "ESRCH") return false;
		if (code === "EPERM" || code === "EACCES") return true;
		return;
	}
}
/**
* Do not break writer locks from this supplementary rescue helper. Path-based
* recovery cannot bind the inspected file generation to the directory entry,
* so this helper never mutates `lockPath` or creates `.stale-*` siblings.
* Routine writer coordination and dead-PID takeover are delegated to the
* official atomic-write protocol in the store. Returns `undefined` always.
*/
async function breakStaleWriterLock(_lockPath) {}
//#endregion
//#region src/index.ts
/**
* Stable Cordis plugin name. Deliberately UNIQUE vs the old dsh-xai bundle:
* dsh-xai also inserts `id: llm-xai-oauth`, so sharing that id would make the
* loader reject a profile that still has both installed. The LLM route id
* below (`xai-oauth`) is what keeps saved model settings compatible.
*/
const name = "dsh-grok-kit";
/** LLM registry required before the subscription route can register. */
const inject = ["llm"];
const Config = z.object({
	proxyUrl: z.string().default(""),
	searchModel: z.string().default(DEFAULT_XAI_SEARCH_MODEL),
	searchMaxResults: z.number().default(8),
	webSearchTimeoutMs: z.number().default(DEFAULT_WEB_SEARCH_TIMEOUT_MS),
	xSearchTimeoutMs: z.number().default(DEFAULT_X_SEARCH_TIMEOUT_MS),
	backendSearch: z.boolean().default(false),
	nestedSearchTools: z.boolean(),
	statefulResponses: z.boolean(),
	imagineTool: z.boolean().default(false),
	editTool: z.boolean().default(false),
	editModel: z.string().default(""),
	editMaxSourceImages: z.number().default(5),
	editMaxImageBytes: z.number().default(DEFAULT_MAX_IMAGE_BYTES),
	videoTool: z.boolean().default(false),
	mediaRiskAcknowledged: z.boolean().default(false),
	videoModel: z.string().default(DEFAULT_VIDEO_MODEL),
	videoMaxBytes: z.number().default(DEFAULT_VIDEO_MAX_BYTES)
});
/** Resolve nested-tool registration. `nestedSearchTools` omit stays undefined until here. */
function resolveNestedSearchTools(config) {
	const backendSearch = config.backendSearch ?? false;
	return {
		backendSearch,
		nestedSearchTools: config.nestedSearchTools ?? !backendSearch
	};
}
/** Opt-in only. Default off: DSH multi-step tool loops reprint search text if chained. */
function resolveStatefulResponses(config) {
	return config.statefulResponses ?? false;
}
/** Register the xai-oauth LLM route, OAuth routes, Imagine, and search wiring. */
function apply(ctx, config) {
	const effectiveConfig = mergePluginOptions(config, readStoredOptions());
	const media = resolveMediaOptions(effectiveConfig);
	const mediaEnabled = (key) => media[key] && resolveMediaOptions(mergePluginOptions(config, readStoredOptions()))[key];
	ctx.effect(() => {
		const dispose = installXaiFetchHook();
		applyXaiProxy(effectiveConfig.proxyUrl);
		return dispose;
	}, "dsh-grok-kit: xAI proxy hook");
	const session = new XaiOAuthSession(new XaiOAuthCredentialStore(), () => {
		ctx.emit("llm/adapters-updated");
	});
	ctx.effect(() => () => session.dispose(), "dsh-grok-kit: session retry lifecycle");
	const tokens = createXaiOAuthSearchTokenSource(session);
	const capabilities = new CapabilityTracker();
	const quota = new SuperGrokQuotaClient({
		tokens,
		fetch: fetchGrokQuota
	});
	ctx.effect(() => () => quota.dispose(), "dsh-grok-kit: quota lifecycle");
	ctx.inject(["webServer"], (webCtx) => registerGrokQuotaRoute(webCtx, quota));
	let capabilityIdentity;
	let identityGeneration = 0;
	let identityRead = 0;
	let observedIdentityRead = 0;
	const currentIdentity = async () => {
		const generation = identityGeneration;
		const read = ++identityRead;
		const identity = await tokens.identity?.();
		if (generation !== identityGeneration) return void 0;
		if (read < observedIdentityRead) return identity === capabilityIdentity ? identity : void 0;
		observedIdentityRead = read;
		if (identity !== capabilityIdentity || identity === void 0) capabilities.reset();
		if (identity === void 0 || capabilityIdentity !== void 0 && identity !== capabilityIdentity) quota.reset();
		capabilityIdentity = identity;
		return identity;
	};
	const authenticated = async () => {
		await currentIdentity();
		return (await session.store.read("xai"))?.type === "oauth";
	};
	const video = media.videoTool ? new VideoTaskManager({
		tokens,
		identity: currentIdentity,
		resolveAttachments: () => ctx.get("attachments"),
		model: validVideoModel(effectiveConfig.videoModel) ? effectiveConfig.videoModel : DEFAULT_VIDEO_MODEL,
		maxVideoBytes: validVideoMaxBytes(effectiveConfig.videoMaxBytes) ? effectiveConfig.videoMaxBytes : DEFAULT_VIDEO_MAX_BYTES,
		onCapability: (event) => {
			if (event.identity === capabilityIdentity) capabilities.observe("video", event);
		}
	}) : void 0;
	if (video !== void 0) {
		ctx.effect(() => () => video.dispose(), "dsh-grok-kit: video task lifecycle");
		ctx.inject(["tools"], (toolCtx) => applyGrokVideoTools(toolCtx, {
			manager: video,
			enabled: () => mediaEnabled("videoTool")
		}));
	}
	ctx.inject(["webServer"], (webCtx) => registerGrokCapabilityRoutes(webCtx, {
		tracker: capabilities,
		videoEnabled: () => mediaEnabled("videoTool"),
		authenticated,
		identity: currentIdentity,
		tasks: () => video?.list() ?? Promise.resolve([]),
		resume: (taskId, signal) => {
			if (video === void 0 || !mediaEnabled("videoTool")) return Promise.reject(/* @__PURE__ */ new Error("video generation is disabled"));
			return video.resume(taskId, signal);
		}
	}));
	ctx.inject(["webServer"], (webCtx) => registerGrokVideoFileRoute(webCtx, {
		enabled: () => mediaEnabled("videoTool"),
		identity: currentIdentity,
		tasks: () => video?.list() ?? Promise.resolve([]),
		resolveAttachments: () => ctx.get("attachments"),
		maxBytes: validVideoMaxBytes(effectiveConfig.videoMaxBytes) ? effectiveConfig.videoMaxBytes : DEFAULT_VIDEO_MAX_BYTES
	}));
	const { backendSearch, nestedSearchTools } = resolveNestedSearchTools(effectiveConfig);
	const searchPolicy = new SessionSearchPolicy();
	ctx.effect(() => () => searchPolicy.dispose(), "dsh-grok-kit: session search lifecycle");
	const statefulResponses = resolveStatefulResponses(effectiveConfig);
	session.setWrapOptions({
		backendSearch,
		resolveBackendSearch: (sessionId) => searchPolicy.resolve(sessionId),
		retry401: true,
		tokenSource: tokens,
		statefulResponses,
		...statefulResponses ? { chainStore: createFileResponseChainStore() } : {}
	});
	session.loadCachedCatalog().then(() => session.refreshLiveCatalog()).catch((error) => {
		console.warn("dsh-grok-kit: startup catalog refresh failed; chat still works with the cached or fallback model list.", error instanceof Error ? error.message : error);
	});
	if (ctx.llm.listProviders().some((provider) => provider.id === "xai-oauth")) console.warn("dsh-grok-kit: the xai-oauth chat route is already registered by another bundle (dsh-xai still installed?). Keeping the existing registration. Nested grok_web_search / x_search stay available only when nestedSearchTools is on. Remove dsh-xai to let dsh-grok-kit own the route.");
	else {
		ctx.llm.registerAdapter([XAI_OAUTH_ROUTE], createXaiOAuthAdapter(session, () => ctx.get("attachments")));
		ctx.provide("grokSearchPolicy", searchPolicy);
	}
	ctx.inject(["webServer"], (webCtx) => registerXaiOAuthAuthRoutes(webCtx, session, config, () => {
		identityGeneration += 1;
		quota.reset();
		capabilities.reset();
		capabilityIdentity = void 0;
	}, () => quota.reset()));
	const searchModel = effectiveConfig.searchModel ?? "grok-build-0.1";
	if (nestedSearchTools) {
		const web = new XaiOAuthSearchProvider(tokens, "web_search", { model: searchModel });
		const x = new XaiOAuthSearchProvider(tokens, "x_search", { model: searchModel });
		ctx.inject(["tools", "systemPrompt"], (toolCtx) => applyGrokSearchTools(toolCtx, {
			web,
			x,
			maxResults: effectiveConfig.searchMaxResults ?? 8,
			webTimeoutMs: effectiveConfig.webSearchTimeoutMs ?? 6e4,
			xTimeoutMs: effectiveConfig.xSearchTimeoutMs ?? 12e4,
			backendSearch
		}));
	}
	if (backendSearch) ctx.inject(["tools", "systemPrompt"], (toolCtx) => applyXaiServerSearchRejectTools(toolCtx));
	if (media.imagineTool) ctx.inject(["tools"], (toolCtx) => applyGrokImagineTool(toolCtx, {
		tokens,
		session,
		resolveAttachments: () => ctx.get("attachments"),
		enabled: () => mediaEnabled("imagineTool")
	}));
	if (media.editTool) ctx.inject(["tools"], (toolCtx) => applyGrokImagineEditTool(toolCtx, {
		tokens,
		session,
		resolveAttachments: () => ctx.get("attachments"),
		enabled: () => mediaEnabled("editTool"),
		editModel: effectiveConfig.editModel,
		maxSourceImages: effectiveConfig.editMaxSourceImages,
		maxImageBytes: effectiveConfig.editMaxImageBytes
	}));
}
//#endregion
export { CapabilityTracker, Config, DEFAULT_EDIT_MODEL, DEFAULT_IMAGINE_MODEL, DEFAULT_SEARCH_MAX_RESULTS, DEFAULT_VIDEO_MAX_BYTES, DEFAULT_VIDEO_MODEL, DEFAULT_WEB_SEARCH_TIMEOUT_MS, DEFAULT_XAI_OAUTH_MODEL, DEFAULT_XAI_SEARCH_MODEL, DEFAULT_X_SEARCH_TIMEOUT_MS, MAX_N as EDIT_MAX_N, GROK_46_MODEL, GROK_VIDEO_FILE_PATH, GROK_XAI_CLIENT_ID, GROK_XAI_SLOT_KEY, PREFERRED_XAI_OAUTH_MODEL, VideoTaskManager, XAI_BUILTIN_SEARCH_FUNCTION_NAMES, XAI_IMAGES_EDIT_URL, XAI_IMAGES_URL, XAI_MODELS_URL, XAI_OAUTH_AUTH_FILENAME, XAI_OAUTH_AUTH_IMPORT_PATH, XAI_OAUTH_AUTH_LOGIN_PATH, XAI_OAUTH_AUTH_LOGOUT_PATH, XAI_OAUTH_AUTH_MODELS_PATH, XAI_OAUTH_AUTH_OPTIONS_PATH, XAI_OAUTH_AUTH_PROXY_PATH, XAI_OAUTH_AUTH_STATUS_PATH, XAI_OAUTH_ROUTE, XAI_OAUTH_STREAM_IDLE_TIMEOUT_MS, XAI_PI_PROVIDER, XAI_RESPONSES_URL, XAI_SERVER_X_SEARCH_REJECT_NAMES, XaiOAuthCredentialStore, XaiOAuthSearchError, XaiOAuthSearchProvider, XaiOAuthSession, alignExtension, apply, applyGrokImagineEditTool, applyGrokImagineTool, applyGrokSearchTools, applyGrokVideoTools, applyStatefulContinuation, applyXaiProxy, applyXaiResponsesPayload, applyXaiServerSearchRejectTools, breakStaleWriterLock, buildEditRequestBody, buildSearchToolPayload, capSources, catalogModels, clientInputDelta, createFileResponseChainStore, createMemoryResponseChainStore, createXaiOAuthAdapter, createXaiOAuthSearchTokenSource, decodeFirstImage, extensionFor as editExtensionFor, extractClientInputItems, extractModelIds, fetchLiveModelIds, filterSelectedChatModelIds, fingerprintInputItem, formatGrokSearchOutput, grokAuthPath, imagineModelId, importGrokAuth, importXaiOAuthFromGrok, importXaiOAuthSession, includeForSearchTool, inject, installXaiFetchHook, isClientOriginatedInputItem, isComposerChatModel, isGrokAuthDocument, isGrokAuthPath, isPidAlive, isPreviousResponseError, isToolOutputInputItem, isUserInputItem, lockPathForAuthFile, loginXaiOAuth, loginXaiOAuthSession, logoutXaiOAuth, mapXaiSearchResponse, materializeLiveModel, mergeLiveCatalog, mergePluginOptions, name, normalizeDataImageUri, optionsPath, parseAttachmentSpec, parseGrokAuthDocument, parseGrokWebSearchArgs, parseLockPid, parseXSearchArgs, preferredXaiOAuthModel, preferredXaiOAuthModelFrom, presentPluginOptions, probeGrokAuth, readStoredOptions, readStoredProxyUrl, registerGrokCapabilityRoutes, registerGrokVideoFileRoute, registerXaiOAuthAuthRoutes, removeGrokAuthSlot, resolveImageSources, resolveNestedSearchTools, resolveStatefulResponses, resolveXaiOAuthStorePath, resolveXaiProxyUrl, runImageEdit, safeDetail, safeMessage, sanitizeRejectToolEvent, sanitizeStoredOptions, setXaiProxyUrl, sniffEditableImageMediaType, sniffImageMediaType, stripRejectToolCalls, wrapXaiResponsesProvider, writeGrokAuthDocument, writeStoredOptions, writeStoredProxyUrl, xaiOAuthAuthPath, xaiOAuthAuthStatus, xaiProxyPath };
