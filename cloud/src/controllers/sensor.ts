import { Hono } from "hono";
import { savePendingScan } from "../repositories/firestore";
import { sensorAuthMiddleware } from "../middlewares/sensor_auth";
import { normalizeDevice, previousWindowStart, jstWeekday, aggregateNodeHealth, groupByLocation, runPipeline } from "../services/scan_service";
import { SensorDataSchema, } from "../schema/sensor_data";
import { isValidMac, hashMac } from "../services/mac";
import { getHashKey } from "../lib/hash_key";
import { buildScanEvent } from "../services/scan_event";
import { publishScanEvent } from "../repositories/pubsub";
import {
  take_out_pending_scans,
  saveCongestionRecords,
  saving_node_health_status,
  delete_pending_scans,
  saveScanDiagnostics,
  getFilterPipelineConfig,
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

  const sensorData = parseResult.data;

  // ハッシュ化する前に、macの書式を確認する。不正なmacが1つでも含まれていれば、そのPOSTは受け付けない
  if (!sensorData.devices.every(device => isValidMac(device.mac))) {
    return c.json({
      status: "error",
      message: "mac is invalid",
    }, 400);
  }

  // savePendingScan は Firestore の serverTimestamp を使うため void を返す仕様に変更された。
  // レスポンス用の received_at はハンドラ側で生成する。pub/subのメッセージにも同じ値を載せる。
  const receivedAt = new Date();

  // firestoreにも生のmacを残さない。ハッシュ化した値でも、/aggregateの重複排除はmacの文字列をキーにするだけなのでそのまま動く
  const key = getHashKey();

  // データベースに保存する処理を呼び出す
  await savePendingScan({
    ...sensorData,
    devices: sensorData.devices.map(device => ({ ...device, mac: hashMac(device.mac, key) })),
  });

  // firestoreへの保存が入口の間は、publishの失敗でPOSTを失敗させない。失敗させるとesp32が再送し、自動採番のドキュメントIDでfirestoreに二重に書かれるため。
  // pub/subが唯一の入口になったら、失敗をエラーとして返す形に変える。
  try {
    await publishScanEvent(buildScanEvent(sensorData, receivedAt, key));
  } catch (error) {
    console.error("Failed to publish scan event:", error instanceof Error ? error.message : error);
  }

  // 正しく届いたか確認
  return c.json({
    status: "success",
    message: "Data received successfully",
    received_at: receivedAt.toISOString(),
    data: sensorData,
  }, 200);
});



export const aggregateRoute = new Hono();

aggregateRoute.post("/aggregate", async (c) => {
  const now = new Date();
  const windowStart = previousWindowStart(now);
  const weekday = jstWeekday(windowStart.toMillis());
  const config = await getFilterPipelineConfig();

  console.info("aggregate started", {
    startedAt: now.toISOString(),
    windowStart: windowStart.toDate().toISOString(),
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

  // ESP32は検出0件でもdevices: []でPOSTしてくる前提。空配列でもrunPipelineは自然に
  // uniqueDeviceCount: 0の結果を返すため、byLocationに出てきたlocationだけを処理すればよい
  for (const [location, devices] of byLocation) {
    const { result, trace, dedupeOutput } = runPipeline(devices, config.stages);
    records.push({ location, weekday, uniqueDeviceCount: result.length });

    if (config.debugModeEnabled && dedupeOutput && devices.length > 0) {
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