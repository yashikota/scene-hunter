// ブラウザから署名付き URL で R2 へ直接 PUT / GET できるか（CORS 込み）を検証する
// usage: (presign.ts と同じ環境変数) node browser.ts <before-cors|after-cors>
import { AwsClient } from "aws4fetch";
import { chromium } from "playwright";

const CHROME = process.env.CHROME ?? `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
const ORIGIN = "https://scene-hunter.test";
const account = process.env.R2_ACCOUNT_ID!;
const bucket = process.env.R2_BUCKET!;
const r2 = new AwsClient({ accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!, service: "s3", region: "auto" });
const base = `https://${account}.r2.cloudflarestorage.com/${bucket}`;

async function presign(method: "PUT" | "GET", key: string, headers: Record<string, string> = {}) {
	const url = new URL(`${base}/${key}`);
	url.searchParams.set("X-Amz-Expires", "300");
	return (await r2.sign(url.toString(), { method, headers, aws: { signQuery: true, allHeaders: true } })).url;
}

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
	if (!ok) failed++;
	console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

const phase = process.argv[2] ?? "after-cors";
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage();
await page.route(`${ORIGIN}/**`, (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>r2</title>" }));
await page.goto(`${ORIGIN}/`);

// ブラウザ内で size バイトの Blob を PUT する（Content-Length はブラウザが自動で付ける）
const browserPut = (url: string, size: number, type = "image/jpeg") =>
	page.evaluate(
		async ([url, size, type]) => {
			try {
				const res = await fetch(url, { method: "PUT", body: new Blob([new Uint8Array(size)], { type }), headers: { "content-type": type } });
				return { status: res.status, error: "" };
			} catch (e) {
				return { status: 0, error: String(e) };
			}
		},
		[url, size, type] as const,
	);

const key = `browser-${Date.now().toString(36)}.jpg`;
const N = 300 * 1024;
const putUrl = await presign("PUT", key, { "content-type": "image/jpeg", "content-length": String(N) });
const r = await browserPut(putUrl, N);
if (phase === "before-cors") {
	check("CORS 未設定だとブラウザからの PUT は失敗する", r.status === 0, r.error || `HTTP ${r.status}`);
} else {
	check("ブラウザから署名どおりのサイズで PUT できる（Content-Length が一致する）", r.status === 200, r.error || `HTTP ${r.status}`);
	const big = await browserPut(putUrl, N * 2);
	check("ブラウザから署名より大きいサイズを PUT すると失敗", big.status !== 200, big.error || `HTTP ${big.status}`);
	const getUrl = await presign("GET", key);
	const g = await page.evaluate(async (u) => {
		try {
			const res = await fetch(u);
			return { status: res.status, bytes: (await res.arrayBuffer()).byteLength, error: "" };
		} catch (e) {
			return { status: 0, bytes: 0, error: String(e) };
		}
	}, getUrl);
	check("ブラウザから署名付き GET で取得できる", g.status === 200 && g.bytes === N, g.error || `HTTP ${g.status} ${g.bytes}B`);
	// <img> 表示（CORS 不要の経路）
	const img = await page.evaluate(
		(u) => new Promise<boolean>((res) => {
			const el = new Image();
			el.onload = () => res(true);
			el.onerror = () => res(false);
			el.src = u;
		}),
		getUrl,
	);
	console.log(`INFO  <img src=署名付きGET>: ${img ? "読み込み成功" : "読み込み失敗（ダミーバイトなので画像として壊れているだけの可能性あり）"}`);
}
await r2.fetch(`${base}/${key}`, { method: "DELETE" });
await browser.close();
console.log(`\n${failed ? `${failed} failed` : "all passed"}`);
process.exit(failed ? 1 : 0);
