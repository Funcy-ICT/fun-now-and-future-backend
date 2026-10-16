#include "e220.h"
#include "config.h"

static HardwareSerial* port = nullptr;

void e220WaitIdle(uint32_t timeoutMs) {
  uint32_t start = millis();
  while (digitalRead(E220_AUX_PIN) == LOW && millis() - start < timeoutMs) delay(1);
  delay(2);  // AUX が High になってから 2ms は待つ（データシート 5.6.4）
}

static void setMode(bool m0, bool m1) {
  e220WaitIdle();
  digitalWrite(E220_M0_PIN, m0 ? HIGH : LOW);
  digitalWrite(E220_M1_PIN, m1 ? HIGH : LOW);
  delay(2);
  e220WaitIdle();
}

bool e220Begin(HardwareSerial& serial) {
  port = &serial;
  pinMode(E220_M0_PIN, OUTPUT);
  pinMode(E220_M1_PIN, OUTPUT);
  pinMode(E220_AUX_PIN, INPUT);
  // 設定もデータも 9600bps で通す（設定は 9600bps でしかできないため、切り替えを省く）
  port->setRxBufferSize(4096);  // スキャンや HTTP の送信中に届いた分を取りこぼさない
  port->begin(9600, SERIAL_8N1, E220_RX_PIN, E220_TX_PIN);

  // mode 3（設定）
  setMode(true, true);

  // 00H から 8 バイト: ADDH, ADDL, REG0, REG1, REG2, REG3, CRYPT_H, CRYPT_L
  const uint8_t reg0 = (0b011 << 5) | (LORA_AIR_RATE & 0x1F);  // UART 9600bps、伝送速度
  const uint8_t reg1 = 0b01;  // サブパケット 200 バイト、環境ノイズ RSSI 無効、送信出力 13dBm（出荷時は「使用不可」）
  const uint8_t reg2 = LORA_CHANNEL;
  const uint8_t reg3 = 0x03;  // RSSI バイト無効、透過送信、WOR 2000ms（使わない）
  const uint8_t cmd[] = {0xC0, 0x00, 0x08, 0x00, 0x00, reg0, reg1, reg2, reg3,
                         (uint8_t)(LORA_CRYPT_KEY >> 8), (uint8_t)(LORA_CRYPT_KEY & 0xFF)};
  while (port->available()) port->read();
  port->write(cmd, sizeof(cmd));
  port->flush();

  // 応答は C1 00 08 と書いた値。暗号キーは読み出せないので 0 で返る
  uint8_t res[11];
  size_t got = port->readBytes(res, sizeof(res));
  bool ok = got == sizeof(res) && res[0] == 0xC1 && res[1] == 0x00 && res[2] == 0x08
            && res[5] == reg0 && res[6] == reg1 && res[7] == reg2 && res[8] == reg3;
  Serial.printf("E220: config %s (channel %d, %.1f MHz)\n", ok ? "ok" : "FAILED",
                LORA_CHANNEL, 920.6 + LORA_CHANNEL * 0.2);

  // mode 0（ノーマル）
  setMode(false, false);
  while (port->available()) port->read();
  return ok;
}

void e220Send(const uint8_t* data, size_t len) {
  e220WaitIdle();
  port->write(data, len);
  port->flush();
  // 次のフレームとつながって1つのパケットにならないよう、送り終わるまで待つ
  delay(10);
  e220WaitIdle();
}
