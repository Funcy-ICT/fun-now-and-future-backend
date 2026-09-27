import { buildPartitionExpirationDdl } from "./services/retention";
import { RetentionInputSchema } from "./schema/retention";

const TABLE = "my-project.fnaf_analytics.scan_events";

describe("buildPartitionExpirationDdl", () => {
	test("日数を指定すると、partition_expiration_daysを設定するDDLになる", () => {
		expect(buildPartitionExpirationDdl(TABLE, 180)).toBe(
			"ALTER TABLE `my-project.fnaf_analytics.scan_events` SET OPTIONS (partition_expiration_days = 180)",
		);
	});

	test("nullなら、有効期限を外すDDLになる", () => {
		expect(buildPartitionExpirationDdl(TABLE, null)).toContain("partition_expiration_days = NULL");
	});

	test("テーブル名の形式が違えば例外を投げる", () => {
		expect(() => buildPartitionExpirationDdl("a.b.c`; DROP TABLE x; --", 30)).toThrow("Invalid table id");
		expect(() => buildPartitionExpirationDdl("scan_events", 30)).toThrow("Invalid table id");
	});

	test("下限未満、上限超過、小数は例外を投げる", () => {
		expect(() => buildPartitionExpirationDdl(TABLE, 6)).toThrow("Invalid retention days");
		expect(() => buildPartitionExpirationDdl(TABLE, 1.5)).toThrow("Invalid retention days");
		expect(() => buildPartitionExpirationDdl(TABLE, 99999)).toThrow("Invalid retention days");
	});
});

describe("RetentionInputSchema", () => {
	test("7日以上の整数とnullを受け付ける", () => {
		expect(RetentionInputSchema.safeParse({ scanEventsDays: 7 }).success).toBe(true);
		expect(RetentionInputSchema.safeParse({ scanEventsDays: null }).success).toBe(true);
	});

	test("下限未満、上限超過、小数は弾く", () => {
		expect(RetentionInputSchema.safeParse({ scanEventsDays: 6 }).success).toBe(false);
		expect(RetentionInputSchema.safeParse({ scanEventsDays: 3651 }).success).toBe(false);
		expect(RetentionInputSchema.safeParse({ scanEventsDays: 30.5 }).success).toBe(false);
	});
});
