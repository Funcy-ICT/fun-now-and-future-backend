import { FilterPipelineInputSchema } from "./schema/api/admin_config";
import { FilterPipelineConfigSchema, StageConfig } from "./schema/filter_pipeline";
import { ConfigHistorySchema } from "./schema/config_meta";
import { getFilterPipeline, hashStages, saveFilterPipelineConfig } from "./services/filter_config";
import { getFilterPipelineConfig } from "./repositories/firestore";
import { db } from "./lib/firebase";

const stages: StageConfig[] = [
	{ name: "dedupe" },
	{ name: "companyFilter", allowedCompanyIds: ["004C"], requireNearbyInfo: true },
	{ name: "rssiFilter", rssiThreshold: -100 },
];

const valid = (input: unknown) => FilterPipelineInputSchema.safeParse(input).success;
const withRssi = (rssiFilter: Record<string, unknown>) => ({ stages: [stages[0], stages[1], { name: "rssiFilter", ...rssiFilter }] });

describe("FilterPipelineInputSchema", () => {
	test("今の既定の構成を受け付ける", () => {
		expect(valid({ stages })).toBe(true);
	});

	test("dedupeが先頭に無ければ弾く", () => {
		expect(valid({ stages: [stages[1], stages[0], stages[2]] })).toBe(false);
		expect(valid({ stages: [stages[1], stages[2]] })).toBe(false);
	});

	test("同じ段が2回あれば弾く", () => {
		expect(valid({ stages: [...stages, stages[2]] })).toBe(false);
	});

	test("rssiは-127から0の整数だけを受け付ける", () => {
		expect(valid(withRssi({ rssiThreshold: -127 }))).toBe(true);
		expect(valid(withRssi({ rssiThreshold: 70 }))).toBe(false);
		expect(valid(withRssi({ rssiThreshold: -70.5 }))).toBe(false);
		expect(valid(withRssi({ rssiThreshold: -128 }))).toBe(false);
	});

	test("companyIdは大文字の16進4桁だけを受け付ける", () => {
		const company = (id: string) => ({ stages: [stages[0], { ...stages[1], allowedCompanyIds: [id] }] });
		expect(valid(company("00E0"))).toBe(true);
		expect(valid(company("4c"))).toBe(false);
		expect(valid(company("004c"))).toBe(false);
		expect(valid(company("0x004C"))).toBe(false);
	});

	test("知らない項目とdebugModeEnabledは弾く", () => {
		expect(valid({ stages, debugModeEnabled: true })).toBe(false);
		expect(valid(withRssi({ rssiThreshold: -100, threshold: -80 }))).toBe(false);
	});

	test("nodeThresholdsは、空のときだけ受け付ける", () => {
		expect(valid(withRssi({ rssiThreshold: -100, nodeThresholds: {} }))).toBe(true);
		expect(valid(withRssi({ rssiThreshold: -100, nodeThresholds: { cafeteria: {} } }))).toBe(true);
		expect(valid(withRssi({ rssiThreshold: -100, nodeThresholds: { cafeteria: { esp32_01: -70 } } }))).toBe(false);
	});
});

describe("configHash", () => {
	test("nodeThresholdsの無い設定は、読み直してもハッシュが変わらない", () => {
		const parsed = FilterPipelineConfigSchema.parse({ stages, debugModeEnabled: false });
		expect(hashStages(parsed.stages)).toBe(hashStages(stages));
	});
});

describe("saveFilterPipelineConfig, getFilterPipeline", () => {
	const configRef = db.collection("config").doc("filter_pipeline");
	const clear = async () => {
		await configRef.delete();
		const history = await db.collection("config_history").get();
		await Promise.all(history.docs.map(doc => doc.ref.delete()));
	};
	beforeEach(clear);
	afterAll(clear);

	test("設定が無ければ、既定の構成とversion 0を返す", async () => {
		const result = await getFilterPipeline();
		expect(result).toMatchObject({ source: "default", version: 0, value: { stages } });
		expect(result.configHash).toBe(hashStages(stages));
		expect(result.value).not.toHaveProperty("debugModeEnabled");
	});

	test("保存すると/aggregateが読む設定になり、debugModeEnabledは今の値を引き継ぐ", async () => {
		await configRef.set({ stages, debugModeEnabled: true });
		const changed: StageConfig[] = [stages[0], { name: "rssiFilter", rssiThreshold: -80 }];

		await saveFilterPipelineConfig({ stages: changed }, 0, "someone@example.com");

		expect(await getFilterPipelineConfig()).toEqual({ stages: changed, debugModeEnabled: true });
		expect(await getFilterPipeline()).toMatchObject({ source: "stored", version: 1, updatedBy: "someone@example.com" });
	});

	test("設定が無いところに保存すると、debugModeEnabledはfalseになる", async () => {
		await saveFilterPipelineConfig({ stages }, 0, null);
		expect((await getFilterPipelineConfig()).debugModeEnabled).toBe(false);
	});

	test("空のnodeThresholdsは消して保存し、履歴にconfigHashを残す", async () => {
		const input = FilterPipelineInputSchema.parse(withRssi({ rssiThreshold: -100, nodeThresholds: { cafeteria: {} } }));
		await saveFilterPipelineConfig(input, 0, null);

		const stored = (await configRef.get()).data();
		expect(stored?.stages[2]).toEqual({ name: "rssiFilter", rssiThreshold: -100 });
		const history = ConfigHistorySchema.parse((await db.collection("config_history").doc("filter_pipeline__1").get()).data());
		expect(history.configHash).toBe(hashStages(stages));
	});

	test("保存された値が検証に通らなければ、既定の構成で動いていることを返す", async () => {
		await configRef.set({ stages: [{ name: "unknown" }], debugModeEnabled: false, version: 2 });
		expect(await getFilterPipeline()).toMatchObject({ source: "default", version: 2, value: { stages } });
	});
});
