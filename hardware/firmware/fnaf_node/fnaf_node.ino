// Fun Now and Future のセンサーノード（ESP32-S3）。
// 周りの BLE 端末を1分ごとにスキャンし、役割（config.h の NODE_ROLE）に応じて送る。
//   ROLE_WIFI        : Wi-Fi で POST /receiveSensorData へ raw 形式で送る（食堂①）
//   ROLE_GATEWAY     : ROLE_WIFI に加えて、LoRa で受けたバス停の分を parsed 形式で送る（食堂②）
//   ROLE_LORA_SENDER : 自分の分と、UART で受けたバス停①の分を LoRa で送る（バス停②）
//   ROLE_UART_SENDER : UART でバス停②へ渡す（バス停①）
// 構成は hardware/systemConfigurationDiagram.md、送る形はバックエンドの cloud/src/schema/sensor_data.ts。
#include <Arduino.h>
#include <deque>
#include <algorithm>
#include "config.h"
#include "scan.h"
#include "frame.h"

#if NODE_ROLE == ROLE_WIFI || NODE_ROLE == ROLE_GATEWAY
#include "uploader.h"
#endif
#if NODE_ROLE == ROLE_GATEWAY || NODE_ROLE == ROLE_LORA_SENDER
#include "e220.h"
#endif
#if NODE_ROLE == ROLE_GATEWAY
#include "gateway.h"
#endif

// 送信の周期。バックエンドは1分ごとの送信を前提に、5分の窓で数える
static const uint32_t SEND_INTERVAL_MS = 60 * 1000;
// 1回のスキャンの長さ。送信の周期より短くする
static const uint32_t SCAN_DURATION_MS = 10 * 1000;
// 全ノードが同じ瞬間に送らないよう、ノードごとに最初の送信をずらす（0〜この値）
static const uint32_t MAX_SEND_OFFSET_MS = 15 * 1000;
// Wi-Fi で送る1回あたりの台数の上限（バックエンドの上限）
static const size_t MAX_DEVICES_WIFI = 256;
// LoRa で送る1回あたりの台数の上限。18台で1フレーム（約0.4秒）。多いときは RSSI の強い順に残す。値は仮
static const size_t MAX_DEVICES_LORA = 72;

static uint32_t nextCycleAt = 0;
static std::vector<ScannedDevice> scanned;

// ノードから決まる、送信をずらす量。再起動しても同じノードは同じだけずれる
static uint32_t sendOffsetMs(const char* key) {
  uint32_t h = 2166136261u;  // FNV-1a
  for (const char* p = key; *p; ++p) h = (h ^ (uint8_t)*p) * 16777619u;
  return h % (MAX_SEND_OFFSET_MS + 1);
}

// 周期が来たらスキャンを始める。スキャンが終わったら true を返し、結果は scanned に入る
static bool pollScan() {
  if ((int32_t)(millis() - nextCycleAt) >= 0) {
    nextCycleAt += SEND_INTERVAL_MS;
    scanStart(SCAN_DURATION_MS);
  }
  if (!scanTakeResults(scanned)) return false;
  Serial.printf("scan: %u found\n", (unsigned)scanned.size());
  return true;
}

// ---------------------------------------------------------------- Wi-Fi で送る（食堂）
#if NODE_ROLE == ROLE_WIFI || NODE_ROLE == ROLE_GATEWAY

static String toHex(const std::vector<uint8_t>& bytes) {
  static const char digits[] = "0123456789abcdef";
  String s;
  s.reserve(bytes.size() * 2);
  for (uint8_t v : bytes) {
    s += digits[v >> 4];
    s += digits[v & 0x0F];
  }
  return s;
}

// 自分のスキャン結果を raw 形式で送る。検出が0件でも devices: [] で送る
static void sendOwnScan() {
  String json = jsonHead(NODE_ID, LOCATION);
  json.reserve(json.length() + scanned.size() * 120);
  size_t n = std::min(scanned.size(), MAX_DEVICES_WIFI);
  for (size_t i = 0; i < n; i++) {
    if (i > 0) json += ',';
    json += "{\"format\":\"raw\",\"mac\":\"";
    json += formatMac(scanned[i].mac);
    json += "\",\"rssi\":";
    json += (int)scanned[i].rssi;  // int8_t のままだと文字として足される
    json += ",\"rawData\":\"";
    json += toHex(scanned[i].payload);
    json += "\"}";
  }
  json += "]}";
  uploaderEnqueue(json);
  uploaderFlush();
}

