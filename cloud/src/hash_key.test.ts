import { getHashKey, HASH_KEY_VERSION } from "./lib/hash_key";

describe("getHashKey", () => {
	const original = process.env.MAC_HASH_KEY;

	afterEach(() => {
		if (original === undefined) {
			delete process.env.MAC_HASH_KEY;
		} else {
			process.env.MAC_HASH_KEY = original;
		}
	});

	test("未設定なら例外を投げる", () => {
		delete process.env.MAC_HASH_KEY;
		expect(() => getHashKey()).toThrow("MAC_HASH_KEY is missing or too short");
	});

	test("32文字未満なら例外を投げる", () => {
		process.env.MAC_HASH_KEY = "a".repeat(31);
		expect(() => getHashKey()).toThrow("MAC_HASH_KEY is missing or too short");
	});

	test("32文字以上ならそのまま返す", () => {
		process.env.MAC_HASH_KEY = "a".repeat(32);
		expect(getHashKey()).toBe("a".repeat(32));
	});

	test("鍵の版はv1", () => {
		expect(HASH_KEY_VERSION).toBe("v1");
	});
});
