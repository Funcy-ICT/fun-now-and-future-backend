import { Hono } from "hono";
import { z } from "zod";
import {sensordatetodb} from "../repositories/firestore";
import { sensorAuthMiddleware } from "../middlewares/sensor_auth";

//このデータはESP32から検出するたびに送られてくる
const SensorDataSchema = z.object({
  sensor_id: z.string().min(1, "sensor_id is required"),
  location: z.string().min(1, "location is required"),
  // ble_device_count: z.number().min(0, "ble_device_count must be 0 or greater"),
  ble_advertising_raw_data: z.array(z.string().min(1, "ble_advertising_raw_data must be a non-empty array of strings")),//esp32からのbleアドバタイジングの生データを受け取る
  timestamp: z.string().min(1, "timestamp is required"),//esp32からのデータ送信時のタイムスタンプを受け取る
  ble_mac_addresses: z.array(z.string().min(1, "ble_mac_addresses must be a non-empty array of strings")),//esp32からの検出されたBLEデバイスのMACアドレスの配列を受け取る
});

export const sensorRoute = new Hono();


sensorRoute.post("/receiveSensorData", async (c) => {
  //# ヘッダーなしで実行するとエラーになることを確認
  // curl -X POST http://127.0.0.1:5001/fun-now-and-future/us-central1/receiveSensorData \ -H "Content-Type: application/json" \ -d "{\"sensor_id\": \"esp32_test\", \"location\": \"moscow\", \"ble_device_count\": 10}"
  //API key確認


  const apiKey = c.req.header("x-api-key");
  // apikeyの確認は、middleware層に分離しました。
  // functions/middleware/sensor_aurh.tsに書いてあります。
  // APIキーの検証のためのsensorAuthMiddleware関数を呼び出す
  const authResult = await sensorAuthMiddleware(apiKey);
  if(authResult === -1) {
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
  //データーベース部をリポジトリ層に分割しました。
  //書いてあった処理は/functions/src/repositories/firestore.tsのsensordatetodb関数に書いてあります。
  //データベースに保存する処理を呼び出す
  const result = await sensordatetodb(parseResult);
  const sensorData = result.sensorData;
  const receivedAt = result.receivedAt;
     //正しく届いたか確認
   return c.json({
     status: "success",
     message: "Data received successfully",
     received_at: receivedAt,
     data: sensorData
   }, 200);
});