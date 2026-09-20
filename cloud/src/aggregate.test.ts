import { app } from "./app";
import { db } from "./lib/firebase";
import { savePendingScanEvent, pendingScanDocId } from "./repositories/firestore";
import { ScanEvent, ScanEventDevice } from "./schema/scan_event";

// 他のテストのドキュメントと混ざらないよう、遠い過去の時刻を使う。
// 猶予の1分を置くので、10:06に呼ぶと[10:00, 10:05)の窓が対象になる
const now = new Date("2019-12-31T10:06:00.000Z");
const windowStartMs = Date.UTC(2019, 11, 31, 10, 0, 0);
const at = (hhmm: string) => `2019-12-31T${hhmm}:00.000Z`;

const apple = (macHash: string, rssi: number): ScanEventDevice => ({
	macHash, rssi, format: "raw", rawData: "0aff4c001005011c2b3c4d", companyId: "004C", isNearbyInfo: true, addressType: null,
});
const other = (macHash: string, rssi: number): ScanEventDevice => ({
	macHash, rssi, format: "raw", rawData: "02011a020a0c", companyId: "00E0", isNearbyInfo: false, addressType: null,
});

const event = (nodeId: string, location: string, receivedAt: string, devices: ScanEventDevice[]): ScanEvent => ({
	sendId: `send-${receivedAt}`, nodeId, location, receivedAt, hashKeyVersion: "v1", devices,
});

// ドキュメントIDは、sendIdの記号が置き換えられるので、保存に使う関数で求める
const docId = (e: ScanEvent) => pendingScanDocId(e, "m");
const inA = event("agg-node-a", "agg-loc-1", at("10:01"), [apple("H1", -60), apple("H2", -70)]);
const inB = event("agg-node-b", "agg-loc-1", at("10:02"), [apple("H1", -55), other("H3", -60)]);
const inC = event("agg-node-c", "agg-loc-2", at("10:03"), []);
// 窓の外。endは窓に含まれず、lateは窓より前に受信している
const atEnd = event("agg-node-a", "agg-loc-1", at("10:05"), [apple("H9", -60)]);
const late = event("agg-node-a", "agg-loc-1", at("09:59"), [apple("H8", -60)]);
// 24時間より古い
const stale = event("agg-node-a", "agg-loc-1", "2019-12-30T09:00:00.000Z", [apple("H7", -60)]);
const all = [inA, inB, inC, atEnd, late, stale];

const cleanup = async () => {
	const refs = [
		...all.map(e => db.collection("pending_scans").doc(docId(e))),
		db.collection("congestion_records").doc(`agg-loc-1__${windowStartMs}`),
		db.collection("congestion_records").doc(`agg-loc-2__${windowStartMs}`),
		...["a", "b", "c"].map(n => db.collection("node_health_stats").doc(`agg-node-${n}_2019-12-31T10:00:00.000Z`)),
	];
	await Promise.all(refs.map(ref => ref.delete()));
};

describe("POST /aggregate", () => {
	beforeAll(() => {
		// Dateだけを固定する。Firestoreの通信に使うタイマーは本物のままにする
		jest.useFakeTimers({
			now,
			doNotFake: [
				"hrtime", "nextTick", "performance", "queueMicrotask", "requestAnimationFrame", "cancelAnimationFrame",
				"requestIdleCallback", "cancelIdleCallback", "setImmediate", "clearImmediate",
				"setInterval", "clearInterval", "setTimeout", "clearTimeout",
			],
		});
	});
	afterAll(async () => {
		jest.useRealTimers();
		await cleanup();
	});

	test("窓の範囲のデータだけを集計して記録し、読んだドキュメントだけを削除する", async () => {
		await cleanup();
		// 窓の中のinAとinBは、同じ端末(H1)を拾っていて、location内で重複排除される
		for (const e of all) {
			await savePendingScanEvent(e, "m");
		}

		const res = await app.request("/aggregate", { method: "POST" });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			windowStart: "2019-12-31T10:00:00.000Z",
			scanCount: 3,
			locationCount: 2,
		});

		// H1, H2はApple。H3は会社IDが対象外。H1は2つのノードで重複しているので、2台
		const loc1 = await db.collection("congestion_records").doc(`agg-loc-1__${windowStartMs}`).get();
		expect(loc1.data()?.uniqueDeviceCount).toBe(2);
		const loc2 = await db.collection("congestion_records").doc(`agg-loc-2__${windowStartMs}`).get();
		expect(loc2.data()?.uniqueDeviceCount).toBe(0);

		const health = await db.collection("node_health_stats").doc("agg-node-a_2019-12-31T10:00:00.000Z").get();
		expect(health.data()).toMatchObject({ nodeId: "agg-node-a", postCount: 1, totalMacCount: 2 });

		// 読んだドキュメントと24時間より古いドキュメントは消え、窓の外のドキュメントは残る
		const exists = async (e: ScanEvent) => (await db.collection("pending_scans").doc(docId(e)).get()).exists;
		expect(await exists(inA)).toBe(false);
		expect(await exists(inB)).toBe(false);
		expect(await exists(inC)).toBe(false);
		expect(await exists(stale)).toBe(false);
		expect(await exists(atEnd)).toBe(true);
		expect(await exists(late)).toBe(true);
	});

	test("窓の中にデータが無ければ、何も記録しない", async () => {
		await cleanup();
		const res = await app.request("/aggregate", { method: "POST" });
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({ scanCount: 0, locationCount: 0 });
	});
});
