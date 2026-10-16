import { updateConfigWithHistory } from "./repositories/firestore";
import { ConfigHistorySchema, ConfigVersionConflictError } from "./schema/config_meta";
import { db } from "./lib/firebase";

// どの設定名でも処理は同じなので、/aggregateが読まないnodesで確かめる
const NAME = "nodes";
const configRef = () => db.collection("config").doc(NAME);
const historyRef = (version: number) => db.collection("config_history").doc(`${NAME}__${version}`);

const clear = async () => {
	await configRef().delete();
	const history = await db.collection("config_history").get();
	await Promise.all(history.docs.map((doc) => doc.ref.delete()));
};

describe("updateConfigWithHistory", () => {
	beforeEach(clear);
	afterAll(clear);

	test("ドキュメントが無ければversion 0として扱い、値と履歴を書く", async () => {
		const version = await updateConfigWithHistory(NAME, 0, () => ({ nodes: { a: { retired: true } } }), "someone@example.com");
		expect(version).toBe(1);

		const config = (await configRef().get()).data();
		expect(config).toMatchObject({ nodes: { a: { retired: true } }, version: 1, updatedBy: "someone@example.com" });

		const history = ConfigHistorySchema.parse((await historyRef(1).get()).data());
		expect(history).toMatchObject({
			name: NAME,
			version: 1,
			before: null,
			after: { nodes: { a: { retired: true } } },
			updatedBy: "someone@example.com",
		});
		expect(history.configHash).toBeUndefined();
	});

	test("2回目の保存では、前の値を履歴のbeforeに残す。versionなどはbeforeとafterに含めない", async () => {
		await updateConfigWithHistory(NAME, 0, () => ({ nodes: { a: {} } }), null);
		const version = await updateConfigWithHistory(NAME, 1, () => ({ nodes: { a: { retired: true } } }), null);
		expect(version).toBe(2);

		const history = ConfigHistorySchema.parse((await historyRef(2).get()).data());
		expect(history.before).toEqual({ nodes: { a: {} } });
		expect(history.after).toEqual({ nodes: { a: { retired: true } } });
	});

	test("versionが食い違えば、何も書かずに、今のversionを持つ例外を投げる", async () => {
		await updateConfigWithHistory(NAME, 0, () => ({ nodes: { a: {} } }), null);

		const result = updateConfigWithHistory(NAME, 0, () => ({ nodes: { b: {} } }), null);
		await expect(result).rejects.toBeInstanceOf(ConfigVersionConflictError);
		await expect(result).rejects.toMatchObject({ currentVersion: 1 });

		expect((await configRef().get()).data()).toMatchObject({ nodes: { a: {} }, version: 1 });
		expect((await historyRef(2).get()).exists).toBe(false);
	});

	test("versionの無いドキュメント(コンソールで作ったもの)は0として扱い、その値をbeforeに残す", async () => {
		await configRef().set({ nodes: { a: { displayName: "食堂" } } });

		const version = await updateConfigWithHistory(NAME, 0, () => ({ nodes: {} }), null);
		expect(version).toBe(1);

		const history = ConfigHistorySchema.parse((await historyRef(1).get()).data());
		expect(history.before).toEqual({ nodes: { a: { displayName: "食堂" } } });
	});

	test("buildには今のドキュメントを渡す。buildが返した値に古いversionが残っていても、新しいversionで書く", async () => {
		await configRef().set({ nodes: {}, keep: true, version: 1 });

		await updateConfigWithHistory(NAME, 1, (current) => ({ ...current, nodes: { a: {} } }), null);

		const config = (await configRef().get()).data();
		expect(config).toMatchObject({ nodes: { a: {} }, keep: true, version: 2 });
		const history = ConfigHistorySchema.parse((await historyRef(2).get()).data());
		expect(history.after).toEqual({ nodes: { a: {} }, keep: true });
	});

	test("同じIDの履歴が既にあれば、設定も書かない", async () => {
		await historyRef(1).set({ name: NAME, version: 1 });

		await expect(updateConfigWithHistory(NAME, 0, () => ({ nodes: {} }), null)).rejects.toThrow();
		expect((await configRef().get()).exists).toBe(false);
	});

	test("configHashを渡すと、履歴に残す", async () => {
		await updateConfigWithHistory(NAME, 0, () => ({ nodes: {} }), null, "3f2a");

		const history = ConfigHistorySchema.parse((await historyRef(1).get()).data());
		expect(history.configHash).toBe("3f2a");
	});
});
