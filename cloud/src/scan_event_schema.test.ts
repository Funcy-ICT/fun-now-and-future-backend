import { readFileSync } from "fs";
import { join } from "path";
import { z } from "zod";
import { ScanEventSchema } from "./schema/scan_event";

type JsonSchema = {
	type?: string;
	format?: string;
	anyOf?: JsonSchema[];
	properties?: Record<string, JsonSchema>;
	required?: string[];
	items?: JsonSchema;
};

type BqField = {
	name: string;
	type: string;
	mode?: "NULLABLE" | "REQUIRED" | "REPEATED";
	fields?: BqField[];
};

const bqSchema: BqField[] = JSON.parse(
	readFileSync(join(__dirname, "../bigquery/scan_events.schema.json"), "utf-8"),
);

// z.nullable()は anyOf: [本体, {type: "null"}] として出力される
const unwrapNullable = (s: JsonSchema): { schema: JsonSchema; nullable: boolean } => {
	if (!s.anyOf) return { schema: s, nullable: false };
	const nonNull = s.anyOf.filter(x => x.type !== "null");
	return { schema: nonNull[0], nullable: nonNull.length !== s.anyOf.length };
};

const bqTypeOf = (s: JsonSchema): string => {
	if (s.format === "date-time") return "TIMESTAMP";
	switch (s.type) {
		case "string": return "STRING";
		case "integer": return "INT64";
		case "number": return "FLOAT64";
		case "boolean": return "BOOL";
		case "object": return "RECORD";
		default: return `未対応(${s.type})`;
	}
};

// BigQueryサブスクリプションが書き込みに失敗する組み合わせを列挙する
const findProblems = (schema: JsonSchema, fields: BqField[], path: string): string[] => {
	const problems: string[] = [];
	const props = schema.properties ?? {};
	const required = new Set(schema.required ?? []);
	const bqByName = new Map(fields.map(f => [f.name, f]));

	for (const [name, prop] of Object.entries(props)) {
		const field = bqByName.get(name);
		if (!field) {
			problems.push(`${path}${name}: テーブルに列がない`);
			continue;
		}

		const { schema: inner, nullable } = unwrapNullable(prop);
		const isArray = inner.type === "array";
		const element = isArray ? inner.items! : inner;
		const mode = field.mode ?? "NULLABLE";

		if (isArray !== (mode === "REPEATED")) {
			problems.push(`${path}${name}: 配列とREPEATEDが対応していない`);
		}
		if (mode === "REQUIRED" && (nullable || !required.has(name))) {
			problems.push(`${path}${name}: nullを送りうるが、テーブルの列はREQUIRED`);
		}
		if (bqTypeOf(element) !== field.type) {
			problems.push(`${path}${name}: 型が違う(メッセージ ${bqTypeOf(element)} / テーブル ${field.type})`);
		}
		if (element.type === "object") {
			problems.push(...findProblems(element, field.fields ?? [], `${path}${name}.`));
		}
	}

	for (const field of fields) {
		if (field.mode === "REQUIRED" && !(field.name in props)) {
			problems.push(`${path}${field.name}: REQUIREDの列だが、メッセージに項目がない`);
		}
	}
	return problems;
};

describe("ScanEventSchemaとBigQueryのテーブル定義", () => {
	const jsonSchema = z.toJSONSchema(ScanEventSchema) as JsonSchema;

	test("項目名・型・NULL許容が一致する", () => {
		expect(findProblems(jsonSchema, bqSchema, "")).toEqual([]);
	});

	test("テーブルに列が無ければ検出する(検査自体が空振りしていないことの確認)", () => {
		const withoutSendId = bqSchema.filter(f => f.name !== "sendId");
		expect(findProblems(jsonSchema, withoutSendId, "")).toEqual(["sendId: テーブルに列がない"]);
	});

	test("NULL許容とREQUIREDの食い違いを検出する", () => {
		const sendIdRequired = bqSchema.map(f => f.name === "sendId" ? { ...f, mode: "REQUIRED" as const } : f);
		expect(findProblems(jsonSchema, sendIdRequired, "")).toEqual(["sendId: nullを送りうるが、テーブルの列はREQUIRED"]);
	});
});
