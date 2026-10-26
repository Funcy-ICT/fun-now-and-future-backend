import { OpenAPIHono } from "@hono/zod-openapi";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { createPrAssetRoute } from "./controllers/pr_asset";
import { errorHandler } from "./middlewares/error_handler";
import { MyPrAssetsResponseSchema, WithdrawPrAssetResponseSchema } from "./schema/api/my_pr_assets";
import { CONSENT_VERSION } from "./schema/pr_asset";
import { createTestAuth } from "./testing/auth";

const PRIVATE = "test-pr-assets-private";
const PUBLIC = "test-pr-assets-public";
const POSTER = "google-oauth2|my-poster";
const OTHER = "google-oauth2|my-other";

let app: OpenAPIHono;
let posterToken: string;
let otherToken: string;
const ids: string[] = [];

const docOf = (id: string) => getFirestore().collection("prAssets").doc(id);
const publicFile = (id: string) => getStorage().bucket(PUBLIC).file(`objects/${id}`);

const seed = async (id: string, uid: string, status: string, createdAt: string, extra: Record<string, unknown> = {}) => {
	ids.push(id);
	await docOf(id).set({
		id,
		status,
		tag: "お知らせ",
		title: `投稿 ${id}`,
		description: "",
		contentType: "image/png",
		size: 5,
		publishFrom: Timestamp.fromDate(new Date("2026-10-01T00:00:00Z")),
		publishUntil: null,
		createdAt: Timestamp.fromDate(new Date(createdAt)),
		submittedBy: { uid, email: "someone@fun.ac.jp" },
		consent: { version: CONSENT_VERSION, agreedAt: Timestamp.fromDate(new Date(createdAt)) },
		...extra,
	});
};

const request = (path: string, method: string, token?: string) =>
	app.request(path, { method, headers: token === undefined ? {} : { Authorization: `Bearer ${token}` } });

describe("ダッシュボードのapi", () => {
	const original = { private: process.env.PR_ASSET_PRIVATE_BUCKET, public: process.env.PR_ASSET_BUCKET };

	beforeAll(async () => {
		process.env.PR_ASSET_PRIVATE_BUCKET = PRIVATE;
		process.env.PR_ASSET_BUCKET = PUBLIC;
		const auth = await createTestAuth();
		posterToken = await auth.sign({}, POSTER);
		otherToken = await auth.sign({}, OTHER);
		app = new OpenAPIHono();
		app.onError(errorHandler);
		app.route("/", createPrAssetRoute(auth.middleware));

		const admin = { uid: "google-oauth2|admin", email: "admin@fun.ac.jp" };
		await seed("my-old", POSTER, "approved", "2026-10-01T00:00:00Z", { reviewedBy: admin });
		await seed("my-rejected", POSTER, "rejected", "2026-10-02T00:00:00Z", { reviewedBy: admin, reviewNote: "画像が読めないため" });
		await seed("my-new", POSTER, "pending", "2026-10-03T00:00:00Z");
		await seed("my-revoked", POSTER, "revoked", "2026-09-30T00:00:00Z", { revokedBy: { ...admin, role: "admin" } });
		await seed("my-others", OTHER, "pending", "2026-10-04T00:00:00Z");
	});

	afterAll(async () => {
		for (const id of ids) {
			await docOf(id).delete();
			await publicFile(id).delete({ ignoreNotFound: true });
		}
		for (const [key, value] of [["PR_ASSET_PRIVATE_BUCKET", original.private], ["PR_ASSET_BUCKET", original.public]] as const) {
			if (value === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}
	});

	describe("GET /pr-assets/mine", () => {
		test("自分の投稿だけを、新しい順に返す", async () => {
			const res = await request("/pr-assets/mine", "GET", posterToken);

			expect(res.status).toBe(200);
			const { assets } = MyPrAssetsResponseSchema.parse(await res.json());
			expect(assets.map(a => a.id)).toEqual(["my-new", "my-rejected", "my-old", "my-revoked"]);
		});

		test("却下の理由は却下のときだけ、取り下げた人は取り下げのときだけ返し、承認した人のメールアドレスは返さない", async () => {
			const res = await request("/pr-assets/mine", "GET", posterToken);
			const body = await res.text();
			const assets = MyPrAssetsResponseSchema.parse(JSON.parse(body)).assets;

			expect(assets.find(a => a.id === "my-rejected")?.reviewNote).toBe("画像が読めないため");
			expect(assets.find(a => a.id === "my-old")?.reviewNote).toBeNull();
			expect(assets.find(a => a.id === "my-revoked")?.revokedBy).toBe("admin");
			expect(assets.find(a => a.id === "my-new")?.revokedBy).toBeNull();
			expect(body).not.toContain("admin@fun.ac.jp");
		});

		test("投稿が無ければ空の一覧", async () => {
			const auth = await createTestAuth();
			const res = await new OpenAPIHono().route("/", createPrAssetRoute(auth.middleware))
				.request("/pr-assets/mine", { headers: { Authorization: `Bearer ${await auth.sign({}, "google-oauth2|nobody")}` } });

			expect(await res.json()).toEqual({ assets: [] });
		});

		test("トークンが無ければ401", async () => {
			expect((await request("/pr-assets/mine", "GET")).status).toBe(401);
		});
	});

	describe("POST /pr-assets/{id}/withdraw", () => {
		test("承認済みの自分の投稿を取り下げると、revokedになり、公開バケットの画像が消える", async () => {
			await publicFile("my-old").save(Buffer.from("image"), { contentType: "image/png", resumable: false });

			const res = await request("/pr-assets/my-old/withdraw", "POST", posterToken);

			expect(res.status).toBe(200);
			expect(WithdrawPrAssetResponseSchema.parse(await res.json())).toEqual({ id: "my-old", status: "revoked" });
			const data = (await docOf("my-old").get()).data();
			expect(data?.status).toBe("revoked");
			expect(data?.revokedBy).toMatchObject({ uid: POSTER, role: "submitter" });
			expect((await publicFile("my-old").exists())[0]).toBe(false);
		});

		test("ほかの人の投稿と、無いidは404。ほかの人の投稿は変わらない", async () => {
			expect((await request("/pr-assets/my-others/withdraw", "POST", posterToken)).status).toBe(404);
			expect((await request("/pr-assets/no-such-asset/withdraw", "POST", posterToken)).status).toBe(404);
			expect((await docOf("my-others").get()).data()?.status).toBe("pending");
		});

		test("ほかの人が、却下済みの投稿を取り下げようとしても、409ではなく404", async () => {
			expect((await request("/pr-assets/my-rejected/withdraw", "POST", otherToken)).status).toBe(404);
		});

		test("却下済みの自分の投稿は409", async () => {
			const res = await request("/pr-assets/my-rejected/withdraw", "POST", posterToken);

			expect(res.status).toBe(409);
			expect(await res.json()).toEqual({ status: "error", message: "prAsset status is rejected" });
		});

		test("トークンが無ければ401", async () => {
			expect((await request("/pr-assets/my-new/withdraw", "POST")).status).toBe(401);
		});
	});
});
