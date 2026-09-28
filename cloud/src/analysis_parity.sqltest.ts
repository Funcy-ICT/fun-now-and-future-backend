import { writeFileSync, mkdtempSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { getBigQuery, getScanEventsTableId } from "./lib/bigquery";
import { countDevicesByWindow, WindowResult } from "./services/analysis";
import { jstWeekday, runPipeline } from "./services/scan_service";
import { StageConfig } from "./schema/filter_pipeline";
import { toParsedDevice } from "./services/scan_event";
import { ScanEventDevice } from "./schema/scan_event";

// 同じテストデータを、TSの集計(runPipeline)とSQL(buildAnalysisQuery)の両方に通し、各段の台数が一致するかを確かめる。
// 本物のBigQueryが要る。実行するには、gcpの認証(gcloud auth application-default login)をしたうえで、
// 環境変数BQ_DATASETにテスト用のデータセット(名前が_testで終わるもの)を指定する。テーブルscan_eventsは作り直される。
// 例: GCLOUD_PROJECT=fun-now-and-future BQ_DATASET=fnaf_analytics_test npm run test:sql

const WINDOW_MS = 5 * 60 * 1000;
const START = Date.UTC(2026, 8, 20, 3, 0, 0); // 日本時間の12:00
const END = START + 3 * WINDOW_MS;

type Row = {
	sendId: string | null;
	nodeId: string;
	location: string;
	receivedAt: string;
	hashKeyVersion: string;
	message_id: string;
	devices: ScanEventDevice[];
};

// 再現できるよう、種を固定した乱数を使う
const random = (() => {
	let seed = 20260920;
	return () => {
		seed = (seed * 1103515245 + 12345) % 2 ** 31;
		return seed / 2 ** 31;
	};
})();
const randomInt = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));

// companyIdとisNearbyInfoはmacごとに決める。同じmacのrssiが同じでも、残る行によって結果が変わらないようにするため
const device = (location: string, n: number): ScanEventDevice => {
	const kind = n % 4;
	return {
		macHash: `${location}-${n}`.padEnd(64, "0"),
		rssi: randomInt(-110, -30),
		format: kind === 3 ? "parsed" : "raw",
		rawData: kind === 3 ? null : "02011a",
		companyId: kind === 2 ? "00E0" : kind === 3 ? null : "004C",
		isNearbyInfo: kind === 0 ? true : kind === 3 ? null : false,
		addressType: null,
	};
};

const buildRows = (): Row[] => {
	const rows: Row[] = [];
	let messageNo = 0;

	for (let w = 0; w < 3; w++) {
		const locations = w === 1 ? ["loc-a", "loc-b", "loc-c"] : ["loc-a", "loc-b"]; // loc-cは窓1だけ
		for (const location of locations) {
			for (const node of ["n1", "n2"]) {
				for (let k = 0; k < 2; k++) {
					messageNo += 1;
					const count = location === "loc-c" ? 0 : randomInt(0, 6); // loc-cは検出0件のメッセージだけ
					rows.push({
						sendId: messageNo % 3 === 0 ? null : `send-${messageNo}`,
						nodeId: `${location}-${node}`,
						location,
						receivedAt: new Date(START + w * WINDOW_MS + randomInt(0, WINDOW_MS - 1)).toISOString(),
						hashKeyVersion: "v1",
						message_id: `m-${messageNo}`,
						// 同じ端末を、同じlocationの2つのノードが拾うよう、macは8台から選ぶ
						devices: Array.from({ length: count }, () => device(location, randomInt(0, 7))),
					});
				}
			}
		}
	}

	// esp32の再送(sendIdが同じで、message_idが違う)と、pub/subの再配信(message_idが同じ)を混ぜる
	const withSendId = rows.find(r => r.sendId !== null && r.devices.length > 0)!;
	const withoutSendId = rows.find(r => r.sendId === null && r.devices.length > 0)!;
	rows.push({ ...withSendId, message_id: `${withSendId.message_id}-resend` });
	rows.push({ ...withoutSendId });
	return rows;
};

