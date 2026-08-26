import { Hono } from "hono";
import { z } from "zod";
import { sensordatetodb } from "../repositories/firestore";
import { sensorAuthMiddleware } from "../middlewares/sensor_auth";
import { parseRawData } from "../services/parseRawData";


//ESP32から等間隔で送信されるBLEデータを受信するためのエンドポイントを定義する
// 

const deviceBase = {
  mac: z.string().min(1, "mac is required"),
  rssi: z.number().min(-100, "rssi must be greater than or equal to -100").max(0, "rssi must be less than or equal to 0"),
}

const parsedDeviceSchema = z.object({
  ...deviceBase,
  format: z.literal("parsed"),
  companyId: z.string().min(1, "companyId is required"),
  nearbyInfo: z.string().min(1, "nearbyInfo is required"),
});

const rawDeviceSchema = z.object({
  ...deviceBase,
  format: z.literal("raw"),
  rawData: z.string().min(1, "rawData is required"),
});

const devicesSchema = z.discriminatedUnion("format", [parsedDeviceSchema, rawDeviceSchema]);

type SensorData = z.infer<typeof SensorDataSchema>;
type Device = z.infer<typeof devicesSchema>;
type ParsedDevice = z.infer<typeof parsedDeviceSchema>;
type RawDevice = z.infer<typeof rawDeviceSchema>;

const SensorDataSchema = z.object({
  nodeId: z.string().min(1, "nodeId is required"),
  location: z.string().min(1, "location is required"),
  devices: z.array(devicesSchema).min(1, "devices must be a non-empty array")
});



type SensorDataSchemaType = z.infer<typeof SensorDataSchema>;


export const sensorRoute = new Hono();


sensorRoute.post("/receiveSensorData", async (c) => {
  //# ヘッダーなしで実行するとエラーになることを確認
  // curl -X POST http://127.0.0.1:5001/fun-now-and-future/us-central1/receiveSensorData \ -H "Content-Type: application/json" \ -d "{\"nodeId\": \"esp32_test\", \"location\": \"moscow\", \"ble_device_count\": 10}"
  //API key確認


  const apiKey = c.req.header("x-api-key");
  // apikeyの確認は、middleware層に分離しました。
  // functions/middleware/sensor_aurh.tsに書いてあります。
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
