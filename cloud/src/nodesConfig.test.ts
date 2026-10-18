import { getNodes, saveNodesConfig } from "./services/nodes_config";
import { NodesConfigInputSchema } from "./schema/nodes_config";
import { ConfigVersionConflictError } from "./schema/config_meta";
import { db } from "./lib/firebase";

const clear = async () => {
	await db.collection("config").doc("nodes").delete();
	const history = await db.collection("config_history").get();
	await Promise.all(history.docs.map((doc) => doc.ref.delete()));
};

describe("NodesConfigInputSchema", () => {
	test("表示名と撤去済みの印を受け付ける", () => {
		const input = { nodes: { esp32_01: { displayName: "食堂の入口", retired: false }, esp32_02: {} } };
		expect(NodesConfigInputSchema.parse(input)).toEqual(input);
	});

	test("知らない項目は弾く", () => {
		expect(NodesConfigInputSchema.safeParse({ nodes: { esp32_01: { retierd: true } } }).success).toBe(false);
		expect(NodesConfigInputSchema.safeParse({ nodes: {}, extra: 1 }).success).toBe(false);
	});

	test("空の表示名と、41文字以上の表示名は弾く", () => {
		expect(NodesConfigInputSchema.safeParse({ nodes: { esp32_01: { displayName: "" } } }).success).toBe(false);
		expect(NodesConfigInputSchema.safeParse({ nodes: { esp32_01: { displayName: "あ".repeat(41) } } }).success).toBe(false);
	});
});

describe("saveNodesConfig, getNodes", () => {
	beforeEach(clear);
	afterAll(clear);

	test("設定が無ければ、空でversion 0を返す", async () => {
		expect(await getNodes()).toEqual({ value: { nodes: {} }, version: 0, updatedAt: null, updatedBy: null });
	});

	test("保存すると、値とversion, 保存した人が読める", async () => {
		const version = await saveNodesConfig({ nodes: { esp32_01: { retired: true } } }, 0, "someone@example.com");
		expect(version).toBe(1);

		const nodes = await getNodes();
		expect(nodes).toMatchObject({ value: { nodes: { esp32_01: { retired: true } } }, version: 1, updatedBy: "someone@example.com" });
		expect(nodes.updatedAt).not.toBeNull();
	});

	test("読んだあとに別の保存が入っていれば、保存しない", async () => {
		await saveNodesConfig({ nodes: {} }, 0, null);
		await expect(saveNodesConfig({ nodes: { esp32_01: {} } }, 0, null)).rejects.toBeInstanceOf(ConfigVersionConflictError);
		expect((await getNodes()).value).toEqual({ nodes: {} });
	});

	test("保存された値が検証に通らなければ、空として扱い、versionはそのまま返す", async () => {
		await db.collection("config").doc("nodes").set({ nodes: { esp32_01: { retired: "yes" } }, version: 3 });
		const nodes = await getNodes();
		expect(nodes.value).toEqual({ nodes: {} });
		expect(nodes.version).toBe(3);
	});
});
