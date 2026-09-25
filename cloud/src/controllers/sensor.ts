import { Hono } from "hono";
import { sensorAuthMiddleware } from "../middlewares/sensor_auth";
import { Timestamp } from "firebase-admin/firestore";
import { aggregateWindow, jstWeekday, aggregateNodeHealth, groupByLocation, runPipeline, STALE_PENDING_SCAN_MS } from "../services/scan_service";
import { SensorDataSchema, } from "../schema/sensor_data";
import { isValidMac } from "../services/mac";
import { getHashKey } from "../lib/hash_key";
import { buildScanEvent, toParsedDevice } from "../services/scan_event";
import { publishScanEvent } from "../repositories/pubsub";
import {
  getPendingScanEventsInWindow,
  saveCongestionRecords,
  saving_node_health_status,
  deletePendingScansByIds,
  deleteStalePendingScans,
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
  if (authResult === -1) {
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

  // レスポンス用の received_at と、pub/subのメッセージに載せる受信時刻は、ここで取った同じ値を使う。
  // firestoreに書く時刻は、処理側での書き込みが遅れた分だけずれるので使わない。
  const receivedAt = new Date();
  const key = getHashKey();

  // pending_scansへの書き込みは、pub/subのプッシュを受ける処理側(pubsubPushRoute)が行う。
  // publishの完了を待ち、失敗したらエラーを返してesp32に再送させる。200を返したデータは、pub/subに届いている。
  await publishScanEvent(buildScanEvent(sensorData, receivedAt, key));

  // 正しく届いたか確認
  return c.json({
    status: "success",
    message: "Data received successfully",
    received_at: receivedAt.toISOString(),
    sendId: sensorData.sendId ?? null,
  }, 200);
});



export const aggregateRoute = new Hono();

aggregateRoute.post("/aggregate", async (c) => {
  const now = new Date();
  const { start: windowStart, end: windowEnd } = aggregateWindow(now);
  const weekday = jstWeekday(windowStart.toMillis());
  const config = await getFilterPipelineConfig();

  console.info("aggregate started", {
    startedAt: now.toISOString(),
    windowStart: windowStart.toDate().toISOString(),
  });

  // 窓の範囲に受信したデータだけを読む。読んだドキュメントのIDは、最後に削除するために持っておく
  const { ids, scans } = await getPendingScanEventsInWindow(windowStart, windowEnd);

  // ノード監視は絞り込みの前の件数を使うため、先に集計する
  const healthStats = scans.length > 0 ? aggregateNodeHealth(scans, windowStart) : [];

  // 受信でパース済みなので、フィルタが受け取るParsedDeviceに変換するだけでよい
  const normalized = scans.map(scan => ({
    location: scan.location,
    devices: scan.devices.map(toParsedDevice),
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
  await deletePendingScansByIds(ids);

  // 窓に間に合わず遅れて届いたデータは、読まれないまま残る。溜まり続けないよう、古いものを消す
  await deleteStalePendingScans(Timestamp.fromMillis(now.getTime() - STALE_PENDING_SCAN_MS));

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