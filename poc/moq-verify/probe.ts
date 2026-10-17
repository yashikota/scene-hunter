import { execSync } from "node:child_process";
// FAIL した項目を個別に深掘りするシナリオ集
// usage: RELAY_DIR=... node probe.ts <token|order|blob|hijack|late>
import { call, check, info, launch, newClient, relay, sleep, summary, tamperSub, tryConnect, waitInbox } from "./lib.ts";

const A = relay("A");
const B = relay("B");
const browser = await launch();
let R = "";

const scenarios: Record<string, () => Promise<void>> = {
	// 不正トークンで「接続できた」後、実際に読み書きできるのか
	async token() {
		const host = await newClient(browser, "host");
		await call(host, "connect", "host", A.pubsub);
		await call(host, "publish", "host", `${R}/host`, "events");
		const hostB = await newClient(browser, "hostB");
		await call(hostB, "connect", "hostB", B.pubsub);
		await call(hostB, "publish", "hostB", `${R}/host`, "events");

		for (const [label, tok] of [
			["改ざん(sub=A→B)", tamperSub(A.pubsub, B.uid)],
			["改ざん(sub=B→A)", tamperSub(B.pubsub, A.uid)],
			["ゴミ文字列", "garbage"],
			["トークン無し", ""],
		] as const) {
			const x = await newClient(browser, label);
			const c = await tryConnect(x, "X", tok, 5000);
			info(`${label}: connect ${c.ok ? `成功 ${c.ms}ms` : `失敗 ${c.error}`}`);
			if (!c.ok) {
				check(`${label}: 拒否される`, true, "接続段階で拒否");
				continue;
			}
			await call(x, "subscribe", "X", `${R}/host`, "events", "json", 2, false);
			await call(x, "publish", "X", `${R}/x`, "events");
			await sleep(2000);
			await call(host, "sendJson", "host", `${R}/host`, "events", { from: "A-host" });
			await call(hostB, "sendJson", "hostB", `${R}/host`, "events", { from: "B-host" });
			const got = await waitInbox(x, "X", `${R}/host`, "events", 1, 3000);
			const ann = await call<string[]>(x, "announced", "X");
			const errs = await call<string[]>(x, "errors", "X");
			check(`${label}: どのルームのデータも読めない`, got.length === 0, `got=${JSON.stringify(got.map((m) => m.json))} announced=${JSON.stringify(ann)} errs=${errs.join(" | ").slice(0, 250)}`);
		}
	},

	// 1メッセージ1グループ と 1グループ多フレーム の順序・欠落比較
	async order() {
		const host = await newClient(browser, "host");
		const p = await newClient(browser, "p");
		await call(host, "connect", "host", A.pubsub);
		await call(p, "connect", "p", A.pubsub);
		await call(host, "publish", "host", `${R}/host`, "groups");
		await call(host, "publish", "host", `${R}/host`, "frames");
		await call(p, "subscribe", "p", `${R}/host`, "groups", "json");
		await call(p, "subscribe", "p", `${R}/host`, "frames", "frames");
		await sleep(2000);
		for (const [N, gapMs] of [[200, 0], [200, 20], [1000, 0]] as const) {
			const before = (await call<any[]>(p, "inbox", "p", `${R}/host`, "groups")).length;
			const beforeF = (await call<any[]>(p, "inbox", "p", `${R}/host`, "frames")).length;
			await call(host, "openGroup", "host", `${R}/host`, "frames");
			for (let i = 0; i < N; i++) {
				await call(host, "sendJson", "host", `${R}/host`, "groups", { seq: i });
				await call(host, "sendFrameJson", "host", `${R}/host`, "frames", { seq: i });
				if (gapMs) await sleep(gapMs);
			}
			const g = (await waitInbox(p, "p", `${R}/host`, "groups", before + N, 15_000)).slice(before).map((m) => m.json?.seq);
			const f = (await waitInbox(p, "p", `${R}/host`, "frames", beforeF + N, 15_000)).slice(beforeF).map((m) => m.json?.seq);
			const inOrder = (a: number[]) => a.every((v, i) => i === 0 || v > a[i - 1]);
			check(`groups N=${N} gap=${gapMs}ms 全件・順序`, g.length === N && g.every((v, i) => v === i), `受信 ${g.length}/${N}, 単調増加=${inOrder(g)}`);
			check(`frames N=${N} gap=${gapMs}ms 全件・順序`, f.length === N && f.every((v, i) => v === i), `受信 ${f.length}/${N}, 単調増加=${inOrder(f)}`);
		}
		info(`p errors: ${(await call<string[]>(p, "errors", "p")).join(" | ").slice(0, 300)}`);
	},

	// 写真サイズ × フレームサイズ
	async blob() {
		const p = await newClient(browser, "p");
		const host = await newClient(browser, "host");
		await call(p, "connect", "p", A.pubsub);
		await call(host, "connect", "host", A.pubsub);
		await call(p, "publish", "p", `${R}/p`, "photo");
		await call(host, "subscribe", "host", `${R}/p`, "photo", "blob");
		await sleep(2000);
		const KB = 1024, MB = 1024 * KB;
		const cases = (process.env.BLOB_CASES ?? "2:64,3:64,5:64,5:256,5:1024,5:5120,5:64,5:5120,5:64")
			.split(",")
			.map((c) => c.split(":").map(Number))
			.map(([mb, kb]) => [mb * MB, kb * KB]);
		let n = 0;
		for (const [size, chunk] of cases) {
			const t0 = Date.now();
			const hash = await call<string>(p, "sendBlob", "p", `${R}/p`, "photo", size, chunk);
			n++;
			const r = (await waitInbox(host, "host", `${R}/p`, "photo", n, 60_000))[n - 1];
			const ms = Date.now() - t0;
			check(
				`${size / MB}MB / frame ${chunk / KB}KB (${size / chunk} frames)`,
				r?.sha256 === hash,
				r ? `${r.frames}frames受信 ${ms}ms ${r.sha256 === hash ? `${((size / MB) / (ms / 1000)).toFixed(2)}MB/s` : r.error ?? "hash不一致"}` : "未受信(タイムアウト)",
			);
			if (!r) n--;
		}
	},

	// MALFORMED_TRACK の条件切り分け。各ケースは新しいパスで行う
	async malformed() {
		type Step = { track?: string; mb: number; kb: number; pace?: number; gap?: number };
		const cases: Record<string, { stamped: boolean; steps: Step[] }> = {
			"基準: 1MB/64KB → 5MB/64KB": { stamped: true, steps: [{ mb: 1, kb: 64 }, { mb: 5, kb: 64 }] },
			"TIMESTAMP 拡張なし": { stamped: false, steps: [{ mb: 1, kb: 64 }, { mb: 5, kb: 64 }] },
			"別 Track に分ける": { stamped: true, steps: [{ track: "a", mb: 1, kb: 64 }, { track: "b", mb: 5, kb: 64 }] },
			"間に 10 秒空ける": { stamped: true, steps: [{ mb: 1, kb: 64 }, { mb: 5, kb: 64, gap: 10_000 }] },
			"1フレーム Group (10KB) × 100": { stamped: true, steps: Array.from({ length: 100 }, () => ({ mb: 10 / 1024, kb: 10 })) },
			"最小: 小さい複数フレーム × 2": { stamped: true, steps: [{ mb: 0.25, kb: 64 }, { mb: 0.25, kb: 64 }] },
			"複数フレーム、5秒以上かかるもの × 2": { stamped: true, steps: [{ mb: 4, kb: 64 }, { mb: 4, kb: 64 }] },
			"2つ目を 1MB 以下 (2秒未満)": { stamped: true, steps: [{ mb: 1, kb: 64 }, { mb: 1, kb: 64 }, { mb: 1, kb: 64 }] },
			"2つ目のフレームを 100ms 間隔で送る": { stamped: true, steps: [{ mb: 1, kb: 64 }, { mb: 5, kb: 64, pace: 100 }] },
			"1MB 1フレーム → 5MB/64KB": { stamped: true, steps: [{ mb: 1, kb: 1024 }, { mb: 5, kb: 64 }] },
			"1MB/64KB → 5MB 1フレーム": { stamped: true, steps: [{ mb: 1, kb: 64 }, { mb: 5, kb: 5120 }] },
		};
		const only = process.env.CASES?.split(",");
		const pub = await newClient(browser, "pub");
		const sub = await newClient(browser, "sub");
		await call(pub, "connect", "pub", A.pubsub);
		await call(sub, "connect", "sub", A.pubsub);
		let c = 0;
		for (const [name, { stamped, steps }] of Object.entries(cases)) {
			if (only && !only.some((o) => name.includes(o))) continue;
			const path = `${R}/c${c++}`;
			const tracks = [...new Set(steps.map((s) => s.track ?? "photo"))];
			for (const t of tracks) {
				await call(pub, "publish", "pub", path, t, stamped, process.env.MAX_AGE ? Number(process.env.MAX_AGE) : undefined);
				await call(sub, "subscribe", "sub", path, t, "blob", 0);
			}
			await sleep(2000);
			const counts: Record<string, number> = {};
			const lines: string[] = [];
			let ok = 0;
			for (const st of steps) {
				const t = st.track ?? "photo";
				if (st.gap) await sleep(st.gap);
				const t0 = Date.now();
				const hash = await call<string>(pub, "sendBlob", "pub", path, t, Math.round(st.mb * 1024 * 1024), st.kb * 1024, st.pace ?? 0);
				counts[t] = (counts[t] ?? 0) + 1;
				const r = (await waitInbox(sub, "sub", path, t, counts[t], 60_000))[counts[t] - 1];
				if (!r) counts[t]--;
				const good = r?.sha256 === hash;
				if (good) ok++;
				if (!good || steps.length <= 5) lines.push(`${st.mb >= 1 ? st.mb + "MB" : Math.round(st.mb * 1024) + "KB"}/${st.kb}KB: ${good ? "OK" : `NG frames=${r?.frames ?? "-"} ${r?.error ?? "未受信"}`} ${Date.now() - t0}ms`);
			}
			const errs = await call<string[]>(sub, "errors", "sub");
			check(name, ok === steps.length, `${ok}/${steps.length}  ${lines.slice(0, 4).join(" | ")}${errs.length ? ` errs=${errs.slice(-1)[0].slice(0, 120)}` : ""}`);
		}
	},

	// publisher を moqtail に替えて、同じ送信パターンで MALFORMED_TRACK が出るか
	async moqtail() {
		const pub = await newClient(browser, "mtpub");
		const sub = await newClient(browser, "sub");
		const mt = (m: string, ...a: unknown[]) => pub.evaluate(([m, a]) => (globalThis as any).MT[m as string](...(a as unknown[])), [m, a] as const);
		await mt("connect", A.pubsub);
		await call(sub, "connect", "sub", A.pubsub);
		const steps: [number, number][] = (process.env.MT_STEPS ?? "1:64,5:64").split(",").map((x) => x.split(":").map(Number) as [number, number]);
		const ns = R; // 1セグメントの namespace
		await mt("publish", ns, "photo");
		await call(sub, "subscribe", "sub", ns, "photo", "blob", 0);
		await sleep(3000);
		let n = 0;
		for (const [mb, kb] of steps) {
			const t0 = Date.now();
			const hash = await mt("sendBlob", ns, "photo", mb * 1024 * 1024, kb * 1024);
			n++;
			const r = (await waitInbox(sub, "sub", ns, "photo", n, 60_000))[n - 1];
			if (!r) n--;
			check(`moqtail publisher: ${mb}MB/${kb}KB`, r?.sha256 === hash, r ? `frames=${r.frames} ${Date.now() - t0}ms ${r.error ?? ""}` : "未受信");
		}
		info(`moqtail log: ${(await mt("log")).slice(0, 12).join(", ")}`);
		info(`sub errors: ${(await call<string[]>(sub, "errors", "sub")).join(" | ").slice(0, 300)}`);
	},

	// pubsub トークンを持つ参加者が host のパスを横取りできるか
	async hijack() {
		const host = await newClient(browser, "host");
		const evil = await newClient(browser, "evil");
		const p = await newClient(browser, "p");
		for (const [pg, id] of [[host, "host"], [evil, "evil"], [p, "p"]] as const) await call(pg, "connect", id, A.pubsub);
		await call(host, "publish", "host", `${R}/host`, "events");
		await call(p, "subscribe", "p", `${R}/host`, "events");
		await sleep(2000);
		await call(host, "sendJson", "host", `${R}/host`, "events", { from: "host", n: 1 });
		await waitInbox(p, "p", `${R}/host`, "events", 1);
		await call(evil, "publish", "evil", `${R}/host`, "events");
		await sleep(2000);
		await call(evil, "sendJson", "evil", `${R}/host`, "events", { from: "evil", n: 1 });
		await call(host, "sendJson", "host", `${R}/host`, "events", { from: "host", n: 2 });
		await sleep(3000);
		const existing = await call<any[]>(p, "inbox", "p", `${R}/host`, "events");
		info(`既存購読者が受信: ${JSON.stringify(existing.map((m) => m.json))}`);
		info(`既存購読者 errors: ${(await call<string[]>(p, "errors", "p")).join(" | ").slice(0, 300)}`);
		// 後から来た購読者はどちらを受け取るか
		const late = await newClient(browser, "late");
		await call(late, "connect", "late", A.pubsub);
		await call(late, "subscribe", "late", `${R}/host`, "events");
		await sleep(2000);
		await call(evil, "sendJson", "evil", `${R}/host`, "events", { from: "evil", n: 2 });
		await call(host, "sendJson", "host", `${R}/host`, "events", { from: "host", n: 3 });
		await sleep(3000);
		const lateGot = await call<any[]>(late, "inbox", "late", `${R}/host`, "events");
		info(`後から来た購読者が受信: ${JSON.stringify(lateGot.map((m) => m.json))}`);
		const all = [...existing, ...lateGot].map((m) => m.json?.from);
		check("参加者が host パスに偽メッセージを混入できない", !all.includes("evil"), all.join(","));
	},

	// 1部屋 n 人（host 含む）: host→全員のブロードキャストと、全員→host の遅延
	async fanout() {
		const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.max(0, Math.ceil((p / 100) * xs.length) - 1)];
		for (const n of (process.env.SIZES ?? "2,4,8,16").split(",").map(Number)) {
			const room = `${R}/n${n}`;
			const pages = await Promise.all(Array.from({ length: n }, (_, i) => newClient(browser, `n${n}-${i}`)));
			const ids = pages.map((_, i) => (i === 0 ? "host" : `p${i}`));
			const conn = await Promise.all(pages.map((pg, i) => call(pg, "connect", ids[i], A.pubsub)));
			await Promise.all(pages.map((pg, i) => call(pg, "publish", ids[i], `${room}/${ids[i]}`, "events")));
			for (let i = 1; i < n; i++) {
				await call(pages[i], "subscribe", ids[i], `${room}/host`, "events", "frames");
				await call(pages[0], "subscribe", "host", `${room}/${ids[i]}`, "events", "frames");
			}
			await sleep(3000);
			await call(pages[0], "openGroup", "host", `${room}/host`, "events");
			await Promise.all(pages.slice(1).map((pg, i) => call(pg, "openGroup", ids[i + 1], `${room}/${ids[i + 1]}`, "events")));
			const K = 20;
			for (let k = 0; k < K; k++) {
				await call(pages[0], "sendFrameJson", "host", `${room}/host`, "events", { k, at: Date.now() });
				await Promise.all(pages.slice(1).map((pg, i) => call(pg, "sendFrameJson", ids[i + 1], `${room}/${ids[i + 1]}`, "events", { k, at: Date.now() })));
				await sleep(100);
			}
			await sleep(3000);
			const down: number[] = [];
			let downCount = 0;
			for (let i = 1; i < n; i++) {
				const got = await call<any[]>(pages[i], "inbox", ids[i], `${room}/host`, "events");
				downCount += got.length;
				got.forEach((m) => down.push(m.at - m.json.at));
			}
			const up: number[] = [];
			let upCount = 0;
			for (let i = 1; i < n; i++) {
				const got = await call<any[]>(pages[0], "inbox", "host", `${room}/${ids[i]}`, "events");
				upCount += got.length;
				got.forEach((m) => up.push(m.at - m.json.at));
			}
			const exp = K * (n - 1);
			check(
				`${n}人: host→全員 ${downCount}/${exp}, 全員→host ${upCount}/${exp}`,
				downCount === exp && upCount === exp,
				`接続 p50 ${pct(conn.map((c) => c.ms), 50)}ms / 下り遅延 p50 ${pct(down, 50)}ms p95 ${pct(down, 95)}ms / 上り遅延 p50 ${pct(up, 50)}ms p95 ${pct(up, 95)}ms`,
			);
			await Promise.all(pages.map((pg) => pg.context().close()));
		}
	},

	// host の再接続に参加者が追従できるか / 強制終了した host を何秒で検知できるか
	async reconnect() {
		const marker = `--moq-kill-${R}`;
		const hostBrowser = await launch([marker]); // 後で SIGKILL して電波断に近い状態を作る
		const host = await newClient(hostBrowser, "host");
		const p = await newClient(browser, "p");
		await call(host, "connect", "h1", A.pubsub);
		await call(p, "connect", "p", A.pubsub);
		await call(host, "publish", "h1", `${R}/host`, "events");
		await call(p, "subscribe", "p", `${R}/host`, "events", "json", 100);
		await sleep(2000);
		await call(host, "sendJson", "h1", `${R}/host`, "events", { phase: "before" });
		await waitInbox(p, "p", `${R}/host`, "events", 1);
		await call(host, "close", "h1");
		const closedAt = Date.now();
		await sleep(2000);
		await call(host, "connect", "h2", A.pubsub);
		await call(host, "publish", "h2", `${R}/host`, "events");
		const timer = await call<number>(host, "startTicker", "h2", `${R}/host`, "events", 300);
		const got = await waitInbox(p, "p", `${R}/host`, "events", 2, 20_000);
		await call(host, "stopTicker", timer);
		const resumed = got.find((m) => m.json?.tick !== undefined);
		check("host 再接続後、参加者が再購読で追従できる", !!resumed, resumed ? `切断から ${resumed.at - closedAt}ms` : JSON.stringify(await call(p, "errors", "p")).slice(0, 300));

		// 強制終了（ブラウザプロセスを SIGKILL = QUIC の close が送られない）: 他の参加者の announce 一覧から消えるまで
		const watcher = await newClient(browser, "w");
		await call(watcher, "connect", "w", A.pubsub);
		await sleep(2000);
		const path = `${R}/host`;
		check("強制終了前: host の broadcast が見えている", (await call<string[]>(watcher, "announced", "w")).includes(path));
		const killedAt = Date.now();
		execSync(`pkill -9 -f -- "[${marker[0]}]${marker.slice(1)}" || true`);
		let goneAfter = -1;
		while (Date.now() - killedAt < 120_000) {
			if (!(await call<string[]>(watcher, "announced", "w")).includes(path)) {
				goneAfter = Date.now() - killedAt;
				break;
			}
			await sleep(250);
		}
		check("強制終了した host を announce の消失で検知できる", goneAfter >= 0, `${goneAfter}ms`);
	},

	// host が epoch ごとに新しいパスで publish し直す方式で、N 回の再接続すべてで全参加者に新しい snapshot が届くか
	async epoch() {
		const N = Number(process.env.N ?? 50);
		const P = Number(process.env.P ?? 4);
		const prefix = `${R}/host/`;
		const parts = await Promise.all(Array.from({ length: P }, (_, i) => newClient(browser, `p${i}`)));
		for (const [i, pg] of parts.entries()) await call(pg, "follow", `p${i}`, A.pubsub, prefix, "state");
		const times: number[] = [];
		const failures: string[] = [];
		let prev: { browser: Awaited<ReturnType<typeof launch>>; marker: string; page: any; id: string } | undefined;
		for (let e = 1; e <= N; e++) {
			// 前の host を落とす（奇数回は正常切断、偶数回は SIGKILL）
			const mode = e % 2 ? "close" : "kill";
			const downAt = Date.now();
			if (prev) {
				if (mode === "close") {
					await call(prev.page, "close", prev.id);
					await prev.browser.close();
				} else execSync(`pkill -9 -f -- "[${prev.marker[0]}]${prev.marker.slice(1)}" || true`);
			}
			const marker = `--moq-kill-${R}-${e}`;
			const hb = await launch([marker]);
			const hp = await newClient(hb, `host${e}`);
			const hid = `h${e}`;
			await call(hp, "connect", hid, A.pubsub);
			await call(hp, "publish", hid, `${prefix}${e}`, "state");
			const timer = await call<number>(hp, "startTicker", hid, `${prefix}${e}`, "state", 300);
			prev = { browser: hb, marker, page: hp, id: hid };
			// 全参加者が epoch e の snapshot を受け取るまで
			const deadline = Date.now() + 20_000;
			let done = false;
			while (Date.now() < deadline) {
				const got = await Promise.all(parts.map((pg, i) => call<any[]>(pg, "inbox", `p${i}`, prefix, "state")));
				if (got.every((inbox) => inbox.some((m) => m.json?.epoch === e))) {
					done = true;
					break;
				}
				await sleep(100);
			}
			const ms = Date.now() - downAt;
			if (done) times.push(ms);
			else {
				const got = await Promise.all(parts.map((pg, i) => call<any[]>(pg, "inbox", `p${i}`, prefix, "state")));
				failures.push(`#${e}(${mode}) 未達: ${got.map((g, i) => `p${i}=epoch${g.at(-1)?.json?.epoch ?? "-"}`).join(",")}`);
			}
			if (e % 10 === 0) info(`${e}/${N} 完了 (失敗 ${failures.length})`);
			void timer;
		}
		await prev?.browser.close().catch(() => {});
		const sorted = [...times].sort((a, b) => a - b);
		const q = (p: number) => sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
		for (const f of failures.slice(0, 5)) info(f);
		const errs = await Promise.all(parts.map((pg, i) => call<string[]>(pg, "errors", `p${i}`)));
		if (errs.flat().length) info(`参加者 errors: ${errs.flat().slice(0, 3).join(" | ").slice(0, 300)}`);
		const stats = await Promise.all(parts.map((pg, i) => pg.evaluate((id) => (globalThis as any).followStats[id], `p${i}`)));
		info(`参加者ごとのリクエスト数/セッション張り直し回数: ${stats.map((st, i) => `p${i}=${st.requests}/${st.reconnects}`).join(", ")}`);
		check(`epoch 方式: ${N} 回の host 再接続すべてで ${P} 人全員に snapshot 到達`, failures.length === 0, `成功 ${times.length}/${N}, 復旧時間 p50 ${q(50)}ms p95 ${q(95)}ms max ${sorted.at(-1)}ms（切断〜全員受信、host の起動・接続込み）`);
	},

	// 1セッションで何回リクエスト (SUBSCRIBE) を出せるか
	async reqlimit() {
		const host = await newClient(browser, "host");
		const p = await newClient(browser, "p");
		await call(host, "connect", "host", A.pubsub);
		await call(host, "publish", "host", `${R}/host`, "events");
		const timer = await call<number>(host, "startTicker", "host", `${R}/host`, "events", 100);
		await call(p, "connect", "p", A.pubsub);
		await sleep(2000);
		let okCount = 0;
		for (let i = 0; i < 70; i++) {
			// 毎回存在しないパスを購読し、Track not found が返ってくれば 1 リクエスト消化
			const got = await p.evaluate(
				async ([path, n]) => {
					const T = (globalThis as any).T;
					const before = T.errors("p").length;
					T.subscribe("p", `${path}${n}`, "events", "json", 0, false);
					const t0 = Date.now();
					while (Date.now() - t0 < 5000) {
						if (T.errors("p").length > before) return true;
						await new Promise((r) => setTimeout(r, 50));
					}
					return false;
				},
				[`${R}/none`, i] as const,
			);
			if (!got) break;
			okCount++;
		}
		await call(host, "stopTicker", timer);
		info(`1セッションで成功した SUBSCRIBE 数: ${okCount}（+ 起動時の SUBSCRIBE_NAMESPACE 1件）`);
		check("1セッションで 60 回以上 SUBSCRIBE できる", okCount >= 60, `${okCount} 回目の次で停止`);
	},

	// 購読開始前に送られたイベントは届くか（途中参加・再接続時の再同期に関係）
	async late() {
		const host = await newClient(browser, "host");
		await call(host, "connect", "host", A.pubsub);
		await call(host, "publish", "host", `${R}/host`, "events");
		await call(host, "publish", "host", `${R}/host`, "state");
		for (let i = 0; i < 5; i++) await call(host, "sendJson", "host", `${R}/host`, "events", { seq: i });
		await call(host, "openGroup", "host", `${R}/host`, "state");
		for (let i = 0; i < 5; i++) await call(host, "sendFrameJson", "host", `${R}/host`, "state", { seq: i });
		await sleep(1000);
		const p = await newClient(browser, "p");
		await call(p, "connect", "p", A.pubsub);
		await call(p, "subscribe", "p", `${R}/host`, "events");
		await call(p, "subscribe", "p", `${R}/host`, "state", "frames");
		await sleep(3000);
		info(`途中参加: groups で受信=${JSON.stringify((await call<any[]>(p, "inbox", "p", `${R}/host`, "events")).map((m) => m.json?.seq))}`);
		info(`途中参加: 開いたグループの frames で受信=${JSON.stringify((await call<any[]>(p, "inbox", "p", `${R}/host`, "state")).map((m) => m.json?.seq))}`);
	},
};

for (const name of process.argv.slice(2)) {
	R = `${name}-${Date.now().toString(36)}`;
	console.log(`\n=== ${name} (${R})`);
	await scenarios[name]();
}
await browser.close();
process.exit(summary() ? 1 : 0);
