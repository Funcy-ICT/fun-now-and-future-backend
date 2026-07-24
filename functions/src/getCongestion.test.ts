import { createRequest, createResponse } from "node-mocks-http";
import { getFirestore } from "firebase-admin/firestore";
import { getCongestion } from "./index";

describe("getCongestion", () => {
	test("混雑度を取得", async () => {
		const db = getFirestore();

		//テストデータを実際にfirestoreに保存
		const docRef = await db.collection("sensorData").add({
			sensor_id: "getCongestionTestId",
			location: "moscow",
			ble_device_count: 998,
			received_at: new Date().toISOString(),
		});

		const req: any = createRequest({
			method: "GET",
			query: {
				location: "moscow",
			},
		});

		const res = createResponse();

		await getCongestion(req, res);

		try{
			//アサーション
			expect(res.statusCode).toBe(200);

			const json = res._getJSONData();
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