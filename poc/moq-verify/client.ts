// ブラウザ内で動くテストクライアント。runner (run.ts) から window.T 経由で操作する。
import * as Moq from "@moq/net";

const ENDPOINT = "https://draft-16.cloudflare.mediaoverquic.com/";

type Received = { at: number; group: number; frames: number; json?: unknown; bytes?: number; sha256?: string; error?: string };

interface Session {
	conn: Awaited<ReturnType<typeof Moq.Connection.connect>>;
	pub: Moq.Origin.Producer;
	sub: Moq.Origin.Producer;
	broadcasts: Map<string, Moq.Broadcast.Producer>;
	tracks: Map<string, Moq.Track.Producer>;
	inbox: Map<string, Received[]>;
	errors: string[];
}

const sessions = new Map<string, Session>();
const openGroups = new Map<string, Map<string, Moq.Group.Producer>>();

async function sha256(buf: Uint8Array): Promise<string> {
	const h = new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
	return Array.from(h, (b) => b.toString(16).padStart(2, "0")).join("");
}

function key(path: string, track: string) {
	return `${path}#${track}`;
}

const T = {
	webtransport: typeof WebTransport !== "undefined",

	async connect(id: string, token: string, timeoutMs = 10_000) {
		const pub = new Moq.Origin.Producer();
		const sub = new Moq.Origin.Producer();
		const t0 = performance.now();
		const conn = await Moq.Connection.connect({
			url: new URL(ENDPOINT + token),
			websocket: { enabled: false },
			publish: pub.consume(),
			consume: sub,
			signal: AbortSignal.timeout(timeoutMs),
		});
		const s: Session = { conn, pub, sub, broadcasts: new Map(), tracks: new Map(), inbox: new Map(), errors: [] };
		sessions.set(id, s);
		return { ms: Math.round(performance.now() - t0), version: (conn as any).version ?? String((conn as any).protocol ?? "") };
	},

	// broadcast(path) 配下に track を作って announce する
	// stamped=false にすると timescale を宣言せず、Object に TIMESTAMP 拡張が付かない
	// maxAgeMs: 閉じていないグループを publisher が破棄するまでの時間（@moq/net の既定は 5000ms）
	publish(id: string, path: string, trackName: string, stamped = true, maxAgeMs?: number) {
		const s = sessions.get(id)!;
		let b = s.broadcasts.get(path);
		if (!b) {
			b = s.pub.createBroadcast(Moq.Path.from(path));
			b.announce();
			s.broadcasts.set(path, b);
		}
		s.tracks.set(key(path, trackName), b.createTrack(trackName, {
				...(stamped ? { timescale: Moq.Time.Timescale.MILLI } : {}),
				...(maxAgeMs ? { maxAge: maxAgeMs as Moq.Time.Milli } : {}),
			}));
	},

	// 1メッセージ = 1グループ。グループ番号が送信順になる
	sendJson(id: string, path: string, trackName: string, json: unknown) {
		const g = sessions.get(id)!.tracks.get(key(path, trackName))!.appendGroup();
		g.writeFrame({ payload: new TextEncoder().encode(JSON.stringify(json)), timestamp: Moq.Time.Timestamp.now() });
		g.close();
	},

	// size バイトの乱数を chunk バイトずつのフレームに分けて1グループで送る。ハッシュを返す
	async sendBlob(id: string, path: string, trackName: string, size: number, chunk: number, paceMs = 0) {
		const data = new Uint8Array(size);
		for (let i = 0; i < size; i += 65536) crypto.getRandomValues(data.subarray(i, Math.min(i + 65536, size)));
		const g = sessions.get(id)!.tracks.get(key(path, trackName))!.appendGroup();
		for (let off = 0; off < size; off += chunk) {
			if (paceMs && off) await new Promise((r) => setTimeout(r, paceMs));
			g.writeFrame({ payload: data.slice(off, off + chunk), timestamp: Moq.Time.Timestamp.now() });
		}
		g.close();
		return sha256(data);
	},

	// 開いたままのグループにフレームを追記する（イベントを1ストリームで順序保証して流す用）
	openGroup(id: string, path: string, trackName: string) {
		const s = sessions.get(id)!;
		openGroups.get(id)?.get(key(path, trackName))?.close();
		const g = s.tracks.get(key(path, trackName))!.appendGroup();
		if (!openGroups.has(id)) openGroups.set(id, new Map());
		openGroups.get(id)!.set(key(path, trackName), g);
	},

	sendFrameJson(id: string, path: string, trackName: string, json: unknown) {
		openGroups.get(id)!.get(key(path, trackName))!.writeFrame({ payload: new TextEncoder().encode(JSON.stringify(json)), timestamp: Moq.Time.Timestamp.now() });
	},

	// mode: json = 1グループ1メッセージ / blob = グループ全体を1バイナリ / frames = 1フレーム1メッセージ
	// announce を待ってから購読し、SUBSCRIBE 失敗時は retries 回まで再試行する
	subscribe(id: string, path: string, trackName: string, mode: "json" | "blob" | "frames" = "json", retries = 10, waitAnnounce = true) {
		const s = sessions.get(id)!;
		const inbox: Received[] = [];
		s.inbox.set(key(path, trackName), inbox);
		void (async () => {
			for (let attempt = 0; attempt <= retries; attempt++) {
				try {
					const p = Moq.Path.from(path);
					const list = s.sub.broadcasts();
					while (waitAnnounce && !list.peek().has(p)) await list.changed();
					const req = s.sub.request(p, { announced: waitAnnounce });
					let active = req.active.peek();
					while (!active) {
						await req.active.changed();
						active = req.active.peek();
					}
					const track = active.track(trackName).subscribe({ priority: 0 });
					for (;;) {
						const group = await track.recvGroup();
						if (!group) throw new Error("track ended"); // publisher 再接続に追従するため再購読する
						const parts: Uint8Array[] = [];
						try {
							for (;;) {
								const f = await group.readFrame();
								if (!f) break;
								if (mode === "frames") inbox.push({ at: Date.now(), group: group.sequence, frames: 1, json: JSON.parse(new TextDecoder().decode(f.payload)) });
								else parts.push(f.payload);
							}
						} catch (e) {
							inbox.push({ at: Date.now(), group: group.sequence, frames: parts.length, error: String(e) });
							continue;
						}
						if (mode === "frames") continue;
						const total = parts.reduce((n, p) => n + p.byteLength, 0);
						const buf = new Uint8Array(total);
						let o = 0;
						for (const p of parts) (buf.set(p, o), (o += p.byteLength));
						inbox.push(
							mode === "json"
								? { at: Date.now(), group: group.sequence, frames: parts.length, json: JSON.parse(new TextDecoder().decode(buf)) }
								: { at: Date.now(), group: group.sequence, frames: parts.length, bytes: total, sha256: await sha256(buf) },
						);
					}
				} catch (e) {
					s.errors.push(`subscribe ${path}#${trackName} attempt ${attempt}: ${e}`);
					await new Promise((r) => setTimeout(r, 500));
				}
			}
		})();
	},

	// prefix + <epoch> の broadcast を追い、最大の epoch の track に乗り換え続ける参加者。
	// - relay は一部の購読者へ announce を配り損ねることがあるので、announce と並行して
	//   次の epoch (current+1) を announce なしで購読しにいく（間隔 500ms→2s のバックオフ）
	// - 1 セッションのリクエストは 50 件まで（MAX_REQUEST_ID が増えない）なので、
	//   REQUEST_BUDGET を超えたらセッションを張り直す
	// 受信したメッセージは inbox(id, prefix, trackName) に epoch 付きで入る
	async follow(id: string, token: string, prefix: string, trackName: string) {
		const REQUEST_BUDGET = 40;
		const inbox: Received[] = [];
		const errors: string[] = [];
		const stats = { reconnects: 0, requests: 0 };
		let current = -1;
		let sub: Moq.Track.Subscriber | undefined;
		let origin!: Moq.Origin.Producer;
		let conn: Awaited<ReturnType<typeof Moq.Connection.connect>> | undefined;
		let requests = 0;
		let gen = 0;
		let reconnecting: Promise<void> | undefined;
		const watching = new Set<string>();

		const connect = async () => {
			conn?.close();
			origin = new Moq.Origin.Producer();
			conn = await Moq.Connection.connect({ url: new URL(ENDPOINT + token), websocket: { enabled: false }, consume: origin });
			requests = 1; // SUBSCRIBE_NAMESPACE
			const g = ++gen;
			void (async () => {
				for await (const a of origin.announced()) {
					if (g !== gen) return;
					if (a.kind === "retracted" || !a.prefix.startsWith(prefix)) continue;
					const epoch = Number(a.prefix.slice(prefix.length));
					if (epoch > current) void watch(epoch, false);
				}
			})();
			if (current >= 0) {
				void watch(current, true);
				void watch(current + 1, true);
			}
		};
		// リクエストを 1 件使う前に呼ぶ。予算を超えていたら張り直しを待つ
		const spend = async () => {
			if (requests >= REQUEST_BUDGET) {
				reconnecting ??= connect().then(() => {
					stats.reconnects++;
					reconnecting = undefined;
				});
				await reconnecting;
			}
			requests++;
			stats.requests++;
		};

		const watch = async (epoch: number, blind: boolean) => {
			const k = `${gen}:${epoch}`;
			if (watching.has(k)) return;
			watching.add(k);
			const myGen = gen;
			const path = Moq.Path.from(prefix + epoch);
			let delay = 500;
			try {
				while (epoch >= current && myGen === gen) {
					await spend();
					if (myGen !== gen) return void watch(epoch, true);
					const req = origin.request(path, blind ? undefined : { announced: true });
					try {
						let active = req.active.peek();
						while (!active) {
							await req.active.changed();
							active = req.active.peek();
						}
						const track = active.track(trackName).subscribe({ priority: 0 });
						let group = await track.recvGroup();
						if (!group) throw new Error("track ended");
						if (epoch < current) return track.close();
						if (epoch > current) {
							current = epoch;
							void watch(epoch + 1, true);
						}
						if (sub !== track) sub?.close();
						sub = track;
						while (group) {
							const f = await group.readFrame();
							if (f) inbox.push({ at: Date.now(), group: group.sequence, frames: 1, json: { epoch, ...JSON.parse(new TextDecoder().decode(f.payload)) } });
							group = await track.recvGroup();
						}
						return; // host が去った。次の epoch は別の watch が拾う
					} catch (e) {
						req.close();
						if (!blind) errors.push(`follow ${path}: ${e}`);
						await new Promise((r) => setTimeout(r, delay));
						delay = Math.min(delay * 2, 2000);
					}
				}
			} finally {
				watching.delete(k);
			}
		};

		await connect();
		sessions.set(id, { conn: conn!, pub: new Moq.Origin.Producer(), sub: origin, broadcasts: new Map(), tracks: new Map(), inbox: new Map([[key(prefix, trackName), inbox]]), errors });
		(globalThis as any).followStats ??= {};
		(globalThis as any).followStats[id] = stats;
	},

	inbox(id: string, path: string, trackName: string) {
		return sessions.get(id)?.inbox.get(key(path, trackName)) ?? [];
	},

	// interval ms ごとに {tick, at} を送り続ける（受信可否の確認用）
	startTicker(id: string, path: string, trackName: string, interval = 300) {
		let n = 0;
		const timer = setInterval(() => {
			try {
				T.sendJson(id, path, trackName, { tick: n++, at: Date.now() });
			} catch (e) {
				sessions.get(id)?.errors.push(`ticker: ${e}`);
			}
		}, interval);
		return Number(timer);
	},

	stopTicker(timer: number) {
		clearInterval(timer);
	},

	errors(id: string) {
		return sessions.get(id)?.errors ?? [];
	},

	// 接続が見えている broadcast パス一覧（announce の受信結果）
	announced(id: string) {
		return [...sessions.get(id)!.sub.broadcasts().peek().keys()];
	},

	close(id: string) {
		sessions.get(id)?.conn.close();
		sessions.delete(id);
	},
};

(globalThis as any).T = T;
