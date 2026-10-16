import { runPipeline, STAGE_REGISTRY, aggregateWindow, toPipelineDevice, dedupeByMac, filterByRssi, groupByLocation } from "./services/scan_service";
import { ParsedDevice } from "./schema/sensor_data";

// 重複排除の前の、検出1件の端末
const device = (overrides: Partial<ParsedDevice> & { mac: string }, nodeId = "node-1") => toPipelineDevice({
	rssi: -60,
	format: "parsed",
	companyId: "004C",
	isNearbyInfo: true,
	...overrides,
}, nodeId);

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

describe("groupByLocation", () => {
	test("locationごとにまとめ、検出ごとにnodeIdを残す", () => {
		const parsed = (mac: string, rssi: number): ParsedDevice => ({ mac, rssi, format: "parsed", companyId: "004C", isNearbyInfo: true });
		const byLocation = groupByLocation([
			{ nodeId: "a", location: "cafeteria", devices: [parsed("H1", -60)] },
			{ nodeId: "b", location: "cafeteria", devices: [parsed("H1", -70)] },
			{ nodeId: "c", location: "bus_stop", devices: [] },
		]);
		expect(byLocation.get("cafeteria")?.map(d => d.detections)).toEqual([[{ nodeId: "a", rssi: -60 }], [{ nodeId: "b", rssi: -70 }]]);
		expect(byLocation.get("bus_stop")).toEqual([]);
	});
});

describe("dedupeByMac", () => {
	test("同じmacの検出をすべて残し、代表はrssiが最も強い検出にする", () => {
		const deduped = dedupeByMac([
			device({ mac: "H1", rssi: -70, companyId: "00E0" }, "a"),
			device({ mac: "H1", rssi: -60, companyId: "004C" }, "b"),
			device({ mac: "H1", rssi: -80 }, "a"),
		]);
		expect(deduped).toHaveLength(1);
		expect(deduped[0].count).toBe(3);
		expect(deduped[0].device).toMatchObject({ rssi: -60, companyId: "004C" });
		expect(deduped[0].device.detections).toEqual([
			{ nodeId: "a", rssi: -70 }, { nodeId: "b", rssi: -60 }, { nodeId: "a", rssi: -80 },
		]);
	});

	test("入力の端末は書き換えない", () => {
		const first = device({ mac: "H1", rssi: -70 }, "a");
		dedupeByMac([first, device({ mac: "H1", rssi: -60 }, "b")]);
		expect(first.detections).toEqual([{ nodeId: "a", rssi: -70 }]);
	});
});

describe("filterByRssi", () => {
	test("どれか1件の検出が閾値以上なら残す", () => {
		const [merged] = dedupeByMac([device({ mac: "H1", rssi: -90 }, "a"), device({ mac: "H1", rssi: -65 }, "b")]);
		expect(filterByRssi([merged.device], -70)).toHaveLength(1);
		expect(filterByRssi([merged.device], -60)).toHaveLength(0);
	});
});

describe("aggregateWindow", () => {
	const window = (iso: string) => {
		const { start, end } = aggregateWindow(new Date(iso));
		return [start.toDate().toISOString(), end.toDate().toISOString()];
	};

	test("窓が閉じた1分後に呼ぶと、その窓が対象になる", () => {
		expect(window("2026-09-20T10:06:00.000Z")).toEqual(["2026-09-20T10:00:00.000Z", "2026-09-20T10:05:00.000Z"]);
		expect(window("2026-09-20T10:06:59.999Z")).toEqual(["2026-09-20T10:00:00.000Z", "2026-09-20T10:05:00.000Z"]);
	});

	test("猶予より早く呼ばれたら、1つ前の窓が対象になる", () => {
		expect(window("2026-09-20T10:05:00.000Z")).toEqual(["2026-09-20T09:55:00.000Z", "2026-09-20T10:00:00.000Z"]);
		expect(window("2026-09-20T10:05:59.999Z")).toEqual(["2026-09-20T09:55:00.000Z", "2026-09-20T10:00:00.000Z"]);
	});

	test("窓の長さは5分", () => {
		const { start, end } = aggregateWindow(new Date("2026-09-20T10:11:00.000Z"));
		expect(end.toMillis() - start.toMillis()).toBe(5 * 60 * 1000);
	});
});
