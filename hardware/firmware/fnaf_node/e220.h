// LoRa モジュール E220-900T22S(JP) の制御。データシートは hardware/dataSheet/
// 透過送信モード（同じアドレス、同じチャンネルのモジュール同士で届く）で使う
#pragma once
#include <Arduino.h>

// 起動時に呼ぶ。設定（mode 3）でレジスタを書き、ノーマルモード（mode 0）に戻す。書けなければ false
bool e220Begin(HardwareSerial& serial);
// 送信が終わる（AUX が High になる）まで待つ
void e220WaitIdle(uint32_t timeoutMs = 5000);
// 1フレームを送る。200 バイト以下にする
void e220Send(const uint8_t* data, size_t len);
