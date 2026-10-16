#include "frame.h"
#include "adv_parse.h"

// CRC-16/CCITT-FALSE
static uint16_t crc16(const uint8_t* data, size_t len) {
  uint16_t crc = 0xFFFF;
  for (size_t i = 0; i < len; i++) {
    crc ^= (uint16_t)data[i] << 8;
    for (int b = 0; b < 8; b++) {
      crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1;
    }
  }
  return crc;
}

std::vector<std::vector<uint8_t>> encodeScan(uint8_t nodeNumber, const std::vector<ScannedDevice>& devices, size_t maxDevices) {
  uint32_t scanId = esp_random();
  size_t total = min(devices.size(), maxDevices);
  size_t frameCount = max((size_t)1, (total + FRAME_MAX_DEVICES - 1) / FRAME_MAX_DEVICES);

  std::vector<std::vector<uint8_t>> frames;
  for (size_t f = 0; f < frameCount; f++) {
    size_t from = f * FRAME_MAX_DEVICES;
    size_t n = min(FRAME_MAX_DEVICES, total - from);

    std::vector<uint8_t> b;
    b.reserve(FRAME_HEADER_SIZE + n * FRAME_DEVICE_SIZE + FRAME_CRC_SIZE);
    b.push_back(FRAME_MAGIC0);
    b.push_back(FRAME_MAGIC1);
    b.push_back(FRAME_VERSION);
    b.push_back(nodeNumber);
    for (int i = 0; i < 4; i++) b.push_back((scanId >> (8 * i)) & 0xFF);
    b.push_back((uint8_t)f);
    b.push_back((uint8_t)frameCount);
    b.push_back((uint8_t)n);
    for (size_t i = from; i < from + n; i++) {
      const ScannedDevice& d = devices[i];
      ParsedAdvertisement p = parseAdvertisement(d.payload);
      b.insert(b.end(), d.mac, d.mac + 6);
      b.push_back((uint8_t)d.rssi);
      b.push_back((p.hasCompanyId ? 0x01 : 0) | (p.isNearbyInfo ? 0x02 : 0));
      b.push_back(p.companyId & 0xFF);
      b.push_back(p.companyId >> 8);
    }
    uint16_t crc = crc16(b.data(), b.size());
    b.push_back(crc & 0xFF);
    b.push_back(crc >> 8);
    frames.push_back(std::move(b));
  }
  return frames;
}

bool FrameReader::push(uint8_t b, Frame& out) {
  buf.push_back(b);
  // 頭がマジックでなければ、ずらして探し直す
  while (!buf.empty() && buf[0] != FRAME_MAGIC0) buf.erase(buf.begin());
  if (buf.size() >= 2 && buf[1] != FRAME_MAGIC1) {
    buf.erase(buf.begin());
    return false;
  }
  return tryDecode(out);
}

bool FrameReader::tryDecode(Frame& out) {
  if (buf.size() < FRAME_HEADER_SIZE) return false;
  size_t n = buf[10];
  if (buf[2] != FRAME_VERSION || n > FRAME_MAX_DEVICES) {
    buf.erase(buf.begin());
    return false;
  }
  size_t size = FRAME_HEADER_SIZE + n * FRAME_DEVICE_SIZE + FRAME_CRC_SIZE;
  if (buf.size() < size) return false;

  uint16_t crc = (uint16_t)buf[size - 2] | ((uint16_t)buf[size - 1] << 8);
  if (crc != crc16(buf.data(), size - 2)) {
    Serial.println("frame: CRC mismatch, skipped");
    buf.erase(buf.begin());
    return false;
  }

  out.nodeNumber = buf[3];
  out.scanId = (uint32_t)buf[4] | ((uint32_t)buf[5] << 8) | ((uint32_t)buf[6] << 16) | ((uint32_t)buf[7] << 24);
  out.index = buf[8];
  out.count = buf[9];
  out.devices.clear();
  for (size_t i = 0; i < n; i++) {
    const uint8_t* p = &buf[FRAME_HEADER_SIZE + i * FRAME_DEVICE_SIZE];
    FrameDevice d;
    memcpy(d.mac, p, 6);
    d.rssi = (int8_t)p[6];
    d.hasCompanyId = p[7] & 0x01;
    d.isNearbyInfo = p[7] & 0x02;
    d.companyId = (uint16_t)p[8] | ((uint16_t)p[9] << 8);
    out.devices.push_back(d);
  }
  raw.assign(buf.begin(), buf.begin() + size);
  buf.erase(buf.begin(), buf.begin() + size);
  return true;
}
