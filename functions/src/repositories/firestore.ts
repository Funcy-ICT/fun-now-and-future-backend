import { db } from "../lib/firebase";


// ESP32からのデータを受け取り、Firestoreに保存する関数
// ESP32のデータを受け取る関数は、functions/src/controllers/sensor.tsのsensorRoute.post("/receiveSensorData")で呼び出されます。
export async function sensordatetodb(parseResult: any) {
      //ESP32からのデータを取得
  const sensorData = parseResult.data;
   //(default)データベースに保存
   const receivedAt = new Date().toISOString();
   await db.collection("sensorData").add({
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

// すでに読み出したデータを削除する関数, 一度に大量のデータを削除する可能性があるため、バッチ処理を行う
const deleteScanRecord = async (docRefs: FirebaseFirestore.DocumentReference[]): Promise<void> => {
  const batch = db.batch();
  docRefs.forEach((ref) => 
    batch.delete(ref));
    await batch.commit();
};