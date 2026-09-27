import { AggregateRunSchema } from "./schema/aggregate_run";
import { readBqSchema, findSchemaProblems, BqField } from "./testing/bq_schema";

const bqSchema = readBqSchema("aggregate_runs.schema.json");

const mapField = (fields: BqField[], name: string, change: (f: BqField) => BqField): BqField[] =>
	fields.map(f => f.name === name ? change(f) : f);

describe("AggregateRunSchemaとBigQueryのテーブル定義", () => {
	test("項目名・型・NULL許容が一致する", () => {
		expect(findSchemaProblems(AggregateRunSchema, bqSchema)).toEqual([]);
	});

	test("テーブルに列が無ければ検出する(検査自体が空振りしていないことの確認)", () => {
		const withoutConfigHash = bqSchema.filter(f => f.name !== "configHash");
		expect(findSchemaProblems(AggregateRunSchema, withoutConfigHash)).toEqual([
			"configHash: テーブルに列がない",
		]);
	});

	test("入れ子のRECORDの中の食い違いも検出する", () => {
		const changed = mapField(bqSchema, "locations", f => ({
			...f,
			fields: mapField(f.fields!, "uniqueDeviceCount", g => ({ ...g, type: "STRING" })),
		}));
		expect(findSchemaProblems(AggregateRunSchema, changed)).toEqual([
			"locations.uniqueDeviceCount: 型が違う(メッセージ INT64 / テーブル STRING)",
		]);
	});

	test("入れ子の配列とREPEATEDの食い違いも検出する", () => {
		const changed = mapField(bqSchema, "locations", f => ({
			...f,
			fields: mapField(f.fields!, "stageTrace", g => ({ ...g, mode: "NULLABLE" as const })),
		}));
		expect(findSchemaProblems(AggregateRunSchema, changed)).toEqual([
			"locations.stageTrace: 配列とREPEATEDが対応していない",
		]);
	});
});
