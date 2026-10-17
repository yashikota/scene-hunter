// Relay のライフサイクル・トークン失効・作成速度・大量作成を検証する
// usage: CLOUDFLARE_ACCOUNT_ID=... node lifecycle.ts <lifecycle|speed|bulk>
import type { Browser, Page } from "playwright";
import { createRelay, createToken, deleteRelay, getRelay, listRelays, revokeToken, tokens, type Relay } from "./cfapi.ts";
import { call, check, info, launch, newClient, sleep, summary, tryConnect, waitInbox } from "./lib.ts";

const browser = await launch();
const created: string[] = []; // 後始末用

let seq = 0;
// token で新規接続し、path#track を announce 待ちで購読して timeoutMs 以内に受信できるか
async function canRead(b: Browser, token: string, path: string, track: string, timeoutMs = 4000) {
	const page = await newClient(b, `reader${seq}`);
	const id = `r${seq++}`;
	try {
		const c = await tryConnect(page, id, token, 5000);
		if (!c.ok) return { read: false, why: `connect失敗 ${c.error.slice(0, 120)}` };
		await call(page, "subscribe", id, path, track, "json", 0);
		const got = await waitInbox(page, id, path, track, 1, timeoutMs);
		const errs = await call<string[]>(page, "errors", id);
		return { read: got.length > 0, why: got.length ? "受信" : `未受信 ${errs.join("|").slice(0, 160)}` };
	} finally {
		await page.context().close();
	}
}

// create 呼び出し開始から、新しい relay で pub→sub のメッセージが届くまでの時間
async function timeToReady(pub: Page, sub: Page, name: string) {
	const t0 = performance.now();
	const r = await createRelay(name);
	if (!r.result) return { apiMs: r.ms, readyMs: -1, relay: undefined, error: JSON.stringify(r.errors) };
	created.push(r.result.uid);
	const tk = tokens(r.result);
	const id = `x${seq++}`;
	for (;;) {
		const cp = await tryConnect(pub, `p${id}`, tk.pubsub.secret, 5000);
		const cs = await tryConnect(sub, `s${id}`, tk.sub.secret, 5000);
		if (cp.ok && cs.ok) break;
		if (performance.now() - t0 > 30_000) return { apiMs: r.ms, readyMs: -1, relay: r.result, error: "connect timeout" };
		await sleep(200);
	}
	await call(pub, "publish", `p${id}`, "room/host", "events");
	await call(sub, "subscribe", `s${id}`, "room/host", "events", "json", 50);
	const timer = await call<number>(pub, "startTicker", `p${id}`, "room/host", "events", 100);
	const got = await waitInbox(sub, `s${id}`, "room/host", "events", 1, 30_000);
	const readyMs = got.length ? Math.round(performance.now() - t0) : -1;
	await call(pub, "stopTicker", timer);
	await call(pub, "close", `p${id}`);
	await call(sub, "close", `s${id}`);
	return { apiMs: r.ms, readyMs, relay: r.result };
}

function pct(xs: number[], p: number) {
	const s = [...xs].sort((a, b) => a - b);
	return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
}

