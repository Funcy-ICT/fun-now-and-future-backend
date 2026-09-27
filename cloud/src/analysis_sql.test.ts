import { buildStageCte, buildAnalysisQuery } from "./services/analysis_sql";
import { StageConfig } from "./schema/filter_pipeline";

describe("buildStageCte", () => {
	test("dedupeは、窓とlocationとmacごとにrssiが最も強い行を残す", () => {
		const cte = buildStageCte({ name: "dedupe" }, 1, "s0");
		expect(cte.body).toContain("FROM s0");
		expect(cte.body).toContain("PARTITION BY windowStart, location, macHash ORDER BY rssi DESC");
		expect(cte.params).toEqual({});
	});

	test("companyFilterは、値をパラメータで渡し、配列の型を指定する", () => {
		const cte = buildStageCte({ name: "companyFilter", allowedCompanyIds: ["004C"], requireNearbyInfo: true }, 2, "s1");
		expect(cte.body).toContain("FROM s1");
		expect(cte.body).toContain("IN UNNEST(@s2_allowedCompanyIds)");
		expect(cte.params).toEqual({ s2_allowedCompanyIds: ["004C"], s2_requireNearbyInfo: true });
		expect(cte.types).toEqual({ s2_allowedCompanyIds: ["STRING"], s2_requireNearbyInfo: "BOOL" });
	});

	test("許可する会社IDが空でも、型が決まっている", () => {
		const cte = buildStageCte({ name: "companyFilter", allowedCompanyIds: [], requireNearbyInfo: false }, 1, "s0");
		expect(cte.params.s1_allowedCompanyIds).toEqual([]);
		expect(cte.types.s1_allowedCompanyIds).toEqual(["STRING"]);
	});

	test("rssiFilterは、閾値をパラメータで渡す", () => {
		const cte = buildStageCte({ name: "rssiFilter", rssiThreshold: -85 }, 3, "s2");
		expect(cte.body).toContain("rssi >= @s3_rssiThreshold");
		expect(cte.params).toEqual({ s3_rssiThreshold: -85 });
	});

	test("SQLに値を埋め込まない", () => {
		const cte = buildStageCte({ name: "companyFilter", allowedCompanyIds: ["'; DROP TABLE x; --"], requireNearbyInfo: true }, 1, "s0");
		expect(cte.body).not.toContain("DROP TABLE");
	});
});

describe("buildAnalysisQuery", () => {
	const stages: StageConfig[] = [
		{ name: "dedupe" },
		{ name: "companyFilter", allowedCompanyIds: ["004C"], requireNearbyInfo: true },
		{ name: "rssiFilter", rssiThreshold: -100 },
	];
	const input = {
		tableId: "my-project.fnaf_analytics.scan_events",
		stages,
		start: new Date("2026-09-20T00:00:00.000Z"),
		end: new Date("2026-09-21T00:00:00.000Z"),
	};

	test("段の順番どおりに、1つ前の段を読むCTEをつなぐ", () => {
		const { query } = buildAnalysisQuery(input);
		const s1 = query.indexOf("s1 AS (");
		const s2 = query.indexOf("s2 AS (");
		const s3 = query.indexOf("s3 AS (");
		expect(s1).toBeGreaterThan(-1);
		expect(s1).toBeLessThan(s2);
		expect(s2).toBeLessThan(s3);
		expect(query).toContain("FROM s0 WHERE TRUE"); // s1(dedupe)はs0を読む
		expect(query).toContain("GENERATE_ARRAY(0, 3)");
	});

	test("受信時刻で範囲を絞り、期間はパラメータで渡す", () => {
		const { query, params, types } = buildAnalysisQuery(input);
		expect(query).toContain("WHERE receivedAt >= @start AND receivedAt < @end");
		expect(params.start).toBe("2026-09-20T00:00:00.000Z");
		expect(types.start).toBe("TIMESTAMP");
	});

	test("各段のパラメータを、1つにまとめる", () => {
		const { params } = buildAnalysisQuery(input);
		expect(params).toMatchObject({ s2_allowedCompanyIds: ["004C"], s2_requireNearbyInfo: true, s3_rssiThreshold: -100 });
	});

	test("locationsを指定したときだけ、locationで絞る", () => {
		expect(buildAnalysisQuery(input).query).not.toContain("@locations");
		const withLocations = buildAnalysisQuery({ ...input, locations: ["cafeteria"] });
		expect(withLocations.query).toContain("location IN UNNEST(@locations)");
		expect(withLocations.params.locations).toEqual(["cafeteria"]);
	});

	test("段が無ければ、絞り込む前の件数だけを返す", () => {
		const { query } = buildAnalysisQuery({ ...input, stages: [] });
		expect(query).not.toContain("s1 AS (");
		expect(query).toContain("GENERATE_ARRAY(0, 0)");
	});

	test("曜日は日本時間で、0が日曜になるよう1を引く", () => {
		expect(buildAnalysisQuery(input).query).toContain("EXTRACT(DAYOFWEEK FROM w.windowStart AT TIME ZONE 'Asia/Tokyo') - 1");
	});

	test("テーブル名の形式が違えば例外を投げる", () => {
		expect(() => buildAnalysisQuery({ ...input, tableId: "a.b.c`; DROP TABLE x; --" })).toThrow("Invalid table id");
		expect(() => buildAnalysisQuery({ ...input, tableId: "scan_events" })).toThrow("Invalid table id");
	});

	test("startがend以降なら例外を投げる", () => {
		expect(() => buildAnalysisQuery({ ...input, start: input.end })).toThrow("start must be before end");
	});
});
