import { createRequest, createResponse } from "node-mocks-http";
import { getFirestore } from "firebase-admin/firestore";
import app from "./index";

describe("getCongestionHistory", () => {
	test("履歴の取得ができる", async () => {
		const db = getFirestore();

		const doc1 = await db.collection("sensorData").add({
			sensor_id: "historyTest1",
			location: "paris",
			ble_device_count: 10,
			received_at: "2026-07-24T10:00:00.000Z",
		});
		const doc2 = await db.collection("sensorData").add({
			sensor_id: "historyTest2",
			location: "paris",
			ble_device_count: 60,0
			received_at: "2026-07-24T10:05:00.000Z",
		});

		const req = await app.request({
			method: "GET",
			query: {
				location: "paris",
			},
		});

		await getCongestionHistory(req, res);

		try{
			expect(res.statusCode).toBe(200);

			const json = res._getJSONData();
			expect(json.status).toBe("success");
			expect(json.count).toBe(2);
			expect(json.data[0].sensor_id).toBe("historyTest2");
			expect(json.data[0].congestion_level).toBe("high");
		} finally {
			await doc1.delete();
			await doc2.delete();
		}
	});
});