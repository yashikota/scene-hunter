// Playwright で複数のブラウザコンテキスト（=別々の端末相当）を立ち上げ、
// Cloudflare MoQ Relay 上で P0 の検証を行う runner。
// usage: RELAY_DIR=<relay-A.json/relay-B.json のあるディレクトリ> node run.ts [scenario...]
import { readFileSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright";

const CHROME = process.env.CHROME ?? `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
const ORIGIN = "https://moq-verify.test";
const dir = process.env.RELAY_DIR!;

type Token = { operations: string[]; secret: string };
function relay(name: string) {
	const r = JSON.parse(readFileSync(`${dir}/relay-${name}.json`, "utf8"));
	const tokens: Token[] = r.issuers[0].cloudflare_tokens;
	return {
		uid: r.uid as string,
		pubsub: tokens.find((t) => t.operations.includes("publish"))!.secret,
		sub: tokens.find((t) => !t.operations.includes("publish"))!.secret,
	};
}

const results: { name: string; ok: boolean; detail: string }[] = [];
function check(name: string, ok: boolean, detail = "") {
	results.push({ name, ok, detail });
	console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function newClient(browser: Browser, label: string): Promise<Page> {
	const ctx = await browser.newContext();
	await ctx.route(`${ORIGIN}/**`, (route) => {
		const u = new URL(route.request().url());
		if (u.pathname === "/client.js") return route.fulfill({ contentType: "text/javascript", body: readFileSync(new URL("./dist/client.js", import.meta.url)) });
		return route.fulfill({ contentType: "text/html", body: `<!doctype html><title>${label}</title><script type="module" src="/client.js"></script>` });
	});
	const page = await ctx.newPage();
	page.on("console", (m) => process.env.VERBOSE && console.log(`[${label}] ${m.text()}`));
	await page.goto(`${ORIGIN}/`);
	await page.waitForFunction(() => (globalThis as any).T);
	return page;
}

// page 内の T.<method>(...args) を呼ぶ
function call<R = any>(page: Page, method: string, ...args: unknown[]): Promise<R> {
	return page.evaluate(([m, a]) => (globalThis as any).T[m as string](...(a as unknown[])), [method, args] as const);
}

async function waitInbox(page: Page, id: string, path: string, track: string, n: number, timeoutMs = 10_000) {
	const t0 = Date.now();
	for (;;) {
		const inbox = await call<any[]>(page, "inbox", id, path, track);
		if (inbox.length >= n || Date.now() - t0 > timeoutMs) return inbox;
		await sleep(100);
	}
}

function tamperSub(token: string, newSub: string) {
	const [h, p, s] = token.split(".");
	const payload = JSON.parse(Buffer.from(p, "base64url").toString());
	payload.sub = newSub;
	return `${h}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${s}`;
}

async function main() {
	const A = relay("A");
	const B = relay("B");
	const browser = await chromium.launch({ executablePath: CHROME, args: ["--ignore-certificate-errors-spki-list"] });
	const [a1, a2, b1, b2] = await Promise.all(["A1", "A2", "B1", "B2"].map((l) => newClient(browser, l)));

	check("WebTransport API が存在する", await a1.evaluate(() => (globalThis as any).T.webtransport));

	// --- 接続 ---
	for (const [p, id, tok] of [[a1, "A1", A.pubsub], [a2, "A2", A.pubsub], [b1, "B1", B.pubsub], [b2, "B2", B.pubsub]] as const) {
		try {
			const r = await call(p, "connect", id, tok);
			check(`${id} 接続`, true, `${r.ms}ms`);
		} catch (e) {
			check(`${id} 接続`, false, String(e).slice(0, 300));
		}
	}

	// --- 双方向通信 (Relay A 内) ---
	await call(a1, "publish", "A1", "room/host", "events");
	await call(a2, "publish", "A2", "room/p2", "events");
	await call(b1, "publish", "B1", "room/host", "events"); // 同じパスを Relay B でも使う
	await call(a2, "subscribe", "A2", "room/host", "events");
	await call(a1, "subscribe", "A1", "room/p2", "events");
	await call(b2, "subscribe", "B2", "room/host", "events");
	await call(b2, "subscribe", "B2", "room/p2", "events"); // Relay A にしか無いパス
	await sleep(1500);

	await call(a1, "sendJson", "A1", "room/host", "events", { from: "A1", type: "hint", text: "赤い橋" });
	await call(b1, "sendJson", "B1", "room/host", "events", { from: "B1", type: "hint", text: "青い塔" });
	await call(a2, "sendJson", "A2", "room/p2", "events", { from: "A2", type: "join", name: "p2" });

	const a2got = await waitInbox(a2, "A2", "room/host", "events", 1);
	const a1got = await waitInbox(a1, "A1", "room/p2", "events", 1);
	const b2got = await waitInbox(b2, "B2", "room/host", "events", 1);
	await sleep(1500); // 混線した余分なメッセージが来ないか少し待つ
	const b2p2 = await call<any[]>(b2, "inbox", "B2", "room/p2", "events");
	const a2final = await call<any[]>(a2, "inbox", "A2", "room/host", "events");

	check("A1→A2 (host→参加者) 受信", a2got.some((m) => m.json?.from === "A1"), JSON.stringify(a2got.map((m) => m.json)));
	check("A2→A1 (参加者→host) 受信", a1got.some((m) => m.json?.from === "A2"), JSON.stringify(a1got.map((m) => m.json)));
	check("B 内でも同パスで受信", b2got.some((m) => m.json?.from === "B1"), JSON.stringify(b2got.map((m) => m.json)));
	check("分離: A2 に B1 のメッセージが混ざらない", a2final.every((m) => m.json?.from === "A1"), JSON.stringify(a2final.map((m) => m.json)));
	check("分離: B2 に A のメッセージが混ざらない", (await call<any[]>(b2, "inbox", "B2", "room/host", "events")).every((m) => m.json?.from === "B1"));
	check("分離: B2 は A にしか無い room/p2 を受信できない", b2p2.length === 0, JSON.stringify(b2p2));
	const annA = await call<string[]>(a2, "announced", "A2");
	const annB = await call<string[]>(b2, "announced", "B2");
	check("分離: announce 一覧が relay 毎に分かれる", !annB.includes("room/p2"), `A2 sees ${JSON.stringify(annA)}, B2 sees ${JSON.stringify(annB)}`);

	// --- 順序 ---
	const N = 200;
	for (let i = 0; i < N; i++) await call(a1, "sendJson", "A1", "room/host", "events", { from: "A1", seq: i });
	const ordered = (await waitInbox(a2, "A2", "room/host", "events", 1 + N, 15_000)).filter((m) => typeof m.json?.seq === "number");
	const seqs = ordered.map((m) => m.json.seq);
	check(`順序: ${N} 件連続送信が全件・順番通り届く`, seqs.length === N && seqs.every((v, i) => v === i), `got ${seqs.length}, first misorder at ${seqs.findIndex((v, i) => v !== i)}`);

	// --- 写真相当のバイナリ ---
	await call(a2, "publish", "A2", "room/p2", "photo");
	await call(a1, "subscribe", "A1", "room/p2", "photo", "blob");
	await sleep(1000);
	const blobs: [number, number][] = [
		[1 << 20, 64 << 10],
		[5 << 20, 64 << 10],
		[1 << 20, 1 << 20],
		[5 << 20, 5 << 20],
	];
	const hashes: string[] = [];
	for (const [size, chunk] of blobs) {
		const t0 = Date.now();
		hashes.push(await call(a2, "sendBlob", "A2", "room/p2", "photo", size, chunk));
		const got = await waitInbox(a1, "A1", "room/p2", "photo", hashes.length, 30_000);
		const r = got[hashes.length - 1];
		check(
			`写真: ${size >> 20}MB / frame ${chunk >> 10}KB の SHA-256 一致`,
			r?.sha256 === hashes.at(-1),
			r ? `${r.bytes}B ${r.frames}frames ${Date.now() - t0}ms ${r.error ?? ""}` : "未受信",
		);
	}

	// --- トークン ---
	const tampered = tamperSub(A.pubsub, B.uid);
	const [x] = await Promise.all([newClient(browser, "X")]);
	try {
		await call(x, "connect", "X", tampered, 5000);
		check("改ざん JWT (sub を B に書き換え) が拒否される", false, "接続できてしまった");
	} catch (e) {
		check("改ざん JWT (sub を B に書き換え) が拒否される", true, String(e).slice(0, 200));
	}
	try {
		await call(x, "connect", "X", "garbage", 5000);
		check("不正トークンが拒否される", false, "接続できてしまった");
	} catch (e) {
		check("不正トークンが拒否される", true, String(e).slice(0, 200));
	}

	// subscribe 専用トークンで publish を試みる
	const s = await newClient(browser, "S");
	await call(s, "connect", "S", A.sub);
	await call(s, "publish", "S", "room/host", "events"); // host になりすまし
	await call(s, "publish", "S", "room/evil", "events");
	await call(a2, "subscribe", "A2", "room/evil", "events");
	await sleep(1500);
	await call(s, "sendJson", "S", "room/host", "events", { from: "S", type: "hint", text: "なりすまし" });
	await call(s, "sendJson", "S", "room/evil", "events", { from: "S" });
	await sleep(3000);
	const evil = await call<any[]>(a2, "inbox", "A2", "room/evil", "events");
	const hostAfter = await call<any[]>(a2, "inbox", "A2", "room/host", "events");
	check("subscribe 専用トークンの publish が届かない (新規パス)", evil.length === 0, JSON.stringify(evil.map((m) => m.json)));
	check("subscribe 専用トークンで host パスを乗っ取れない", hostAfter.every((m) => m.json?.from === "A1"), JSON.stringify(hostAfter.filter((m) => m.json?.from !== "A1")));
	check("subscribe 専用トークンでも購読はできる", await (async () => {
		await call(s, "subscribe", "S", "room/host", "events");
		await sleep(1000);
		await call(a1, "sendJson", "A1", "room/host", "events", { from: "A1", type: "ping" });
		return (await waitInbox(s, "S", "room/host", "events", 1)).length > 0;
	})());

	// pubsub トークンを持つ参加者は host パスを publish できてしまうか（=アプリ層での検証が必要か）
	await call(a2, "publish", "A2", "room/host", "events");
	await sleep(1000);
	await call(a2, "sendJson", "A2", "room/host", "events", { from: "A2-spoof", type: "hint" });
	await sleep(2500);
	const spoof = (await call<any[]>(s, "inbox", "S", "room/host", "events")).filter((m) => m.json?.from === "A2-spoof");
	console.log(`INFO  pubsub トークンの参加者が room/host を publish → 他者に届いた件数: ${spoof.length}`);

	for (const id of ["A1", "A2", "B1", "B2", "S"]) {
		const errs = await call<string[]>({ A1: a1, A2: a2, B1: b1, B2: b2, S: s }[id]!, "errors", id);
		if (errs.length) console.log(`INFO  ${id} errors: ${errs.join(" | ").slice(0, 400)}`);
	}

	await browser.close();
	const failed = results.filter((r) => !r.ok);
	console.log(`\n${results.length - failed.length}/${results.length} passed`);
	process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
	console.error(e);
	process.exit(2);
});
