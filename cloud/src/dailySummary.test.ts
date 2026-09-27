import { Timestamp } from "firebase-admin/firestore";
import { buildDailySummary, isSummaryStale } from "./services/daily_summary";
import { CongestionRecord } from "./schema/congestion_record";
import { DEFAULT_BASELINE_SETTINGS } from "./schema/baseline_settings";

// 日本時間のhh:mmの窓
const record = (hhmm: string, count: number): CongestionRecord => ({
	location: "cafeteria",
	weekday: 0,
	windowStart: Timestamp.fromDate(new Date(`2026-09-20T${hhmm}:00.000+09:00`)),
	uniqueDeviceCount: count,
});

const settings = { ...DEFAULT_BASELINE_SETTINGS };

describe("buildDailySummary", () => {
	test("稼働時間帯の記録だけを、昇順に並べて数える", () => {
		const records = [
			record("06:55", 99), // 稼働時間帯の前
			record("07:00", 5),
			record("12:00", 1),
			record("21:55", 3),
			record("22:00", 99), // 稼働時間帯の後
		];
		const summary = buildDailySummary("cafeteria", "2026-09-20", 0, records, settings);
		expect(summary.counts).toEqual([1, 3, 5]);
		expect(summary.slotCount).toBe(3);
		expect(summary.dayMedian).toBe(3);
	});

	test("記録が1件も無ければ、dayMedianはnull", () => {
		const summary = buildDailySummary("cafeteria", "2026-09-20", 0, [], settings);
		expect(summary).toMatchObject({ slotCount: 0, dayMedian: null, counts: [] });
	});

	test("台数が0の記録も数える。ノードが落ちていた日と区別するため", () => {
		const summary = buildDailySummary("cafeteria", "2026-09-20", 0, [record("08:00", 0), record("09:00", 0)], settings);
		expect(summary).toMatchObject({ slotCount: 2, dayMedian: 0 });
	});

	test("どの稼働時間帯で作ったかを持たせる", () => {
		const summary = buildDailySummary("cafeteria", "2026-09-20", 0, [], { ...settings, operatingStartHour: 9, operatingEndHour: 18 });
		expect(summary).toMatchObject({ operatingStartHour: 9, operatingEndHour: 18 });
	});
});

describe("isSummaryStale", () => {
	test("稼働時間帯が同じなら、作り直しは要らない", () => {
		expect(isSummaryStale({ operatingStartHour: 7, operatingEndHour: 22 }, settings)).toBe(false);
	});

	test("稼働時間帯が違えば、作り直しが要る", () => {
		expect(isSummaryStale({ operatingStartHour: 9, operatingEndHour: 22 }, settings)).toBe(true);
		expect(isSummaryStale({ operatingStartHour: 7, operatingEndHour: 18 }, settings)).toBe(true);
	});
});
