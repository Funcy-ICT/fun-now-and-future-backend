import { db } from "../lib/firebase";
import { z } from "zod";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { ScanEvent } from "../schema/scan_event";
import { FilterPipelineConfig, FilterPipelineConfigSchema } from "../schema/filter_pipeline";
import { RetentionConfig, RetentionConfigSchema, RetentionInput } from "../schema/retention";
import { BaselineConfig, BaselineConfigSchema } from "../schema/baseline_settings";
import { DailySummary, DailySummaryInput, DailySummarySchema } from "../schema/daily_summary";
import { ExcludedDayInput } from "../schema/excluded_day";
import { CongestionRecord, CongestionRecordInput, CongestionRecordSchema } from "../schema/congestion_record";
import { MaxDeviceSchema, MaxDeviceData, MaxDeviceInput } from "../schema/max_device";
import { NodeStatusSchema, NodeStatusData } from "../schema/node_status";
import { PrAssetSchema, PrAsset } from "../schema/pr_asset";
import { ScanDiagnosticsSchema, ScanDiagnostics } from "../schema/scan_diagnostics";
import { PendingScanEventSchema, PendingScanEvent } from "../schema/pending_scan_event";

// Firestoreのドキュメント名に使えない文字(/ 等)がlocationに紛れても壊れないようにするための最低限の変換
const sanitizeForDocId = (value: string): string => value.replace(/[^a-zA-Z0-9_-]/g, "_");


// pending_scansへの保存は、pub/subのプッシュを受ける処理側(controllers/pubsub_push.ts)が行う。

// 同じメッセージが2回届いても、同じドキュメントに上書きされて二重に数えないよう、IDをメッセージから決める。
// sendIdがあればnodeIdと組にする。無ければpub/subのmessageIdを使う(esp32の再送は防げないが、pub/subの再配信は防げる)。
export const pendingScanDocId = (event: ScanEvent, messageId: string): string =>
  event.sendId !== null
    ? `${sanitizeForDocId(event.nodeId)}__${sanitizeForDocId(event.sendId)}`
    : `msg__${sanitizeForDocId(messageId)}`;

export const savePendingScanEvent = async (event: ScanEvent, messageId: string): Promise<void> => {
  const { receivedAt, ...rest } = event;
  await db.collection("pending_scans").doc(pendingScanDocId(event, messageId)).set({
    ...rest,
    received_at: Timestamp.fromDate(new Date(receivedAt)),
  });
};

// 窓の範囲[windowStart, windowEnd)に受信したメッセージだけを読む。読んだドキュメントのIDも返し、削除に使う。
// 検証に失敗したドキュメントは集計に使わないが、窓の中にあるのでIDには含める。
export const getPendingScanEventsInWindow = async (
  windowStart: Timestamp,
  windowEnd: Timestamp,
): Promise<{ ids: string[]; scans: PendingScanEvent[] }> => {
  const snapshot = await db.collection("pending_scans")
    .where("received_at", ">=", windowStart)
    .where("received_at", "<", windowEnd)
    .get();

  const scans: PendingScanEvent[] = [];
  for (const doc of snapshot.docs) {
    const parsed = PendingScanEventSchema.safeParse(doc.data());
    if (!parsed.success) {
      console.error(`Invalid data in pending_scans document ${doc.id}:`, parsed.error.issues);
      continue;
    }
    scans.push(parsed.data);
  }
  return { ids: snapshot.docs.map(doc => doc.id), scans };
};

// 読んだドキュメントだけを消す。コレクションごと消すと、集計中に届いたデータを数えないまま消してしまう。
export const deletePendingScansByIds = async (ids: string[]): Promise<void> => {
  const collectionRef = db.collection("pending_scans");
  const batchSize = 500; // Firestoreのバッチ書き込みの上限は500件

  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = db.batch();
    for (const id of ids.slice(i, i + batchSize)) {
      batch.delete(collectionRef.doc(id));
    }
    await batch.commit();
  }

  console.info(`Deleted ${ids.length} documents from pending_scans collection.`);
};

