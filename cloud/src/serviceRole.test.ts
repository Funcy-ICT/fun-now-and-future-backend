import { createApp, getServiceRole } from "./app";

const status = async (role: "ingest" | "worker" | "app" | "all", method: string, path: string) => {
	const res = await createApp(role).request(path, { method });
	return res.status;
};

describe("createApp", () => {
	test("ingestは受信とサイネージのルートを持ち、/aggregateとプッシュの受け口を持たない", async () => {
		expect(await status("ingest", "POST", "/receiveSensorData")).not.toBe(404);
		expect(await status("ingest", "GET", "/getCongestion")).not.toBe(404);
		expect(await status("ingest", "POST", "/aggregate")).toBe(404);
		expect(await status("ingest", "POST", "/pubsub/scan-events")).toBe(404);
	});

	test("workerは/aggregateとプッシュの受け口を持ち、受信とサイネージのルートを持たない", async () => {
		expect(await status("worker", "POST", "/pubsub/scan-events")).not.toBe(404);
		expect(await status("worker", "POST", "/receiveSensorData")).toBe(404);
		expect(await status("worker", "GET", "/getCongestion")).toBe(404);
	});

	test("appは受信とサイネージのルートも、/aggregateとプッシュの受け口も持たない", async () => {
		expect(await status("app", "POST", "/receiveSensorData")).toBe(404);
		expect(await status("app", "GET", "/getCongestion")).toBe(404);
		expect(await status("app", "GET", "/signage/assets")).toBe(404);
		expect(await status("app", "POST", "/aggregate")).toBe(404);
		expect(await status("app", "POST", "/pubsub/scan-events")).toBe(404);
		expect(await status("app", "POST", "/internal/batch/calc-max-device")).toBe(404);
	});

	test("allは全部のルートを持つ", async () => {
		expect(await status("all", "POST", "/receiveSensorData")).not.toBe(404);
		expect(await status("all", "POST", "/pubsub/scan-events")).not.toBe(404);
	});

	test("どのroleでも/healthは返す", async () => {
		expect(await status("ingest", "GET", "/health")).toBe(200);
		expect(await status("worker", "GET", "/health")).toBe(200);
		expect(await status("app", "GET", "/health")).toBe(200);
	});
});

describe("getServiceRole", () => {
	const original = process.env.SERVICE_ROLE;

	afterEach(() => {
		if (original === undefined) {
			delete process.env.SERVICE_ROLE;
		} else {
			process.env.SERVICE_ROLE = original;
		}
	});

	test("未設定ならall", () => {
		delete process.env.SERVICE_ROLE;
		expect(getServiceRole()).toBe("all");
	});

	test("ingest, worker, appはそのまま返す", () => {
		process.env.SERVICE_ROLE = "ingest";
		expect(getServiceRole()).toBe("ingest");
		process.env.SERVICE_ROLE = "worker";
		expect(getServiceRole()).toBe("worker");
		process.env.SERVICE_ROLE = "app";
		expect(getServiceRole()).toBe("app");
	});

	test("知らない値なら例外を投げる", () => {
		process.env.SERVICE_ROLE = "wroker";
		expect(() => getServiceRole()).toThrow("Unknown SERVICE_ROLE: wroker");
	});
});
