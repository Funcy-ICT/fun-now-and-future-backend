import { buildScanEvent, toParsedDevice } from "./services/scan_event";
import { hashMac } from "./services/mac";
import { ScanEventSchema } from "./schema/scan_event";
import { SensorData } from "./schema/sensor_data";

const key = "test-key-0123456789-0123456789-0123456789";
const receivedAt = new Date("2026-09-20T12:00:00.000Z");

// Apple(0x004C)のNearby Info(0x10)を含むアドバタイズ
const appleRawData = "0aff4c001005011c2b3c4d";

const sensorData = (overrides: Partial<SensorData> = {}): SensorData => ({
	nodeId: "node-01",
	location: "london",
	devices: [
		{ format: "raw", mac: "C0:11:22:33:44:01", rssi: -60, rawData: appleRawData },
		{ format: "parsed", mac: "40:11:22:33:44:02", rssi: -72, companyId: "00E0", isNearbyInfo: false },
	],
	...overrides,
});

describe("buildScanEvent", () => {
	test("rawの検出はパースしてcompanyIdとisNearbyInfoを埋め、rawDataも残す", () => {
		const event = buildScanEvent(sensorData(), receivedAt, key);
		expect(event.devices[0]).toEqual({
			macHash: hashMac("C0:11:22:33:44:01", key),
			rssi: -60,
			format: "raw",
			rawData: appleRawData,
			companyId: "004C",
			isNearbyInfo: true,
			addressType: "random_static",
		});
	});

	test("parsedの検出はrawDataがnullで、送られてきた値をそのまま使う", () => {
		const event = buildScanEvent(sensorData(), receivedAt, key);
		expect(event.devices[1]).toEqual({
			macHash: hashMac("40:11:22:33:44:02", key),
			rssi: -72,
			format: "parsed",
			rawData: null,
			companyId: "00E0",
			isNearbyInfo: false,
			addressType: "random_resolvable",
		});
	});

	test("生のmacアドレスがメッセージのどこにも含まれない", () => {
		const json = JSON.stringify(buildScanEvent(sensorData(), receivedAt, key)).toUpperCase();
		expect(json).not.toContain("C0:11:22:33:44:01");
		expect(json).not.toContain("C01122334401");
		expect(json).not.toContain("401122334402");
	});

	test("sendIdが無ければnull、あればそのまま入る", () => {
		expect(buildScanEvent(sensorData(), receivedAt, key).sendId).toBeNull();
		expect(buildScanEvent(sensorData({ sendId: "abc" }), receivedAt, key).sendId).toBe("abc");
	});

	test("受信時刻はISO形式で、鍵の版が入る", () => {
		const event = buildScanEvent(sensorData(), receivedAt, key);
		expect(event.receivedAt).toBe("2026-09-20T12:00:00.000Z");
		expect(event.hashKeyVersion).toBe("v1");
	});

	test("rssiが小数なら丸める", () => {
		const event = buildScanEvent(
			sensorData({ devices: [{ format: "parsed", mac: "AA:BB:CC:DD:EE:01", rssi: -60.6, companyId: null, isNearbyInfo: false }] }),
			receivedAt,
			key,
		);
		expect(event.devices[0].rssi).toBe(-61);
	});

	test("組み立てたメッセージはScanEventSchemaを通る。検出が0件でも通る", () => {
		expect(ScanEventSchema.safeParse(buildScanEvent(sensorData(), receivedAt, key)).success).toBe(true);
		expect(ScanEventSchema.safeParse(buildScanEvent(sensorData({ devices: [] }), receivedAt, key)).success).toBe(true);
	});
});

describe("toParsedDevice", () => {
	test("macにはmacHashが入り、formatはparsedになる", () => {
		const device = buildScanEvent(sensorData(), receivedAt, key).devices[0];
		expect(toParsedDevice(device)).toEqual({
			mac: device.macHash,
			rssi: -60,
			format: "parsed",
			companyId: "004C",
			isNearbyInfo: true,
		});
	});

	test("isNearbyInfoがnullならfalseとして扱う", () => {
		const device = { ...buildScanEvent(sensorData(), receivedAt, key).devices[0], isNearbyInfo: null };
		expect(toParsedDevice(device).isNearbyInfo).toBe(false);
	});
});
