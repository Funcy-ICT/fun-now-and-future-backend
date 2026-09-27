import { Timestamp } from "firebase-admin/firestore";
import { app } from "./app";
import { db } from "./lib/firebase";
import { targetDates } from "./services/max_devices_batch";
import { jstDateStartMs } from "./services/jst";

// 他のテストと混ざらないよう、遠い過去の日付を使う。2019-12-31は火曜日
const now = new Date("2019-12-30T19:00:00.000Z"); // 日本時間 2019-12-31 04:00
const TUESDAY = 2;
const LOC_WRITTEN = "batch-loc-written";
const LOC_FROZEN = "batch-loc-frozen";

// 稼働時間帯を7時から9時(24窓)にして、テストデータを小さくする
const settings = {
	operatingStartHour: 7,
	operatingEndHour: 9,
	refMedianWeeks: 4,
	maxLookbackWeeks: 3,
};

const seedDay = async (location: string, date: string, slots: number, count: number) => {
	const batch = db.batch();
	const start = jstDateStartMs(date) + 7 * 60 * 60 * 1000;

	for (let i = 0; i < slots; i++) {
		const windowStart = Timestamp.fromMillis(start + i * 5 * 60 * 1000);
		batch.set(db.collection("congestion_records").doc(`${location}__${windowStart.toMillis()}`), {
			location,
			weekday: new Date(windowStart.toMillis() + 9 * 60 * 60 * 1000).getUTCDay(),
			windowStart,
			uniqueDeviceCount: count,
		});
	}
	await batch.commit();
};

const deleteWhere = async (collection: string, field: string, values: string[]) => {
	for (const value of values) {
		const snapshot = await db.collection(collection).where(field, "==", value).get();
		await Promise.all(snapshot.docs.map(doc => doc.ref.delete()));
	}
};

const cleanup = async () => {
	const locations = [LOC_WRITTEN, LOC_FROZEN];
	await deleteWhere("congestion_records", "location", locations);
	await deleteWhere("daily_summaries", "location", locations);
	await deleteWhere("excluded_records", "location", locations);
	await deleteWhere("max_devices", "location", locations);
	await db.collection("config").doc("baseline").delete();
};

describe("POST /internal/batch/calc-max-device", () => {
	beforeAll(async () => {
		jest.useFakeTimers({
			now,
			doNotFake: [
				"hrtime", "nextTick", "performance", "queueMicrotask", "requestAnimationFrame", "cancelAnimationFrame",
				"requestIdleCallback", "cancelIdleCallback", "setImmediate", "clearImmediate",
				"setInterval", "clearInterval", "setTimeout", "clearTimeout",
			],
		});
		await cleanup();

		await db.collection("config").doc("baseline").set({
			locations: {
				[LOC_WRITTEN]: { ...settings, targetDays: 2 },
				[LOC_FROZEN]: { ...settings, targetDays: 3 },
			},
		});

		for (const location of [LOC_WRITTEN, LOC_FROZEN]) {
			await seedDay(location, "2019-12-24", 24, 20); // 有効
			await seedDay(location, "2019-12-17", 24, 20); // 有効
			await seedDay(location, "2019-12-10", 24, 1);  // 中央値が低い。休業として弾かれる
			await seedDay(location, "2019-12-03", 10, 20); // 窓が足りない。ノード停止として弾かれる
			await seedDay(location, "2019-12-30", 24, 20); // 直近のlocation一覧に出すため(月曜)
		}
	});

	afterAll(async () => {
		jest.useRealTimers();
		await cleanup();
	});

	test("バッチを実行すると、件数を返す", async () => {
		const res = await app.request("/internal/batch/calc-max-device", { method: "POST" });
		expect(res.status).toBe(200);

		const json = await res.json();
		expect(json.failed).toBe(0);
		expect(json.succeeded).toBeGreaterThan(0);
	});

	test("有効日が揃ったlocationは、max_devicesを書く", async () => {
		const doc = await db.collection("max_devices").doc(`${LOC_WRITTEN}_${TUESDAY}`).get();
		expect(doc.exists).toBe(true);
		expect(doc.data()).toMatchObject({
			location: LOC_WRITTEN,
			weekday: TUESDAY,
			baseline: 20,
			p50: 20,
			p05: 20,
			windowStartHour: 7,
			windowEndHour: 9,
			sampleDays: 2,        // 12-24と12-17
			sampleCount: 48,      // 24窓 × 2日
			lookbackWeeks: 2,     // 2週遡って揃った
			oldestSampleDate: "2019-12-17",
			refMedian: 20,
		});
	});

	test("有効日が揃わないlocationは、max_devicesを書かない", async () => {
		const doc = await db.collection("max_devices").doc(`${LOC_FROZEN}_${TUESDAY}`).get();
		expect(doc.exists).toBe(false);
	});

	test("弾いた日を、理由とともにexcluded_recordsに残す", async () => {
		const holiday = await db.collection("excluded_records").doc(`${LOC_FROZEN}__2019-12-10`).get();
		expect(holiday.data()).toMatchObject({
			reason: "statistical",
			slotCount: 24,
			dayMedian: 1,
			refMedian: 20,
			ratio: 0.05,
		});

		// 有効日が2日で足りているlocationは、その先を見ないので記録も残らない
		expect((await db.collection("excluded_records").doc(`${LOC_WRITTEN}__2019-12-10`).get()).exists).toBe(false);
	});

	test("日ごとのまとめを、設定の稼働時間帯で作る", async () => {
		const summary = await db.collection("daily_summaries").doc(`${LOC_WRITTEN}__2019-12-24`).get();
		expect(summary.data()).toMatchObject({
			location: LOC_WRITTEN,
			date: "2019-12-24",
			weekday: TUESDAY,
			slotCount: 24,
			dayMedian: 20,
			operatingStartHour: 7,
			operatingEndHour: 9,
		});
		expect(summary.data()?.counts).toHaveLength(24);
	});

	test("2回目の実行でも、同じ結果になる", async () => {
		const res = await app.request("/internal/batch/calc-max-device", { method: "POST" });
		expect(res.status).toBe(200);

		const doc = await db.collection("max_devices").doc(`${LOC_WRITTEN}_${TUESDAY}`).get();
		expect(doc.data()).toMatchObject({ baseline: 20, sampleDays: 2, lookbackWeeks: 2 });
	});
});

describe("targetDates", () => {
	test("当日は含めず、同じ曜日を指定した週数だけ遡る", () => {
		expect(targetDates("2019-12-31", TUESDAY, 4)).toEqual(["2019-12-24", "2019-12-17", "2019-12-10", "2019-12-03"]);
	});

	test("当日と同じ曜日でも、当日は含めない", () => {
		expect(targetDates("2019-12-31", TUESDAY, 1)).toEqual(["2019-12-24"]);
	});

	test("別の曜日なら、その曜日の直近から遡る", () => {
		expect(targetDates("2019-12-31", 1, 2)).toEqual(["2019-12-30", "2019-12-23"]); // 月曜
	});
});
