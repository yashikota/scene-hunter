// Cloudflare MoQ Relay API の薄いラッパー。cf CLI の OAuth トークンを流用する
import { readFileSync } from "node:fs";

const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID!;
const BASE = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/moq/relays`;

function bearer() {
	return JSON.parse(readFileSync(`${process.env.HOME}/.config/cloudflare/config/default.json`, "utf8")).oauth_token as string;
}

export type RelayToken = { jti: string; operations: string[]; secret: string };
export type Relay = { uid: string; name: string; issuers?: { cloudflare_tokens: RelayToken[] }[] };

async function api<T>(method: string, path: string, body?: unknown): Promise<{ status: number; ms: number; result?: T; errors?: unknown }> {
	const t0 = performance.now();
	const res = await fetch(BASE + path, {
		method,
		headers: { authorization: `Bearer ${bearer()}`, "content-type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const ms = Math.round(performance.now() - t0);
	const json: any = await res.json().catch(() => ({}));
	return { status: res.status, ms, result: json.result, errors: json.errors };
}

export const createRelay = (name: string) => api<Relay>("POST", "", { name });
export const getRelay = (uid: string) => api<Relay>("GET", `/${uid}`);
export const deleteRelay = (uid: string) => api<unknown>("DELETE", `/${uid}`);
export const listRelays = (query = "") => api<Relay[]>("GET", query);
// レスポンスは { issuers: [{ cloudflare_tokens: [...] }] } 形式。secret を持つものが今作ったトークン
export async function createToken(uid: string, operations: string[], label?: string) {
	const r = await api<Relay>("POST", `/${uid}/tokens`, { operations, label });
	const t = r.result?.issuers?.[0]?.cloudflare_tokens.find((t) => t.secret && (label === undefined || (t as any).label === label));
	return { ...r, result: t };
}
export const revokeToken = (uid: string, jti: string) => api<unknown>("DELETE", `/${uid}/tokens/${jti}`);

export function tokens(r: Relay) {
	const ts = r.issuers![0].cloudflare_tokens;
	return { pubsub: ts.find((t) => t.operations.includes("publish"))!, sub: ts.find((t) => !t.operations.includes("publish"))! };
}
