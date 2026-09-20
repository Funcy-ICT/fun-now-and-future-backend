import { db } from "./lib/firebase";
import { Timestamp } from "firebase-admin/firestore";
import {
	savePendingScanEvent,
	getPendingScanEventsInWindow,
	deletePendingScansByIds,
	deleteStalePendingScans,
} from "./repositories/firestore";
import { ScanEvent } from "./schema/scan_event";

// 他のテストのドキュメントと混ざらないよう、遠い過去の時刻を使う
const at = (minute: number) => new Date(Date.UTC(2020, 0, 1, 0, minute, 0));
const ts = (minute: number) => Timestamp.fromDate(at(minute));

const event = (nodeId: string, minute: number, overrides: Partial<ScanEvent> = {}): ScanEvent => ({
	sendId: `send-${minute}`,
	nodeId,
	location: "london",
	receivedAt: at(minute).toISOString(),
	hashKeyVersion: "v1",
	devices: [
		{ macHash: "A".repeat(64), rssi: -60, format: "raw", rawData: "02011a020a0c", companyId: null, isNearbyInfo: false, addressType: null },
	],
	...overrides,
});

const cleanup = async () => {
	const snapshot = await db.collection("pending_scans").where("received_at", "<", ts(600)).get();
	await Promise.all(snapshot.docs.map(doc => doc.ref.delete()));
};

describe("pending_scansの窓の読み出しと削除", () => {
	beforeEach(cleanup);
	afterAll(cleanup);

	test("窓[start, end)に受信したものだけを読み、境界はstartを含みendを含まない", async () => {
		await savePendingScanEvent(event("node-w", 4), "m4"); // 窓より前
		await savePendingScanEvent(event("node-w", 5), "m5"); // start
		await savePendingScanEvent(event("node-w", 9), "m9"); // 窓の中
		await savePendingScanEvent(event("node-w", 10), "m10"); // end

		const { ids, scans } = await getPendingScanEventsInWindow(ts(5), ts(10));
		expect(ids.sort()).toEqual(["node-w__send-5", "node-w__send-9"]);
		expect(scans).toHaveLength(2);
	});

	test("検証に失敗したドキュメントは、scansに含めず、idsには含める", async () => {
		await db.collection("pending_scans").doc("broken").set({ received_at: ts(6), nodeId: "node-w" });

		const { ids, scans } = await getPendingScanEventsInWindow(ts(5), ts(10));
		expect(ids).toEqual(["broken"]);
		expect(scans).toHaveLength(0);
	});

	test("deletePendingScansByIdsは、指定したドキュメントだけを消す", async () => {
		await savePendingScanEvent(event("node-w", 6), "m6");
		await savePendingScanEvent(event("node-w", 7), "m7");

		await deletePendingScansByIds(["node-w__send-6"]);

		expect((await db.collection("pending_scans").doc("node-w__send-6").get()).exists).toBe(false);
		expect((await db.collection("pending_scans").doc("node-w__send-7").get()).exists).toBe(true);
	});

	test("deleteStalePendingScansは、指定した時刻より古いものだけを消す", async () => {
		await savePendingScanEvent(event("node-w", 1), "m1");
		await savePendingScanEvent(event("node-w", 8), "m8");

		await deleteStalePendingScans(ts(5));

		expect((await db.collection("pending_scans").doc("node-w__send-1").get()).exists).toBe(false);
		expect((await db.collection("pending_scans").doc("node-w__send-8").get()).exists).toBe(true);
	});
});
