import { Hono } from "hono";
import * as logger from "firebase-functions/logger";
import { z } from "zod";
import { db } from "../lib/firebase";

const VALID_API_KEY = "funcy_esp32_secret_key_2026";

const SensorDataSchema = z.object({
  sensor_id: z.string().min(1, "sensor_id is required"),
  location: z.string().min(1, "location is required"),
  ble_device_count: z.number().min(0, "ble_device_count must be 0 or greater"),
});

export const sensorRoute = new Hono();

sensorRoute.post("/receiveSensorData", async (c) => {
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