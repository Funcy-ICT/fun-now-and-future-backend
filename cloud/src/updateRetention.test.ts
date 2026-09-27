import { updateRetention, getRetention } from "./services/retention";
import { getBigQuery } from "./lib/bigquery";
import { db } from "./lib/firebase";

// BigQueryのクライアントだけをモックにする。テーブル名を読む関数は本物を使う
jest.mock("./lib/bigquery", () => ({
	...jest.requireActual("./lib/bigquery"),
	getBigQuery: jest.fn(),
}));

describe("updateRetention", () => {
	const env = { ...process.env };
	const query = jest.fn();

	beforeEach(async () => {
		query.mockReset().mockResolvedValue([[]]);
		(getBigQuery as jest.Mock).mockReturnValue({ query });
		await db.collection("config").doc("retention").delete();
	});

	afterEach(() => {
		process.env = { ...env };
	});

	afterAll(async () => {
		await db.collection("config").doc("retention").delete();
	});

	test("BigQueryに有効期限を適用してから、Firestoreに保存する", async () => {
		process.env.GCLOUD_PROJECT = "my-project";
		process.env.BQ_DATASET = "fnaf_analytics";

		await updateRetention({ scanEventsDays: 180 }, "someone@example.com");

		expect(query.mock.calls[0][0].query).toBe(
			"ALTER TABLE `my-project.fnaf_analytics.scan_events` SET OPTIONS (partition_expiration_days = 180)",
		);
		expect(query.mock.calls[0][0].location).toBe("asia-northeast1");

		const config = await getRetention();
		expect(config).toMatchObject({ scanEventsDays: 180, updatedBy: "someone@example.com" });
	});

	test("nullなら、無期限に戻す", async () => {
		await updateRetention({ scanEventsDays: null }, null);
		expect(query.mock.calls[0][0].query).toContain("partition_expiration_days = NULL");
		expect((await getRetention())?.scanEventsDays).toBeNull();
	});

	test("BigQueryへの適用が失敗したら、Firestoreには保存しない", async () => {
		query.mockRejectedValueOnce(new Error("Permission denied"));
		await expect(updateRetention({ scanEventsDays: 30 }, null)).rejects.toThrow("Permission denied");
		expect(await getRetention()).toBeNull();
	});

	test("下限未満の日数は、BigQueryを呼ばずに例外を投げる", async () => {
		await expect(updateRetention({ scanEventsDays: 1 }, null)).rejects.toThrow("Invalid retention days");
		expect(query).not.toHaveBeenCalled();
		expect(await getRetention()).toBeNull();
	});
});

describe("getRetention", () => {
	test("設定が無ければnullを返す", async () => {
		await db.collection("config").doc("retention").delete();
		expect(await getRetention()).toBeNull();
	});
});
