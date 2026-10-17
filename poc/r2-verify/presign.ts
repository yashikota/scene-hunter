// R2 の署名付き PUT でアップロードサイズ・形式を制限できるかを検証する
// usage: R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_BUCKET=... node presign.ts
import { AwsClient } from "aws4fetch";

const account = process.env.R2_ACCOUNT_ID!;
const bucket = process.env.R2_BUCKET!;
const r2 = new AwsClient({
	accessKeyId: process.env.R2_ACCESS_KEY_ID!,
	secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
	service: "s3",
	region: "auto",
});
const base = `https://${account}.r2.cloudflarestorage.com/${bucket}`;

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
	if (!ok) failed++;
	console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

// Workers 側で行う想定の処理: key・形式・サイズを決めて PUT URL に署名する
async function presignPut(key: string, opts: { contentType?: string; contentLength?: number; expires?: number }) {
	const url = new URL(`${base}/${key}`);
	url.searchParams.set("X-Amz-Expires", String(opts.expires ?? 300));
	const headers: Record<string, string> = {};
	if (opts.contentType) headers["content-type"] = opts.contentType;
	if (opts.contentLength !== undefined) headers["content-length"] = String(opts.contentLength);
	// allHeaders: aws4fetch は既定で content-type / content-length を署名対象から外すので明示的に含める
	const signed = await r2.sign(url.toString(), { method: "PUT", headers, aws: { signQuery: true, allHeaders: true } });
	return signed.url;
}

async function presignGet(key: string, expires = 300) {
	const url = new URL(`${base}/${key}`);
	url.searchParams.set("X-Amz-Expires", String(expires));
	return (await r2.sign(url.toString(), { method: "GET", aws: { signQuery: true } })).url;
}

async function put(url: string, size: number, contentType = "image/jpeg") {
	const body = new Uint8Array(size).fill(0x42);
	const res = await fetch(url, { method: "PUT", body, headers: { "content-type": contentType } });
	return { status: res.status, text: (await res.text()).slice(0, 160).replace(/\s+/g, " ") };
}

const KB = 1024;
const MB = 1024 * KB;
const N = 512 * KB;
const run = `verify-${Date.now().toString(36)}`;

// 1. Content-Type と Content-Length (=N) を署名
const url = await presignPut(`${run}/a.jpg`, { contentType: "image/jpeg", contentLength: N });
check("signedHeaders に content-length が含まれる", new URL(url).searchParams.get("X-Amz-SignedHeaders")?.includes("content-length") ?? false, new URL(url).searchParams.get("X-Amz-SignedHeaders") ?? "");
let r = await put(url, N);
check("署名どおりのサイズ・形式は成功", r.status === 200, `HTTP ${r.status}`);
r = await put(url, 2 * N);
check("署名より大きいサイズは拒否", r.status === 403, `HTTP ${r.status} ${r.text}`);
r = await put(url, N / 2);
check("署名より小さいサイズも拒否", r.status === 403, `HTTP ${r.status} ${r.text}`);
r = await put(url, N, "image/png");
check("署名と違う Content-Type は拒否", r.status === 403, `HTTP ${r.status} ${r.text}`);
r = await put(url, N);
check("有効期限内なら同じ URL を再利用できる（上書き）", r.status === 200, `HTTP ${r.status}`);

// 2. Content-Length を署名しない場合（=サイズ無制限であることの確認）
const loose = await presignPut(`${run}/b.jpg`, { contentType: "image/jpeg" });
r = await put(loose, 10 * MB);
check("Content-Length 未署名なら 10MB でも通ってしまう", r.status === 200, `HTTP ${r.status}`);

// 3. 有効期限
const short = await presignPut(`${run}/c.jpg`, { contentType: "image/jpeg", contentLength: N, expires: 1 });
await new Promise((res) => setTimeout(res, 2500));
r = await put(short, N);
check("期限切れの URL は拒否", r.status === 403, `HTTP ${r.status} ${r.text}`);

// 4. 署名付き GET
const get = await fetch(await presignGet(`${run}/a.jpg`));
const got = new Uint8Array(await get.arrayBuffer());
check("署名付き GET で取得できる", get.status === 200 && got.byteLength === N, `HTTP ${get.status} ${got.byteLength}B`);
const anon = await fetch(`${base}/${run}/a.jpg`);
check("署名なし GET は拒否", anon.status === 400 || anon.status === 401 || anon.status === 403, `HTTP ${anon.status}`);

// 後始末
for (const k of ["a.jpg", "b.jpg", "c.jpg"]) await r2.fetch(`${base}/${run}/${k}`, { method: "DELETE" });
console.log(`\n${failed ? `${failed} failed` : "all passed"}`);
process.exit(failed ? 1 : 0);
