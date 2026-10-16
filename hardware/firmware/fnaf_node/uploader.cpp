#include "uploader.h"
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <deque>
#include "config.h"

// 送れなかった分をためる量の上限（バイト）。超えたら古いものから捨てる。値は仮（hardware/README.md の9）
static const size_t MAX_PENDING_BYTES = 64 * 1024;
static const uint32_t HTTP_TIMEOUT_MS = 10 * 1000;

static std::deque<String> pending;
static size_t pendingBytes = 0;

static WiFiClient plainClient;
static WiFiClientSecure secureClient;
static HTTPClient http;
static bool useTls = false;

String makeUuid() {
  uint8_t b[16];
  for (int i = 0; i < 16; i += 4) {
    uint32_t r = esp_random();
    memcpy(b + i, &r, 4);
  }
  b[6] = (b[6] & 0x0F) | 0x40;
  b[8] = (b[8] & 0x3F) | 0x80;
  char s[37];
  snprintf(s, sizeof(s),
           "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
           b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7],
           b[8], b[9], b[10], b[11], b[12], b[13], b[14], b[15]);
  return String(s);
}

String jsonHead(const char* nodeId, const char* location) {
  String json = "{\"sendId\":\"";
  json += makeUuid();
  json += "\",\"nodeId\":\"";
  json += nodeId;
  json += "\",\"location\":\"";
  json += location;
  json += "\",\"devices\":[";
  return json;
}

static void connectWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.printf("WiFi: connecting to %s\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    delay(250);
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("WiFi: connected, ip=%s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("WiFi: not connected");
  }
}

void uploaderBegin() {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  connectWifi();

  useTls = String(API_URL).startsWith("https://");
  if (useTls) {
    if (strlen(ROOT_CA) == 0) {
      // 証明書を検証できないまま送ることはしない
      Serial.println("ROOT_CA is empty. Set it in config.h to use https. Stopped.");
      while (true) delay(1000);
    }
    secureClient.setCACert(ROOT_CA);
  }
  http.setReuse(true);
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.setConnectTimeout(HTTP_TIMEOUT_MS);
}

void uploaderEnqueue(const String& json) {
  pending.push_back(json);
  pendingBytes += json.length();
  while (pendingBytes > MAX_PENDING_BYTES && pending.size() > 1) {
    pendingBytes -= pending.front().length();
    pending.pop_front();
    Serial.println("queue: dropped the oldest payload (limit reached)");
  }
}

// 1件送る。戻り値は HTTP のステータス。接続できなかったときは負の値
static int post(const String& json) {
  bool ok = useTls ? http.begin(secureClient, API_URL) : http.begin(plainClient, API_URL);
  if (!ok) return -1;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-api-key", API_KEY);
  int status = http.POST(json);
  // 応答の本文は読まない。200 か、4xx か、5xx かだけで判断する
  http.end();  // setReuse(true) なので、接続は閉じずに次の送信で使い回す
  return status;
}

// 4xx はデータが不正なので、再送しても通らない。捨てて次へ進む。
// 5xx と接続の失敗は、残して次の周期に再送する。後ろの分も送らずに打ち切る
void uploaderFlush() {
  connectWifi();
  if (WiFi.status() != WL_CONNECTED) {
    Serial.printf("send: skipped (no WiFi), %u queued\n", (unsigned)pending.size());
    return;
  }
  while (!pending.empty()) {
    int status = post(pending.front());
    if (status >= 200 && status < 300) {
      Serial.printf("send: %d\n", status);
    } else if (status >= 400 && status < 500) {
      Serial.printf("send: %d, dropped (not retried)\n", status);
    } else {
      Serial.printf("send: failed (%d), %u queued\n", status, (unsigned)pending.size());
      return;
    }
    pendingBytes -= pending.front().length();
    pending.pop_front();
  }
}
