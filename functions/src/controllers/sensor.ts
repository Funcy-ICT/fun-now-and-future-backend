import { Hono } from "hono";
import { z } from "zod";
import { sensordatetodb } from "../repositories/firestore";
import { sensorAuthMiddleware } from "../middlewares/sensor_auth";
import { normalizeDevice } from "../services/scan_service";
import { SensorDataSchema, SensorData } from "../schema/sensor_data";



type SensorDataSchemaType = z.infer<typeof SensorDataSchema>;


export const sensorRoute = new Hono();


sensorRoute.post("/receiveSensorData", async (c) => {
  //# ヘッダーなしで実行するとエラーになることを確認
  // curl -X POST http://127.0.0.1:5001/fun-now-and-future/us-central1/receiveSensorData \ -H "Content-Type: application/json" \ -d "{\"nodeId\": \"esp32_test\", \"location\": \"moscow\", \"ble_device_count\": 10}"
  //API key確認


  const apiKey = c.req.header("x-api-key");

  // APIキーの検証のためのsensorAuthMiddleware関数を呼び出す
  const authResult = await sensorAuthMiddleware(apiKey);
  if (authResult === 0) {
    return c.json({
      status: "error",
      message: "Unauthorized: Invalid or missing API Key",
    }, 401);
  }

  const parseResult = SensorDataSchema.safeParse(await c.req.json());
  if (!parseResult.success) {
    const errorMessage = parseResult.error.issues[0].message;
    return c.json({
      status: "error",
      message: errorMessage,
    }, 400);
  }

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