#endif

// ---------------------------------------------------------------- LoRa で送る（バス停②）
#if NODE_ROLE == ROLE_LORA_SENDER

// 送るのを待っているフレーム。上限を超えたら古いものから捨てる
static const size_t MAX_QUEUED_FRAMES = 16;
static std::deque<std::vector<uint8_t>> loraQueue;
static FrameReader linkReader;

static void queueFrame(std::vector<uint8_t> frame) {
  loraQueue.push_back(std::move(frame));
  while (loraQueue.size() > MAX_QUEUED_FRAMES) {
    loraQueue.pop_front();
    Serial.println("lora: dropped the oldest frame (limit reached)");
  }
}

#endif

#if NODE_ROLE == ROLE_LORA_SENDER || NODE_ROLE == ROLE_UART_SENDER
// LoRa で送れる量に収めるため、RSSI の強い（近い）順に残す
static std::vector<std::vector<uint8_t>> encodeOwnScan() {
  std::sort(scanned.begin(), scanned.end(),
            [](const ScannedDevice& a, const ScannedDevice& b) { return a.rssi > b.rssi; });
  return encodeScan(LORA_NODE_NUMBER, scanned, MAX_DEVICES_LORA);
}
#endif

// ----------------------------------------------------------------

void setup() {
  Serial.begin(115200);
  delay(1000);
  scanBegin();

#if NODE_ROLE == ROLE_WIFI || NODE_ROLE == ROLE_GATEWAY
  Serial.printf("role=%s node=%s location=%s\n", NODE_ROLE == ROLE_WIFI ? "wifi" : "gateway", NODE_ID, LOCATION);
  uploaderBegin();
  nextCycleAt = millis() + sendOffsetMs(NODE_ID);
#else
  char key[16];
  snprintf(key, sizeof(key), "lora-%u", LORA_NODE_NUMBER);
  Serial.printf("role=%s node number=%u\n", NODE_ROLE == ROLE_LORA_SENDER ? "lora sender" : "uart sender", LORA_NODE_NUMBER);
  nextCycleAt = millis() + sendOffsetMs(key);
#endif

#if NODE_ROLE == ROLE_GATEWAY || NODE_ROLE == ROLE_LORA_SENDER
  if (!e220Begin(Serial1)) {
    Serial.println("E220: check wiring (M0, M1, AUX, TX, RX) and power");
  }
#endif

#if NODE_ROLE == ROLE_LORA_SENDER
  Serial2.setRxBufferSize(4096);
  Serial2.begin(LINK_BAUD, SERIAL_8N1, LINK_RX_PIN, -1);
#elif NODE_ROLE == ROLE_UART_SENDER
  Serial2.begin(LINK_BAUD, SERIAL_8N1, -1, LINK_TX_PIN);
#endif
}

void loop() {
#if NODE_ROLE == ROLE_WIFI
  if (pollScan()) sendOwnScan();

#elif NODE_ROLE == ROLE_GATEWAY
  if (pollScan()) sendOwnScan();
  gatewayPoll();

#elif NODE_ROLE == ROLE_LORA_SENDER
  Frame f;
  while (Serial2.available()) {
    if (linkReader.push(Serial2.read(), f)) {
      Serial.printf("link: frame from node %u (%u/%u)\n", f.nodeNumber, f.index + 1, f.count);
      queueFrame(linkReader.lastRaw());
    }
  }
  if (pollScan()) {
    for (auto& frame : encodeOwnScan()) queueFrame(std::move(frame));
  }
  if (!loraQueue.empty()) {
    e220Send(loraQueue.front().data(), loraQueue.front().size());
    loraQueue.pop_front();
  }

#elif NODE_ROLE == ROLE_UART_SENDER
  if (pollScan()) {
    auto frames = encodeOwnScan();
    for (const auto& frame : frames) Serial2.write(frame.data(), frame.size());
    Serial.printf("link: sent %u frames\n", (unsigned)frames.size());
  }

#else
#error "NODE_ROLE in config.h is invalid"
#endif
  delay(5);
}
