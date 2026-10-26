import sharp from "sharp";
import { OpenAPIHono } from "@hono/zod-openapi";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { createApp } from "./app";
import { createPrAssetRoute } from "./controllers/pr_asset";
import { errorHandler } from "./middlewares/error_handler";
import { ErrorResponseSchema } from "./schema/api/common";
import { PrAssetSubmitResponseSchema } from "./schema/api/pr_asset_submit";
import { CONSENT_VERSION, PrAssetSchema } from "./schema/pr_asset";
import { createTestAuth } from "./testing/auth";

const BUCKET = "test-pr-assets-private";

let app: OpenAPIHono;
let token: string;

const restoreEnv = (key: string, value: string | undefined) => {
	if (value === undefined) {
		delete process.env[key];
	} else {
		process.env[key] = value;
	}
};

const jpeg = async () =>
	sharp({ create: { width: 40, height: 20, channels: 3, background: "#3366cc" } }).jpeg().toBuffer();

const form = async (fields: Record<string, string | Blob> = {}) => {
	const body = new FormData();
	const defaults: Record<string, string | Blob> = {
		file: new File([new Uint8Array(await jpeg())], "photo.jpg", { type: "image/jpeg" }),
		tag: "イベント",
		title: "秋のコンテスト告知",
		description: "10月31日まで作品を募集しています",
		publishFrom: "2026-10-01",
		consentVersion: CONSENT_VERSION,
	};
	for (const [key, value] of Object.entries({ ...defaults, ...fields })) {
		body.append(key, value);
	}
	return body;
};

const post = (body: FormData, bearer: string | null = token) =>
	app.request("/pr-assets", {
		method: "POST",
		body,
		headers: bearer === null ? {} : { Authorization: `Bearer ${bearer}` },
	});

const countDocs = async () => (await getFirestore().collection("prAssets").count().get()).data().count;

const expectError = async (res: Response, status: number) => {
	expect(res.status).toBe(status);
	expect(ErrorResponseSchema.safeParse(await res.json()).success).toBe(true);
};

describe("POST /pr-assets", () => {
	const original = process.env.PR_ASSET_PRIVATE_BUCKET;

	beforeAll(async () => {
		process.env.PR_ASSET_PRIVATE_BUCKET = BUCKET;
		const auth = await createTestAuth();
		token = await auth.sign();
		app = new OpenAPIHono();
		app.onError(errorHandler);
		app.route("/", createPrAssetRoute(auth.middleware));
	});

	afterAll(() => {
		restoreEnv("PR_ASSET_PRIVATE_BUCKET", original);
	});

	test("投稿すると、201でidとpendingが返り、ドキュメントと画像が置かれる", async () => {
		const res = await post(await form());

		expect(res.status).toBe(201);
		const json = PrAssetSubmitResponseSchema.parse(await res.json());
		const file = getStorage().bucket(BUCKET).file(`objects/${json.id}`);
		try {
			expect(json.status).toBe("pending");
			const doc = await getFirestore().collection("prAssets").doc(json.id).get();
			const asset = PrAssetSchema.parse(doc.data());
			expect(asset.status).toBe("pending");
			expect(asset.submittedBy).toEqual({ uid: "google-oauth2|1234567890", email: "poster@fun.ac.jp" });
			expect(asset.publishUntil).toBeNull();
			expect((await file.exists())[0]).toBe(true);
		} finally {
			await getFirestore().collection("prAssets").doc(json.id).delete();
			await file.delete({ ignoreNotFound: true });
		}
	});

	test("トークンが無ければ401で、何も置かれない", async () => {
		const docs = await countDocs();
		await expectError(await post(await form(), null), 401);
		expect(await countDocs()).toBe(docs);
	});

	test("本文に知らない項目(submittedBy)があれば400", async () => {
		await expectError(await post(await form({ submittedBy: "someone@fun.ac.jp" })), 400);
	});

	test("許諾の版が今の版と違えば400で、文言を読み直すように返す", async () => {
		const res = await post(await form({ consentVersion: "2000-01-v1" }));
		expect(res.status).toBe(400);
		expect((await res.json()).message).toBe("consentVersion is outdated. reload the page");
	});

	test("画像が無ければ400", async () => {
		const body = await form();
		body.delete("file");
		await expectError(await post(body), 400);
	});

	test("種類をJPEGと偽っても、中身がJPEGとPNG以外なら400で、何も置かれない", async () => {
		const docs = await countDocs();
		const webp = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#3366cc" } }).webp().toBuffer();
		const res = await post(await form({ file: new File([new Uint8Array(webp)], "photo.jpg", { type: "image/jpeg" }) }));
		await expectError(res, 400);
		expect(await countDocs()).toBe(docs);
	});

	test("掲載の終わりが今日より前なら400", async () => {
		await expectError(await post(await form({ publishFrom: "2000-01-01", publishUntil: "2000-01-02" })), 400);
	});

	test("画像が10MBを超えれば400。本文が上限(11MB)を超えれば413", async () => {
		const over10 = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "photo.jpg", { type: "image/jpeg" });
		await expectError(await post(await form({ file: over10 })), 400);

		const over11 = new File([new Uint8Array(12 * 1024 * 1024)], "photo.jpg", { type: "image/jpeg" });
		await expectError(await post(await form({ file: over11 })), 413);
	});
});

describe("POST /pr-assets(appに載せたもの)", () => {
	const original = { domain: process.env.AUTH0_DOMAIN, audience: process.env.AUTH0_AUDIENCE };

	beforeAll(() => {
		process.env.AUTH0_DOMAIN = "test-tenant.jp.auth0.com";
		process.env.AUTH0_AUDIENCE = "https://fun-now-and-future/api";
	});

	afterAll(() => {
		restoreEnv("AUTH0_DOMAIN", original.domain);
		restoreEnv("AUTH0_AUDIENCE", original.audience);
	});

	test("トークンが無ければ401", async () => {
		const res = await createApp("app").request("/pr-assets", { method: "POST", body: await form() });
		await expectError(res, 401);
	});

	test("ingestとworkerには載らない", async () => {
		for (const role of ["ingest", "worker"] as const) {
			const res = await createApp(role).request("/pr-assets", { method: "POST", body: await form() });
			expect(res.status).toBe(404);
		}
	});
});
