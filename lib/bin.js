#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import z from "@deepseek-ai/schemastery";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import "@deepseek-ai/dsh-llm";
import "@deepseek-ai/dsh-llm-pi-ai";
import { xaiProvider } from "@earendil-works/pi-ai/providers/xai";
import { createAssistantMessageEventStream, createModels } from "@earendil-works/pi-ai";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { withFileLock, writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import "undici";
import { createHash } from "node:crypto";
import "@deepseek-ai/dsh-tools";
//#region src/ids.ts
/** Harness LLM route. Distinct from the catalog `xai` API-key route. */
const XAI_OAUTH_ROUTE = "xai-oauth";
/** Basename of the OAuth document inside the Harness home. */
const XAI_OAUTH_AUTH_FILENAME = ".xai-oauth-auth.json";
/** Preferred chat model when the live or installed catalog includes it. */
const PREFERRED_XAI_OAUTH_MODEL = "grok-4.6";
/** Fallback model when the installed pi-ai catalog has no grok-4.6. */
const DEFAULT_XAI_OAUTH_MODEL = "grok-4.5";
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
//#region src/grok-import.ts
/**
* Grok CLI auth.json: parse, probe, and write-in-place.
* When the store points at this file, dsh login/refresh/logout mutate the
* same document Grok CLI reads — one refresh-token rotation, not a copy.
* @module dsh-grok-kit/grok-import
*/
const DEFAULT_TOKEN_LIFETIME_MS = 36e5;
const GROK_XAI_SLOT_KEY = `https://auth.x.ai::b1a00492-073a-47ea-816f-4c329264a828`;
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
//#region src/redact.ts
/** Remove token-like strings from an external OAuth diagnostic. */
function safeMessage(error) {
	return (error instanceof Error ? error.message : String(error)).replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu, "[redacted token]").replace(/(\b(?:code|token|refresh_token|access_token)=)[^&\s]+/giu, "$1[redacted]").replace(/(["'](?:access|access_token|refresh|refresh_token)["']\s*:\s*["'])[^"']+(["'])/giu, "$1[redacted]$2").slice(0, 1e3);
}
//#endregion
//#region src/search.ts
/** OAuth-friendly Grok Build model; override via config `searchModel`. */
const DEFAULT_XAI_SEARCH_MODEL = "grok-build-0.1";
//#endregion
//#region src/response-chain.ts
/**
* Client-side bookkeeping for xAI stateful Responses (store + previous_response_id).
* Fingerprints are hashes of client-originated input items; the search corpus
* itself never lives here.
* @module dsh-grok-kit/response-chain
*/
function isRecord$1(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function itemRole(item) {
	return typeof item["role"] === "string" ? item["role"] : void 0;
}
function isToolOutputInputItem(item) {
	if (!isRecord$1(item)) return false;
	const type = item["type"];
	return type === "function_call_output" || type === "custom_tool_call_output";
}
function isUserInputItem(item) {
	if (!isRecord$1(item)) return false;
	const role = itemRole(item);
	if (role === "user") return true;
	return item["type"] === "message" && role === "user";
}
/** User / system messages and local tool results — not model output. */
function isClientOriginatedInputItem(item) {
	if (!isRecord$1(item)) return false;
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
		return message === event.message ? event : {
			...event,
			message
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
function withPayload(streamOptions, options, continuation) {
	const skipDefaultHigh = streamOptions?.reasoning === "off";
	return {
		...streamOptions,
		onPayload: async (payload, model) => {
			const applied = applyXaiResponsesPayload(await streamOptions?.onPayload?.(payload, model) ?? payload, model, {
				...options,
				skipDefaultHigh
			});
			if (continuation === void 0 || !isRecord(applied) || model.api !== "openai-responses") return applied;
			const next = applyStatefulContinuation(applied, {
				sessionId: continuation.sessionId,
				modelId: model.id,
				store: continuation.store,
				forceFullReplay: continuation.forceFullReplay()
			});
			continuation.pending.fingerprints = next.fingerprints;
			continuation.pending.usedPrevious = next.usedPrevious;
			return next.payload;
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
function forwardStream(inner, backendSearch, extras) {
	const out = createAssistantMessageEventStream();
	(async () => {
		try {
			let source = inner;
			let first = true;
			for await (const event of source) {
				if (first && extras?.retryPrevious !== void 0 && extras.usedPrevious?.() === true && isPreviousResponseError(event)) {
					first = false;
					source = extras.retryPrevious();
					for await (const retried of source) {
						const sanitized = sanitizeRejectToolEvent(retried);
						if (sanitized === void 0) continue;
						const finished = finishedResponseOf(sanitized);
						if (finished !== void 0) extras.remember?.(finished.responseId, finished.stopReason);
						out.push(rewriteBackendSearchError(sanitized, backendSearch));
					}
					out.end();
					return;
				}
				first = false;
				const sanitized = sanitizeRejectToolEvent(event);
				if (sanitized === void 0) continue;
				const finished = finishedResponseOf(sanitized);
				if (finished !== void 0) extras?.remember?.(finished.responseId, finished.stopReason);
				out.push(rewriteBackendSearchError(sanitized, backendSearch));
			}
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
		const sessionId = typeof streamOptions?.sessionId === "string" && streamOptions.sessionId.length > 0 ? streamOptions.sessionId : void 0;
		const stateful = options.statefulResponses === true && options.chainStore !== void 0 && sessionId !== void 0;
		let forceFullReplay = false;
		const pending = {};
		const injected = withPayload(streamOptions, options, stateful ? {
			sessionId,
			forceFullReplay: () => forceFullReplay,
			pending,
			store: options.chainStore
		} : void 0);
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
					stopReason
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
		const decorate = (inner) => options.backendSearch || extras !== void 0 ? forwardStream(inner, options.backendSearch, extras) : inner;
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
			backendSearch: options.backendSearch
		}));
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
Uint8Array.from([
	137,
	80,
	78,
	71,
	13,
	10,
	26,
	10
]);
Uint8Array.from([
	255,
	216,
	255
]);
new TextEncoder().encode("GIF87a");
new TextEncoder().encode("GIF89a");
z.object({
	proxyUrl: z.string().default(""),
	searchModel: z.string().default(DEFAULT_XAI_SEARCH_MODEL),
	searchMaxResults: z.number().default(8),
	webSearchTimeoutMs: z.number().default(6e4),
	xSearchTimeoutMs: z.number().default(12e4),
	backendSearch: z.boolean().default(false),
	nestedSearchTools: z.boolean(),
	statefulResponses: z.boolean(),
	imagineTool: z.boolean().default(true)
});
//#endregion
//#region src/bin.ts
/** Standalone credential CLI for the optional xAI Grok bundle. */
function openBrowser(rawUrl) {
	const url = new URL(rawUrl);
	if (url.protocol !== "https:") throw new Error(`refusing to open non-HTTPS authorization URL from ${url.host}`);
	const command = process.platform === "win32" ? {
		file: "rundll32.exe",
		args: ["url.dll,FileProtocolHandler", url.href]
	} : process.platform === "darwin" ? {
		file: "open",
		args: [url.href]
	} : {
		file: "xdg-open",
		args: [url.href]
	};
	try {
		const child = spawn(command.file, command.args, {
			detached: true,
			stdio: "ignore",
			windowsHide: true
		});
		child.on("error", () => {});
		child.unref();
	} catch {}
}
function notify(event, useBrowser) {
	switch (event.type) {
		case "auth_url":
			process.stdout.write(`Open this URL to sign in:\n${event.url}\n`);
			if (event.instructions !== void 0) process.stdout.write(`${event.instructions}\n`);
			if (useBrowser) openBrowser(event.url);
			break;
		case "device_code":
			process.stdout.write(`Open this URL to sign in:\n${event.verificationUri}\n`);
			if (event.userCode.length > 0) process.stdout.write(`Enter code: ${event.userCode}\n`);
			if (useBrowser) openBrowser(event.verificationUri);
			break;
		case "info":
		case "progress": process.stdout.write(`${event.message}\n`);
	}
}
async function answerPrompt(prompt, question) {
	if (prompt.type === "select") return prompt.options.find((option) => option.id === "oauth" || option.id.includes("oauth"))?.id ?? prompt.options[0]?.id ?? "oauth";
	const suffix = prompt.placeholder === void 0 ? "" : ` (${prompt.placeholder})`;
	return question(`${prompt.message}${suffix}: `, { ...prompt.signal === void 0 ? {} : { signal: prompt.signal } });
}
function printHelp() {
	process.stdout.write([
		"Usage: dsh-grok-kit <login|logout|status|import>",
		"",
		"  login   sign in with SuperGrok or X Premium (device code)",
		"  import  copy ~/.grok/auth.json into a leftover dsh-only store (no-op when already sharing)",
		"  logout  remove the live credential (also signs Grok CLI out when sharing ~/.grok/auth.json)",
		"  status  report non-secret credential state and visible models",
		""
	].join("\n"));
}
async function run(argv) {
	if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
		printHelp();
		return 0;
	}
	const [rawAction, ...flags] = argv;
	if (rawAction !== "login" && rawAction !== "logout" && rawAction !== "status" && rawAction !== "import") {
		process.stderr.write(`dsh-grok-kit: expected login, logout, status, or import; got ${JSON.stringify(rawAction)}\n`);
		return 1;
	}
	const action = rawAction;
	if (flags.length > 0) {
		process.stderr.write(`dsh-grok-kit: invalid options for ${action}: ${flags.join(" ")}\n`);
		return 1;
	}
	try {
		switch (action) {
			case "status": {
				const session = new XaiOAuthSession();
				await session.loadCachedCatalog();
				const status = await xaiOAuthAuthStatus(session.store);
				if (!status.authenticated) {
					process.stdout.write("xAI Grok for dsh: signed out\n");
					return 1;
				}
				await session.refreshLiveCatalog();
				const expires = status.expiresAt;
				const suffix = expires === void 0 || Number.isNaN(expires.valueOf()) ? "" : `; access token expires ${expires.toISOString()} (refresh is automatic)`;
				const models = session.visibleModels().map((model) => model.id).join(", ");
				const where = session.store.sharedWithGrokCli ? `shared ${grokAuthPath()}` : xaiOAuthAuthPath();
				process.stdout.write(`xAI Grok for dsh: signed in via ${where}${suffix}\n`);
				process.stdout.write(`models (${session.catalogSource}): ${models}\n`);
				if (session.catalogError !== void 0) process.stderr.write(`dsh-grok-kit: live /models failed: ${safeMessage(session.catalogError)}\n`);
				return 0;
			}
			case "logout": {
				const session = new XaiOAuthSession();
				const where = session.store.filename;
				await session.logout();
				process.stdout.write(`xAI Grok for dsh: signed out; removed credential at ${where}\n`);
				return 0;
			}
			case "import": {
				const session = new XaiOAuthSession();
				if (session.store.sharedWithGrokCli) {
					process.stdout.write(`xAI Grok for dsh: already using ${grokAuthPath()} as the live store\n`);
					return 0;
				}
				await importXaiOAuthSession(session);
				process.stdout.write(`xAI Grok for dsh: imported ${grokAuthPath()} into ${session.store.filename}\n`);
				process.stdout.write("Prefer sharing ~/.grok/auth.json so later refresh does not fight Grok CLI.\n");
				const models = session.visibleModels().map((model) => model.id).join(", ");
				process.stdout.write(`models (${session.catalogSource}): ${models}\n`);
				return 0;
			}
			case "login": {
				const session = new XaiOAuthSession();
				const readline = createInterface({
					input: process.stdin,
					output: process.stdout
				});
				try {
					await loginXaiOAuthSession({
						prompt: (prompt) => answerPrompt(prompt, (text, options) => readline.question(text, options)),
						notify: (event) => notify(event, true)
					}, session);
				} finally {
					readline.close();
				}
				process.stdout.write(`xAI Grok for dsh: signed in; credentials saved to ${session.store.filename}\n`);
				process.stdout.write(`models (${session.catalogSource}): ${session.visibleModels().map((model) => model.id).join(", ")}\n`);
				return 0;
			}
		}
	} catch (error) {
		process.stderr.write(`dsh-grok-kit: ${action} failed: ${safeMessage(error)}\n`);
		return 1;
	}
}
if (process.argv[1] !== void 0 && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) process.exitCode = await run(process.argv.slice(2));
//#endregion
export { run };
