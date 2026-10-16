// ESP32 の送信を確かめるための、簡易な受け口。POST /receiveSensorData だけを受ける。
// 本物のサーバー（cloud/）は Pub/Sub が無いと 500 を返すので、デプロイ前の動作確認に使う。
// 検証は cloud/src/schema/sensor_data.ts と cloud/src/services/mac.ts の規則の一部をまねたもの。正しさの基準は本物のサーバー。
//
// 使い方: node hardware/firmware/tools/mock_server.mjs
//   環境変数 PORT（既定 8080）、ESP32_API_KEY（既定 local-dev-key）、FAIL_RATE（0〜1。その割合で 500 を返し、再送を試す）
//
// 台数の確認: curl -s localhost:8080/counts
//   受け取った送信ごとの台数と、location ごとの5分の窓の台数（重複を除く）を表で返す
import { createServer } from "node:http";
import { parseRawData } from "./parse_raw_data.mjs";

const port = Number(process.env.PORT) || 8080;
const apiKey = process.env.ESP32_API_KEY ?? "local-dev-key";
const failRate = Number(process.env.FAIL_RATE) || 0;
const seenSendIds = new Set();

// 受け取った送信の記録。台数の確認（GET /counts）に使う。MAC はメモリに置くだけで、ログにも応答にも出さない
const WINDOW_MS = 5 * 60 * 1000;
const MAX_RECORDS = 500;
const records = [];

// 1台ずつ、Company ID と Nearby Info の有無を出す。raw はバックエンドと同じ規則でパースする
const classify = (d) => {
  const p = d.format === "raw" ? parseRawData(d.rawData) : { companyId: d.companyId, isNearbyInfo: d.isNearbyInfo };
  return { mac: d.mac.replace(/[:\-.\s]/g, "").toUpperCase(), apple: p.companyId === "004C", target: p.companyId === "004C" && p.isNearbyInfo };
};

const record = (body, receivedAt) => {
  const devices = (body.devices ?? []).map(classify);
  records.push({ receivedAt, nodeId: body.nodeId, location: body.location, sendId: body.sendId ?? "-", devices });
  if (records.length > MAX_RECORDS) records.shift();
  return {
    total: devices.length,
    apple: devices.filter((d) => d.apple).length,
    target: devices.filter((d) => d.target).length,
  };
};

const pad = (v, n) => String(v).padEnd(n);
const padL = (v, n) => String(v).padStart(n);

// 台数の表。サーバーの集計と同じく、5分の窓（受信時刻で区切る）ごとに、同じ location の MAC の重複を除いて数える。
// サーバーはさらに RSSI の閾値で絞るので、本物の台数はここより少なくなることがある
const countsText = (limit) => {
  const lines = [];
  lines.push("== 送信ごと（新しい順）");
  lines.push(`${pad("受信時刻(JST)", 20)}${pad("nodeId", 22)}${pad("location", 12)}${padL("全部", 6)}${padL("Apple", 7)}${padL("対象", 6)}  sendId`);
  for (const r of records.slice(-limit).reverse()) {
    const apple = r.devices.filter((d) => d.apple).length;
    const target = r.devices.filter((d) => d.target).length;
    lines.push(`${pad(jst(r.receivedAt), 20)}${pad(r.nodeId, 22)}${pad(r.location, 12)}${padL(r.devices.length, 6)}${padL(apple, 7)}${padL(target, 6)}  ${r.sendId.slice(0, 8)}`);
  }

  lines.push("");
  lines.push("== 5分の窓ごと（location 単位、MAC の重複を除く。新しい順）");
  lines.push(`${pad("窓の開始(JST)", 20)}${pad("location", 12)}${padL("送信", 6)}${padL("全部", 6)}${padL("Apple", 7)}${padL("対象", 6)}`);
  const windows = new Map();
  for (const r of records) {
    const start = Math.floor(r.receivedAt.getTime() / WINDOW_MS) * WINDOW_MS;
    const key = `${start}|${r.location}`;
    if (!windows.has(key)) windows.set(key, { start, location: r.location, posts: 0, devices: new Map() });
    const w = windows.get(key);
    w.posts++;
    for (const d of r.devices) {
      const prev = w.devices.get(d.mac);
      w.devices.set(d.mac, { apple: d.apple || prev?.apple, target: d.target || prev?.target });
    }
  }
  const sorted = [...windows.values()].sort((a, b) => b.start - a.start || a.location.localeCompare(b.location));
  for (const w of sorted.slice(0, limit)) {
    const ds = [...w.devices.values()];
    lines.push(`${pad(jst(new Date(w.start)), 20)}${pad(w.location, 12)}${padL(w.posts, 6)}${padL(ds.length, 6)}${padL(ds.filter((d) => d.apple).length, 7)}${padL(ds.filter((d) => d.target).length, 6)}`);
  }
  lines.push("");
  lines.push("全部: 検出した端末 / Apple: Company ID が 004C / 対象: Apple の Nearby Info（サーバーが数えるもの）");
  return lines.join("\n") + "\n";
};

const jst = (date) => new Date(date.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 19).replace("T", " ");

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
  const url = new URL(req.url, "http://localhost");
  if (req.method === "GET" && url.pathname === "/counts") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end(countsText(Number(url.searchParams.get("limit")) || 10));
  }
  if (req.method !== "POST" || url.pathname !== "/receiveSensorData") return reply(res, 404, { status: "error" });

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
    const counts = record(body, new Date(time));
    // MAC はログに出さない（docs/overview.md の「MACアドレスの扱い」）
    const format = devices[0]?.format ?? "-";
    console.log(`${time} 200 node=${body.nodeId} location=${body.location} format=${format} devices=${devices.length}`
      + ` apple=${counts.apple} target=${counts.target} sendId=${body.sendId}${retry}`);
    reply(res, 200, { status: "success", received_at: time, sendId: body.sendId ?? null });
  });
}).listen(port, "0.0.0.0", () => {
  console.log(`mock server: http://0.0.0.0:${port}/receiveSensorData (api key: ${apiKey})`);
});
