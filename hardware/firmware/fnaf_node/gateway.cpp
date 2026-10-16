#include "gateway.h"
#include <Arduino.h>
#include <map>
#include "config.h"
#include "frame.h"
#include "uploader.h"

// 1スキャン分のフレームが揃うのを待つ時間。過ぎたら、届いた分だけで送る
static const uint32_t REASSEMBLY_TIMEOUT_MS = 30 * 1000;
// まとめ直しを待つスキャンの数の上限。壊れたフレームで溜まり続けないようにする
static const size_t MAX_REASSEMBLY = 16;

struct PendingScan {
  uint8_t count;
  uint32_t receivedMask;
  uint32_t firstAt;
  std::vector<FrameDevice> devices;
};
// キーは (ノード番号 << 32) | スキャン ID
static std::map<uint64_t, PendingScan> reassembly;
static FrameReader reader;

static const LoraNode* findLoraNode(uint8_t number) {
  for (const LoraNode& n : LORA_NODES) {
    if (n.number == number) return &n;
  }
  return nullptr;
}

// バス停の1スキャン分を parsed 形式で送る。届いたフレームが0台だけでも devices: [] で送る
static void enqueueScan(uint8_t nodeNumber, const PendingScan& s) {
  const LoraNode* node = findLoraNode(nodeNumber);
  if (!node) {
    Serial.printf("lora: unknown node %u, dropped\n", nodeNumber);
    return;
  }
  String json = jsonHead(node->nodeId, node->location);
  json.reserve(json.length() + s.devices.size() * 100);
  for (size_t i = 0; i < s.devices.size(); i++) {
    const FrameDevice& d = s.devices[i];
    if (i > 0) json += ',';
    json += "{\"format\":\"parsed\",\"mac\":\"";
    json += formatMac(d.mac);
    json += "\",\"rssi\":";
    json += (int)d.rssi;  // int8_t のままだと文字として足される
    json += ",\"companyId\":";
    if (d.hasCompanyId) {
      char id[7];
      snprintf(id, sizeof(id), "\"%04X\"", d.companyId);
      json += id;
    } else {
      json += "null";
    }
    json += ",\"isNearbyInfo\":";
    json += d.isNearbyInfo ? "true" : "false";
    json += '}';
  }
  json += "]}";
  Serial.printf("lora: node %u, %u devices, %d/%u frames\n", nodeNumber, (unsigned)s.devices.size(),
                __builtin_popcount(s.receivedMask), s.count);
  uploaderEnqueue(json);
}

void gatewayPoll() {
  Frame f;
  while (Serial1.available()) {
    if (!reader.push(Serial1.read(), f)) continue;
    if (f.count == 0 || f.count > 32 || f.index >= f.count) continue;
    uint64_t key = ((uint64_t)f.nodeNumber << 32) | f.scanId;
    if (reassembly.find(key) == reassembly.end() && reassembly.size() >= MAX_REASSEMBLY) {
      Serial.println("lora: too many scans waiting, frame dropped");
      continue;
    }
    PendingScan& s = reassembly[key];
    if (s.receivedMask == 0) {
      s.count = f.count;
      s.firstAt = millis();
    }
    if (s.receivedMask & (1u << f.index)) continue;  // 同じフレームが2回届いた
    s.receivedMask |= 1u << f.index;
    s.devices.insert(s.devices.end(), f.devices.begin(), f.devices.end());
  }

  // 揃ったもの、待ちすぎたものを送る
  bool queued = false;
  for (auto it = reassembly.begin(); it != reassembly.end();) {
    const PendingScan& s = it->second;
    bool complete = __builtin_popcount(s.receivedMask) == s.count;
    if (complete || millis() - s.firstAt > REASSEMBLY_TIMEOUT_MS) {
      enqueueScan(it->first >> 32, s);
      it = reassembly.erase(it);
      queued = true;
    } else {
      ++it;
    }
  }
  if (queued) uploaderFlush();
}
