import { createApp } from "./app";

const ALLOWED = "https://fnaf-post.web.app";
const env = ["APP_ALLOWED_ORIGINS", "AUTH0_DOMAIN", "AUTH0_AUDIENCE"] as const;

const preflight = (origin: string) => ({
	method: "OPTIONS",
	headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization" },
});

describe("appのcors", () => {
	const original = Object.fromEntries(env.map(key => [key, process.env[key]]));

	beforeEach(() => {
		process.env.APP_ALLOWED_ORIGINS = `${ALLOWED},https://fnaf-post.firebaseapp.com`;
		process.env.AUTH0_DOMAIN = "test-tenant.jp.auth0.com";
		process.env.AUTH0_AUDIENCE = "https://fun-now-and-future/api";
	});

	afterAll(() => {
		for (const key of env) {
			if (original[key] === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = original[key];
			}
		}
	});

	test("許したオリジンのプリフライトに、オリジンとAuthorizationのヘッダーを許す", async () => {
		const res = await createApp("app").request("/pr-assets", preflight(ALLOWED));

		expect(res.status).toBe(204);
		expect(res.headers.get("access-control-allow-origin")).toBe(ALLOWED);
		expect(res.headers.get("access-control-allow-headers")).toContain("Authorization");
		expect(res.headers.get("access-control-allow-credentials")).toBeNull();
	});

	test("ほかのオリジンには、Access-Control-Allow-Originを付けない", async () => {
		const res = await createApp("app").request("/pr-assets", preflight("https://evil.example"));

		expect(res.headers.get("access-control-allow-origin")).toBeNull();
	});

	test("許したオリジンからなら、401の応答にもヘッダーが付く(画面がエラーを読める)", async () => {
		const res = await createApp("app").request("/pr-assets", { method: "POST", headers: { Origin: ALLOWED } });

		expect(res.status).toBe(401);
		expect(res.headers.get("access-control-allow-origin")).toBe(ALLOWED);
	});

	test("APP_ALLOWED_ORIGINSが無ければ、どのオリジンも許さない(ローカル)", async () => {
		delete process.env.APP_ALLOWED_ORIGINS;
		const res = await createApp("all").request("/pr-assets", preflight(ALLOWED));

		expect(res.headers.get("access-control-allow-origin")).toBeNull();
	});

	test("ingestのルートには付けない", async () => {
		const res = await createApp("all").request("/getCongestion?location=cafeteria", { headers: { Origin: ALLOWED } });

		expect(res.headers.get("access-control-allow-origin")).toBeNull();
	});
});
