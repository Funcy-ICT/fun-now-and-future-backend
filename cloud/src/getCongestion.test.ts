import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { app } from "./app";
import { jstWeekday } from "./services/scan_service";

describe("getCongestion", () => {
	test("混雑度を取得", async () => {
		const db = getFirestore();
		const windowStart = Timestamp.now();
		const weekday = jstWeekday(windowStart.toMillis());

		const congestionDoc = await db.collection("congestion_records").add({
			location: "moscow",
			weekday,
			windowStart,
			uniqueDeviceCount: 18,
		});
		const maxDeviceRef = db.collection("max_devices").doc(`moscow_${weekday}`);
		await maxDeviceRef.set({
			location: "moscow",
			weekday,
			baseline: 40,
			percentile: 0.95,
			p50: 20,
			p05: 2,
			windowStartHour: 7,
			windowEndHour: 22,
			sampleDays: 4,
			sampleCount: 720,
			lookbackWeeks: 4,
			oldestSampleDate: "2026-08-01",
			refMedian: 15,
			computedAt: Timestamp.now(),
		});

		try {
			const res = await app.request("/getCongestion?location=moscow");

			//アサーション
			expect(res.status).toBe(200);

			const json = await res.json();
			expect(json.status).toBe("success");
			expect(json.data).toMatchObject({
				location: "moscow",
				uniqueDeviceCount: 18,
				level: 5, // ceil(18/40*9) = ceil(4.05) = 5
				stale: false,
			});
		} finally {
			//テストデータを削除
			await congestionDoc.delete();
			await maxDeviceRef.delete();
		}
	});

	test("max_devicesが無い場合levelはnullになる", async () => {
		const db = getFirestore();
		const windowStart = Timestamp.now();
		const weekday = jstWeekday(windowStart.toMillis());

		const congestionDoc = await db.collection("congestion_records").add({
			location: "getCongestionTestNoBaseline",
			weekday,
			windowStart,
			uniqueDeviceCount: 5,
		});

		try {
			const res = await app.request("/getCongestion?location=getCongestionTestNoBaseline");

			expect(res.status).toBe(200);

			const json = await res.json();
			expect(json.data.level).toBeNull();
			expect(json.data.stale).toBe(false);
		} finally {
			await congestionDoc.delete();
		}
	});

	test("該当locationのデータが無い場合404を返す", async () => {
		const res = await app.request("/getCongestion?location=getCongestionTestNotExist");
		expect(res.status).toBe(404);
	});
});
