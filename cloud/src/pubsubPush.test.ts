import { db } from "./lib/firebase";
import { pubsubPushRoute } from "./controllers/pubsub_push";
import { ScanEvent } from "./schema/scan_event";

const event = (overrides: Partial<ScanEvent> = {}): ScanEvent => ({
	sendId: "send-1",
	nodeId: "node-push-test",
	location: "london",
	receivedAt: "2026-09-20T12:00:00.000Z",
	hashKeyVersion: "v1",
	devices: [
		{ macHash: "A".repeat(64), rssi: -60, format: "raw", rawData: "02011a020a0c", companyId: null, isNearbyInfo: false, addressType: null },
	],
	...overrides,
});

const push = (body: unknown) => pubsubPushRoute.request("/pubsub/scan-events", {
	method: "POST",
	headers: { "Content-Type": "application/json" },
	body: JSON.stringify(body),
});

const envelope = (payload: unknown, messageId = "m1") => ({
	message: { data: Buffer.from(JSON.stringify(payload)).toString("base64"), messageId },
	subscription: "projects/p/subscriptions/s",
});

const countDocs = async () => (await db.collection("pending_scans").where("nodeId", "==", "node-push-test").get()).size;

const cleanup = async () => {
	const snapshot = await db.collection("pending_scans").where("nodeId", "==", "node-push-test").get();
	await Promise.all(snapshot.docs.map(doc => doc.ref.delete()));
};

describe("POST /pubsub/scan-events", () => {
	beforeEach(cleanup);
	afterAll(cleanup);

	test("メッセージをpending_scansに保存して204を返す", async () => {
		const res = await push(envelope(event()));
		expect(res.status).toBe(204);

		const doc = await db.collection("pending_scans").doc("node-push-test__send-1").get();
		expect(doc.exists).toBe(true);
		expect(doc.data()?.location).toBe("london");
		expect(doc.data()?.received_at.toDate().toISOString()).toBe("2026-09-20T12:00:00.000Z");
	});

	test("同じメッセージが2回届いても、ドキュメントは1つのまま", async () => {
		expect((await push(envelope(event()))).status).toBe(204);
		expect((await push(envelope(event()))).status).toBe(204);
		expect(await countDocs()).toBe(1);
	});

	test("sendIdが無ければmessageIdでドキュメントIDを決める", async () => {
		await push(envelope(event({ sendId: null }), "m99"));
		expect((await db.collection("pending_scans").doc("msg__m99").get()).exists).toBe(true);

		await db.collection("pending_scans").doc("msg__m99").delete();
	});

	test("メッセージがスキーマに合わなければ400を返し、保存しない", async () => {
		const res = await push(envelope({ ...event(), devices: [{ macHash: "" }] }));
		expect(res.status).toBe(400);
		expect(await countDocs()).toBe(0);
	});

	test("JSONでないメッセージには400を返す", async () => {
		const res = await push({ message: { data: Buffer.from("not json").toString("base64"), messageId: "m1" } });
		expect(res.status).toBe(400);
	});

	test("封筒の形が違えば400を返す", async () => {
		expect((await push({ foo: "bar" })).status).toBe(400);
		expect((await push({ message: { data: "", messageId: "m1" } })).status).toBe(400);
	});
});
