#include "scan.h"
#include <NimBLEDevice.h>

static NimBLEScan* scan = nullptr;
static bool started = false;

void scanBegin() {
  NimBLEDevice::init("");
  scan = NimBLEDevice::getScan();
  // パッシブスキャン（スキャン応答は取らない）。仮の設定（hardware/README.md の13）
  scan->setActiveScan(false);
  scan->setInterval(100);
  scan->setWindow(100);
}

void scanStart(uint32_t durationMs) {
  if (scan->isScanning()) return;
  scan->clearResults();
  started = scan->start(durationMs, false);
}

bool scanTakeResults(std::vector<ScannedDevice>& out) {
  if (!started || scan->isScanning()) return false;
  started = false;

  NimBLEScanResults results = scan->getResults();
  out.clear();
  out.reserve(results.getCount());
  for (int i = 0; i < results.getCount(); i++) {
    const NimBLEAdvertisedDevice* dev = results.getDevice(i);
    int rssi = dev->getRSSI();
    const std::vector<uint8_t>& payload = dev->getPayload();
    // 範囲外や空のデータが1件でもあると、POST 全体が400になるので、その端末だけ外す
    if (payload.empty() || rssi < -127 || rssi > 20) continue;

    ScannedDevice d;
    // getVal() はリトルエンディアン（先頭が最下位のバイト）なので、表記の順に並べ替える
    const uint8_t* val = dev->getAddress().getVal();
    for (int j = 0; j < 6; j++) d.mac[j] = val[5 - j];
    d.rssi = (int8_t)rssi;
    d.payload = payload;
    out.push_back(std::move(d));
  }
  scan->clearResults();
  return true;
}

String formatMac(const uint8_t mac[6]) {
  char s[18];
  snprintf(s, sizeof(s), "%02X:%02X:%02X:%02X:%02X:%02X", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
  return String(s);
}
