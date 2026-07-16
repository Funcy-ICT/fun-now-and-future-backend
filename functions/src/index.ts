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
オウム返しするだけ


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
    res.status().json({
      status: "error",
      message: "sensor_id ****",
    });
    return;
  }

  if(sensorData.ble_device_count === undefined) {
    res.status().json({
      status: "error",
      message: "sensor_id ****",
    });
    return;
  }

  if(typeof sensorData.ble_device_count !== "number") {
    res.status().json({
      status: "error",
      message: "sensor_id ****",
    });
    return;
  }

  if(sensorData.ble_device_count < 0) {
    res.status().json({
      status: "error",
      message: "sensor_id ****",
    });
    return;
  }

  if(!sensorData.location) {
    res.status().json({
      status: "error",
      message: "sensor_id ****",
    });
    return;
  }

  if(typeof sensorData.location !== "string") {
    res.status().json({
      status: "error",
      message: "sensor_id ****",
    });
    return;
  }

  //(default)データベースに保存
  await db.collection("sensorData").add(sensorData);

  //firebaseのログ
  logger.info("Received data from ESP32", sensorData);

  //正しく届いたか確認
  res.status(200).json({
    status: "success",
    message: "Data received successfully",
    received_at: new Date().toISOString(),
    data: sensorData
  });
});

