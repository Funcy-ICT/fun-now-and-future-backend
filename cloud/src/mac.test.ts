import { normalizeMac, isValidMac } from "./services/mac";

describe("normalizeMac", () => {
	test("区切り文字と大文字小文字の違いを吸収して、同じ値になる", () => {
		const expected = "AABBCCDDEE01";
		expect(normalizeMac("AA:BB:CC:DD:EE:01")).toBe(expected);
		expect(normalizeMac("aa:bb:cc:dd:ee:01")).toBe(expected);
		expect(normalizeMac("AA-BB-CC-DD-EE-01")).toBe(expected);
		expect(normalizeMac("aabbccddee01")).toBe(expected);
		expect(normalizeMac("aabb.ccdd.ee01")).toBe(expected);
	});

	test("12桁の16進数でなければ例外を投げる", () => {
		expect(() => normalizeMac("AA:BB:CC:DD:EE")).toThrow();
		expect(() => normalizeMac("AA:BB:CC:DD:EE:GG")).toThrow();
		expect(() => normalizeMac("")).toThrow();
	});

	test("例外のメッセージにmacアドレスを含めない", () => {
		expect(() => normalizeMac("ZZ:BB:CC:DD:EE:01")).toThrow(/^Invalid MAC address$/);
	});
});

describe("isValidMac", () => {
	test("正しい書式ならtrue、そうでなければfalseを返す", () => {
		expect(isValidMac("AA:BB:CC:DD:EE:01")).toBe(true);
		expect(isValidMac("aabbccddee01")).toBe(true);
		expect(isValidMac("AA:BB:CC:DD:EE")).toBe(false);
		expect(isValidMac("")).toBe(false);
	});
});
