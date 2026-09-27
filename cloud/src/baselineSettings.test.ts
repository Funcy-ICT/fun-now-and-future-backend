import { resolveSettings, pickValidSettings } from "./services/baseline_settings";
import { DEFAULT_BASELINE_SETTINGS } from "./schema/baseline_settings";

const silence = () => jest.spyOn(console, "error").mockImplementation(() => { });

describe("pickValidSettings", () => {
	test("範囲を外れた項目だけを捨てる", () => {
		const spy = silence();
		expect(pickValidSettings({ gateRatio: 0.3, completenessRatio: 2 }, "test")).toEqual({ gateRatio: 0.3 });
		expect(spy).toHaveBeenCalled();
		spy.mockRestore();
	});

	test("知らない項目は無視する", () => {
		const spy = silence();
		expect(pickValidSettings({ unknown: 1 }, "test")).toEqual({});
		spy.mockRestore();
	});

	test("オブジェクトでなければ空を返す", () => {
		expect(pickValidSettings(null, "test")).toEqual({});
		expect(pickValidSettings("7", "test")).toEqual({});
	});
});

describe("resolveSettings", () => {
	test("設定が無ければ、コードの既定値を使う", () => {
		expect(resolveSettings(null, "cafeteria")).toEqual(DEFAULT_BASELINE_SETTINGS);
	});

	test("locationの上書きが、全体の既定値より優先される", () => {
		const config = {
			defaults: { operatingEndHour: 20, gateRatio: 0.4 },
			locations: { cafeteria: { operatingEndHour: 18 } },
		};
		const settings = resolveSettings(config, "cafeteria");
		expect(settings.operatingEndHour).toBe(18); // locationの値
		expect(settings.gateRatio).toBe(0.4);       // 全体の既定値
		expect(settings.operatingStartHour).toBe(7); // コードの既定値
	});

	test("上書きが無いlocationは、全体の既定値を使う", () => {
		const config = { defaults: { operatingEndHour: 20 }, locations: { cafeteria: { operatingEndHour: 18 } } };
		expect(resolveSettings(config, "bus_stop").operatingEndHour).toBe(20);
	});

	test("稼働時間帯が逆転していたら、時間帯だけコードの既定値に戻す", () => {
		const spy = silence();
		const settings = resolveSettings({ locations: { cafeteria: { operatingStartHour: 22, operatingEndHour: 7, gateRatio: 0.4 } } }, "cafeteria");
		expect(settings.operatingStartHour).toBe(7);
		expect(settings.operatingEndHour).toBe(22);
		expect(settings.gateRatio).toBe(0.4); // 他の項目は残す
		spy.mockRestore();
	});
});
