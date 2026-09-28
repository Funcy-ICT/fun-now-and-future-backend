import { stagesToJson, hashStages } from "./services/filter_config";
import { StageConfig } from "./schema/filter_pipeline";

const stages: StageConfig[] = [
	{ name: "dedupe" },
	{ name: "companyFilter", allowedCompanyIds: ["004C"], requireNearbyInfo: true },
	{ name: "rssiFilter", rssiThreshold: -100 },
];

describe("stagesToJson", () => {
	test("キーを名前順に並べ替える", () => {
		expect(stagesToJson([{ name: "rssiFilter", rssiThreshold: -100 }])).toBe('[{"name":"rssiFilter","rssiThreshold":-100}]');
	});

	test("段の順序は保つ", () => {
		const reversed = [...stages].reverse();
		expect(stagesToJson(stages)).not.toBe(stagesToJson(reversed));
	});
});

describe("hashStages", () => {
	test("同じ設定なら同じ値になる", () => {
		expect(hashStages(stages)).toBe(hashStages([...stages]));
	});

	test("キーの順序が違うだけなら、同じ値になる", () => {
		const swapped: StageConfig[] = [
			{ name: "dedupe" },
			{ requireNearbyInfo: true, allowedCompanyIds: ["004C"], name: "companyFilter" },
			{ rssiThreshold: -100, name: "rssiFilter" },
		];
		expect(hashStages(swapped)).toBe(hashStages(stages));
	});

	test("段の順序が違えば、別の値になる", () => {
		expect(hashStages([...stages].reverse())).not.toBe(hashStages(stages));
	});

	test("閾値が違えば、別の値になる", () => {
		const changed: StageConfig[] = [...stages.slice(0, 2), { name: "rssiFilter", rssiThreshold: -85 }];
		expect(hashStages(changed)).not.toBe(hashStages(stages));
	});

	test("16進64文字を返す", () => {
		expect(hashStages(stages)).toMatch(/^[0-9a-f]{64}$/);
	});
});
