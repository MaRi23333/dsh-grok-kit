import z from "@deepseek-ai/schemastery";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { HarnessError, resolveRetryPolicy } from "@deepseek-ai/dsh-llm";
import { PiAiAdapter } from "@deepseek-ai/dsh-llm-pi-ai";
import { xaiProvider } from "@earendil-works/pi-ai/providers/xai";
import { createAssistantMessageEventStream, createModels } from "@earendil-works/pi-ai";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { withFileLock, writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import { ProxyAgent, fetch as fetch$1 } from "undici";
import { defineTool } from "@deepseek-ai/dsh-tools";
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
function isRecord$3(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** Pull model ids from an OpenAI-shaped or gateway-shaped listing body. */
function extractModelIds(body) {
	const rows = Array.isArray(body) ? body : isRecord$3(body) && Array.isArray(body["data"]) ? body["data"] : isRecord$3(body) && Array.isArray(body["models"]) ? body["models"] : [];
	const ids = [];
	for (const row of rows) if (typeof row === "string" && row.length > 0) ids.push(row);
	else if (isRecord$3(row) && typeof row["id"] === "string" && row["id"].length > 0) ids.push(row["id"]);
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
		response = await fetch(XAI_MODELS_URL, {
			headers: {
				accept: "application/json",
				authorization: `Bearer ${accessToken}`
			},
			signal
		});
	} catch (error) {
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
		const code = isRecord$3(body) && typeof body["error"] === "string" ? body["error"] : void 0;
		throw new Error(`xAI model listing failed (HTTP ${response.status})${code === void 0 ? "" : `: ${code}`}`);
	}
	const ids = extractModelIds(body);
	if (ids.length === 0) throw new Error("xAI model listing contained no model ids");
	return ids;
}
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
	return new PiAiAdapter({
		profiles: () => {
			const piProvider = session.provider();
			if (cached?.provider === piProvider) return cached.map;
			const map = /* @__PURE__ */ new Map([[XAI_OAUTH_ROUTE, {
				provider: XAI_OAUTH_ROUTE,
				displayName: "xAI Grok",
				streamIdleTimeoutMs: XAI_OAUTH_STREAM_IDLE_TIMEOUT_MS,
				retryPolicy: resolveRetryPolicy(void 0, "dsh-grok-kit retryPolicy"),
				configuredMaxTokens: /* @__PURE__ */ new Map(),
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
function isENOENT$2(error) {
	return error?.code === "ENOENT";
}
function isRecord$2(value) {
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
	if (!isRecord$2(value)) return [];
	const access = firstString(value, [
		"key",
		"access",
		"access_token"
	]);
	const refresh = firstString(value, ["refresh_token", "refresh"]);
	if (access !== void 0 && refresh !== void 0) {
		const issuer = firstString(value, ["oidc_issuer", "issuer"]);
		const preferred = key.includes("auth.x.ai") || issuer !== void 0 && issuer.includes("auth.x.ai");
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
			preferred
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
	if (!isRecord$2(value) || "version" in value && "credential" in value) return false;
	if (Object.keys(value).length === 0) return true;
	return walk(value, "").length > 0;
}
function formatExpiresAt(expires) {
	return new Date(expires).toISOString();
}
function slotRecord(document) {
	if (isRecord$2(document[GROK_XAI_SLOT_KEY])) return {
		key: GROK_XAI_SLOT_KEY,
		slot: document[GROK_XAI_SLOT_KEY]
	};
	for (const [key, nested] of Object.entries(document)) {
		if (!isRecord$2(nested)) continue;
		const issuer = firstString(nested, ["oidc_issuer", "issuer"]);
		if (key.includes("auth.x.ai") || issuer !== void 0 && issuer.includes("auth.x.ai")) return {
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
		if (!isRecord$2(parsed)) throw new Error("xai-oauth: Grok CLI auth file must contain an object");
		document = { ...parsed };
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
	if (!isRecord$2(parsed)) return void 0;
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
	if (candidates.length === 1) return candidates[0].credential;
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
		if (isENOENT$2(error)) return {
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
		if (isENOENT$2(error)) throw new Error(`xai-oauth: Grok CLI auth file not found at ${filename}`);
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
function isENOENT$1(error) {
	return error?.code === "ENOENT";
}
async function assertOwnerOnly(filename) {
	let mode;
	try {
		mode = (await stat(filename)).mode;
	} catch (error) {
		if (isENOENT$1(error)) return;
		throw error;
	}
	if (process.platform === "win32") return;
	if ((mode & 63) !== 0) throw new Error(`xai-oauth: ${filename} is readable beyond its owner (mode ${(mode & 511).toString(8)}); run "chmod 600 ${filename}" before starting again`);
}
function parseDocument(text, filename) {
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
	if (isDshAuthDocument(value)) return parseDocument(text, filename).credential;
	if (isGrokAuthDocument(value) || isGrokAuthPath(filename)) return parseGrokAuthDocument(text, filename);
	return parseDocument(text, filename).credential;
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
			if (isENOENT$1(error)) return void 0;
			throw error;
		}
	}
	async readCurrent() {
		const text = await this.readText();
		if (text === void 0 || text.trim().length === 0) return void 0;
		try {
			return cloneCredential(parseStoredCredential(text, this.filename));
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
	* The lock's wait budget is a fixed 2s (dsh-atomic-write) and is sized for
	* pure file I/O: `fn` MUST NOT perform network work inside the lock.
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
					return cloneCredential(parseStoredCredential(existingText, this.filename));
				} catch {
					return;
				}
			})();
			const candidate = await fn(current);
			if (candidate === void 0) return current;
			const document = parseDocument(JSON.stringify({
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
//#region src/proxy.ts
/**
* xAI-only outbound proxy — per-plugin setting, no global configuration.
*
* Style matches the other local dsh plugins: this bundle owns one setting
* of its own (stored in `$DSH_HOME/.xai-oauth-proxy.json`, editable on its
* settings page). Nothing global is touched:
*  - no undici global dispatcher replacement,
*  - no global proxy environment variables are read or written,
*  - a transparent `globalThis.fetch` hook routes ONLY `x.ai` origins
*    (api.x.ai / x.ai and subdomains) through this plugin's ProxyAgent and
*    passes every other request to the original fetch untouched — DSH
*    itself, DeepSeek and every other provider keep their direct routes
*    with zero behavior change.
*
* Effective URL precedence: stored setting > plugin config `proxyUrl` >
* `DSH_XAI_PROXY` (plugin-scoped env for headless/CLI use). HTTP/HTTPS
* proxy URLs only; undici's ProxyAgent does not speak SOCKS.
*/
const PROXY_FILE_VERSION = 1;
const PROXY_FILENAME = ".xai-oauth-proxy.json";
/** Absolute path of the plugin-owned proxy setting file. */
function xaiProxyPath(dshHome) {
	return resolve(join(resolveDshHome(dshHome), PROXY_FILENAME));
}
/** Read the plugin's own stored proxy URL ('' = off). */
function readStoredProxyUrl() {
	try {
		const doc = JSON.parse(readFileSync(xaiProxyPath(), "utf8"));
		if (doc.version !== PROXY_FILE_VERSION) return "";
		return typeof doc.proxyUrl === "string" ? doc.proxyUrl.trim() : "";
	} catch {
		return "";
	}
}
/** Persist the plugin's own proxy setting. */
async function writeStoredProxyUrl(url) {
	const file = xaiProxyPath();
	mkdirSync(dirname(file), {
		recursive: true,
		mode: 448
	});
	await writeFileAtomic(file, `${JSON.stringify({
		version: PROXY_FILE_VERSION,
		proxyUrl: url.trim()
	}, null, 2)}\n`, {
		mode: 384,
		dirMode: 448
	});
}
let proxyAgent = null;
let hookInstalled = false;
function urlHref(input) {
	if (typeof input === "string") return input;
	if (input instanceof URL) return input.href;
	if (input !== null && typeof input === "object" && typeof input.url === "string") return input.url;
	return "";
}
function isXaiUrl(input) {
	if (input === void 0 || input === null) return false;
	try {
		const host = new URL(urlHref(input)).hostname.toLowerCase();
		return host === "x.ai" || host.endsWith(".x.ai");
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
/**
* Install a transparent global-fetch hook that routes ONLY x.ai origins
* through this plugin's ProxyAgent; every other request goes to the
* original fetch untouched. Idempotent; without a configured URL it is a
* pure pass-through.
*/
function installXaiFetchHook() {
	if (hookInstalled) return;
	hookInstalled = true;
	const original = globalThis.fetch.bind(globalThis);
	globalThis.fetch = ((input, init) => {
		if (proxyAgent !== null && isXaiUrl(input)) return fetch$1(input, {
			...init ?? {},
			dispatcher: proxyAgent
		});
		return original(input, init);
	});
}
/** Effective proxy URL: stored setting > config `proxyUrl` > `DSH_XAI_PROXY`. */
function resolveXaiProxyUrl(configUrl) {
	const stored = readStoredProxyUrl();
	if (stored !== "") return stored;
	if (nonBlank(configUrl)) return configUrl.trim();
	const env = process.env.DSH_XAI_PROXY;
	if (nonBlank(env)) return env.trim();
	return "";
}
/** Install the hook and apply the current URL. Returns the effective URL, '' when unset/invalid. */
function applyXaiProxy(configUrl) {
	installXaiFetchHook();
	const url = resolveXaiProxyUrl(configUrl);
	setXaiProxyUrl(url);
	return url;
}
//#endregion
//#region src/redact.ts
/** Remove token-like strings from an external OAuth diagnostic. */
function safeMessage(error) {
	return (error instanceof Error ? error.message : String(error)).replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu, "[redacted token]").replace(/(\b(?:code|token|refresh_token|access_token)=)[^&\s]+/giu, "$1[redacted]").replace(/(["'](?:access|access_token|refresh|refresh_token)["']\s*:\s*["'])[^"']+(["'])/giu, "$1[redacted]$2").slice(0, 1e3);
}
//#endregion
//#region src/auth-routes.ts
const XAI_OAUTH_AUTH_STATUS_PATH = "/plugins/dsh-grok-kit/auth/status";
const XAI_OAUTH_AUTH_LOGIN_PATH = "/plugins/dsh-grok-kit/auth/login";
const XAI_OAUTH_AUTH_IMPORT_PATH = "/plugins/dsh-grok-kit/auth/import";
const XAI_OAUTH_AUTH_LOGOUT_PATH = "/plugins/dsh-grok-kit/auth/logout";
const XAI_OAUTH_AUTH_MODELS_PATH = "/plugins/dsh-grok-kit/auth/models";
const XAI_OAUTH_AUTH_PROXY_PATH = "/plugins/dsh-grok-kit/auth/proxy";
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
	exclusivePending = false;
	constructor(session) {
		this.session = session;
	}
	async status() {
		if (this.operation !== void 0) return this.state;
		if (this.state.status === "error") return {
			...this.state,
			grokImportAvailable: await grokImportAvailable()
		};
		return this.readStoredStatus();
	}
	async signIn() {
		if (this.exclusivePending) await this.exclusive;
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
			await fn();
		});
		this.exclusivePending = true;
		this.exclusive = run.catch(() => void 0);
		return run.finally(() => {
			this.exclusivePending = false;
		});
	}
	start() {
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
			this.state = {
				status: "error",
				message: safeMessage(error),
				grokImportAvailable: false,
				sharedGrokAuth: this.session.store.sharedWithGrokCli
			};
		}).finally(() => {
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
			...this.session.catalogError === void 0 ? {} : { catalogError: this.session.catalogError }
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
function trustedRequest(req) {
	return isTrustedRequest(req.socket.remoteAddress, req.headers, req.method ?? "GET");
}
/** Trust header/remote shape for the plugin's Web routes. Exported for tests. */
function isTrustedRequest(remote, headers, method) {
	if (remote !== "127.0.0.1" && remote !== "::1" && remote !== "::ffff:127.0.0.1") return false;
	if (headers["sec-fetch-site"] === "cross-site") return false;
	const host = headers.host;
	if (host === void 0) return false;
	if (loopbackHostname(host) === void 0) return false;
	const origin = headers.origin;
	if (origin === void 0) return method === "GET";
	try {
		return new URL(origin).host === new URL(`http://${host}`).host;
	} catch {
		return false;
	}
}
/** Client-side request error (bad content-type / bad body); reported as 400. */
var BadRequestError = class extends Error {};
/**
* Accept a JSON body: no content-type header (no body) or application/json.
* A cross-site form cannot send application/json, so this rejects form posts;
* same-origin checks in trustedRequest() are the primary CSRF gate.
*/
function jsonContentTypeAccepted(contentType) {
	if (contentType === "") return true;
	return contentType.toLowerCase().split(";")[0].trim() === "application/json";
}
function errorStatus(error) {
	if (error instanceof BadRequestError) return 400;
	if (error instanceof SyntaxError) return 400;
	return 500;
}
async function readJson(req) {
	if (!jsonContentTypeAccepted(req.headers["content-type"] ?? "")) throw new BadRequestError("content-type must be application/json");
	const chunks = [];
	for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	const text = Buffer.concat(chunks).toString("utf8").trim();
	if (text.length === 0) return {};
	return JSON.parse(text);
}
function json(res, status, value) {
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
		"x-content-type-options": "nosniff"
	});
	res.end(JSON.stringify(value));
}
/** Register the plugin-owned OAuth routes when the Web server is composed. */
function registerXaiOAuthAuthRoutes(ctx, session) {
	const auth = new XaiOAuthWebAuth(session);
	ctx.effect(() => {
		const routes = [
			ctx.webServer.register({
				kind: "exact",
				path: XAI_OAUTH_AUTH_STATUS_PATH,
				handler: async (req, res) => {
					if (req.method !== "GET") return json(res, 405, { error: "method not allowed" });
					if (!trustedRequest(req)) return json(res, 403, { error: "forbidden" });
					json(res, 200, await auth.status());
				}
			}),
			ctx.webServer.register({
				kind: "exact",
				path: XAI_OAUTH_AUTH_LOGIN_PATH,
				handler: async (req, res) => {
					if (req.method !== "POST") return json(res, 405, { error: "method not allowed" });
					if (!trustedRequest(req)) return json(res, 403, { error: "forbidden" });
					try {
						json(res, 200, await auth.signIn());
					} catch (error) {
						json(res, errorStatus(error), { error: safeMessage(error) });
					}
				}
			}),
			ctx.webServer.register({
				kind: "exact",
				path: XAI_OAUTH_AUTH_IMPORT_PATH,
				handler: async (req, res) => {
					if (req.method !== "POST") return json(res, 405, { error: "method not allowed" });
					if (!trustedRequest(req)) return json(res, 403, { error: "forbidden" });
					try {
						await auth.importGrok();
						json(res, 200, await auth.status());
					} catch (error) {
						json(res, errorStatus(error), { error: safeMessage(error) });
					}
				}
			}),
			ctx.webServer.register({
				kind: "exact",
				path: XAI_OAUTH_AUTH_MODELS_PATH,
				handler: async (req, res) => {
					if (req.method !== "POST") return json(res, 405, { error: "method not allowed" });
					if (!trustedRequest(req)) return json(res, 403, { error: "forbidden" });
					try {
						const body = await readJson(req);
						const selected = typeof body === "object" && body !== null && "selected" in body ? body.selected : void 0;
						if (!Array.isArray(selected) || selected.some((id) => typeof id !== "string")) return json(res, 400, { error: "selected must be an array of model ids" });
						await auth.setModels(selected);
						json(res, 200, await auth.status());
					} catch (error) {
						json(res, errorStatus(error), { error: safeMessage(error) });
					}
				}
			}),
			ctx.webServer.register({
				kind: "exact",
				path: XAI_OAUTH_AUTH_PROXY_PATH,
				handler: async (req, res) => {
					if (!trustedRequest(req)) return json(res, 403, { error: "forbidden" });
					if (req.method === "GET") return json(res, 200, { proxyUrl: readStoredProxyUrl() });
					if (req.method !== "POST") return json(res, 405, { error: "method not allowed" });
					try {
						const body = await readJson(req);
						const proxyUrl = typeof body === "object" && body !== null && "proxyUrl" in body ? body.proxyUrl : void 0;
						if (typeof proxyUrl !== "string") return json(res, 400, { error: "proxyUrl must be a string" });
						const normalized = validProxyUrl(proxyUrl);
						if (normalized === void 0) return json(res, 400, { error: "proxyUrl must be a valid http:// or https:// URL" });
						setXaiProxyUrl(proxyUrl);
						await writeStoredProxyUrl(proxyUrl);
						json(res, 200, { proxyUrl: normalized });
					} catch (error) {
						json(res, errorStatus(error), { error: safeMessage(error) });
					}
				}
			}),
			ctx.webServer.register({
				kind: "exact",
				path: XAI_OAUTH_AUTH_LOGOUT_PATH,
				handler: async (req, res) => {
					if (req.method !== "POST") return json(res, 405, { error: "method not allowed" });
					if (!trustedRequest(req)) return json(res, 403, { error: "forbidden" });
					try {
						await auth.signOut();
						json(res, 200, await auth.status());
					} catch (error) {
						json(res, errorStatus(error), { error: safeMessage(error) });
					}
				}
			})
		];
		return async () => {
			for (const dispose of routes) dispose();
			await auth.dispose();
		};
	}, "dsh-grok-kit: Web OAuth routes");
}
//#endregion
//#region src/token-source.ts
/**
* OAuth-only bearer source for search, chat 401 retry, and Imagine.
* Refresh runs outside the 2s file lock; compare-and-write is inside it.
* @module dsh-grok-kit/token-source
*/
const inFlightRefresh = /* @__PURE__ */ new Map();
/**
* Build a token source that is OAuth-only by construction, including forced
* refresh after a server-side 401. In-process refreshes for the same rejected
* bearer coalesce onto one `oauth.refresh` call.
*/
function createXaiOAuthSearchTokenSource(session) {
	return {
		available: () => session.store.exists(),
		async resolve(signal) {
			signal?.throwIfAborted();
			const credential = await session.store.read("xai");
			signal?.throwIfAborted();
			if (credential?.type !== "oauth") return void 0;
			const auth = await session.models.getAuth("xai");
			signal?.throwIfAborted();
			if (auth?.source !== "OAuth") return void 0;
			const accessToken = auth.auth.apiKey;
			return accessToken === void 0 || accessToken.length === 0 ? void 0 : accessToken;
		},
		async refresh(rejectedAccessToken, signal) {
			const existing = inFlightRefresh.get(rejectedAccessToken);
			if (existing !== void 0) return existing;
			const pending = refreshRejected(session, rejectedAccessToken, signal).finally(() => {
				if (inFlightRefresh.get(rejectedAccessToken) === pending) inFlightRefresh.delete(rejectedAccessToken);
			});
			inFlightRefresh.set(rejectedAccessToken, pending);
			return pending;
		}
	};
}
async function refreshRejected(session, rejectedAccessToken, signal) {
	signal?.throwIfAborted();
	const oauth = session.models.getProvider("xai")?.auth.oauth;
	if (oauth === void 0) return void 0;
	const refreshSignal = signal ?? new AbortController().signal;
	const current = await session.store.read("xai");
	refreshSignal.throwIfAborted();
	if (current?.type !== "oauth") return void 0;
	if (current.access !== rejectedAccessToken) return current.access;
	const rotated = await oauth.refresh(current, refreshSignal);
	refreshSignal.throwIfAborted();
	const credential = await session.store.modify("xai", async (candidate) => {
		refreshSignal.throwIfAborted();
		if (candidate?.type !== "oauth") return void 0;
		if (candidate.access !== rejectedAccessToken) return void 0;
		return rotated;
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
const USER_AGENT$1 = "dsh-grok-kit/0.1.0";
const ERROR_BODY_LIMIT = 300;
function isRecord$1(value) {
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
	if (!isRecord$1(value)) return void 0;
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
		if (!isRecord$1(item) || item["type"] !== "message" || !Array.isArray(item["content"])) continue;
		for (const chunk of item["content"]) {
			if (!isRecord$1(chunk) || chunk["type"] !== "output_text") continue;
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
		if (!isRecord$1(item) || !isSearchCall(item) || !isRecord$1(item["action"])) continue;
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
		if (!isRecord$1(item) || item["type"] !== "message" || !Array.isArray(item["content"])) continue;
		for (const chunk of item["content"]) {
			if (!isRecord$1(chunk) || chunk["type"] !== "output_text" || !Array.isArray(chunk["annotations"])) continue;
			for (const annotation of chunk["annotations"]) {
				if (!isRecord$1(annotation)) continue;
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
		if (!isRecord$1(item) || item["type"] !== "custom_tool_call" || !isXSearchToolName(item["name"])) continue;
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
		if (isRecord$1(parsed)) {
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
	if (!isRecord$1(usage)) return void 0;
	const details = usage["server_side_tool_usage_details"];
	if (!isRecord$1(details)) return void 0;
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
	if (!isRecord$1(body)) return void 0;
	const error = body["error"];
	if (typeof error === "string") return nonBlankString(error);
	if (!isRecord$1(error)) return void 0;
	return nonBlankString(error["message"]) ?? nonBlankString(error["code"]);
}
function isAbortError(error) {
	if (error instanceof DOMException && error.name === "AbortError") return true;
	return isRecord$1(error) && error["name"] === "AbortError";
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
			return await this.fetchImpl(XAI_RESPONSES_URL, {
				method: "POST",
				redirect: "error",
				headers: {
					authorization: `Bearer ${accessToken}`,
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
				if (signal?.aborted || isAbortError(error)) throw new XaiOAuthSearchError("xAI search aborted", "WEB_ABORTED", { cause: error });
				throw new XaiOAuthSearchError("Could not refresh the SuperGrok OAuth credential after HTTP 401", "WEB_PROVIDER_ERROR", { cause: error });
			}
			if (refreshed !== void 0 && refreshed.length > 0 && refreshed !== accessToken) {
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
		const apiError = xaiApiErrorMessage(body);
		if (apiError !== void 0) throw new XaiOAuthSearchError(`xAI search returned an error: ${safeMessage(apiError)}`, "WEB_PROVIDER_ERROR");
		if (!isRecord$1(body)) throw new XaiOAuthSearchError("xAI search returned an invalid response envelope", "WEB_PROVIDER_ERROR");
		return mapXaiSearchResponse(body);
	}
};
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
const ENCRYPTED_REASONING = "reasoning.encrypted_content";
function isRecord(value) {
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
	if (!isRecord(tool) || tool["type"] !== "function" && tool["type"] !== "custom") return void 0;
	if (typeof tool["name"] === "string") return tool["name"];
	const nested = tool["function"];
	return isRecord(nested) && typeof nested["name"] === "string" ? nested["name"] : void 0;
}
function isRetriableChat401(event) {
	return event.type === "error" && /\b401\b/.test(event.error.errorMessage ?? "");
}
/**
* Mutate a Responses payload. Never returns undefined (pi-ai only replaces
* params when onPayload's result is defined). Completions models get the
* same object reference back.
*/
function applyXaiResponsesPayload(payload, model, options) {
	if (model.api !== "openai-responses") return payload;
	if (!isRecord(payload)) return payload === void 0 ? {} : payload;
	const params = { ...payload };
	const include = Array.isArray(params["include"]) ? params["include"].filter((item) => typeof item === "string") : [];
	if (!include.includes(ENCRYPTED_REASONING)) include.push(ENCRYPTED_REASONING);
	params["include"] = include;
	if (!options.skipDefaultHigh) {
		const reasoning = isRecord(params["reasoning"]) ? { ...params["reasoning"] } : {};
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
		for (const type of ["web_search", "x_search"]) if (!stripped.some((tool) => isRecord(tool) && tool["type"] === type)) stripped.push({ type });
		params["tools"] = stripped;
	}
	return params;
}
function rewriteBackendSearchError(event, backendSearch) {
	if (!backendSearch || event.type !== "error") return event;
	const message = event.error.errorMessage ?? "";
	if (/\b403\b/.test(message)) return {
		...event,
		error: {
			...event.error,
			errorMessage: "xAI rejected this request (HTTP 403). Server-side web_search/x_search may be disabled for this SuperGrok tier — set backendSearch: false in the dsh-grok-kit plugin config."
		}
	};
	if (/\b400\b/.test(message) && /invalid.?tool|unknown.?tool|web_search|x_search|mixed/i.test(message)) return {
		...event,
		error: {
			...event.error,
			errorMessage: "xAI rejected mixed server-side search tools (HTTP 400). Set backendSearch: false in the dsh-grok-kit plugin config." + (message.length > 0 ? ` Original: ${message}` : "")
		}
	};
	return event;
}
function withPayload(streamOptions, options) {
	const skipDefaultHigh = streamOptions?.reasoning === "off";
	return {
		...streamOptions,
		onPayload: async (payload, model) => {
			return applyXaiResponsesPayload(await streamOptions?.onPayload?.(payload, model) ?? payload, model, {
				...options,
				skipDefaultHigh
			});
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
				out.end();
				return;
			}
			const event = first.value;
			if (isRetriableChat401(event)) {
				const refreshed = await options.tokenSource.refresh?.(options.rejected, options.signal);
				if (refreshed !== void 0 && refreshed.length > 0 && refreshed !== options.rejected) {
					const second = options.retry(refreshed);
					for await (const next of second) out.push(rewriteBackendSearchError(next, options.backendSearch));
					out.end();
					return;
				}
			}
			out.push(rewriteBackendSearchError(event, options.backendSearch));
			while (true) {
				const step = await iterator.next();
				if (step.done) break;
				out.push(rewriteBackendSearchError(step.value, options.backendSearch));
			}
			out.end();
		} catch (error) {
			console.error(`dsh-grok-kit: chat stream failed: ${safeMessage(error)}`);
			out.end();
		}
	})();
	return out;
}
function forwardStream(inner, backendSearch) {
	const out = createAssistantMessageEventStream();
	(async () => {
		try {
			for await (const event of inner) out.push(rewriteBackendSearchError(event, backendSearch));
			out.end();
		} catch (error) {
			console.error(`dsh-grok-kit: chat stream failed: ${safeMessage(error)}`);
			out.end();
		}
	})();
	return out;
}
/** Wrap a provider's stream / streamSimple. Outer 401 retry, inner onPayload. */
function wrapXaiResponsesProvider(provider, options) {
	const run = (fn, model, context, streamOptions) => {
		const injected = withPayload(streamOptions, options);
		const inner = fn.call(provider, model, context, injected);
		if (!options.retry401 || options.tokenSource === void 0) return options.backendSearch ? forwardStream(inner, true) : inner;
		const rejected = streamOptions?.apiKey;
		if (rejected === void 0 || rejected.length === 0) return options.backendSearch ? forwardStream(inner, true) : inner;
		return retryOn401(inner, {
			retry: (apiKey) => fn.call(provider, model, context, {
				...injected,
				apiKey
			}),
			tokenSource: options.tokenSource,
			rejected,
			signal: streamOptions?.signal,
			backendSearch: options.backendSearch
		});
	};
	return {
		...provider,
		stream: (model, context, streamOptions) => run(provider.stream, model, context, streamOptions),
		streamSimple: (model, context, streamOptions) => run(provider.streamSimple, model, context, streamOptions)
	};
}
//#endregion
//#region src/session.ts
/**
* Shared OAuth store + live catalog for the host plugin and CLI.
* @module dsh-grok-kit/session
*/
const MODELS_CACHE_VERSION = 2;
const MODELS_CACHE_FILENAME = ".xai-oauth-models.json";
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
	constructor(store = new XaiOAuthCredentialStore(), onCatalogChange) {
		this.store = store;
		this.cacheFile = modelsCachePath();
		this.baseline = xaiProvider();
		this.models = createModels({ credentials: store });
		this.models.setProvider(this.baseline);
		this.onCatalogChange = onCatalogChange;
	}
	setWrapOptions(next) {
		this.wrapOptions = next;
		this.cachedProvider = void 0;
		this.onCatalogChange?.();
	}
	invalidateProvider() {
		this.cachedProvider = void 0;
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
		let access;
		try {
			const stored = await this.store.read("xai");
			if (stored?.type === "oauth" && stored.access.length > 0) access = stored.access;
			if (stored?.type === "oauth" && Date.now() >= stored.expires || access === void 0) {
				const refreshed = (await this.models.getAuth("xai"))?.auth.apiKey;
				if (refreshed !== void 0 && refreshed.length > 0) access = refreshed;
			}
		} catch (error) {
			this.listingError = safeMessage(error instanceof Error ? error.message : String(error));
			if (this.liveIds === void 0) this.source = "fallback";
			if (access === void 0) return;
		}
		if (access === void 0 || access.length === 0) {
			this.listingError = void 0;
			return;
		}
		try {
			const ids = await fetchLiveModelIds(access, signal);
			this.liveIds = ids;
			this.source = "live";
			this.listingError = void 0;
			await this.writeCache();
			this.invalidateProvider();
			this.onCatalogChange?.();
		} catch (error) {
			this.listingError = safeMessage(error instanceof Error ? error.message : String(error));
			if (this.liveIds === void 0) this.source = "fallback";
		}
	}
	async setSelectedModels(ids) {
		this.selectedIds = filterSelectedChatModelIds(ids) ?? [preferredXaiOAuthModelFrom(this.availableModels())];
		this.invalidateProvider();
		await this.writeCache();
		this.onCatalogChange?.();
	}
	async logout() {
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
/**
* DSH grok_imagine tool over POST /v1/images/generations.
* Pixels enter the session as ImageBlock via saveImage; no server-side image_generation.
* @module dsh-grok-kit/imagine
*/
const XAI_IMAGES_URL = "https://api.x.ai/v1/images/generations";
const DEFAULT_IMAGINE_MODEL = "grok-imagine-image-2.0";
const FALLBACK_IMAGINE_MODEL = "grok-imagine-image";
const USER_AGENT = "dsh-grok-kit/0.1.0";
/** v1 renders exactly one image per call (the API bills per n). */
const MAX_N = 1;
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
const GIF87 = new TextEncoder().encode("GIF87a");
const GIF89 = new TextEncoder().encode("GIF89a");
function sniffImageMediaType(bytes) {
	if (startsWith(bytes, PNG)) return "image/png";
	if (startsWith(bytes, JPEG)) return "image/jpeg";
	if (startsWith(bytes, GIF87) || startsWith(bytes, GIF89)) return "image/gif";
	if (bytes.length >= 12 && bytes[0] === 82 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 70 && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80) return "image/webp";
}
function startsWith(bytes, prefix) {
	if (bytes.length < prefix.length) return false;
	return prefix.every((value, index) => bytes[index] === value);
}
function extensionFor(mediaType) {
	switch (mediaType) {
		case "image/jpeg": return "jpg";
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
function attachmentFromValue(value) {
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
	const post = (bearer) => fetchImpl(XAI_IMAGES_URL, {
		method: "POST",
		redirect: "error",
		headers: {
			authorization: `Bearer ${bearer}`,
			"content-type": "application/json",
			accept: "application/json",
			"user-agent": USER_AGENT
		},
		body: JSON.stringify(body),
		...signal !== void 0 ? { signal } : {}
	});
	let response = await post(access);
	if (response.status === 401 && tokens.refresh !== void 0) {
		const refreshed = await tokens.refresh(access, signal);
		if (refreshed !== void 0 && refreshed.length > 0 && refreshed !== access) response = await post(refreshed);
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
				description: "Number of images (1-4). Default 1."
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
				const attachment = attachmentFromValue(value);
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
			const attachment = value === void 0 ? void 0 : attachmentFromValue(value);
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
			const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
			if (prompt.length === 0) throw new Error("prompt must be a non-empty string");
			const n = typeof args.n === "number" && Number.isFinite(args.n) ? Math.trunc(args.n) : 1;
			if (n < 1 || n > MAX_N) throw new Error("n must be 1: this plugin renders one image per call (the API bills per n)");
			const resolution = args.resolution;
			if (resolution !== void 0 && resolution !== "1k" && resolution !== "2k") throw new Error("resolution must be 1k or 2k");
			const body = {
				model: imagineModelId(options.session.liveModelIds()),
				prompt,
				n,
				response_format: "b64_json",
				...typeof args.aspect_ratio === "string" && args.aspect_ratio.length > 0 ? { aspect_ratio: args.aspect_ratio } : {},
				...resolution !== void 0 ? { resolution } : {}
			};
			const response = await requestImage(options.tokens, body, fetchImpl, exec.signal);
			if (!response.ok) {
				const detail = safeMessage((await response.text().catch(() => "")).slice(0, 300));
				throw new Error(`xAI image generation failed (HTTP ${response.status})${detail.length === 0 ? "" : `: ${detail}`}`);
			}
			const b64 = (await response.json()).data?.[0]?.b64_json;
			if (typeof b64 !== "string" || b64.length === 0) throw new Error("xAI image generation returned no b64_json");
			const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
			const mediaType = sniffImageMediaType(bytes);
			if (mediaType === void 0) throw new Error("grok_imagine: generated bytes are not a supported image type");
			const attachments = options.resolveAttachments();
			if (attachments !== void 0) {
				const ref = await attachments.saveImage({
					data: bytes,
					mediaType,
					name: `grok-imagine.${extensionFor(mediaType)}`
				});
				return {
					text: "Generated image.",
					attachmentId: ref.attachmentId,
					mediaType: ref.mediaType,
					bytes: ref.bytes,
					width: ref.width,
					height: ref.height,
					...ref.name === void 0 ? {} : { name: ref.name }
				};
			}
			const cwd = exec.agent?.session.header.cwd;
			if (cwd === void 0 || cwd.length === 0) throw new Error("grok_imagine: no session working directory; enable the attachment service or run from a workspace");
			const stamp = (/* @__PURE__ */ new Date()).toISOString().replaceAll(":", "").replaceAll(".", "-");
			const relative = join(".dsh-grok-kit", `imagine-${stamp}-1.${extensionFor(mediaType)}`);
			const absolute = join(cwd, relative);
			await mkdir(join(cwd, ".dsh-grok-kit"), { recursive: true });
			await writeFile(absolute, bytes);
			return {
				text: `Saved to ${absolute}`,
				path: absolute
			};
		}
	}));
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
	if (!Number.isFinite(Date.parse(`${value}T00:00:00Z`))) throw new Error(`${name} must be a valid date`);
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
	imagineTool: z.boolean().default(true)
});
/** Resolve nested-tool registration. `nestedSearchTools` omit stays undefined until here. */
function resolveNestedSearchTools(config) {
	const backendSearch = config.backendSearch ?? false;
	return {
		backendSearch,
		nestedSearchTools: config.nestedSearchTools ?? !backendSearch
	};
}
/** Register the xai-oauth LLM route, OAuth routes, Imagine, and search wiring. */
function apply(ctx, config) {
	applyXaiProxy(config.proxyUrl);
	const session = new XaiOAuthSession(new XaiOAuthCredentialStore(), () => {
		ctx.emit("llm/adapters-updated");
	});
	const tokens = createXaiOAuthSearchTokenSource(session);
	const { backendSearch, nestedSearchTools } = resolveNestedSearchTools(config);
	session.setWrapOptions({
		backendSearch,
		retry401: true,
		tokenSource: tokens
	});
	session.loadCachedCatalog().then(() => session.refreshLiveCatalog()).catch((error) => {
		console.warn("dsh-grok-kit: startup catalog refresh failed; chat still works with the cached or fallback model list.", error instanceof Error ? error.message : error);
	});
	if (ctx.llm.listProviders().some((provider) => provider.id === "xai-oauth")) console.warn("dsh-grok-kit: the xai-oauth chat route is already registered by another bundle (dsh-xai still installed?). Keeping the existing registration. Nested grok_web_search / x_search stay available only when nestedSearchTools is on. Remove dsh-xai to let dsh-grok-kit own the route.");
	else ctx.llm.registerAdapter([XAI_OAUTH_ROUTE], createXaiOAuthAdapter(session, () => ctx.get("attachments")));
	ctx.inject(["webServer"], (webCtx) => registerXaiOAuthAuthRoutes(webCtx, session));
	const searchModel = config.searchModel ?? "grok-build-0.1";
	if (nestedSearchTools) {
		const web = new XaiOAuthSearchProvider(tokens, "web_search", { model: searchModel });
		const x = new XaiOAuthSearchProvider(tokens, "x_search", { model: searchModel });
		ctx.inject(["tools", "systemPrompt"], (toolCtx) => applyGrokSearchTools(toolCtx, {
			web,
			x,
			maxResults: config.searchMaxResults ?? 8,
			webTimeoutMs: config.webSearchTimeoutMs ?? 6e4,
			xTimeoutMs: config.xSearchTimeoutMs ?? 12e4,
			backendSearch
		}));
	}
	if (backendSearch) ctx.inject(["tools", "systemPrompt"], (toolCtx) => applyXaiServerSearchRejectTools(toolCtx));
	if (config.imagineTool !== false) ctx.inject(["tools"], (toolCtx) => applyGrokImagineTool(toolCtx, {
		tokens,
		session,
		resolveAttachments: () => ctx.get("attachments")
	}));
}
//#endregion
export { Config, DEFAULT_IMAGINE_MODEL, DEFAULT_SEARCH_MAX_RESULTS, DEFAULT_WEB_SEARCH_TIMEOUT_MS, DEFAULT_XAI_OAUTH_MODEL, DEFAULT_XAI_SEARCH_MODEL, DEFAULT_X_SEARCH_TIMEOUT_MS, GROK_46_MODEL, GROK_XAI_CLIENT_ID, GROK_XAI_SLOT_KEY, PREFERRED_XAI_OAUTH_MODEL, XAI_BUILTIN_SEARCH_FUNCTION_NAMES, XAI_IMAGES_URL, XAI_MODELS_URL, XAI_OAUTH_AUTH_FILENAME, XAI_OAUTH_AUTH_IMPORT_PATH, XAI_OAUTH_AUTH_LOGIN_PATH, XAI_OAUTH_AUTH_LOGOUT_PATH, XAI_OAUTH_AUTH_MODELS_PATH, XAI_OAUTH_AUTH_PROXY_PATH, XAI_OAUTH_AUTH_STATUS_PATH, XAI_OAUTH_ROUTE, XAI_OAUTH_STREAM_IDLE_TIMEOUT_MS, XAI_PI_PROVIDER, XAI_RESPONSES_URL, XAI_SERVER_X_SEARCH_REJECT_NAMES, XaiOAuthCredentialStore, XaiOAuthSearchError, XaiOAuthSearchProvider, XaiOAuthSession, apply, applyGrokImagineTool, applyGrokSearchTools, applyXaiProxy, applyXaiResponsesPayload, applyXaiServerSearchRejectTools, buildSearchToolPayload, capSources, catalogModels, createXaiOAuthAdapter, createXaiOAuthSearchTokenSource, extractModelIds, fetchLiveModelIds, filterSelectedChatModelIds, formatGrokSearchOutput, grokAuthPath, imagineModelId, importGrokAuth, importXaiOAuthFromGrok, importXaiOAuthSession, includeForSearchTool, inject, installXaiFetchHook, isComposerChatModel, isGrokAuthDocument, isGrokAuthPath, lockPathForAuthFile, loginXaiOAuth, loginXaiOAuthSession, logoutXaiOAuth, mapXaiSearchResponse, materializeLiveModel, mergeLiveCatalog, name, parseGrokAuthDocument, parseGrokWebSearchArgs, parseXSearchArgs, preferredXaiOAuthModel, preferredXaiOAuthModelFrom, probeGrokAuth, readStoredProxyUrl, registerXaiOAuthAuthRoutes, removeGrokAuthSlot, resolveNestedSearchTools, resolveXaiOAuthStorePath, resolveXaiProxyUrl, safeMessage, setXaiProxyUrl, sniffImageMediaType, wrapXaiResponsesProvider, writeGrokAuthDocument, writeStoredProxyUrl, xaiOAuthAuthPath, xaiOAuthAuthStatus, xaiProxyPath };