// TSの集計と同じ手順で、期待する結果を作る。pending_scansのドキュメントIDと同じ考え方で重複をまとめる
const expectedResults = (rows: Row[], stages: StageConfig[]): WindowResult[] => {
	const seen = new Set<string>();
	const groups = new Map<string, { windowStart: number; location: string; devices: ScanEventDevice[] }>();

	for (const row of [...rows].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))) {
		const key = row.sendId !== null ? `${row.nodeId}/${row.sendId}` : row.message_id;
		if (seen.has(key)) continue;
		seen.add(key);

		const windowStart = Math.floor(Date.parse(row.receivedAt) / WINDOW_MS) * WINDOW_MS;
		const groupKey = `${windowStart}__${row.location}`;
		const group = groups.get(groupKey) ?? { windowStart, location: row.location, devices: [] };
		group.devices.push(...row.devices);
		groups.set(groupKey, group);
	}

	return [...groups.values()].map(group => {
		const { result, trace } = runPipeline(group.devices.map(toParsedDevice), stages);
		return {
			windowStart: new Date(group.windowStart).toISOString(),
			location: group.location,
			weekday: jstWeekday(group.windowStart),
			uniqueDeviceCount: result.length,
			stageTrace: trace,
		};
	});
};

const sortResults = (results: WindowResult[]) =>
	[...results].sort((a, b) => `${a.windowStart}${a.location}`.localeCompare(`${b.windowStart}${b.location}`));

const STAGE_PATTERNS: Record<string, StageConfig[]> = {
	"既定の設定": [
		{ name: "dedupe" },
		{ name: "companyFilter", allowedCompanyIds: ["004C"], requireNearbyInfo: true },
		{ name: "rssiFilter", rssiThreshold: -100 },
	],
	"companyFilterを先に": [
		{ name: "companyFilter", allowedCompanyIds: ["004C"], requireNearbyInfo: false },
		{ name: "dedupe" },
		{ name: "rssiFilter", rssiThreshold: -70 },
	],
	"rssiFilterを先に": [
		{ name: "rssiFilter", rssiThreshold: -70 },
		{ name: "dedupe" },
	],
	"companyIdがnullの端末も許可": [
		{ name: "dedupe" },
		{ name: "companyFilter", allowedCompanyIds: ["004C", ""], requireNearbyInfo: false },
	],
	"段なし": [],
};

describe("テストデータ", () => {
	test("重複、検出0件、窓によって無いlocationを含む", () => {
		const rows = buildRows();
		const keys = rows.map(r => r.sendId !== null ? `${r.nodeId}/${r.sendId}` : r.message_id);
		expect(new Set(keys).size).toBe(rows.length - 2);
		expect(rows.some(r => r.devices.length === 0)).toBe(true);
		expect(rows.filter(r => r.location === "loc-c").every(r => r.devices.length === 0)).toBe(true);

		const results = expectedResults(rows, STAGE_PATTERNS["既定の設定"]);
		expect(results.filter(r => r.location === "loc-c")).toHaveLength(1);
		expect(results.find(r => r.location === "loc-c")?.uniqueDeviceCount).toBe(0);
	});
});

const dataset = process.env.BQ_DATASET;
const canRun = dataset !== undefined && dataset.endsWith("_test");
const describeWithBigQuery = canRun ? describe : describe.skip;

describeWithBigQuery("TSの集計とSQLの突き合わせ", () => {
	jest.setTimeout(180_000);
	const rows = buildRows();

	beforeAll(async () => {
		const [, datasetId, tableName] = getScanEventsTableId().split(".");
		const table = getBigQuery().dataset(datasetId).table(tableName);
		await table.delete({ ignoreNotFound: true });

		const file = join(mkdtempSync(join(tmpdir(), "fnaf-parity-")), "rows.ndjson");
		writeFileSync(file, rows.map(r => JSON.stringify(r)).join("\n"));
		const fields = JSON.parse(readFileSync(join(__dirname, "../bigquery/scan_events.schema.json"), "utf-8"));

		// ロードジョブなら、作ったばかりのテーブルにもすぐ書ける
		await table.load(file, {
			sourceFormat: "NEWLINE_DELIMITED_JSON",
			schema: { fields },
			timePartitioning: { type: "DAY", field: "receivedAt" },
			writeDisposition: "WRITE_TRUNCATE",
		});
	});

	for (const [name, stages] of Object.entries(STAGE_PATTERNS)) {
		test(`${name}で、窓とlocationごとの台数と各段の通過数が一致する`, async () => {
			const actual = await countDevicesByWindow({ stages, start: new Date(START), end: new Date(END) });
			expect(sortResults(actual)).toEqual(sortResults(expectedResults(rows, stages)));
		});
	}

	test("locationsを指定すると、そのlocationだけを返す", async () => {
		const actual = await countDevicesByWindow({
			stages: STAGE_PATTERNS["既定の設定"], start: new Date(START), end: new Date(END), locations: ["loc-b"],
		});
		expect(actual.length).toBeGreaterThan(0);
		expect(actual.every(r => r.location === "loc-b")).toBe(true);
	});
});
