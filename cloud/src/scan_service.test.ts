import { runPipeline, STAGE_REGISTRY } from "./services/scan_service";
import { ParsedDevice } from "./schema/sensor_data";

const device = (overrides: Partial<ParsedDevice> & { mac: string }): ParsedDevice => ({
	rssi: -60,
	format: "parsed",
	companyId: "004C",
	isNearbyInfo: true,
	...overrides,
});

describe("STAGE_REGISTRY.companyFilter", () => {
	test("allowedCompanyIdsに含まれないcompanyIdは除外", () => {
		const devices = [device({ mac: "AA:BB:CC:DD:EE:01", companyId: "00E0" })];
		const result = STAGE_REGISTRY.companyFilter(devices, {
			name: "companyFilter", allowedCompanyIds: ["004C"], requireNearbyInfo: true,
		});
		expect(result).toHaveLength(0);
	});

	test("requireNearbyInfo: falseならisNearbyInfoを問わない", () => {
		const devices = [device({ mac: "AA:BB:CC:DD:EE:01", isNearbyInfo: false })];
		const result = STAGE_REGISTRY.companyFilter(devices, {
			name: "companyFilter", allowedCompanyIds: ["004C"], requireNearbyInfo: false,
		});
		expect(result).toHaveLength(1);
	});
});

describe("runPipeline", () => {
	test("段の順序通りに実行され、traceが記録される", () => {
		const devices = [
			device({ mac: "AA:AA:AA:AA:AA:01", rssi: -50 }),
			device({ mac: "AA:AA:AA:AA:AA:01", rssi: -90 }), // 同一mac、重複排除対象
			device({ mac: "AA:AA:AA:AA:AA:02", rssi: -60, companyId: "00E0" }), // company対象外
		];

		const { result, trace, dedupeOutput } = runPipeline(devices, [
			{ name: "dedupe" },
			{ name: "companyFilter", allowedCompanyIds: ["004C"], requireNearbyInfo: true },
			{ name: "rssiFilter", rssiThreshold: -100 },
		]);

		expect(result).toHaveLength(1); // 重複排除で1台、company対象外で1台除外 → 1台
		expect(trace).toEqual([
			{ stageName: "dedupe", countBefore: 3, countAfter: 2 },
			{ stageName: "companyFilter", countBefore: 2, countAfter: 1 },
			{ stageName: "rssiFilter", countBefore: 1, countAfter: 1 },
		]);
		expect(dedupeOutput).toHaveLength(2);
		expect(dedupeOutput?.find(d => d.device.mac === "AA:AA:AA:AA:AA:01")?.count).toBe(2);
	});

	test("dedupeを含まない設定ではdedupeOutputがundefined", () => {
		const devices = [device({ mac: "AA:BB:CC:DD:EE:01" })];
		const { dedupeOutput } = runPipeline(devices, [
			{ name: "rssiFilter", rssiThreshold: -100 },
		]);
		expect(dedupeOutput).toBeUndefined();
	});

	test("順序を入れ替えても最終件数は変わらない（dedupeByMacと述語フィルタの可換性）", () => {
		const devices = [
			device({ mac: "AA:AA:AA:AA:AA:01", rssi: -50 }),
			device({ mac: "AA:AA:AA:AA:AA:02", rssi: -90, companyId: "00E0" }),
		];

		const dedupeFirst = runPipeline(devices, [
			{ name: "dedupe" },
			{ name: "companyFilter", allowedCompanyIds: ["004C"], requireNearbyInfo: true },
			{ name: "rssiFilter", rssiThreshold: -80 },
		]);

		const companyFilterFirst = runPipeline(devices, [
			{ name: "companyFilter", allowedCompanyIds: ["004C"], requireNearbyInfo: true },
			{ name: "dedupe" },
			{ name: "rssiFilter", rssiThreshold: -80 },
		]);

		expect(dedupeFirst.result.length).toBe(companyFilterFirst.result.length);
	});
});
