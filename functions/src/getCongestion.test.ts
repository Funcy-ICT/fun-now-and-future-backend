import { createRequest, createResponse } from "node-mocks-http";
import { getCongestion, receiveSensorData } from "./index";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";


describe("getCongestion", () => {
	test("混雑度を取得", async () => {
		initializeApp();
		const db = getFirestore();

		//テストデータを実際にfirestoreに保存
		const docRef = await db.collection("sensorData").add({
			sensor_id: "test_sensor",
			location: "moscow",
			ble_device_count: 999,
			received_at: new Date().toISOString(),
		});

		const req = createRequest({
			method: "GET"
		});


		//テストデータを削除
		await docRef.delete();
	});
});