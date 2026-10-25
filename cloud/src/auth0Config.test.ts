import { getAuth0Config } from "./lib/auth0";

describe("getAuth0Config", () => {
	const original = { domain: process.env.AUTH0_DOMAIN, audience: process.env.AUTH0_AUDIENCE };

	afterEach(() => {
		for (const [key, value] of [["AUTH0_DOMAIN", original.domain], ["AUTH0_AUDIENCE", original.audience]] as const) {
			if (value === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}
	});

	test("ドメインから、発行元と公開鍵のurlを作る", () => {
		process.env.AUTH0_DOMAIN = "test-tenant.jp.auth0.com";
		process.env.AUTH0_AUDIENCE = "https://fun-now-and-future/api";

		const config = getAuth0Config();

		expect(config.issuer).toBe("https://test-tenant.jp.auth0.com/");
		expect(config.audience).toBe("https://fun-now-and-future/api");
		expect(config.jwksUrl.toString()).toBe("https://test-tenant.jp.auth0.com/.well-known/jwks.json");
	});

	test("どちらかが未設定なら例外を投げる", () => {
		process.env.AUTH0_AUDIENCE = "https://fun-now-and-future/api";
		delete process.env.AUTH0_DOMAIN;
		expect(() => getAuth0Config()).toThrow("AUTH0_DOMAIN is not set");

		process.env.AUTH0_DOMAIN = "test-tenant.jp.auth0.com";
		delete process.env.AUTH0_AUDIENCE;
		expect(() => getAuth0Config()).toThrow("AUTH0_AUDIENCE is not set");
	});
});
