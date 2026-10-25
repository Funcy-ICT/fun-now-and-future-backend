import { Hono } from "hono";
import { createLocalJWKSet, exportJWK, generateKeyPair, JWTPayload, KeyLike, SignJWT } from "jose";
import { AuthVariables, createUserAuthMiddleware, requirePermission } from "./middlewares/user_auth";
import { DOMAIN_CLAIM, EMAIL_CLAIM } from "./schema/api/auth";

const ISSUER = "https://test-tenant.jp.auth0.com/";
const AUDIENCE = "https://fun-now-and-future/api";
const KID = "test-key";

let privateKey: KeyLike;
let otherPrivateKey: KeyLike;
let app: Hono<{ Variables: AuthVariables }>;

beforeAll(async () => {
	const pair = await generateKeyPair("RS256");
	privateKey = pair.privateKey;
	otherPrivateKey = (await generateKeyPair("RS256")).privateKey;
	const jwk = { ...(await exportJWK(pair.publicKey)), kid: KID, alg: "RS256" };

	app = new Hono<{ Variables: AuthVariables }>()
		.use(createUserAuthMiddleware(createLocalJWKSet({ keys: [jwk] }), ISSUER, AUDIENCE))
		.get("/me", c => c.json(c.get("user")))
		.get("/review", requirePermission("review:pr-assets"), c => c.text("ok"));
});

const claims = (overrides: JWTPayload = {}): JWTPayload => ({
	[EMAIL_CLAIM]: "poster@fun.ac.jp",
	[DOMAIN_CLAIM]: "fun.ac.jp",
	...overrides,
});

const sign = (payload: JWTPayload, options: { key?: KeyLike; issuer?: string; audience?: string; exp?: number | string } = {}) =>
	new SignJWT(payload)
		.setProtectedHeader({ alg: "RS256", kid: KID })
		.setSubject("google-oauth2|1234567890")
		.setIssuer(options.issuer ?? ISSUER)
		.setAudience(options.audience ?? AUDIENCE)
		.setIssuedAt()
		.setExpirationTime(options.exp ?? "1h")
		.sign(options.key ?? privateKey);

const request = (path: string, token?: string) =>
	app.request(path, { headers: token === undefined ? {} : { Authorization: `Bearer ${token}` } });

describe("createUserAuthMiddleware", () => {
	test("正しいトークンなら、uid, メールアドレス, 権限が後ろの処理に渡る", async () => {
		const res = await request("/me", await sign(claims()));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ uid: "google-oauth2|1234567890", email: "poster@fun.ac.jp", permissions: [] });
	});

	test("Authorizationヘッダーが無いか、Bearerでなければ401", async () => {
		expect((await request("/me")).status).toBe(401);
		const res = await app.request("/me", { headers: { Authorization: `Basic ${await sign(claims())}` } });
		expect(res.status).toBe(401);
	});

	test("期限が切れていれば401。ずれは1分まで許す", async () => {
		const now = Math.floor(Date.now() / 1000);
		expect((await request("/me", await sign(claims(), { exp: now - 120 }))).status).toBe(401);
		expect((await request("/me", await sign(claims(), { exp: now - 30 }))).status).toBe(200);
	});

	test("宛先(aud)か発行元(iss)が違えば401", async () => {
		expect((await request("/me", await sign(claims(), { audience: "https://other-api" }))).status).toBe(401);
		expect((await request("/me", await sign(claims(), { issuer: "https://other-tenant.auth0.com/" }))).status).toBe(401);
	});

	test("ほかの鍵で署名されていれば401", async () => {
		expect((await request("/me", await sign(claims(), { key: otherPrivateKey }))).status).toBe(401);
	});

	test("RS256以外のアルゴリズムで署名されていれば401", async () => {
		const token = await new SignJWT(claims())
			.setProtectedHeader({ alg: "HS256", kid: KID })
			.setSubject("google-oauth2|1234567890")
			.setIssuer(ISSUER)
			.setAudience(AUDIENCE)
			.setExpirationTime("1h")
			.sign(new TextEncoder().encode("a-shared-secret-that-is-long-enough"));
		expect((await request("/me", token)).status).toBe(401);
	});

	test("署名が正しくても、ドメインのクレームが無いか、fun.ac.jpでなければ401", async () => {
		expect((await request("/me", await sign(claims({ [DOMAIN_CLAIM]: undefined })))).status).toBe(401);
		expect((await request("/me", await sign(claims({ [DOMAIN_CLAIM]: "gmail.com" })))).status).toBe(401);
	});

	test("メールアドレスのクレームが無ければ401", async () => {
		expect((await request("/me", await sign(claims({ [EMAIL_CLAIM]: undefined })))).status).toBe(401);
	});

	test("401のレスポンスは、ほかのエラーと同じ形", async () => {
		const res = await request("/me");
		expect(await res.json()).toEqual({ status: "error", message: "Unauthorized: Invalid or missing access token" });
	});
});

describe("requirePermission", () => {
	test("権限があれば通す", async () => {
		const res = await request("/review", await sign(claims({ permissions: ["review:pr-assets"] })));
		expect(res.status).toBe(200);
	});

	test("権限が無ければ403", async () => {
		expect((await request("/review", await sign(claims()))).status).toBe(403);
		expect((await request("/review", await sign(claims({ permissions: ["write:config"] })))).status).toBe(403);
	});
});
