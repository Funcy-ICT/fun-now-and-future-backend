import { jstDate, jstHour, jstDateStartMs, jstDaysBefore, operatingRangeMs } from "./services/jst";

describe("jstDate", () => {
	test("UTCの15時は、日本時間では翌日の0時", () => {
		expect(jstDate(Date.parse("2026-09-20T14:59:59.999Z"))).toBe("2026-09-20");
		expect(jstDate(Date.parse("2026-09-20T15:00:00.000Z"))).toBe("2026-09-21");
	});
});

describe("jstHour", () => {
	test("UTCの22時は、日本時間の7時", () => {
		expect(jstHour(Date.parse("2026-09-19T22:00:00.000Z"))).toBe(7);
		expect(jstHour(Date.parse("2026-09-20T13:00:00.000Z"))).toBe(22);
	});
});

describe("jstDateStartMs", () => {
	test("日本時間の0時は、UTCの前日15時", () => {
		expect(new Date(jstDateStartMs("2026-09-20")).toISOString()).toBe("2026-09-19T15:00:00.000Z");
	});

	test("jstDateと往復する", () => {
		expect(jstDate(jstDateStartMs("2026-09-20"))).toBe("2026-09-20");
	});
});

describe("jstDaysBefore", () => {
	test("7の倍数を渡すと、同じ曜日を遡る", () => {
		expect(jstDaysBefore("2026-09-20", 7)).toBe("2026-09-13");
		expect(jstDaysBefore("2026-09-20", 28)).toBe("2026-08-23");
	});

	test("月をまたいでも正しい", () => {
		expect(jstDaysBefore("2026-03-01", 1)).toBe("2026-02-28");
	});
});

describe("operatingRangeMs", () => {
	test("日本時間の7時から22時の範囲を返す", () => {
		const { start, end } = operatingRangeMs("2026-09-20", 7, 22);
		expect(new Date(start).toISOString()).toBe("2026-09-19T22:00:00.000Z");
		expect(new Date(end).toISOString()).toBe("2026-09-20T13:00:00.000Z");
		expect((end - start) / (60 * 60 * 1000)).toBe(15);
	});
});
