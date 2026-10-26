import { getAppAllowedOrigins } from "./lib/app_origins";

describe("getAppAllowedOrigins", () => {
	const original = process.env.APP_ALLOWED_ORIGINS;

	afterEach(() => {
		if (original === undefined) {
			delete process.env.APP_ALLOWED_ORIGINS;
		} else {
			process.env.APP_ALLOWED_ORIGINS = original;
		}
	});

	test("カンマで分け、前後の空白と空の要素を除く", () => {
		process.env.APP_ALLOWED_ORIGINS = " https://fnaf-post.web.app, https://fnaf-post.firebaseapp.com ,";
		expect(getAppAllowedOrigins()).toEqual(["https://fnaf-post.web.app", "https://fnaf-post.firebaseapp.com"]);
	});

	test("未設定なら例外を投げる", () => {
		delete process.env.APP_ALLOWED_ORIGINS;
		expect(() => getAppAllowedOrigins()).toThrow("APP_ALLOWED_ORIGINS is not set");
	});

	test("末尾の/, パス, オリジンでない文字列は例外を投げる", () => {
		for (const value of ["https://fnaf-post.web.app/", "https://fnaf-post.web.app/post", "fnaf-post.web.app"]) {
			process.env.APP_ALLOWED_ORIGINS = value;
			expect(() => getAppAllowedOrigins()).toThrow("APP_ALLOWED_ORIGINS has an invalid origin");
		}
	});
});
