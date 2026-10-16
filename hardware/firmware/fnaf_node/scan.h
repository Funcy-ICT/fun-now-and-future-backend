// BLE のスキャン。スキャン中も loop() が回るよう、非同期で行う
#pragma once
#include <Arduino.h>
#include <vector>

struct ScannedDevice {
  uint8_t mac[6];  // 表記の順（先頭が最上位のバイト）
  int8_t rssi;
  std::vector<uint8_t> payload;  // アドバタイズの生データ
};

void scanBegin();
// スキャンを始める。すでにスキャン中なら何もしない
void scanStart(uint32_t durationMs);
// スキャンが終わっていれば結果を out に入れて true を返す。結果は1回だけ返す
bool scanTakeResults(std::vector<ScannedDevice>& out);

// MAC を「AA:BB:CC:DD:EE:FF」（大文字、コロン区切り）にする
String formatMac(const uint8_t mac[6]);
