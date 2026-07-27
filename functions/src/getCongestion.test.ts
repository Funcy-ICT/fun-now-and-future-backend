import { getFirestore } from "firebase-admin/firestore";
import { getApp, deleteApp } from "firebase-admin/app";
import app from "./index";

jest.setTimeout(30000);

describe("GET /getCongestion", () => {
	afterAll(async () => {
		await deleteApp(getApp());
	});

	test("混雑度を取得", async () => {
		const db = getFirestore();

		//テストデータを実際にfirestoreに保存
		const docRef = await db.collection("sensorData").add({
			sensor_id: "getCongestionTestId",
			location: "moscow",
			ble_device_count: 998,
			received_at: new Date().toISOString(),
		});

		try{
			const res = await app.request("/getCongestion?location=moscow", {
				method: "GET",
			});

			//アサーション
			expect(res.status).toBe(200);

			const json = await res.json();
			expect(json.status).toBe("success");
			expect(json.data).toMatchObject({
				sensor_id: "getCongestionTestId",
				location: "moscow",
				ble_device_count: 998,
				congestion_level: "high",
				congestion_label: "混雑",
			});
		} finally {
			//テストデータを削除
			await docRef.delete();
		}
	});
});