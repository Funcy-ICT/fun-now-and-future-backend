// バス停のスキャン結果を、LoRa（とバス停①→②の UART）で送るためのバイナリの形式。
// LoRa は1回 200 バイトまでなので、1スキャンを複数のフレームに分けて送り、ゲートウェイでまとめ直す。
//
// フレーム（すべてリトルエンディアン）
//   0  2  マジック 0xF5 0xAA
//   2  1  形式の版（FRAME_VERSION）
//   3  1  ノード番号（LORA_NODE_NUMBER）
//   4  4  スキャン ID（スキャンごとの乱数。sendId の元になる）
//   8  1  フレームの番号（0 から）
//   9  1  フレームの数
//  10  1  このフレームの台数 n
//  11  10×n  端末: MAC 6（表記の順）、RSSI 1（符号付き）、フラグ 1、Company ID 2
//            フラグ: bit0 = Company ID がある、bit1 = Nearby Info がある
//  最後 2  CRC-16（マジックから端末の最後まで）
#pragma once
#include <Arduino.h>
#include <vector>
#include "scan.h"

static const uint8_t FRAME_MAGIC0 = 0xF5;
static const uint8_t FRAME_MAGIC1 = 0xAA;
static const uint8_t FRAME_VERSION = 1;
static const size_t FRAME_HEADER_SIZE = 11;
static const size_t FRAME_DEVICE_SIZE = 10;
static const size_t FRAME_CRC_SIZE = 2;
static const size_t FRAME_MAX_SIZE = 200;  // E220 のサブパケット長
static const size_t FRAME_MAX_DEVICES = (FRAME_MAX_SIZE - FRAME_HEADER_SIZE - FRAME_CRC_SIZE) / FRAME_DEVICE_SIZE;  // 18台

struct FrameDevice {
  uint8_t mac[6];
  int8_t rssi;
  bool hasCompanyId;
  uint16_t companyId;
  bool isNearbyInfo;
};

struct Frame {
  uint8_t nodeNumber;
  uint32_t scanId;
  uint8_t index;
  uint8_t count;
  std::vector<FrameDevice> devices;
};

// 1回のスキャンの結果を、フレームのバイト列に分ける。0台でもフレームを1つ作る（devices: [] を届けるため）
std::vector<std::vector<uint8_t>> encodeScan(uint8_t nodeNumber, const std::vector<ScannedDevice>& devices, size_t maxDevices);

// バイト列からフレームを1つずつ取り出す。届いたバイトを順に入れ、フレームが揃ったら true を返す。
// マジックで頭を探し、CRC が合わないものは捨てる
class FrameReader {
 public:
  bool push(uint8_t b, Frame& out);
  // 最後に取り出したフレームのバイト列。バス停②が、バス停①のフレームをそのまま LoRa で送るために使う
  const std::vector<uint8_t>& lastRaw() const { return raw; }

 private:
  std::vector<uint8_t> buf;
  std::vector<uint8_t> raw;
  bool tryDecode(Frame& out);
};