// 窓に間に合わず遅れて届いたデータは、集計の対象にならず、読まれないまま残る。溜まり続けないよう、古いものを消す。
export const deleteStalePendingScans = async (before: Timestamp): Promise<void> => {
  const batchSize = 500;
  let totalDeleted = 0;

  while (true) {
    const snapshot = await db.collection("pending_scans").where("received_at", "<", before).limit(batchSize).get();
    if (snapshot.empty) break;

    const batch = db.batch();
    for (const doc of snapshot.docs) {
      batch.delete(doc.ref);
    }
    await batch.commit();
    totalDeleted += snapshot.size;
  }

  if (totalDeleted > 0) {
    console.info(`Deleted ${totalDeleted} stale documents from pending_scans collection.`);
  }
};

export async function getLatestSensorData(location: string) {
  const snapshot = await db.collection("sensorData")
    .where("location", "==", location)
    .orderBy("received_at", "desc")
    .limit(1)
    .get();
  return snapshot;
}

export const LocationsConfigSchema = z.object({
  ids: z.array(z.string().min(1)),
});

// /aggregateが対象とするlocationの一覧。スキャンデータに実際に含まれていたlocationだけを処理すると、
// ノードが落ちて何も送ってこなかったlocationのレコードが書けないため、事前に登録された一覧を正とする
export const getLocationIds = async (): Promise<string[]> => {
  const doc = await db.collection("config").doc("locations").get();
  if (!doc.exists) return [];

  const parsed = LocationsConfigSchema.safeParse(doc.data());
  if (!parsed.success) {
    console.error("Invalid data in config/locations:", parsed.error.issues);
    return [];
  }
  return parsed.data.ids;
};


export const getLatestCongestionRecord = async (location: string): Promise<CongestionRecord | null> => {
  const snapshot = await db.collection("congestion_records")
    .where("location", "==", location)
    .orderBy("windowStart", "desc")
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  const parsed = CongestionRecordSchema.safeParse(snapshot.docs[0].data());
  if (!parsed.success) {
    console.error(`Invalid data in congestion_records document ${snapshot.docs[0].id}:`, parsed.error.issues);
    return null;
  }
  return parsed.data;
};

export const getCongestionRecordHistory = async (location: string, limit: number): Promise<CongestionRecord[]> => {
  const snapshot = await db.collection("congestion_records")
    .where("location", "==", location)
    .orderBy("windowStart", "desc")
    .limit(limit)
    .get();

  const result: CongestionRecord[] = [];
  for (const doc of snapshot.docs) {
    const parsed = CongestionRecordSchema.safeParse(doc.data());
    if (!parsed.success) {
      console.error(`Invalid data in congestion_records document ${doc.id}:`, parsed.error.issues);
      continue;
    }
    result.push(parsed.data);
  }
  return result;
};

// 過去の指定した時間のデータを取得する際に、必要な戻り値, 型を定義する
export interface ScanRecord {
  mac: string;
  nodeId: string;
  observed_at: Date;
  location: string;
};

// 過去の指定した時間のデータを取得する関数
export const getScansInWindow = async (start: Date, end: Date): Promise<ScanRecord[]> => {
  const snapshot = await db
    .collection("pending_scans")
    .where("observed_at", ">=", start)//dateで渡しても、SDKによりFirestoreのtimestamp型に変換されるので問題ない
    .where("observed_at", "<", end)
    .get();
  return snapshot.docs.map((doc) => ({
    ...toScanRecord(doc),
    ref: doc.ref,// deleteScanRecord関数で削除するために、ドキュメントの参照を返す
  }));
}

export const toScanRecord = (doc: FirebaseFirestore.QueryDocumentSnapshot): ScanRecord => {
  const data = doc.data();
  return {
    mac: data.mac,
    nodeId: data.nodeId,
    observed_at: data.observed_at.toDate(),
    location: data.location,
  };
}

export const getMaxDevice = async (location: string, weekday: number): Promise<MaxDeviceData | null> => {
  const doc = await db.collection("max_devices").doc(`${location}_${weekday}`).get();
  if (!doc.exists) return null;

  const parsed = MaxDeviceSchema.safeParse(doc.data());
  if (!parsed.success) {
    console.error(`Invalid data in max_devices document ${doc.id}:`, parsed.error.issues);
    return null;
  }
  return parsed.data;
};


