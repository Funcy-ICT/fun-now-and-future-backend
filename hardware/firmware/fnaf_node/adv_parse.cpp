#include "adv_parse.h"

// [長さ][型][中身] の繰り返しを読み、最初の Manufacturer Specific Data（型 0xFF）だけを見る
ParsedAdvertisement parseAdvertisement(const std::vector<uint8_t>& data) {
  ParsedAdvertisement result = {false, 0, false};
  size_t pos = 0;
  while (pos < data.size()) {
    uint8_t length = data[pos];
    if (length == 0) break;
    if (pos + 1 >= data.size()) break;  // データが途中で切れている
    uint8_t type = data[pos + 1];
    if (type == 0xFF) {
      // Company ID はリトルエンディアン。2バイト揃っている場合だけ採用する
      if (pos + 3 < data.size()) {
        result.hasCompanyId = true;
        result.companyId = (uint16_t)data[pos + 2] | ((uint16_t)data[pos + 3] << 8);
      }
      if (result.hasCompanyId && result.companyId == 0x004C) {
        // Apple Continuity は [型][長さ][中身] の繰り返し。0x10 が Nearby Info
        size_t apple = pos + 4;
        size_t end = pos + 1 + length;
        while (apple < end) {
          if (apple + 1 >= data.size()) break;  // 中身が途中で切れている
          if (data[apple] == 0x10) result.isNearbyInfo = true;
          apple += 2 + data[apple + 1];
        }
      }
      break;
    }
    pos += 1 + length;
  }
  return result;
}
