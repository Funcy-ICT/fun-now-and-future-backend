import { Timestamp } from "firebase-admin/firestore";
import { judgeNodes, logNodeTransition, monitorNodes, recordLastSeen } from "./services/node_monitor";
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

// 日本時間の時刻。稼働時間帯の既定は7時から22時
const jst = (date: string, hhmm: string) => Timestamp.fromDate(new Date(`${date}T${hhmm}:00.000+09:00`));
const DEFAULT_HOURS = () => ({ startHour: 7, endHour: 22 });

const entry = (lastSeenAt: Timestamp, state: "up" | "down" = "up") => ({
	location: "cafeteria", lastSeenAt, state, stateChangedAt: lastSeenAt,
});

const judge = (lastSeen: NodeLastSeen, windowStart: Timestamp, options: Partial<{ seen: string[]; retired: string[] }> = {}) =>
	judgeNodes({
		lastSeen,
		seenNodeIds: new Set(options.seen ?? []),
		windowStart,
		retiredNodeIds: new Set(options.retired ?? []),
		operatingHours: DEFAULT_HOURS,
	});

describe("judgeNodes", () => {
	test("稼働時間帯の中で、受信が10分続けて無ければ停止にする", () => {
		const { lastSeen, transitions } = judge({ nodes: { a: entry(jst("2020-01-06", "09:50")) } }, jst("2020-01-06", "10:00"));
		expect(transitions).toEqual([{ event: "node_down", nodeId: "a", location: "cafeteria", lastSeenAt: jst("2020-01-06", "09:50") }]);
		expect(lastSeen.nodes.a).toMatchObject({ state: "down", stateChangedAt: jst("2020-01-06", "10:00") });
	});

	test("受信が無いのが1窓だけなら、停止にしない", () => {
		const { transitions } = judge({ nodes: { a: entry(jst("2020-01-06", "09:55")) } }, jst("2020-01-06", "10:00"));
		expect(transitions).toEqual([]);
	});

	test("稼働時間帯の外では、停止にしない", () => {
		const { transitions } = judge({ nodes: { a: entry(jst("2020-01-06", "21:00")) } }, jst("2020-01-06", "23:00"));
		expect(transitions).toEqual([]);
	});

	test("稼働時間帯の最初の窓では停止にせず、2つ目の窓で停止にする", () => {
		const night = { nodes: { a: entry(jst("2020-01-05", "21:55")) } };
		expect(judge(night, jst("2020-01-06", "07:00")).transitions).toEqual([]);
		expect(judge(night, jst("2020-01-06", "07:05")).transitions.map(t => t.event)).toEqual(["node_down"]);
	});

	test("止まっているノードから受信があれば、復旧にする", () => {
		const { lastSeen, transitions } = judge(
			{ nodes: { a: entry(jst("2020-01-06", "10:30"), "down") } }, jst("2020-01-06", "10:30"), { seen: ["a"] },
		);
		expect(transitions.map(t => t.event)).toEqual(["node_recovered"]);
		expect(lastSeen.nodes.a).toMatchObject({ state: "up", stateChangedAt: jst("2020-01-06", "10:30") });
	});

	test("止まったままのノードは、もう一度停止にしない", () => {
		const { transitions } = judge({ nodes: { a: entry(jst("2020-01-06", "09:00"), "down") } }, jst("2020-01-06", "10:00"));
		expect(transitions).toEqual([]);
	});

	test("撤去済みのノードは判定しない", () => {
		const current = { nodes: { a: entry(jst("2020-01-06", "09:00")) } };
		const { lastSeen, transitions } = judge(current, jst("2020-01-06", "10:00"), { retired: ["a"] });
		expect(transitions).toEqual([]);
		expect(lastSeen).toEqual(current);
	});

	test("稼働時間帯はlocationごとに使う", () => {
		const { transitions } = judgeNodes({
			lastSeen: {
				nodes: {
					a: { ...entry(jst("2020-01-06", "07:00")), location: "cafeteria" },
					b: { ...entry(jst("2020-01-06", "07:00")), location: "bus_stop" },
				},
			},
			seenNodeIds: new Set(),
			windowStart: jst("2020-01-06", "08:00"),
			retiredNodeIds: new Set(),
			operatingHours: (location) => (location === "cafeteria" ? { startHour: 9, endHour: 18 } : { startHour: 7, endHour: 22 }),
		});
		expect(transitions.map(t => t.nodeId)).toEqual(["b"]);
	});
});

describe("logNodeTransition", () => {
	test("停止はERROR、復旧はNOTICEの、1行のJSONで出す", () => {
		const error = jest.spyOn(console, "error").mockImplementation(() => {});
		const info = jest.spyOn(console, "info").mockImplementation(() => {});

		logNodeTransition({ event: "node_down", nodeId: "a", location: "cafeteria", lastSeenAt: jst("2020-01-06", "09:50") });
		logNodeTransition({ event: "node_recovered", nodeId: "a", location: "cafeteria", lastSeenAt: jst("2020-01-06", "10:30") });

		expect(JSON.parse(error.mock.calls[0][0])).toEqual({
			severity: "ERROR", message: "node down", event: "node_down", nodeId: "a", location: "cafeteria",
			lastSeenAt: "2020-01-06T00:50:00.000Z",
		});
		expect(JSON.parse(info.mock.calls[0][0])).toMatchObject({ severity: "NOTICE", event: "node_recovered" });
		error.mockRestore();
		info.mockRestore();
	});
});

describe("monitorNodes", () => {
	const lastSeenRef = db.collection("status").doc("node_last_seen");
	const clear = async () => {
		await Promise.all([
			lastSeenRef.delete(),
			db.collection("config").doc("nodes").delete(),
			db.collection("config").doc("baseline").delete(),
		]);
	};
	beforeEach(clear);
	afterAll(clear);

	test("止まったノードを停止にして保存し、ログを出す", async () => {
		await saveNodeLastSeen({ nodes: { a: entry(jst("2020-01-06", "09:50")) } });
		const error = jest.spyOn(console, "error").mockImplementation(() => {});

		await monitorNodes([], jst("2020-01-06", "10:00"));

		expect(error).toHaveBeenCalledTimes(1);
		expect(JSON.parse(error.mock.calls[0][0])).toMatchObject({ event: "node_down", nodeId: "a" });
		expect((await getNodeLastSeen()).nodes.a.state).toBe("down");
		error.mockRestore();
	});

	test("config/nodesで撤去済みにしたノードは、ログを出さない", async () => {
		await saveNodeLastSeen({ nodes: { a: entry(jst("2020-01-06", "09:50")) } });
		await db.collection("config").doc("nodes").set({ nodes: { a: { retired: true } } });
		const error = jest.spyOn(console, "error").mockImplementation(() => {});

		await monitorNodes([], jst("2020-01-06", "10:00"));

		expect(error).not.toHaveBeenCalled();
		error.mockRestore();
	});

	test("config/baselineのlocationの稼働時間帯を使う", async () => {
		await saveNodeLastSeen({ nodes: { a: entry(jst("2020-01-06", "07:00")) } });
		await db.collection("config").doc("baseline").set({ locations: { cafeteria: { operatingStartHour: 9 } } });
		const error = jest.spyOn(console, "error").mockImplementation(() => {});

		await monitorNodes([], jst("2020-01-06", "08:00"));

		expect(error).not.toHaveBeenCalled();
		error.mockRestore();
	});

	test("知っているノードも受信も無ければ、何も書かない", async () => {
		await monitorNodes([], jst("2020-01-06", "10:00"));
		expect((await lastSeenRef.get()).exists).toBe(false);
	});
});
