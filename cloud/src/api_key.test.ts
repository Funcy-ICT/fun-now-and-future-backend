import { getApiKey } from "./lib/api_key";
import { TEST_API_KEY } from "./testing/api_key";

describe("getApiKey", () => {
	afterEach(() => {
		process.env.ESP32_API_KEY = TEST_API_KEY;
	});

	test("未設定なら例外を投げる", () => {
		delete process.env.ESP32_API_KEY;
		expect(() => getApiKey()).toThrow("ESP32_API_KEY is missing");
	});

	test("空文字なら例外を投げる", () => {
		process.env.ESP32_API_KEY = "";
		expect(() => getApiKey()).toThrow("ESP32_API_KEY is missing");
	});

	test("設定されていればそのまま返す", () => {
		expect(getApiKey()).toBe(TEST_API_KEY);
	});
});
