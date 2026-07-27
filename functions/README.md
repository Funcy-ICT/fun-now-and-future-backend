# Fun Now and Future - Backend

キャンパス内の混雑度リアルタイム可視化システム「Fun Now and Future」のバックエンド API（Firebase Cloud Functions v2）です。
ESP32 から送信される BLE 端末検知データを処理し、Firestore への保存およびサイネージ・アプリ向けの混雑度データ提供を行います。

---

## 🛠 技術構成

* **Runtime**: Node.js / TypeScript
* **Framework**: Firebase Cloud Functions (v2) + Hono
* **Database**: Firebase Firestore
* **Validation**: Zod
* **Testing**: Jest / Hono `app.request`

---

## 🚀 主な機能・エンドポイント

> **Base URL**: `まだデプロイしてない`

### 1. `POST /receiveSensorData`
ESP32（センサー端末）から BLE デバイス数データを受信し、Firestore に保存。
* **認証**: ヘッダー `x-api-key: <API_KEY>`
* **リクエストボディ**:
```json
{
	"sensor_id": "esp32_cafeteria_01",
	"location": "cafeteria",
	"ble_device_count": 12,
}

---

### 2. `GET /getCongestion`
指定したロケーションの**最新の混雑度データ**を取得します。
* **クエリパラメータ**: `location` (必須)
* **レスポンス例(200 OK)**
```json
{
  "status": "success",
  "data": {
    "location": "cafeteria",
    "congestion_level": "low", // "low" | "medium" | "high"
    "label": "空いています",
    "wait_time": "待ち時間0〜3分",
    "ble_device_count": 5,
    "updated_at": "2026-07-27T07:30:00.000Z",
  }
}
```

### 3. `GET /getCongestionHistory`
指定したロケーションの**混雑度の履歴データ**を取得。
* **クエリパラメータ**: `location` (必須), `limit` (任意 / デフォルト10件, 最大50件)
**レスポンス例(200 OK)**
```json
{
  "status": "success",
  "data": [
    {
      "location": "cafeteria",
      "ble_device_count": 15,
      "received_at": "2026-07-27T07:30:00.000Z"
    }
  ]
}
```
---

## ロケーションIDの一覧(`location`)
| location (ID) | 設置場所 | 対応するサイネージ表示 | 備考 |
| :--- | :--- | :--- | :--- |
| `cafeteria` | 学内食堂 | 左側「食堂の混雑状況」 | 食堂用の ESP32 から送信 |
| `bus_stop` | バス停留所 | 右下「バス停の混雑状況」 | バス停用の ESP32 から送信 |

---

## 🧪 ローカル開発・テスト手順

### 1. 依存パッケージのインストール
```bash
npm install
```

### 2. 単体テストの実行
Firestore エミュレータ環境で Jest によるテストを実行します。
```bash
npm test
```

### 3. ローカルエミュレータの起動
```bash
npm run serve
```

