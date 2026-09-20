import { app } from "./app";
import { db } from "./lib/firebase";
import { hashMac } from "./services/mac";
import { publishScanEvent } from "./repositories/pubsub";

jest.mock("./repositories/pubsub");

const post = (body: unknown) => app.request("/receiveSensorData", {
	method: "POST",
	headers: {
		"Content-Type": "application/json",
		"x-api-key": "funcy_esp32_secret_key_2026",
	},
	body: JSON.stringify(body),
});

const deletePendingScans = async (nodeId: string) => {
	const snapshot = await db.collection("pending_scans").where("nodeId", "==", nodeId).get();
	await Promise.all(snapshot.docs.map(doc => doc.ref.delete()));
};

// Apple(0x004C)のNearby Info(0x10)を含むアドバタイズ
const appleRawData = "0aff4c001005011c2b3c4d";

describe("receiveSensorData", () => {
	beforeAll(() => {
		process.env.MAC_HASH_KEY = "test-key-0123456789-0123456789-0123456789";
	});

	test("POSTリクエストを受け取れる", async () => {
		const res = await app.request("/receiveSensorData", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": "funcy_esp32_secret_key_2026",
			},
			body: JSON.stringify({
				"nodeId": "node-01",
				"location": "london",
				"devices": [
					{ "format": "raw", "mac": "AA:BB:CC:DD:EE:01", "rssi": -60, "rawData": "02011a020a0c" },
					{ "format": "parsed", "mac": "AA:BB:CC:DD:EE:02", "rssi": -72, "companyId": "004C", "isNearbyInfo": true }// 元は { "format": "parsed", "mac": "AA:BB:CC:DD:EE:02", "rssi": -72, "companyId": "004C", "nearbyInfo": "10" } だったが、isNearbyInfoに変更
				]
			}),
		});

		expect(res.status).toBe(200);

		const json = await res.json();
		expect(json.status).toBe("success");
		expect(json.data).toBeUndefined(); // 受信したデータは返さない
		expect(json.sendId).toBeNull();
	});

	test("firestoreには生のmacアドレスではなく、ハッシュ化したmacアドレスを保存する", async () => {
		const nodeId = "node-hash-test";
		const res = await post({
			nodeId,
			location: "london",
			devices: [{ format: "raw", mac: "AA:BB:CC:DD:EE:01", rssi: -60, rawData: "02011a020a0c" }],
		});
		expect(res.status).toBe(200);

		const snapshot = await db.collection("pending_scans").where("nodeId", "==", nodeId).get();
		expect(snapshot.size).toBe(1);
		const saved = snapshot.docs[0].data();
		expect(saved.devices[0].mac).toBe(hashMac("AA:BB:CC:DD:EE:01", process.env.MAC_HASH_KEY!));
		expect(JSON.stringify(saved).toUpperCase()).not.toContain("AA:BB:CC:DD:EE:01");

		await deletePendingScans(nodeId);
	});

	test("受信したデータからメッセージを組み立ててpublishし、sendIdを返す", async () => {
		const nodeId = "node-publish-test";
		(publishScanEvent as jest.Mock).mockClear();

		const res = await post({
			sendId: "send-1",
			nodeId,
			location: "london",
			devices: [{ format: "raw", mac: "C0:11:22:33:44:01", rssi: -60, rawData: appleRawData }],
		});
		expect(res.status).toBe(200);
		expect((await res.json()).sendId).toBe("send-1");

		expect(publishScanEvent).toHaveBeenCalledTimes(1);
		const event = (publishScanEvent as jest.Mock).mock.calls[0][0];
		expect(event).toMatchObject({ sendId: "send-1", nodeId, location: "london", hashKeyVersion: "v1" });
		expect(event.devices[0]).toMatchObject({
			macHash: hashMac("C0:11:22:33:44:01", process.env.MAC_HASH_KEY!),
			format: "raw",
			rawData: appleRawData,
			companyId: "004C",
			isNearbyInfo: true,
			addressType: "random_static",
		});
		expect(JSON.stringify(event).toUpperCase()).not.toContain("C0:11:22:33:44:01");

		await deletePendingScans(nodeId);
	});

	test("publishに失敗しても、200を返す", async () => {
		const nodeId = "node-publish-fail-test";
		(publishScanEvent as jest.Mock).mockRejectedValueOnce(new Error("publish failed"));
		const errorSpy = jest.spyOn(console, "error").mockImplementation(() => { });

		const res = await post({
			nodeId,
			location: "london",
			devices: [{ format: "raw", mac: "AA:BB:CC:DD:EE:01", rssi: -60, rawData: "02011a020a0c" }],
		});
		expect(res.status).toBe(200);
		expect(errorSpy).toHaveBeenCalled();

		errorSpy.mockRestore();
		await deletePendingScans(nodeId);
	});

	test("不正なmacアドレスが含まれていれば400を返し、保存もpublishもしない", async () => {
		const nodeId = "node-invalid-mac-test";
		(publishScanEvent as jest.Mock).mockClear();

		const res = await post({
			nodeId,
			location: "london",
			devices: [
				{ format: "raw", mac: "AA:BB:CC:DD:EE:01", rssi: -60, rawData: "02011a020a0c" },
				{ format: "raw", mac: "not-a-mac", rssi: -60, rawData: "02011a020a0c" },
			],
		});
		expect(res.status).toBe(400);
		expect((await res.json()).message).toBe("mac is invalid");

		expect(publishScanEvent).not.toHaveBeenCalled();
		const snapshot = await db.collection("pending_scans").where("nodeId", "==", nodeId).get();
		expect(snapshot.empty).toBe(true);
	});

	test("rssiが-100を下回るデバイスが含まれていても、POST全体を弾かない", async () => {
		const nodeId = "node-low-rssi-test";
		const res = await post({
			nodeId,
			location: "london",
			devices: [{ format: "raw", mac: "AA:BB:CC:DD:EE:01", rssi: -110, rawData: "02011a020a0c" }],
		});
		expect(res.status).toBe(200);

		await deletePendingScans(nodeId);
	});

	test("API Keyがない場合401を返す", async () => {
		const res = await app.request("/receiveSensorData", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				"nodeId": "node-01",
				"location": "london",
				"devices": [
					{ "format": "raw", "mac": "AA:BB:CC:DD:EE:01", "rssi": -60, "rawData": "02011a020a0c" },
					{ "format": "parsed", "mac": "AA:BB:CC:DD:EE:02", "rssi": -72, "companyId": "004C", "nearbyInfo": "10" }
				]
			}),
		});

		expect(res.status).toBe(401);

		const json = await res.json();
		expect(json.status).toBe("error");
		expect(json.message).toBe("Unauthorized: Invalid or missing API Key");
	});

	test("API Keyが間違っている場合401を返す", async () => {
		const res = await app.request("/receiveSensorData", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": "wrong_secret_key",
			},
			body: JSON.stringify({
				"nodeId": "node-01",
				"location": "london",
				"devices": [
					{ "format": "raw", "mac": "AA:BB:CC:DD:EE:01", "rssi": -60, "rawData": "02011a020a0c" },
					{ "format": "parsed", "mac": "AA:BB:CC:DD:EE:02", "rssi": -72, "companyId": "004C", "nearbyInfo": "10" }
				]
			}),
		});

		expect(res.status).toBe(401);

		const json = await res.json();
		expect(json.status).toBe("error");
	});
});
