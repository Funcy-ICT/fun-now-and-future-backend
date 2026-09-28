import { createApp } from "./app";
import { ErrorResponseSchema } from "./schema/api/common";

const getDoc = async (role: "all" | "ingest" | "worker") => {
	const res = await createApp(role).request("/doc");
	return { status: res.status, doc: res.status === 200 ? await res.json() : null };
};

describe("swagger", () => {
	test("公開するルートだけが、/docに載る", async () => {
		const { status, doc } = await getDoc("ingest");
		expect(status).toBe(200);
		expect(Object.keys(doc.paths).sort()).toEqual([
			"/getCongestion",
			"/getCongestionHistory",
			"/health",
			"/receiveSensorData",
			"/signage/assets",
		]);
	});

	test("内部用のルートは、/docに載らない", async () => {
		const { doc } = await getDoc("all");
		for (const path of ["/aggregate", "/pubsub/scan-events", "/internal/batch/calc-max-device"]) {
			expect(doc.paths[path]).toBeUndefined();
		}
	});

	test("workerには、/docも/uiも無い", async () => {
		expect((await getDoc("worker")).status).toBe(404);
		expect((await createApp("worker").request("/ui")).status).toBe(404);
	});

	test("/uiはswagger uiのHTMLを返す", async () => {
		const res = await createApp("ingest").request("/ui");
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/html");
	});

	test("APIキーが要るルートに、認証の方式が付いている", async () => {
		const { doc } = await getDoc("ingest");
		expect(doc.components.securitySchemes.ApiKeyAuth).toEqual({ type: "apiKey", in: "header", name: "x-api-key" });
		expect(doc.paths["/signage/assets"].get.security).toEqual([{ ApiKeyAuth: [] }]);
		expect(doc.paths["/receiveSensorData"].post.security).toEqual([{ ApiKeyAuth: [] }]);
	});
});

describe("説明", () => {
	//READMEから移した説明。消えると、/uiを見ても意味が分からなくなる
	test("ルートに、処理の流れの説明がある", async () => {
		const { doc } = await getDoc("ingest");
		expect(doc.paths["/receiveSensorData"].post.description).toContain("同じsendIdで再送");
		expect(doc.paths["/signage/assets"].get.description).toContain("掲載期間内");
	});

	test("levelとstaleに、nullのときの読み方の説明がある", async () => {
		const { doc } = await getDoc("ingest");
		const status = doc.components.schemas.CongestionStatus.properties;
		expect(status.level.description).toContain("staleで区別する");
		expect(status.stale.description).toContain("15分");
	});

	test("リクエストのボディに、例が付いている", async () => {
		const { doc } = await getDoc("ingest");
		const body = doc.paths["/receiveSensorData"].post.requestBody.content["application/json"].schema;
		expect(body.properties.nodeId.example).toBe("esp32_cafeteria_01");
	});
});

describe("クエリの検証", () => {
	test("locationが無ければ、これまでと同じ形の400を返す", async () => {
		const res = await createApp("ingest").request("/getCongestion");
		expect(res.status).toBe(400);
		expect(ErrorResponseSchema.safeParse(await res.json()).success).toBe(true);
	});

	test("limitが上限を超えていれば、400を返す", async () => {
		const res = await createApp("ingest").request("/getCongestionHistory?location=cafeteria&limit=51");
		expect(res.status).toBe(400);
		expect(ErrorResponseSchema.safeParse(await res.json()).success).toBe(true);
	});
});
