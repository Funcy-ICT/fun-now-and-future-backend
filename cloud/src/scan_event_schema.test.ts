import { ScanEventSchema } from "./schema/scan_event";
import { readBqSchema, findSchemaProblems } from "./testing/bq_schema";

const bqSchema = readBqSchema("scan_events.schema.json");

describe("ScanEventSchemaとBigQueryのテーブル定義", () => {
	test("項目名・型・NULL許容が一致する", () => {
		expect(findSchemaProblems(ScanEventSchema, bqSchema)).toEqual([]);
	});

	test("テーブルに列が無ければ検出する(検査自体が空振りしていないことの確認)", () => {
		const withoutSendId = bqSchema.filter(f => f.name !== "sendId");
		expect(findSchemaProblems(ScanEventSchema, withoutSendId)).toEqual(["sendId: テーブルに列がない"]);
	});

	test("NULL許容とREQUIREDの食い違いを検出する", () => {
		const sendIdRequired = bqSchema.map(f => f.name === "sendId" ? { ...f, mode: "REQUIRED" as const } : f);
		expect(findSchemaProblems(ScanEventSchema, sendIdRequired)).toEqual(["sendId: nullを送りうるが、テーブルの列はREQUIRED"]);
	});
});
