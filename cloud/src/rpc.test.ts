import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { hc } from "hono/client";
import { createApp, AppType } from "./app";
import { jstWeekday } from "./services/scan_service";
import { CongestionStatus } from "./schema/api/signage";
import { ErrorResponse, HealthResponse } from "./schema/api/common";
import { OpenAPIHono } from "@hono/zod-openapi";
import { createPrAssetRoute } from "./controllers/pr_asset";
import { errorHandler } from "./middlewares/error_handler";
import { MyPrAssetDto } from "./schema/api/my_pr_assets";
import { createTestAuth } from "./testing/auth";

//管理画面と同じくhc<AppType>で呼ぶ。サーバーは立てず、app.requestに渡す。
//型が合わなければ、ts-jestの型チェックでテストが落ちる
const app = createApp("ingest");
const client = hc<AppType>("http://localhost", {
	fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(app.request(input, init)),
});

//pr-assetsのルートは、手元の鍵で認証するものに替えて呼ぶ。型はAppTypeのものを使う
let prAssetServer: OpenAPIHono;
let token: string;
const appClient = hc<AppType>("http://localhost", {
	fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(prAssetServer.request(input, init)),
});

beforeAll(async () => {
	const auth = await createTestAuth();
	prAssetServer = new OpenAPIHono();
	prAssetServer.onError(errorHandler);
	prAssetServer.route("/", createPrAssetRoute(auth.middleware));
	token = await auth.sign({}, "google-oauth2|rpc-test");
});

describe("hono rpc", () => {
	test("/healthを呼べる", async () => {
		const res = await client.health.$get();
		expect(res.status).toBe(200);
		const json: HealthResponse = await res.json();
		expect(json.status).toBe("ok");
	});

	test("/getCongestionの200のレスポンスに、型が付く", async () => {
		const db = getFirestore();
		const windowStart = Timestamp.now();
		const congestionDoc = await db.collection("congestion_records").add({
			location: "rpc_test",
			weekday: jstWeekday(windowStart.toMillis()),
			windowStart,
			uniqueDeviceCount: 7,
		});

		try {
			const res = await client.getCongestion.$get({ query: { location: "rpc_test" } });
			expect(res.status).toBe(200);
			if (res.status !== 200) return;

			const json = await res.json();
			const data: CongestionStatus = json.data;
			expect(data).toMatchObject({ location: "rpc_test", uniqueDeviceCount: 7, level: null });
		} finally {
			await congestionDoc.delete();
		}
	});

	test("/getCongestionのデータが無ければ、404のレスポンスの型になる", async () => {
		const res = await client.getCongestion.$get({ query: { location: "rpc_test_none" } });
		expect(res.status).toBe(404);
		if (res.status !== 404) return;

		const json: ErrorResponse = await res.json();
		expect(json.status).toBe("error");
	});

	test("/getCongestionHistoryに、limitを渡せる", async () => {
		const res = await client.getCongestionHistory.$get({ query: { location: "rpc_test_none", limit: "10" } });
		expect(res.status).toBe(404);
	});

	test("/signage/assetsは、APIキーが無ければ401", async () => {
		const res = await client.signage.assets.$get();
		expect(res.status).toBe(401);
	});

	test("/pr-assets/mineは、アクセストークンが無ければ401のレスポンスの型になる", async () => {
		const res = await appClient["pr-assets"].mine.$get();
		expect(res.status).toBe(401);
		if (res.status !== 401) return;

		const json: ErrorResponse = await res.json();
		expect(json.status).toBe("error");
	});

	test("/pr-assets/mineの200のレスポンスに、型が付く", async () => {
		const res = await appClient["pr-assets"].mine.$get(undefined, { headers: { Authorization: `Bearer ${token}` } });
		expect(res.status).toBe(200);
		if (res.status !== 200) return;

		const json = await res.json();
		const assets: MyPrAssetDto[] = json.assets;
		expect(assets).toEqual([]);
	});

	test("/pr-assets/{id}/withdrawは、アクセストークンが無ければ401", async () => {
		const res = await appClient["pr-assets"][":id"].withdraw.$post({ param: { id: "rpc_test" } });
		expect(res.status).toBe(401);
	});

	test("定義と合わない呼び方は、型エラーになる", () => {
		//型を確かめるだけで、実行はしない
		const neverCalled = () => {
			// @ts-expect-error locationは必須
			client.getCongestion.$get({ query: {} });
			// @ts-expect-error 内部用のルートは、クライアントに無い
			client.aggregate.$post();
			// @ts-expect-error esp32から呼ぶルートは、クライアントに無い
			client.receiveSensorData.$post();
			// @ts-expect-error idは必須
			appClient["pr-assets"][":id"].withdraw.$post({});
			// @ts-expect-error 投稿には画像が要る
			appClient["pr-assets"].$post({ form: { tag: "お知らせ", title: "t", publishFrom: "2026-11-06", consentVersion: "2026-10-draft" } });
		};
		expect(neverCalled).toBeDefined();
	});
});
