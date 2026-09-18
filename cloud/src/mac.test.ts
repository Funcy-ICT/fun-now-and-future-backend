import { normalizeMac, isValidMac, hashMac, inferAddressType } from "./services/mac";

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

describe("hashMac", () => {
	const key = "test-key-0123456789-0123456789-0123456789";

	test("書式が違っても、同じmacと鍵なら同じ値になる", () => {
		expect(hashMac("AA:BB:CC:DD:EE:01", key)).toBe(hashMac("aabbccddee01", key));
	});

	test("鍵が違えば別の値になる", () => {
		expect(hashMac("AA:BB:CC:DD:EE:01", key)).not.toBe(hashMac("AA:BB:CC:DD:EE:01", `${key}-other`));
	});

	test("macが違えば別の値になる", () => {
		expect(hashMac("AA:BB:CC:DD:EE:01", key)).not.toBe(hashMac("AA:BB:CC:DD:EE:02", key));
	});

	test("大文字の16進64文字で、元のmacを含まない", () => {
		const hash = hashMac("AA:BB:CC:DD:EE:01", key);
		expect(hash).toMatch(/^[0-9A-F]{64}$/);
		expect(hash).not.toContain("AABBCCDDEE01");
	});
});

describe("inferAddressType", () => {
	test("最上位2ビットが11なら静的ランダム", () => {
		expect(inferAddressType("C0:00:00:00:00:01")).toBe("random_static");
		expect(inferAddressType("FF:BB:CC:DD:EE:01")).toBe("random_static");
	});

	test("最上位2ビットが01ならRPA", () => {
		expect(inferAddressType("40:00:00:00:00:01")).toBe("random_resolvable");
		expect(inferAddressType("7f:bb:cc:dd:ee:01")).toBe("random_resolvable");
	});

	test("最上位2ビットが00ならNRPA", () => {
		expect(inferAddressType("00:11:22:33:44:55")).toBe("random_non_resolvable");
		expect(inferAddressType("3F:BB:CC:DD:EE:01")).toBe("random_non_resolvable");
	});

	test("最上位2ビットが10なら仕様上使われないのでnull", () => {
		expect(inferAddressType("80:00:00:00:00:01")).toBeNull();
		expect(inferAddressType("BF:BB:CC:DD:EE:01")).toBeNull();
	});

	test("区切り文字がなくても判定できる", () => {
		expect(inferAddressType("c00000000001")).toBe("random_static");
	});
});
