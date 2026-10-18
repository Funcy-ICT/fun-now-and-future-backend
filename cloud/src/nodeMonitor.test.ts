import { Timestamp } from "firebase-admin/firestore";
import { recordLastSeen } from "./services/node_monitor";
import { getNodeLastSeen, saveNodeLastSeen } from "./repositories/firestore";
import { NodeLastSeen } from "./schema/node_last_seen";
import { db } from "./lib/firebase";

const t = (hhmm: string) => Timestamp.fromDate(new Date(`2019-12-31T${hhmm}:00.000Z`));

describe("recordLastSeen", () => {
	test("初めてのノードは、動いている状態で足す", () => {
		const next = recordLastSeen({ nodes: {} }, [{ nodeId: "a", location: "cafeteria" }], t("10:00"));
		expect(next.nodes.a).toEqual({ location: "cafeteria", lastSeenAt: t("10:00"), state: "up", stateChangedAt: t("10:00") });
	});

	test("知っているノードは、最終受信時刻とlocationだけを更新し、状態は変えない", () => {
		const current: NodeLastSeen = {
			nodes: { a: { location: "cafeteria", lastSeenAt: t("09:00"), state: "down", stateChangedAt: t("09:10") } },
		};
		const next = recordLastSeen(current, [{ nodeId: "a", location: "bus_stop" }], t("10:00"));
		expect(next.nodes.a).toEqual({ location: "bus_stop", lastSeenAt: t("10:00"), state: "down", stateChangedAt: t("09:10") });
	});

	test("送ってこなかったノードはそのまま残す", () => {
		const current: NodeLastSeen = {
			nodes: { b: { location: "cafeteria", lastSeenAt: t("09:00"), state: "up", stateChangedAt: t("08:00") } },
		};
		const next = recordLastSeen(current, [{ nodeId: "a", location: "cafeteria" }], t("10:00"));
		expect(next.nodes.b).toEqual(current.nodes.b);
	});

	test("古い窓では、最終受信時刻を戻さない", () => {
		const current: NodeLastSeen = {
			nodes: { a: { location: "cafeteria", lastSeenAt: t("10:00"), state: "up", stateChangedAt: t("08:00") } },
		};
		expect(recordLastSeen(current, [{ nodeId: "a", location: "cafeteria" }], t("09:00"))).toEqual(current);
	});
});

describe("getNodeLastSeen, saveNodeLastSeen", () => {
	const ref = db.collection("status").doc("node_last_seen");
	beforeEach(async () => ref.delete());
	afterAll(async () => ref.delete());

	test("無ければ空を返す", async () => {
		expect(await getNodeLastSeen()).toEqual({ nodes: {} });
	});

	test("保存したものが読める", async () => {
		const lastSeen = recordLastSeen({ nodes: {} }, [{ nodeId: "a", location: "cafeteria" }], t("10:00"));
		await saveNodeLastSeen(lastSeen);
		expect(await getNodeLastSeen()).toEqual(lastSeen);
	});

	test("検証に通らなければ空として扱う", async () => {
		await ref.set({ nodes: { a: { location: "cafeteria", state: "unknown" } } });
		expect(await getNodeLastSeen()).toEqual({ nodes: {} });
	});
});
