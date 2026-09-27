import { countDevicesByWindow } from "./services/analysis";
import { getBigQuery } from "./lib/bigquery";

// BigQueryのクライアントだけをモックにする。テーブル名と課金の上限を読む関数は本物を使う
jest.mock("./lib/bigquery", () => ({
	...jest.requireActual("./lib/bigquery"),
	getBigQuery: jest.fn(),
}));

describe("countDevicesByWindow", () => {
	const env = { ...process.env };
	const query = jest.fn();

	beforeEach(() => {
		query.mockReset();
		(getBigQuery as jest.Mock).mockReturnValue({ query });
	});

	afterEach(() => {
		process.env = { ...env };
	});

	const input = {
		stages: [{ name: "rssiFilter" as const, rssiThreshold: -80 }],
		start: new Date("2026-09-20T00:00:00.000Z"),
		end: new Date("2026-09-21T00:00:00.000Z"),
	};

	test("東京のリージョンで、課金の上限を付けて実行する", async () => {
		query.mockResolvedValue([[]]);
		await countDevicesByWindow(input);

		const options = query.mock.calls[0][0];
		expect(options.location).toBe("asia-northeast1");
		expect(options.maximumBytesBilled).toBe(String(5 * 1024 ** 3));
		expect(options.useLegacySql).toBe(false);
		expect(options.params.s1_rssiThreshold).toBe(-80);
	});

	test("環境変数で、データセットと課金の上限を変えられる", async () => {
		process.env.GCLOUD_PROJECT = "my-project";
		process.env.BQ_DATASET = "fnaf_analytics_test";
		process.env.BQ_MAX_BYTES_BILLED = "1000";
		query.mockResolvedValue([[]]);
		await countDevicesByWindow(input);

		const options = query.mock.calls[0][0];
		expect(options.query).toContain("`my-project.fnaf_analytics_test.scan_events`");
		expect(options.maximumBytesBilled).toBe("1000");
	});

	test("結果の行を、窓とlocationごとにまとめて返す", async () => {
		query.mockResolvedValue([[
			{ windowStart: { value: "2026-09-20T12:00:00.000Z" }, location: "cafeteria", weekday: 0, stageIndex: 0, deviceCount: 5 },
			{ windowStart: { value: "2026-09-20T12:00:00.000Z" }, location: "cafeteria", weekday: 0, stageIndex: 1, deviceCount: 3 },
		]]);
		expect(await countDevicesByWindow(input)).toEqual([{
			windowStart: "2026-09-20T12:00:00.000Z",
			location: "cafeteria",
			weekday: 0,
			uniqueDeviceCount: 3,
			stageTrace: [{ stageName: "rssiFilter", countBefore: 5, countAfter: 3 }],
		}]);
	});

	test("クエリが失敗したら、その例外をそのまま投げる", async () => {
		query.mockRejectedValue(new Error("bytes billed limit exceeded"));
		await expect(countDevicesByWindow(input)).rejects.toThrow("bytes billed limit exceeded");
	});
});