// 自動採番を行うための関数
export async function getNextSequenceNumber(
  counterName: string
): Promise<number> {
  const counterRef = db.collection("counters").doc(counterName);

  const newNumber = await db.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);

    if (!snap.exists) {
      tx.set(counterRef, { current: 1 });
      return 1;
    }

    const current = snap.data()!.current as number;
    const next = current + 1;
    tx.update(counterRef, { current: next });
    return next;
  });

  return newNumber;
}

export const saving_node_health_status = async (stats: NodeStatusData[]): Promise<void> => {
  if (stats.length === 0) return;

  const batch = db.batch();
  const collection = db.collection("node_health_stats");

  for (const stat of stats) {
    const result = NodeStatusSchema.safeParse(stat);
    if (!result.success) {
      console.error("Validation failed:", result.error.issues);
      throw new Error("Invalid data for saving node health status");
    }
    const windowKey = result.data.windowStart.toDate().toISOString();
    //issue#1から変更。nodeId_windowStartの組み合わせで一意になるようにする
    batch.set(collection.doc(`${result.data.nodeId}_${windowKey}`), result.data);
  }

  await batch.commit();
};

export const saveCongestionRecords = async (
  records: CongestionRecordInput[],
  windowStart: Timestamp,
  configHash: string,
): Promise<void> => {
  if (records.length === 0) return;

  const batch = db.batch();
  const collection = db.collection("congestion_records");

  for (const record of records) {
    // 自動採番だと/aggregateがリトライされた際に同一(location, windowStart)が重複して書き込まれるため、決定的なIDにする
    const docId = `${sanitizeForDocId(record.location)}__${windowStart.toMillis()}`;
    batch.set(collection.doc(docId), {
      location: record.location,
      weekday: record.weekday,
      windowStart,
      uniqueDeviceCount: record.uniqueDeviceCount,
      configHash,
    });
  }

  await batch.commit();
};

export const saveScanDiagnostics = async (diagnostics: ScanDiagnostics): Promise<void> => {
  const result = ScanDiagnosticsSchema.safeParse(diagnostics);
  if (!result.success) {
    console.error("Validation failed:", result.error.issues);
    throw new Error("Invalid data for saving scan diagnostics");
  }

  const docId = `${sanitizeForDocId(result.data.location)}__${result.data.windowStart.toMillis()}`;
  await db.collection("scan_diagnostics").doc(docId).set(result.data);
};

// 読み取りに失敗した場合のフォールバック。既存の運用(companyId "004C" + isNearbyInfo必須、RSSI閾値-100、デバッグOFF)と同じ構成にする
const DEFAULT_FILTER_PIPELINE_CONFIG: FilterPipelineConfig = {
  stages: [
    { name: "dedupe" },
    { name: "companyFilter", allowedCompanyIds: ["004C"], requireNearbyInfo: true },
    { name: "rssiFilter", rssiThreshold: -100 },
  ],
  debugModeEnabled: false,
};

export const getFilterPipelineConfig = async (): Promise<FilterPipelineConfig> => {
  const doc = await db.collection("config").doc("filter_pipeline").get();
  if (!doc.exists) return DEFAULT_FILTER_PIPELINE_CONFIG;

  const parsed = FilterPipelineConfigSchema.safeParse(doc.data());
  if (!parsed.success) {
    console.error("Invalid data in config/filter_pipeline:", parsed.error.issues);
    return DEFAULT_FILTER_PIPELINE_CONFIG;
  }
  return parsed.data;
};

export const getRetentionConfig = async (): Promise<RetentionConfig | null> => {
  const doc = await db.collection("config").doc("retention").get();
  if (!doc.exists) return null;

  const parsed = RetentionConfigSchema.safeParse(doc.data());
  if (!parsed.success) {
    console.error("Invalid data in config/retention:", parsed.error.issues);
    return null;
  }
  return parsed.data;
};

export const saveRetentionConfig = async (input: RetentionInput, updatedBy: string | null): Promise<void> => {
  await db.collection("config").doc("retention").set({
    ...input,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy,
  });
};

