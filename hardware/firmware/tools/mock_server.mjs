// ESP32 の送信を確かめるための、簡易な受け口。POST /receiveSensorData だけを受ける。
// 本物のサーバー（cloud/）は Pub/Sub が無いと 500 を返すので、デプロイ前の動作確認に使う。
// 検証は cloud/src/schema/sensor_data.ts と cloud/src/services/mac.ts の規則の一部をまねたもの。正しさの基準は本物のサーバー。
//
// 使い方: node hardware/firmware/tools/mock_server.mjs
//   環境変数 PORT（既定 8080）、ESP32_API_KEY（既定 local-dev-key）、FAIL_RATE（0〜1。その割合で 500 を返し、再送を試す）
import { createServer } from "node:http";

const port = Number(process.env.PORT) || 8080;
const apiKey = process.env.ESP32_API_KEY ?? "local-dev-key";
const failRate = Number(process.env.FAIL_RATE) || 0;
const seenSendIds = new Set();

const validate = (body) => {
  if (typeof body.nodeId !== "string" || body.nodeId === "") return "nodeId is required";
  if (typeof body.location !== "string" || body.location === "") return "location is required";
  if (body.sendId !== undefined && (typeof body.sendId !== "string" || body.sendId === "" || body.sendId.length > 64)) {
    return "sendId is invalid";
  }
  const devices = body.devices ?? [];
  if (!Array.isArray(devices)) return "devices must be an array";
  if (devices.length > 256) return "devices must be 256 or fewer";
  for (const d of devices) {
    if (d.format !== "raw" && d.format !== "parsed") return "format is invalid";
    if (typeof d.mac !== "string" || !/^[0-9A-F]{12}$/.test(d.mac.replace(/[:\-.\s]/g, "").toUpperCase())) {
      return "mac is invalid";
    }
    if (typeof d.rssi !== "number" || d.rssi < -127 || d.rssi > 20) return "rssi is out of range";
    if (d.format === "raw" && (typeof d.rawData !== "string" || d.rawData === "")) return "rawData is required";
    if (d.format === "parsed") {
      if (d.companyId !== null && !(typeof d.companyId === "string" && d.companyId.length === 4)) return "companyId is invalid";
      if (typeof d.isNearbyInfo !== "boolean") return "isNearbyInfo is invalid";
    }
  }
  return null;
};

const reply = (res, status, json) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(json));
};

createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/receiveSensorData") return reply(res, 404, { status: "error" });

  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    const time = new Date().toISOString();
    if (req.headers["x-api-key"] !== apiKey) {
      console.log(`${time} 401 invalid api key`);
      return reply(res, 401, { status: "error", message: "Unauthorized: Invalid or missing API Key" });
    }
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      console.log(`${time} 400 invalid json`);
      return reply(res, 400, { status: "error", message: "invalid json" });
    }
    const error = validate(body);
    if (error) {
      console.log(`${time} 400 ${error}`);
      return reply(res, 400, { status: "error", message: error });
    }
    if (Math.random() < failRate) {
      console.log(`${time} 500 (FAIL_RATE) sendId=${body.sendId}`);
      return reply(res, 500, { status: "error" });
    }

    const devices = body.devices ?? [];
    const retry = seenSendIds.has(body.sendId) ? " (duplicate sendId)" : "";
    seenSendIds.add(body.sendId);
    // raw は Apple の Manufacturer Data（ff4c00）を含むもの、parsed は Nearby Info のもの
    const apple = devices.filter((d) => d.format === "raw"
      ? d.rawData.toLowerCase().includes("ff4c00")
      : d.companyId === "004C" && d.isNearbyInfo).length;
    // MAC はログに出さない（docs/overview.md の「MACアドレスの扱い」）
    const format = devices[0]?.format ?? "-";
    console.log(`${time} 200 node=${body.nodeId} location=${body.location} format=${format} devices=${devices.length}`
      + ` apple=${apple} sendId=${body.sendId}${retry}`);
    reply(res, 200, { status: "success", received_at: time, sendId: body.sendId ?? null });
  });
}).listen(port, "0.0.0.0", () => {
  console.log(`mock server: http://0.0.0.0:${port}/receiveSensorData (api key: ${apiKey})`);
});
