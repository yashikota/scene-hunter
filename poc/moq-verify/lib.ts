// runner 共通部品
import { readFileSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright";

const CHROME = process.env.CHROME ?? `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
const ORIGIN = "https://moq-verify.test";
const dir = process.env.RELAY_DIR!;

type Token = { operations: string[]; secret: string };
export function relay(name: string) {
	const r = JSON.parse(readFileSync(`${dir}/relay-${name}.json`, "utf8"));
	const tokens: Token[] = r.issuers[0].cloudflare_tokens;
	return {
		uid: r.uid as string,
		pubsub: tokens.find((t) => t.operations.includes("publish"))!.secret,
		sub: tokens.find((t) => !t.operations.includes("publish"))!.secret,
	};
}

export const results: { name: string; ok: boolean; detail: string }[] = [];
export function check(name: string, ok: boolean, detail = "") {
	results.push({ name, ok, detail });
	console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}
export function info(msg: string) {
	console.log(`INFO  ${msg}`);
}
export function summary() {
	const failed = results.filter((r) => !r.ok);
	console.log(`\n${results.length - failed.length}/${results.length} passed`);
	return failed.length;
}
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function launch(args: string[] = []) {
	return chromium.launch({ executablePath: CHROME, args });
}

export async function newClient(browser: Browser, label: string): Promise<Page> {
	const ctx = await browser.newContext();
	await ctx.route(`${ORIGIN}/**`, (route) => {
		const u = new URL(route.request().url());
		if (u.pathname.endsWith(".js")) return route.fulfill({ contentType: "text/javascript", body: readFileSync(new URL(`./dist${u.pathname}`, import.meta.url)) });
		return route.fulfill({ contentType: "text/html", body: `<!doctype html><title>${label}</title><script type="module" src="/client.js"></script><script type="module" src="/client-mt.js"></script>` });
	});
	const page = await ctx.newPage();
	page.on("console", (m) => process.env.VERBOSE && console.log(`[${label}] ${m.text()}`));
	await page.goto(`${ORIGIN}/`);
	await page.waitForFunction(() => (globalThis as any).T && (globalThis as any).MT);
	return page;
}

// page 内の T.<method>(...args) を呼ぶ
export function call<R = any>(page: Page, method: string, ...args: unknown[]): Promise<R> {
	return page.evaluate(([m, a]) => (globalThis as any).T[m as string](...(a as unknown[])), [method, args] as const);
}

export async function waitInbox(page: Page, id: string, path: string, track: string, n: number, timeoutMs = 10_000) {
	const t0 = Date.now();
	for (;;) {
		const inbox = await call<any[]>(page, "inbox", id, path, track);
		if (inbox.length >= n || Date.now() - t0 > timeoutMs) return inbox;
		await sleep(100);
	}
}

export async function tryConnect(page: Page, id: string, token: string, timeoutMs = 10_000) {
	try {
		return { ok: true as const, ...(await call(page, "connect", id, token, timeoutMs)) };
	} catch (e) {
		return { ok: false as const, error: String(e).slice(0, 300) };
	}
}

export function tamperSub(token: string, newSub: string) {
	const [h, p, s] = token.split(".");
	const payload = JSON.parse(Buffer.from(p, "base64url").toString());
	payload.sub = newSub;
	return `${h}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${s}`;
}
