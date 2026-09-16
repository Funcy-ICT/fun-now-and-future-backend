import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { app } from "./app";
import { jstWeekday } from "./services/scan_service";

describe("getCongestionHistory", () => {
	test("履歴の取得ができる", async () => {
		const db = getFirestore();
		const windowStart1 = Timestamp.fromDate(new Date("2026-07-24T10:00:00.000Z"));
		const windowStart2 = Timestamp.fromDate(new Date("2026-07-24T10:05:00.000Z"));
		const weekday = jstWeekday(windowStart1.toMillis());

		const doc1 = await db.collection("congestion_records").add({
			location: "paris",
			weekday,
			windowStart: windowStart1,
			uniqueDeviceCount: 10,
		});
		const doc2 = await db.collection("congestion_records").add({
			location: "paris",
			weekday,
			windowStart: windowStart2,
			uniqueDeviceCount: 60,
		});
		const maxDeviceRef = db.collection("max_devices").doc(`paris_${weekday}`);
		await maxDeviceRef.set({
			location: "paris",
			weekday,
			baseline: 50,
			percentile: 0.95,
			p50: 20,
			p05: 2,
			windowStartHour: 7,
			windowEndHour: 22,
			sampleDays: 4,
			sampleCount: 720,
			lookbackWeeks: 4,
			oldestSampleDate: "2026-06-01",
			refMedian: 15,
			computedAt: Timestamp.now(),
		});

		try {
			const res = await app.request("/getCongestionHistory?location=paris");

			expect(res.status).toBe(200);

			const json = await res.json();
			expect(json.status).toBe("success");
			expect(json.count).toBe(2);
			// windowStart降順で返るので、新しい方(windowStart2)が先頭になる
			expect(json.data[0].uniqueDeviceCount).toBe(60);
			expect(json.data[0].level).toBe(9); // ceil(60/50*9)=ceil(10.8)=11だが上限クランプで9
			expect(json.data[1].uniqueDeviceCount).toBe(10);
		} finally {
			await doc1.delete();
			await doc2.delete();
			await maxDeviceRef.delete();
		}
	});
});
