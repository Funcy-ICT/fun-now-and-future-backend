import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { hc } from "hono/client";
import { createApp, AppType } from "./app";
import { jstWeekday } from "./services/scan_service";
import { CongestionStatus } from "./schema/api/signage";
import { ErrorResponse, HealthResponse } from "./schema/api/common";

//管理画面と同じくhc<AppType>で呼ぶ。サーバーは立てず、app.requestに渡す。
//型が合わなければ、ts-jestの型チェックでテストが落ちる
const app = createApp("ingest");
const client = hc<AppType>("http://localhost", {
	fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(app.request(input, init)),
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

	test("定義と合わない呼び方は、型エラーになる", () => {
		//型を確かめるだけで、実行はしない
		const neverCalled = () => {
			// @ts-expect-error locationは必須
			client.getCongestion.$get({ query: {} });
			// @ts-expect-error 内部用のルートは、クライアントに無い
			client.aggregate.$post();
			// @ts-expect-error esp32から呼ぶルートは、クライアントに無い
			client.receiveSensorData.$post();
		};
		expect(neverCalled).toBeDefined();
	});
});
