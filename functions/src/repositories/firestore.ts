let _db: any = null;

export const getDb = () => {
	if(!_db) {
		const { initializeApp, getApps } = require("firebase-admin/app");
		const { getFirestore } = require("firebase-admin/firestore");

		if(getApps().length === 0){
			initializeApp({
				projectId: "fun-now-and-future",
			});
		}

		_db = getFirestore();
	}
	return _db;
};

//Proxyでラップ
export const db = new Proxy({} as any, {
	get(_target, prop) {
		const firestore = getDb();
		const value = firestore[prop];
		return typeof value === "function" ? value.bind(firestore) : value;
	},
});

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