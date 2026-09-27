import { percentileOfSorted, medianOfSorted, median } from "./services/statistics";

describe("percentileOfSorted", () => {
	test("ceil(p × n)番目の値を返す", () => {
		const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
		expect(percentileOfSorted(sorted, 0.95)).toBe(10); // ceil(9.5) = 10番目
		expect(percentileOfSorted(sorted, 0.5)).toBe(5);   // ceil(5) = 5番目
		expect(percentileOfSorted(sorted, 0.05)).toBe(1);  // ceil(0.5) = 1番目
	});

	test("20個なら、p95は19番目", () => {
		const sorted = Array.from({ length: 20 }, (_, i) => i + 1);
		expect(percentileOfSorted(sorted, 0.95)).toBe(19);
	});

	test("値が1つでも動く", () => {
		expect(percentileOfSorted([7], 0.95)).toBe(7);
	});

	test("空なら例外を投げる", () => {
		expect(() => percentileOfSorted([], 0.95)).toThrow();
	});
});

describe("median", () => {
	test("並んでいない配列でも中央値を返す", () => {
		expect(median([5, 1, 3])).toBe(3);
	});

	test("偶数個なら、小さい側を返す(補間しない)", () => {
		expect(medianOfSorted([1, 2, 3, 4])).toBe(2);
	});

	test("元の配列を並べ替えない", () => {
		const values = [5, 1, 3];
		median(values);
		expect(values).toEqual([5, 1, 3]);
	});
});
