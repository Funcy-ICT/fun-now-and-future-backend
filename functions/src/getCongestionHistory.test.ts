import { getFirestore } from "firebase-admin/firestore";
import { getApp, deleteApp } from "firebase-admin/app";
import app from "./index";

jest.setTimeout(30000);

describe("GET /getCongestionHistory", () => {
		afterAll(async () => {
			await deleteApp(getApp());
		});

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
			ble_device_count: 60,
			received_at: "2026-07-24T10:05:00.000Z",
		});

		try{
			const res = await app.request("/getCongestionHistory?location=paris", {
				method: "GET",
			});

			//アサーション
			expect(res.status).toBe(200);

			const json = await res.json();
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