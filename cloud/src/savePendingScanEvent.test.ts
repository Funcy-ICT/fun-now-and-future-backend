import { db } from "./lib/firebase";
import { Timestamp } from "firebase-admin/firestore";
import { savePendingScanEvent, pendingScanDocId, PendingScanEventSchema } from "./repositories/firestore";
import { ScanEvent } from "./schema/scan_event";

const event = (overrides: Partial<ScanEvent> = {}): ScanEvent => ({
	sendId: "send-1",
	nodeId: "node-save-test-a",
	location: "london",
	receivedAt: "2026-09-20T12:00:00.000Z",
	hashKeyVersion: "v1",
	devices: [
		{ macHash: "A".repeat(64), rssi: -60, format: "raw", rawData: "02011a020a0c", companyId: null, isNearbyInfo: false, addressType: "random_static" },
	],
	...overrides,
});

const deleteDocs = async (...ids: string[]) => {
	await Promise.all(ids.map(id => db.collection("pending_scans").doc(id).delete()));
};

describe("pendingScanDocId", () => {
	test("sendIdがあればnodeIdと組にする", () => {
		expect(pendingScanDocId(event(), "123")).toBe("node-save-test-a__send-1");
	});

	test("sendIdが無ければmessageIdを使う", () => {
		expect(pendingScanDocId(event({ sendId: null }), "123")).toBe("msg__123");
	});

	test("ドキュメントIDに使えない文字は置き換える", () => {
		expect(pendingScanDocId(event({ nodeId: "a/b", sendId: "c/d" }), "123")).toBe("a_b__c_d");
	});
});

describe("savePendingScanEvent", () => {
	test("メッセージをreceived_atがTimestampの形で保存する", async () => {
		const id = pendingScanDocId(event(), "m1");
		await savePendingScanEvent(event(), "m1");

		const doc = await db.collection("pending_scans").doc(id).get();
		const parsed = PendingScanEventSchema.safeParse(doc.data());
		expect(parsed.success).toBe(true);
		expect(parsed.data?.received_at.toMillis()).toBe(Timestamp.fromDate(new Date("2026-09-20T12:00:00.000Z")).toMillis());
		expect(parsed.data?.devices[0].macHash).toBe("A".repeat(64));

		await deleteDocs(id);
	});

	test("同じメッセージが2回届いても、ドキュメントは1つのまま", async () => {
		await savePendingScanEvent(event(), "m1");
		await savePendingScanEvent(event(), "m2");

		const snapshot = await db.collection("pending_scans").where("nodeId", "==", "node-save-test-a").get();
		expect(snapshot.size).toBe(1);

		await deleteDocs(snapshot.docs[0].id);
	});

	test("nodeIdが違えば、同じsendIdでも別のドキュメントになる", async () => {
		await savePendingScanEvent(event({ nodeId: "node-save-test-a" }), "m1");
		await savePendingScanEvent(event({ nodeId: "node-save-test-b" }), "m2");

		expect((await db.collection("pending_scans").doc("node-save-test-a__send-1").get()).exists).toBe(true);
		expect((await db.collection("pending_scans").doc("node-save-test-b__send-1").get()).exists).toBe(true);

		await deleteDocs("node-save-test-a__send-1", "node-save-test-b__send-1");
	});
});
