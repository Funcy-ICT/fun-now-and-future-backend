import { SensorDataSchema } from "./schema/sensor_data";

const rawDevice = (rssi: number) => ({ format: "raw", mac: "AA:BB:CC:DD:EE:01", rssi, rawData: "02011a020a0c" });

const payload = (overrides: Record<string, unknown> = {}) => ({
	nodeId: "node-01",
	location: "london",
	devices: [rawDevice(-60)],
	...overrides,
});

describe("SensorDataSchema", () => {
	test("sendIdは無くても通り、あれば保持される", () => {
		const without = SensorDataSchema.safeParse(payload());
		expect(without.success).toBe(true);
		expect(without.data?.sendId).toBeUndefined();

		const withId = SensorDataSchema.safeParse(payload({ sendId: "0b8f2c1e-4a7d-4c1e-9d3a-5e6f7a8b9c0d" }));
		expect(withId.data?.sendId).toBe("0b8f2c1e-4a7d-4c1e-9d3a-5e6f7a8b9c0d");
	});

	test("sendIdが空、または65文字以上なら弾く", () => {
		expect(SensorDataSchema.safeParse(payload({ sendId: "" })).success).toBe(false);
		expect(SensorDataSchema.safeParse(payload({ sendId: "a".repeat(65) })).success).toBe(false);
	});

	test("rssiは-127から20までを受け付け、範囲外は弾く", () => {
		expect(SensorDataSchema.safeParse(payload({ devices: [rawDevice(-127), rawDevice(20)] })).success).toBe(true);
		expect(SensorDataSchema.safeParse(payload({ devices: [rawDevice(-128)] })).success).toBe(false);
		expect(SensorDataSchema.safeParse(payload({ devices: [rawDevice(21)] })).success).toBe(false);
	});

	test("devicesは256件まで受け付け、257件以上なら弾く", () => {
		expect(SensorDataSchema.safeParse(payload({ devices: Array(256).fill(rawDevice(-60)) })).success).toBe(true);
		expect(SensorDataSchema.safeParse(payload({ devices: Array(257).fill(rawDevice(-60)) })).success).toBe(false);
	});

	test("devicesが空でも通る", () => {
		expect(SensorDataSchema.safeParse(payload({ devices: [] })).success).toBe(true);
	});
});