const scenarios: Record<string, () => Promise<void>> = {
	async lifecycle() {
		const pub = await newClient(browser, "pub");
		const sub = await newClient(browser, "sub");
		const ready = await timeToReady(pub, sub, "sh-verify-C");
		check("C: 作成→初回メッセージ受信", ready.readyMs > 0, `API ${ready.apiMs}ms / ready ${ready.readyMs}ms`);
		const C = ready.relay as Relay;
		const tk = tokens(C);
		check("C: GET できる", (await getRelay(C.uid)).status === 200);

		// 常時配信しておく
		await call(pub, "connect", "pub", tk.pubsub.secret);
		await call(pub, "publish", "pub", "room/host", "events");
		const ticker = await call<number>(pub, "startTicker", "pub", "room/host", "events", 300);
		await call(sub, "connect", "sub", tk.sub.secret);
		await call(sub, "subscribe", "sub", "room/host", "events");
		await sleep(2000);

		// --- トークン失効 ---
		const t2 = (await createToken(C.uid, ["subscribe"], "kick-test")).result!;
		const tokenAt = performance.now();
		let activeAfter = -1;
		while (performance.now() - tokenAt < 120_000) {
			if ((await canRead(browser, t2.secret, "room/host", "events", 2000)).read) {
				activeAfter = Math.round(performance.now() - tokenAt);
				break;
			}
			await sleep(1000);
		}
		check("追加トークンが有効になる", activeAfter >= 0, `作成から ${activeAfter}ms`);
		const kicked = await newClient(browser, "kicked");
		await call(kicked, "connect", "kicked", t2.secret);
		await call(kicked, "subscribe", "kicked", "room/host", "events");
		check("追加トークンで購読できる", (await waitInbox(kicked, "kicked", "room/host", "events", 1, 5000)).length > 0);
		const rv = await revokeToken(C.uid, t2.jti);
		const revokedAt = performance.now();
		info(`revoke: HTTP ${rv.status} ${rv.ms}ms`);
		let blockedAfter = -1;
		for (let i = 0; i < 60; i++) {
			const r = await canRead(browser, t2.secret, "room/host", "events", 2000);
			if (!r.read) {
				blockedAfter = Math.round(performance.now() - revokedAt);
				info(`失効トークンの新規接続: ${r.why}`);
				break;
			}
			await sleep(1000);
		}
		check("失効トークンでの新規購読がブロックされる", blockedAfter >= 0, `revoke から ${blockedAfter}ms`);
		const before = (await call<any[]>(kicked, "inbox", "kicked", "room/host", "events")).length;
		await sleep(3000);
		const after = (await call<any[]>(kicked, "inbox", "kicked", "room/host", "events")).length;
		info(`失効前から繋いでいた接続: revoke 後も受信し続けた件数 = ${after - before}（ドキュメント上は切断されない）`);
		await kicked.context().close();

		// --- 削除 ---
		const del = await deleteRelay(C.uid);
		const deletedAt = performance.now();
		check("C: DELETE 成功", del.status === 200, `HTTP ${del.status} ${del.ms}ms`);
		const g = await getRelay(C.uid);
		check("C: 削除後 GET は 404", g.status === 404, `HTTP ${g.status}`);
		// 既存接続と新規接続が使えなくなるまでを観測（最大 DELETE_WAIT_S 秒）
		const waitS = Number(process.env.DELETE_WAIT_S ?? 300);
		let newBlocked = -1;
		let existingStopped = -1;
		let lastCount = (await call<any[]>(sub, "inbox", "sub", "room/host", "events")).length;
		while (performance.now() - deletedAt < waitS * 1000 && (newBlocked < 0 || existingStopped < 0)) {
			const elapsed = Math.round(performance.now() - deletedAt);
			if (newBlocked < 0) {
				const r = await canRead(browser, tk.pubsub.secret, "room/host", "events", 2000);
				if (!r.read) {
					newBlocked = elapsed;
					info(`削除後の新規接続が読めなくなった: ${elapsed}ms (${r.why})`);
				}
			}
			const count = (await call<any[]>(sub, "inbox", "sub", "room/host", "events")).length;
			if (existingStopped < 0 && count === lastCount) {
				existingStopped = elapsed;
				info(`削除前からの接続が受信停止: ${elapsed}ms`);
			}
			lastCount = count;
			if (elapsed % 30000 < 4000) info(`  t+${Math.round(elapsed / 1000)}s: 新規=${newBlocked < 0 ? "読める" : "不可"} 既存=${existingStopped < 0 ? "受信中" : "停止"}`);
			await sleep(1500);
		}
		check(`C: 削除後 ${waitS}s 以内に新規接続で読めなくなる`, newBlocked >= 0, `${newBlocked}ms`);
		check(`C: 削除後 ${waitS}s 以内に既存接続も止まる`, existingStopped >= 0, `${existingStopped}ms`);
		info(`既存接続の errors: sub=${(await call<string[]>(sub, "errors", "sub")).join("|").slice(0, 200)} pub=${(await call<string[]>(pub, "errors", "pub")).join("|").slice(0, 200)}`);
		await call(pub, "stopTicker", ticker);
	},

	async speed() {
		const N = Number(process.env.N ?? 20);
		const pub = await newClient(browser, "pub");
		const sub = await newClient(browser, "sub");
		const api: number[] = [];
		const ready: number[] = [];
		for (let i = 0; i < N; i++) {
			const r = await timeToReady(pub, sub, `sh-speed-${i}`);
			if (r.readyMs < 0) info(`#${i} 失敗 ${r.error}`);
			else (api.push(r.apiMs), ready.push(r.readyMs));
			if (r.relay) await deleteRelay(r.relay.uid);
		}
		info(`API create: p50 ${pct(api, 50)}ms p95 ${pct(api, 95)}ms max ${Math.max(...api)}ms`);
		info(`create→初回受信: p50 ${pct(ready, 50)}ms p95 ${pct(ready, 95)}ms max ${Math.max(...ready)}ms`);
		check(`作成→接続可能 p95 < 3s (N=${N})`, ready.length === N && pct(ready, 95) < 3000, `成功 ${ready.length}/${N}`);
	},

	async bulk() {
		for (const M of (process.env.M ?? "10,50,100").split(",").map(Number)) {
			const t0 = performance.now();
			const rs = await Promise.all(Array.from({ length: M }, (_, i) => createRelay(`sh-bulk-${M}-${i}`)));
			const ms = Math.round(performance.now() - t0);
			const ok = rs.filter((r) => r.result);
			ok.forEach((r) => created.push(r.result!.uid));
			const codes = Object.entries(rs.reduce<Record<number, number>>((a, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), a), {}));
			const errs = [...new Set(rs.filter((r) => !r.result).map((r) => JSON.stringify(r.errors)))];
			info(`${M} 並列作成: ${ms}ms, status=${JSON.stringify(codes)} ${errs.join(" ").slice(0, 300)}`);
			const listed = await listRelays("?per_page=1000");
			info(`list: HTTP ${listed.status} 件数 ${listed.result?.length}`);
			// 作成した relay のうち先頭と末尾で実際に通信できるか
			const pub = await newClient(browser, "bpub");
			const sub = await newClient(browser, "bsub");
			for (const r of [ok[0], ok.at(-1)].filter(Boolean)) {
				const tk = tokens(r!.result!);
				await call(pub, "connect", r!.result!.uid, tk.pubsub.secret);
				await call(pub, "publish", r!.result!.uid, "room/host", "events");
				const timer = await call<number>(pub, "startTicker", r!.result!.uid, "room/host", "events", 200);
				const rr = await canRead(browser, tk.sub.secret, "room/host", "events", 5000);
				await call(pub, "stopTicker", timer);
				info(`  ${r!.result!.name}: ${rr.why}`);
			}
			await pub.context().close();
			await sub.context().close();
			check(`${M} 並列作成が全件成功`, ok.length === M, `${ok.length}/${M}`);
			const t1 = performance.now();
			const dels = await Promise.all(ok.map((r) => deleteRelay(r.result!.uid)));
			const delFail = dels.filter((d) => d.status !== 200);
			info(`${ok.length} 並列削除: ${Math.round(performance.now() - t1)}ms 失敗 ${delFail.length} ${[...new Set(delFail.map((d) => d.status))]}`);
			dels.forEach((d, i) => d.status === 200 && created.splice(created.indexOf(ok[i].result!.uid), 1));
		}
	},
};

try {
	for (const name of process.argv.slice(2)) {
		console.log(`\n=== ${name}`);
		await scenarios[name]();
	}
} finally {
	for (const uid of created) await deleteRelay(uid);
	await browser.close();
}
process.exit(summary() ? 1 : 0);
