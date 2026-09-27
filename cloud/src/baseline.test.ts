import { Timestamp } from "firebase-admin/firestore";
import { calcRefMedian, evaluateDay, calcBaseline, expectedSlotCount } from "./services/baseline";
import { DailySummary } from "./schema/daily_summary";
import { DEFAULT_BASELINE_SETTINGS } from "./schema/baseline_settings";

const settings = { ...DEFAULT_BASELINE_SETTINGS };

const summary = (date: string, counts: number[]): DailySummary => ({
	location: "cafeteria",
	date,
	weekday: 0,
	slotCount: counts.length,
	dayMedian: counts.length === 0 ? null : [...counts].sort((a, b) => a - b)[Math.ceil(counts.length / 2) - 1],
	counts: [...counts].sort((a, b) => a - b),
	operatingStartHour: 7,
	operatingEndHour: 22,
	computedAt: Timestamp.now(),
});

// 稼働時間帯180窓のうち、指定した数だけ記録がある日
const day = (date: string, slots: number, value: number) => summary(date, Array(slots).fill(value));

describe("expectedSlotCount", () => {
	test("7時から22時なら180窓", () => {
		expect(expectedSlotCount(settings)).toBe(180);
	});
});

describe("calcRefMedian", () => {
	test("日ごとの中央値の、中央値を返す", () => {
		expect(calcRefMedian([day("2026-09-07", 180, 10), day("2026-09-14", 180, 20), day("2026-09-21", 180, 30)])).toBe(20);
	});

	test("記録が無い日は数えない", () => {
		expect(calcRefMedian([day("2026-09-07", 0, 0), day("2026-09-14", 180, 20)])).toBe(20);
	});

	test("1日も無ければnull", () => {
		expect(calcRefMedian([])).toBeNull();
		expect(calcRefMedian([day("2026-09-07", 0, 0)])).toBeNull();
	});

	test("休業日が少数派なら、学期の水準に留まる", () => {
		const days = [
			...Array.from({ length: 17 }, (_, i) => day(`2026-09-${i + 1}`, 180, 20)),
			...Array.from({ length: 9 }, (_, i) => day(`2026-08-${i + 1}`, 180, 1)),
		];
		expect(calcRefMedian(days)).toBe(20);
	});
});

describe("evaluateDay", () => {
	test("窓が144未満なら、ノード停止として弾く", () => {
		const result = evaluateDay("2026-09-14", day("2026-09-14", 143, 20), 20, settings);
		expect(result).toMatchObject({ valid: false, reason: "incomplete", slotCount: 143 });
	});

	test("窓が144以上で、中央値がrefMedianの半分以上なら通る", () => {
		expect(evaluateDay("2026-09-14", day("2026-09-14", 144, 10), 20, settings).valid).toBe(true);
	});

	test("中央値がrefMedianの半分未満なら、休業として弾く", () => {
		const result = evaluateDay("2026-09-14", day("2026-09-14", 180, 9), 20, settings);
		expect(result).toMatchObject({ valid: false, reason: "statistical", dayMedian: 9, ratio: 0.45 });
	});

	test("まとめが無い日は、ノード停止として弾く", () => {
		expect(evaluateDay("2026-09-14", undefined, 20, settings)).toMatchObject({ valid: false, reason: "incomplete", slotCount: 0 });
	});

	test("完全性を先に見るので、半日落ちた日は人が少ない日と混ざらない", () => {
		const result = evaluateDay("2026-09-14", day("2026-09-14", 90, 1), 20, settings);
		expect(result).toMatchObject({ reason: "incomplete" });
	});
});

describe("calcBaseline", () => {
	test("有効日の窓をプールして、95パーセンタイルを返す", () => {
		const counts = Array.from({ length: 100 }, (_, i) => i + 1); // 1から100
		const result = calcBaseline([summary("2026-09-14", counts)], settings);
		expect(result).toMatchObject({ baseline: 95, p50: 50, p05: 5, sampleCount: 100, oldestSampleDate: "2026-09-14" });
	});

	test("複数の日をまとめて1つのプールにする", () => {
		const result = calcBaseline([summary("2026-09-14", [10, 20]), summary("2026-09-07", [30, 40])], settings);
		expect(result?.sampleCount).toBe(4);
		expect(result?.oldestSampleDate).toBe("2026-09-07");
	});

	test("baselineが9未満なら、発行しない", () => {
		expect(calcBaseline([summary("2026-09-14", [1, 2, 3, 8])], settings)).toBeNull();
	});

	test("プールが空なら、発行しない", () => {
		expect(calcBaseline([], settings)).toBeNull();
	});
});
