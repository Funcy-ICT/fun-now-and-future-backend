import { Hono } from "hono";
import { z } from "zod";
import { sensordatetodb } from "../repositories/firestore";
import { sensorAuthMiddleware } from "../middlewares/sensor_auth";
import { normalizeDevice } from "../services/scan_service";
import { SensorDataSchema, SensorData } from "../schema/sensor_data";
import { previousWindowStart } from "../services/scan_service";
import { take_out_pending_scans } from "../repositories/firestore";
import { aggregateNodeHealth } from "../services/scan_service";
import { groupByLocation } from "../services/scan_service";
import { dedupeByMac } from "../services/scan_service";


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



const RSSI_THRESHOLD = -100;  // 実測データの分布を確認するまではフィルタなしで運用する

export const aggregateRoute = new Hono();

aggregateRoute.post("/aggregate", async (c) => {
  const now = new Date();
  const windowStart = previousWindowStart(now);

  console.info("aggregate started", {
    startedAt: now.toISOString(),
    windowStart: windowStart.toDate().toISOString(),
  });

  const scans = await take_out_pending_scans();
  if (scans.length === 0) {
    console.info("no pending scans");
    return c.json({ windowStart: windowStart.toDate().toISOString(), scanCount: 0 });
  }

  // ノード監視は正規化前の生の件数を使うため、先に集計する
  const healthStats = aggregateNodeHealth(scans, windowStart);

  // raw / parsed を ParsedDevice に揃える
  const normalized = scans.map(scan => ({
    location: scan.location,
    devices: scan.devices.map(normalizeDevice),
  }));

  const byLocation = groupByLocation(normalized);

  const records = [...byLocation].map(([location, devices]) => {
})});