/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import {setGlobalOptions} from "firebase-functions";
import {onRequest} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";


initializeApp();
const db = getFirestore();

// Start writing functions
// https://firebase.google.com/docs/functions/typescript

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({ maxInstances: 10 });

export const health = onRequest((req, res) => {
  logger.info("health endpoint called");

  res.json({
    status: "ok",
    message: "Backend is running",
  });
});

/*
受け取ったら入力チェックして、オウム返しした後データベースに保存
curl -X POST http://127.0.0.1:5001/fun-now-and-future/us-central1/receiveSensorData -H "Content-Type: application/json" -d "{\"sensor_id\": \"esp32_ryoHasegawa_99\", \"location\": \"sapporo\", \"ble_device_count\": 999}"
{"status":"success","message":"Data received successfully","received_at":"2026-07-13T08:58:29.018Z","data":{"sensor_id":"esp32_ryoHasegawa_99","location":"sapporo","ble_device_count":999}}
*/
export const receiveSensorData = onRequest(async (req, res) => {
  //CORS対策(ローカルや別ドメインからのアクセス許可)
  res.set('Access-Control-Allow-Origin', '*');
  if (req.method === "OPTIONS") {
    res.set('Access-Control-Allow-Methods', 'POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).send('');
    return;
  }

  //POSTメソッド以外はエラーを返す
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  //ESP32からのデータを取得
  const sensorData = req.body;

  //入力チェック
  //データに対して、型チェックと値があるか(undefined、null、空文字ではない)のチェックをする
  //存在、型、値の順番でチェックする
  if(!sensorData.sensor_id) {
    res.status(400).json({
      status: "error",
      message: "sensor_id is required",
    });
    return;
  }

  if(typeof sensorData.sensor_id !== "string") {
    res.status(400).json({
      status: "error",
      message: "sensor_id must be a string",
    });
    return;
  }

  if(sensorData.ble_device_count === undefined) {
    res.status(400).json({
      status: "error",
      message: "ble_device_count is required",
    });
    return;
  }

  if(typeof sensorData.ble_device_count !== "number") {
    res.status(400).json({
      status: "error",
      message: "ble_device_count must be a number",
    });
    return;
  }

  if(sensorData.ble_device_count < 0) {
    res.status(400).json({
      status: "error",
      message: "ble_device_count must not be negative",
    });
    return;
  }

  if(!sensorData.location) {
    res.status(400).json({
      status: "error",
      message: "location is required",
    });
    return;
  }

  if(typeof sensorData.location !== "string") {
    res.status(400).json({
      status: "error",
      message: "location must be a string",
    });
    return;
  }

  const receivedAt = new Date().toISOString();

  //(default)データベースに保存
  await db.collection("sensorData").add({
    ...sensorData,
    received_at: receivedAt,
  });

  //firebaseのログ
  logger.info("Received data from ESP32", sensorData);

  //正しく届いたか確認
  res.status(200).json({
    status: "success",
    message: "Data received successfully",
    received_at: receivedAt,
    data: sensorData
  });
});


//curl -X GET "http://127.0.0.1:5001/fun-now-and-future/us-central1/getCongestion" -H "Content-Type: application/json" -d "{\"location\": \"sapporo\"}"
//
export const getCongestion = onRequest (async (req, res) => {
  const location = req.query.location;
  if(typeof location !== "string") {
    res.status(400).json({
      status: "error",
      message: "location query parameter is required",
    });
    return;
  }


	if(location === "") {
		res.status(400).json({
			status: "error",
			message: "location query parameter is required",
		});
		return;
	}

	const snapshot = await db.collection("sensorData")
		.where("location", "==", location)
    .orderBy("received_at", "desc")
		.limit(1)
		.get();

  if(snapshot.empty) {
    res.status(404).json({
      status: "error",
      message: "No data found",
    });
    return;
  }

  const data = snapshot.docs[0].data();
	res.status(200).json({
    status: "success",
    data: data,
  });
});