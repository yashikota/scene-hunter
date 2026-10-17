// moqtail (別実装) による publisher。@moq/net との比較用に window.MT から操作する
import { SetupParameters, FullTrackName, Location, LiveTrackSource, MOQtailClient, MoqtObject, ObjectForwardingPreference, ObjectStatus, Tuple } from "moqtail";

const ENDPOINT = "https://draft-16.cloudflare.mediaoverquic.com/";

let client: MOQtailClient;
const tracks = new Map<string, { name: FullTrackName; ctrl: ReadableStreamDefaultController<MoqtObject>; next: number }>();
const log: string[] = [];

async function sha256(buf: Uint8Array) {
	const h = new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
	return Array.from(h, (b) => b.toString(16).padStart(2, "0")).join("");
}

const MT = {
	async connect(token: string) {
		client = await MOQtailClient.new({
			url: ENDPOINT + token,
			// 既定だと MAX_REQUEST_ID が 0 で、relay からの SUBSCRIBE を受けられない
			setupParameters: new SetupParameters().addMaxRequestId(1000),
			callbacks: {
				onMessageReceived: (m) => log.push(`recv ${m.constructor.name}`),
				onMessageSent: (m) => log.push(`sent ${m.constructor.name}`),
				onSessionTerminated: (r) => log.push(`terminated ${r}`),
			},
		});
	},

	async publish(ns: string, track: string) {
		let ctrl!: ReadableStreamDefaultController<MoqtObject>;
		const stream = new ReadableStream<MoqtObject>({ start: (c) => void (ctrl = c) });
		const name = FullTrackName.tryNew(ns, track);
		client.addOrUpdateTrack({ fullTrackName: name, trackSource: { live: new LiveTrackSource(stream) }, publisherPriority: 0 });
		tracks.set(`${ns}#${track}`, { name, ctrl, next: 0 });
		const r = await client.publishNamespace(Tuple.fromUtf8Path(ns));
		log.push(`publishNamespace ${r.constructor.name}`);
	},

	// size バイトを chunk ごとの Object に分けて新しい Group で送る
	async sendBlob(ns: string, track: string, size: number, chunk: number) {
		const t = tracks.get(`${ns}#${track}`)!;
		const data = new Uint8Array(size);
		for (let i = 0; i < size; i += 65536) crypto.getRandomValues(data.subarray(i, Math.min(i + 65536, size)));
		const group = t.next++;
		let obj = 0;
		for (let off = 0; off < size; off += chunk) {
			t.ctrl.enqueue(MoqtObject.newWithPayload(t.name, new Location(group, obj++), 0, ObjectForwardingPreference.Subgroup, 0, null, data.slice(off, off + chunk)));
		}
		t.ctrl.enqueue(MoqtObject.newWithStatus(t.name, new Location(group, obj), 0, ObjectForwardingPreference.Subgroup, 0, null, ObjectStatus.EndOfGroup));
		return sha256(data);
	},

	log: () => log,
};

(globalThis as any).MT = MT;
