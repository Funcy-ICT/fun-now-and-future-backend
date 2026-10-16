// アドバタイズの生データから、Company ID と Apple の Nearby Info の有無を取り出す。
// LoRa では生データを送れないので、バス停のノードはここでパースして parsed 形式で送る。
// バックエンドの cloud/src/services/parseRawData.ts と同じ規則にする。変えるときは両方を変える
#pragma once
#include <Arduino.h>
#include <vector>

struct ParsedAdvertisement {
  bool hasCompanyId;
  uint16_t companyId;  // hasCompanyId が false のときは使わない
  bool isNearbyInfo;
};

ParsedAdvertisement parseAdvertisement(const std::vector<uint8_t>& data);