// 1日分の記録を読む。locationとweekdayの等価、windowStartの範囲なので、既存の複合インデックスに収まる。
export const getCongestionRecordsForDay = async (
  location: string,
  weekday: number,
  start: Timestamp,
  end: Timestamp,
): Promise<CongestionRecord[]> => {
  const snapshot = await db.collection("congestion_records")
    .where("location", "==", location)
    .where("weekday", "==", weekday)
    .where("windowStart", ">=", start)
    .where("windowStart", "<", end)
    .get();

  const result: CongestionRecord[] = [];
  for (const doc of snapshot.docs) {
    const parsed = CongestionRecordSchema.safeParse(doc.data());
    if (!parsed.success) {
      console.error(`Invalid data in congestion_records document ${doc.id}:`, parsed.error.issues);
      continue;
    }
    result.push(parsed.data);
  }
  return result;
};

const dailySummaryDocId = (location: string, date: string): string => `${sanitizeForDocId(location)}__${date}`;

// 複数の日をまとめて読む。getAllは1回の呼び出しで済み、存在しない日はnullで返す。
export const getDailySummaries = async (location: string, dates: string[]): Promise<Map<string, DailySummary>> => {
  const result = new Map<string, DailySummary>();
  if (dates.length === 0) return result;

  const refs = dates.map(date => db.collection("daily_summaries").doc(dailySummaryDocId(location, date)));
  const docs = await db.getAll(...refs);

  for (const doc of docs) {
    if (!doc.exists) continue;
    const parsed = DailySummarySchema.safeParse(doc.data());
    if (!parsed.success) {
      console.error(`Invalid data in daily_summaries document ${doc.id}:`, parsed.error.issues);
      continue;
    }
    result.set(parsed.data.date, parsed.data);
  }
  return result;
};

export const saveDailySummary = async (summary: DailySummaryInput): Promise<void> => {
  await db.collection("daily_summaries").doc(dailySummaryDocId(summary.location, summary.date)).set({
    ...summary,
    computedAt: FieldValue.serverTimestamp(),
  });
};

// 基準値の計算対象にするlocation。Firestoreにdistinctが無いので、直近の記録から重複を除いて取る。
// 事前登録(config/locations)は使わない(issue #32でaggregateから外したため)。
export const getRecentLocations = async (since: Timestamp): Promise<string[]> => {
  const snapshot = await db.collection("congestion_records").where("windowStart", ">=", since).get();
  return [...new Set(snapshot.docs.map(doc => doc.data().location as string))];
};

// 発行しない場合はこの関数を呼ばない。未発行ならドキュメントが無いまま、発行済みなら既存の値が残る(issue #24 Decision 7)。
export const saveMaxDevice = async (maxDevice: MaxDeviceInput): Promise<void> => {
  await db.collection("max_devices").doc(`${sanitizeForDocId(maxDevice.location)}_${maxDevice.weekday}`).set({
    ...maxDevice,
    computedAt: FieldValue.serverTimestamp(),
  });
};

export const saveExcludedDay = async (excluded: ExcludedDayInput): Promise<void> => {
  await db.collection("excluded_records").doc(`${sanitizeForDocId(excluded.location)}__${excluded.date}`).set({
    ...excluded,
    evaluatedAt: FieldValue.serverTimestamp(),
  });
};

// 基準値の計算に使う設定。ドキュメントが無ければnullを返し、呼び出し側がコードの既定値を使う。
// 項目ごとの検証はresolveSettingsで行うので、ここでは全体の形だけを見る。
export const getBaselineConfig = async (): Promise<BaselineConfig | null> => {
  const doc = await db.collection("config").doc("baseline").get();
  if (!doc.exists) return null;

  const parsed = BaselineConfigSchema.safeParse(doc.data());
  if (!parsed.success) {
    console.error("Invalid data in config/baseline:", parsed.error.issues);
    return null;
  }
  return parsed.data;
};

export const getApprovedPrAssets = async (): Promise<PrAsset[]> => {
  const result: PrAsset[] = [];
  const snapshot = await db.collection("prAssets").where("status", "==", "approved").get();

  for (const doc of snapshot.docs) {
    const parsed = PrAssetSchema.safeParse(doc.data());
    if (!parsed.success) {
      console.error(`Invalid data in prAssets document ${doc.id}:`, parsed.error.issues);
      continue;
    }
    result.push(parsed.data);
  }
  return result;
};