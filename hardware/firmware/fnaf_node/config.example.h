// このファイルを同じフォルダに config.h という名前でコピーし、値を書き換える。
// config.h には Wi-Fi のパスワードと API キーが入るので、git には入れない（hardware/firmware/.gitignore）。
// ノードごとに、NODE_ROLE と NODE_ID などを変えて書き込む。
#pragma once

// ---- ノードの役割 ----
// ROLE_WIFI        : BLE をスキャンし、Wi-Fi でクラウドへ送る（食堂①）
// ROLE_GATEWAY     : ROLE_WIFI に加えて、LoRa で受けたバス停の分もクラウドへ送る（食堂②）
// ROLE_LORA_SENDER : BLE をスキャンし、自分の分と UART で受けたバス停①の分を LoRa で送る（バス停②）
// ROLE_UART_SENDER : BLE をスキャンし、UART でバス停②へ渡す（バス停①）
#define ROLE_WIFI        1
#define ROLE_GATEWAY     2
#define ROLE_LORA_SENDER 3
#define ROLE_UART_SENDER 4
#define NODE_ROLE ROLE_WIFI

// ---- ノードと場所（ROLE_WIFI、ROLE_GATEWAY）----
// nodeId はノードごとに変える。命名規則は未定（hardware/README.md の5）
#define NODE_ID  "esp32_cafeteria_01"
#define LOCATION "cafeteria"

// ---- バス停のノード番号（ROLE_LORA_SENDER、ROLE_UART_SENDER）----
// LoRa では文字列の nodeId を送らず、1バイトの番号だけを送る。番号から nodeId と location への対応は、
// ゲートウェイの LORA_NODES に書く。バス停①は1、バス停②は2
#define LORA_NODE_NUMBER 1

// ---- Wi-Fi と送信先（ROLE_WIFI、ROLE_GATEWAY）----
// WPA2-Personal を想定。eduroam のような企業認証には、まだ対応していない
#define WIFI_SSID     "your-ssid"
#define WIFI_PASSWORD "your-password"

// デプロイ前は、動作確認用の受け口（tools/mock_server.mjs）を動かした Mac の IP アドレスを書く
#define API_URL "http://192.168.1.10:8080/receiveSensorData"

// x-api-key に付ける値
#define API_KEY "local-dev-key"

// API_URL が https のときに使うルート証明書（PEM）。http のときは使わない。
// 証明書の検証は切らない（setInsecure() は使わない）。https で空のままなら、送信しない。
static const char ROOT_CA[] = "";

// ---- ゲートウェイが受けるバス停のノード（ROLE_GATEWAY）----
struct LoraNode {
  uint8_t number;        // バス停側の LORA_NODE_NUMBER
  const char* nodeId;
  const char* location;
};
static const LoraNode LORA_NODES[] = {
  {1, "esp32_busstop_01", "busstop"},
  {2, "esp32_busstop_02", "busstop"},
};

// ---- LoRa（E220-900T22S(JP)）の設定（ROLE_GATEWAY、ROLE_LORA_SENDER）----
// 送る側と受ける側で、チャンネル、伝送速度、暗号キーを同じにする。
// チャンネルは 0〜14 にする。BW125kHz で 15 以上を選ぶと、送信時間が 400ms に制限され、1回に 32 バイトしか送れない
#define LORA_CHANNEL   0
// 伝送速度。REG0 の下位5ビット。0b01000 = 5,469bps（SF7、BW125kHz）。200バイトの送信で約0.4秒
#define LORA_AIR_RATE  0b01000
// 暗号キー（2バイト）。0 以外にすると、同じモジュールでも傍受されにくくなる
#define LORA_CRYPT_KEY 0x0000

// E220 とつなぐピン（ESP32-S3 の GPIO 番号）
#define E220_TX_PIN  17  // ESP32 の TX → E220 の RXD
#define E220_RX_PIN  18  // ESP32 の RX ← E220 の TXD
#define E220_M0_PIN  5
#define E220_M1_PIN  6
#define E220_AUX_PIN 7

// ---- バス停①と②をつなぐ UART（ROLE_LORA_SENDER、ROLE_UART_SENDER）----
// バス停①の TX をバス停②の RX につなぎ、GND も共通にする
#define LINK_TX_PIN 16  // バス停①が使う
#define LINK_RX_PIN 15  // バス停②が使う
#define LINK_BAUD   115200
