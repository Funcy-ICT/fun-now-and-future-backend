import { Hono } from "hono";
import { savePendingScan } from "../repositories/firestore";
import { sensorAuthMiddleware } from "../middlewares/sensor_auth";
import { normalizeDevice, previousWindowStart, jstWeekday, aggregateNodeHealth, groupByLocation, runPipeline } from "../services/scan_service";
import { SensorDataSchema, } from "../schema/sensor_data";
import {
  take_out_pending_scans,
  saveCongestionRecords,
  saving_node_health_status,
  delete_pending_scans,
  saveScanDiagnostics,
  getFilterPipelineConfig,
  getLocationIds,
  CongestionRecordInput,
} from "../repositories/firestore";




export const sensorRoute = new Hono();


sensorRoute.post("/receiveSensorData", async (c) => {
  // ヘッダーなしで実行するとエラーになることを確認
  // curl -X POST http://127.0.0.1:5001/fun-now-and-future/us-central1/receiveSensorData \
  //   -H "Content-Type: application/json" \
  //   -H "x-api-key: <YOUR_API_KEY>" \
  //   -d '{"nodeId": "esp32_test", "location": "moscow", ...}'

  // API key 確認
  const apiKey = c.req.header("x-api-key");

  // APIキーの検証のための sensorAuthMiddleware 関数を呼び出す
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

  // データベースに保存する処理を呼び出す
  await savePendingScan(parseResult.data);

  // savePendingScan は Firestore の serverTimestamp を使うため void を返す仕様に変更された。
  // レスポンス用の received_at はハンドラ側で生成する。
  const sensorData = parseResult.data;
  const receivedAt = new Date().toISOString();

  // 正しく届いたか確認
  return c.json({
    status: "success",
    message: "Data received successfully",
    received_at: receivedAt,
    data: sensorData,
  }, 200);
});



export const aggregateRoute = new Hono();

aggregateRoute.post("/aggregate", async (c) => {
  const now = new Date();
  const windowStart = previousWindowStart(now);
  const weekday = jstWeekday(windowStart.toMillis());
  const config = await getFilterPipelineConfig();
  const locationIds = await getLocationIds();

  console.info("aggregate started", {
    startedAt: now.toISOString(),
    windowStart: windowStart.toDate().toISOString(),
    locationCount: locationIds.length,
  });

  const scans = await take_out_pending_scans();

  // ノード監視は正規化前の生の件数を使うため、先に集計する
  const healthStats = scans.length > 0 ? aggregateNodeHealth(scans, windowStart) : [];

  // raw / parsed を ParsedDevice に揃える
  const normalized = scans.map(scan => ({
    location: scan.location,
    devices: scan.devices.map(normalizeDevice),
    nodeId: scan.nodeId,
  }));

  const byLocation = groupByLocation(normalized);

  const records: CongestionRecordInput[] = [];

  // config/locationsに登録されている全location分を必ず処理する。byLocationのキーだけを見ると、
  // ノードが落ちて何も送ってこなかったlocationのレコードが書けなくなるため
  for (const location of locationIds) {
    const devices = byLocation.get(location) ?? [];

    if (devices.length === 0) {
      records.push({ location, weekday, uniqueDeviceCount: 0 });
      continue;
    }

    const { result, trace, dedupeOutput } = runPipeline(devices, config.stages);
    records.push({ location, weekday, uniqueDeviceCount: result.length });

    if (config.debugModeEnabled && dedupeOutput) {
      await saveScanDiagnostics({
        location,
        weekday,
        windowStart,
        stageTrace: trace,
        devices: dedupeOutput.map(d => ({
          uuid: d.uuid,
          rssi: d.device.rssi,
          companyId: d.device.companyId,
          isNearbyInfo: d.device.isNearbyInfo,
          count: d.count,
        })),
      });
    }
  }

  await saveCongestionRecords(records, windowStart);
  await saving_node_health_status(healthStats);
  await delete_pending_scans();

  console.info("aggregate finished", {
    scanCount: scans.length,
    locationCount: records.length,
  });
  return c.json({
    windowStart: windowStart.toDate().toISOString(),
    scanCount: scans.length,
    locationCount: records.length,
  })
});