import { toWindowResults } from "./services/analysis";
import { StageConfig } from "./schema/filter_pipeline";

const stages: StageConfig[] = [
	{ name: "dedupe" },
	{ name: "companyFilter", allowedCompanyIds: ["004C"], requireNearbyInfo: true },
];

const row = (windowStart: unknown, location: string, stageIndex: number, deviceCount: number) =>
	({ windowStart, location, weekday: 0, stageIndex, deviceCount });

describe("toWindowResults", () => {
	test("窓とlocationごとにまとめ、各段の前後の台数にする", () => {
		const rows = [
			row("2026-09-20T12:00:00.000Z", "cafeteria", 0, 10),
			row("2026-09-20T12:00:00.000Z", "cafeteria", 1, 7),
			row("2026-09-20T12:00:00.000Z", "cafeteria", 2, 4),
		];
		expect(toWindowResults(rows, stages)).toEqual([{
			windowStart: "2026-09-20T12:00:00.000Z",
			location: "cafeteria",
			weekday: 0,
			uniqueDeviceCount: 4,
			stageTrace: [
				{ stageName: "dedupe", countBefore: 10, countAfter: 7 },
				{ stageName: "companyFilter", countBefore: 7, countAfter: 4 },
			],
		}]);
	});

	test("TIMESTAMPが{ value }の形で返ってきても読める", () => {
		const rows = [0, 1, 2].map(i => row({ value: "2026-09-20T12:00:00.000Z" }, "cafeteria", i, 3));
		expect(toWindowResults(rows, stages)[0].windowStart).toBe("2026-09-20T12:00:00.000Z");
	});

	test("整数が文字列で返ってきても数にする", () => {
		const rows = [0, 1, 2].map(i => ({ ...row("2026-09-20T12:00:00.000Z", "cafeteria", i, 0), deviceCount: "5", stageIndex: String(i) }));
		expect(toWindowResults(rows, stages)[0].uniqueDeviceCount).toBe(5);
	});

	test("窓やlocationが違えば、別の結果になる", () => {
		const rows = [
			...[0, 1, 2].map(i => row("2026-09-20T12:00:00.000Z", "cafeteria", i, 1)),
			...[0, 1, 2].map(i => row("2026-09-20T12:00:00.000Z", "bus_stop", i, 2)),
			...[0, 1, 2].map(i => row("2026-09-20T12:05:00.000Z", "cafeteria", i, 3)),
		];
		expect(toWindowResults(rows, stages).map(r => [r.windowStart, r.location, r.uniqueDeviceCount])).toEqual([
			["2026-09-20T12:00:00.000Z", "cafeteria", 1],
			["2026-09-20T12:00:00.000Z", "bus_stop", 2],
			["2026-09-20T12:05:00.000Z", "cafeteria", 3],
		]);
	});

	test("段が無ければ、stageTraceは空で、台数は絞り込む前の件数", () => {
		const result = toWindowResults([row("2026-09-20T12:00:00.000Z", "cafeteria", 0, 6)], []);
		expect(result[0]).toMatchObject({ uniqueDeviceCount: 6, stageTrace: [] });
	});

	test("形の違う行があれば例外を投げる", () => {
		expect(() => toWindowResults([{ location: "cafeteria" }], stages)).toThrow();
	});
});
