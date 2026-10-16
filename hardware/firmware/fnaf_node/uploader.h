// Wi-Fi への接続と、POST /receiveSensorData への送信。送れなかった分はためて、次の周期に再送する
#pragma once
#include <Arduino.h>

void uploaderBegin();
// 送る JSON をためる。sendId は JSON に入れておくので、再送でも同じ値になる
void uploaderEnqueue(const String& json);
// ためている分を古い順に送る
void uploaderFlush();

// 送信ごとの UUID（v4）
String makeUuid();

// 送る JSON の、devices の配列の手前まで。sendId はここで振る
String jsonHead(const char* nodeId, const char* location);
