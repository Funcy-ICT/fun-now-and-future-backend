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
import { z } from "zod";
import { Hono } from "hono";
import { cors } from "hono/cors";


const app = new Hono();

initializeApp();
const db = getFirestore();
const VALID_API_KEY = "funcy_esp32_secret_key_2026";

const SensorDataSchema = z.object({
  sensor_id: z.string().min(1, "sensor_id is required"),
  location: z.string().min(1, "location is required"),
  ble_device_count: z.number().min(0, "ble_device_count must be 0 or greater"),
});

const LocationQuerySchema = z.object({
  location: z.string().min(1, "location query parameter is required"),
});

const HistoryQuerySchema = LocationQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(50).default(50),
});

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


app.get("/health", (c) => {
  logger.info("health endpoint called");

  return c.json({
    status: "ok",
    message: "Backend is running",
  });
});

//corsの処理
app.use("*", cors({
  origin: "*",
  allowMethods: ["POST", "GET", "OPTIONS"],
  allowHeaders: ["Content-Type", "x-api-key"],
}));

app.post("/receiveSensorData", async (c) => {
  //# ヘッダーなしで実行するとエラーになることを確認
  // curl -X POST http://127.0.0.1:5001/fun-now-and-future/us-central1/receiveSensorData \ -H "Content-Type: application/json" \ -d "{\"sensor_id\": \"esp32_test\", \"location\": \"moscow\", \"ble_device_count\": 10}"
  //API key確認
  const apiKey = c.req.header("x-api-key");
  if(!apiKey || apiKey !== VALID_API_KEY) {
    return c.json({
      status: "error",
      message: "Unauthorized: Invalid or missing API Key",
    }, 401);
  }

  const parseResult = SensorDataSchema.safeParse(await c.req.json());
  if(!parseResult.success) {
    const errorMessage = parseResult.error.issues[0].message;
    return c.json({
      status: "error",
      message: errorMessage,
    }, 400);
  }


  //ESP32からのデータを取得
  const sensorData = parseResult.data;

  //(default)データベースに保存
  const receivedAt = new Date().toISOString();
  await db.collection("sensorData").add({
    ...sensorData,
    received_at: receivedAt,
  });

  //firebaseのログ
  logger.info("Received data from ESP32", sensorData);

  //正しく届いたか確認
  return c.json({
    status: "success",
    message: "Data received successfully",
    received_at: receivedAt,
    data: sensorData
  }, 200);
});

app.get("/getCongestion", async (c) => {
    const parseResult = LocationQuerySchema.safeParse(await c.req.query);
  if(!parseResult.success) {
    return c.json({
      status: "error",
      message: parseResult.error.issues[0].message,
    }, 400);
  }

  const {location} = parseResult.data;

	const snapshot = await db.collection("sensorData")
		.where("location", "==", location)
    .orderBy("received_at", "desc")
		.limit(1)
		.get();

  if(snapshot.empty) {
    return c.json({
      status: "error",
      message: "No data found",
    }, 404);
  }

  const data = snapshot.docs[0].data();

  const congestionInfo = calculateCongestionStatus(data.ble_device_count);

	return c.json({
    status: "success",
    data: {...data,
      congestion_level: congestionInfo.level,
      congestion_label: congestionInfo.label,
    }
  }, 200);
});

app.get("/getCongestionHistory", async (c) => {
  const parseResult = HistoryQuerySchema.safeParse(await c.req.query);
  if(!parseResult.success) {
    return c.json({
      status: "error",
      message: parseResult.error.issues[0].message,
    }, 400);
  }

  const { location, limit } = parseResult.data;

  const snapshot = await db.collection("sensorData")
    .where("location", "==", location)
    .orderBy("received_at", "desc")
    .limit(limit)
    .get();

  if (snapshot.empty) {
    return c.json({
      status: "error",
      message: "No history data found",
    }, 404);
  }

  const history = snapshot.docs.map(doc => {
    const data = doc.data();
    const congestionInfo = calculateCongestionStatus(data.ble_device_count);
    return {
      ...data,
      congestion_level: congestionInfo.level,
      congestion_label: congestionInfo.label,
    };
  });

  return c.json({
    status: "success",
    count: history.length,
    data: history,
  }, 200);
});


app.get("/getAnnouncements", (c) => {
  return c.json({

  });
});

export default app;

function calculateCongestionStatus(count: number):  {level: string; label: string} {
  if(count >= 50) {
    return {level: "high", label: "混雑"};
  }else if (count >= 20) {
    return {level: "medium", label: "やや混雑"};
  } else {
    return {level: "low", label: "空いている"};
  }
}