import { db } from "../lib/firebase";
import { z } from "zod";


// ESP32からのデータを受け取り、Firestoreに保存する関数
// ESP32のデータを受け取る関数は、functions/src/controllers/sensor.tsのsensorRoute.post("/receiveSensorData")で呼び出されます。

const panding_scans_schema = z.object({
  mac: z.string().min(1, "mac is required"),
  rssi: z.number().min(1, "rssi is required"),
  rawData: z.string().min(1, "rawData is required"),
})

const panding_scans_data_schema = z.object({
  nodeId: z.string().min(1, "nodeId is required"),
  location: z.string().min(1, "location is required"),
  devices: z.array(panding_scans_schema).min(1, "devices must be a non-empty array"),
  received_at: z.string().min(1, "received_at is required"),
});

type PandingScansData = z.infer<typeof panding_scans_data_schema>;

export async function sensordatetodb(parseResult: any) {
      //ESP32からのデータを取得
  const sensorData = parseResult.data;
   //(default)データベースに保存
   const receivedAt = new Date().toISOString();
   await db.collection("pending_scans").add({
 	...sensorData,
     received_at: receivedAt,
   });

//firebaseのログ
   console.info("Received data from ESP32", sensorData);
   return {sensorData, receivedAt};
}


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
interface ScanRecord {
  mac: string;
  nodeId: string;
  observed_at: Date;
  location: string;
};

// 過去の指定した時間のデータを取得する関数
const getScansInWindow = async (start: Date, end: Date): Promise<ScanRecord[]> => {
  const snapshot = await db
  .collection("panding_scans")
  .where("observed_at", ">=", start)//dateで渡しても、SDKによりFirestoreのtimestamp型に変換されるので問題ない
  .where("observed_at", "<", end)
  .get();
  return snapshot.docs.map((doc) => ({
    ...toScanRecord(doc),
    ref: doc.ref,// deleteScanRecord関数で削除するために、ドキュメントの参照を返す
  }));
}

const toScanRecord = (doc: FirebaseFirestore.QueryDocumentSnapshot): ScanRecord => {
  const data = doc.data();
  return {
    mac: data.mac,
    nodeId: data.nodeId,
    observed_at: data.observed_at.toDate(),
    location: data.location,
  };
}

const take_out_pending_scans = async (): Promise<PandingScansData[]> => {
  const result: PandingScansData[] = [];
  const snapshot = await db.collection("pending_scans").get();

  for (const doc of snapshot.docs) {
    const docId = doc.id;
    const parsed = panding_scans_data_schema.safeParse(doc.data());
    if (!parsed.success) {
      console.error(`Invalid data in pending_scans document ${docId}:`, parsed.error.issues);
      continue;
    }
    result.push(parsed.data);
  }
  return result;
}

const delete_pending_scans = async (): Promise<void> => {
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