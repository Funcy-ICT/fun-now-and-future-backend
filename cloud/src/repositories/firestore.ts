import { db } from "../lib/firebase";
import { z } from "zod";
import { Timestamp } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { SensorData } from "../schema/sensor_data";
import { SensorDataSchema } from "../schema/sensor_data";

export type CongestionRecordInput = {
  location: string;
  uniqueDeviceCount: number;
};


// ESP32からのデータを受け取り、Firestoreに保存する関数
// ESP32のデータを受け取る関数は、functions/src/controllers/sensor.tsのsensorRoute.post("/receiveSensorData")で呼び出されます。


const pendingScanDocSchema = SensorDataSchema.extend({
  received_at: z.instanceof(Timestamp),
});

type PendingScansData = z.infer<typeof pendingScanDocSchema>;

export const savePendingScan = async (sensorData: SensorData): Promise<void> => {
  await db.collection("pending_scans").add({
    ...sensorData,
    received_at: FieldValue.serverTimestamp(),
  });
};


export async function getLatestSensorData(location: string) {
  const snapshot = await db.collection("sensorData")
    .where("location", "==", location)
    .orderBy("received_at", "desc")
    .limit(1)
    .get();
  return snapshot;
}

export async function getSensorDataHistory(location: string, limit: number) {
  const snapshot = await db.collection("sensorData")
    .where("location", "==", location)
    .orderBy("received_at", "desc")
    .limit(limit)
    .get();
  return snapshot;
}

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

export const take_out_pending_scans = async (): Promise<PendingScansData[]> => {
  const result: PendingScansData[] = [];
  const snapshot = await db.collection("pending_scans").get();

  for (const doc of snapshot.docs) {
    const docId = doc.id;
    const parsed = pendingScanDocSchema.safeParse(doc.data());
    if (!parsed.success) {
      console.error(`Invalid data in pending_scans document ${docId}:`, parsed.error.issues);
      continue;
    }
    result.push(parsed.data);
  }
  return result;
}

export const delete_pending_scans = async (): Promise<void> => {
  const collectionRef = db.collection("pending_scans");
  const batchSize = 500; // Firestoreのバッチ書き込みの上限は500件
  let totalDeleted = 0;

  while (true) {
    const snapshot = await collectionRef.limit(batchSize).get();
    if (snapshot.empty) {
      break;
    }

    const batch = db.batch();
    for (const doc of snapshot.docs) {
      batch.delete(doc.ref);
    }
    await batch.commit();
    totalDeleted += snapshot.size;
  }

  console.info(`Deleted ${totalDeleted} documents from pending_scans collection.`);
}


const MaxDeviceSchema = z.object({
  location: z.string().min(1, "location is required"),
  weekday: z.number().min(0).max(6, "weekday must be between 0 and 6"),
  maxDevices: z.number().min(1, "maxDevices must be at least 1"),
  updated_at: z.string().min(1, "updated_at is required"),
});

export type MaxDeviceData = z.infer<typeof MaxDeviceSchema>;

export const saving_max_devices = async (location: string, weekday: number, maxDevice: number): Promise<void> => {
  const result = MaxDeviceSchema.safeParse({
    location,
    weekday,
    maxDevices: maxDevice,
    updated_at: new Date().toISOString(),
  });

  if (!result.success) {
    console.error("Validation failed:", result.error.issues);
    throw new Error("Invalid data for saving max devices");
  }

  await db
    .collection("max_devices")
    .doc(`${result.data.location}_${result.data.weekday}`)
    .set(
      result.data
    );
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

const NodeStatusSchema = z.object({
  nodeId: z.string().min(1, "nodeId is required"),
  location: z.string().min(1, "location is required"),
  windowStart: z.instanceof(Timestamp),
  postCount: z.number().min(0, "postCount must be at least 0"),
  totalMacCount: z.number().min(0, "totalMacCount must be at least 0"),
});

export type NodeStatusData = z.infer<typeof NodeStatusSchema>;


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
): Promise<void> => {
  if (records.length === 0) return;

  const batch = db.batch();
  const collection = db.collection("congestion_records");

  for (const record of records) {
    batch.set(collection.doc(), {
      location: record.location,
      windowStart,
      uniqueDeviceCount: record.uniqueDeviceCount,
    });
  }

  await batch.commit();
};