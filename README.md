# Fun Now and Future - Backend

キャンパス内の混雑度リアルタイム可視化システム「Fun Now and Future」のバックエンド API です。
ESP32 から送信される BLE 検知データを処理し、Firestore への保存およびサイネージ・アプリ向けの混雑度データ提供を行います。


## 技術構成

* Runtime - Node.js 24 / TypeScript
* Framework - [`Hono`](https://hono.dev/)（`@hono/node-server`でNode.jsのHTTPサーバーとして起動）
* Database - Firebase Firestore（`firebase-admin`経由でアクセス。Cloud Run上でもFirestore自体は独立して利用可能）
* Validation - Zod
* Testing - Jest / Hono `app.request`（Firestoreエミュレータを使用）
* Deploy - Docker → Cloud Run

### アーキテクチャ（層構成）
```
src/
├── index.ts               # エントリーポイント（serve()でサーバー起動のみ）
├── app.ts                 # Honoアプリの組み立て（ルーティングの登録）
├── controllers/           # HTTPの受け口（リクエスト検証・レスポンス整形）
│   └── sensor.ts
│   └── signage.ts
├── services/              # ビジネスロジック（混雑度判定など）
│   └── congestion.ts
├── repositories/          # Firestoreへの読み書きのみ
│   └── firestore.ts
├── middlewares/           # 認証など横断的な処理
│   └── sensor_auth.ts
└── lib/
    └── firebase.ts        # Firebase Admin SDKの初期化
```


## 主な機能・エンドポイント

> Base URL: `まだデプロイしてない`

### 1. GET /health
死活監視用のエンドポイント。
```json
{ "status": "ok", "message": "Backend is running" }
```

### 2. POST /receiveSensorData
ESP32（センサー端末）から BLE 検知データを受信し、Firestore に保存。
* 認証 - ヘッダー `x-api-key: <API_KEY>`
* リクエストボディ
```json
{
  "sensor_id": "esp32_cafeteria_01",
  "location": "cafeteria",
  "ble_advertising_raw_data": ["raw_packet_1", "raw_packet_2"],
  "timestamp": "2026-07-28T07:30:00.000Z",
  "ble_mac_addresses": ["AA:BB:CC:DD:EE:01", "AA:BB:CC:DD:EE:02"]
}
```
* レスポンス例 (200 OK)
```json
{
  "status": "success",
  "message": "Data received successfully",
  "received_at": "2026-07-28T07:30:00.000Z",
  "data": { "sensor_id": "esp32_cafeteria_01", "location": "cafeteria", "...": "..." }
}
```

### 3. GET /getCongestion
指定したロケーションの最新の混雑度データを取得します。
* クエリパラメータ: `location`（必須）
* レスポンス例 (200 OK)
```json
{
  "status": "success",
  "data": {
    "sensor_id": "esp32_cafeteria_01",
    "location": "cafeteria",
    "received_at": "2026-07-28T07:30:00.000Z",
    "congestion_level": "low",
    "congestion_label": "空いている"
  }
}
```
* `congestion_level`: `low` | `medium` | `high`（`ble_device_count`が20未満/50未満/50以上で判定）

### 4. GET /getCongestionHistory
指定したロケーションの**混雑度の履歴データ**を取得。
* クエリパラメータ: `location`（必須）, `limit`（任意 / デフォルト50件, 最大50件）
* レスポンス例 (200 OK)
```json
{
  "status": "success",
  "count": 2,
  "data": [
    {
      "sensor_id": "esp32_cafeteria_01",
      "location": "cafeteria",
      "received_at": "2026-07-28T07:30:00.000Z",
      "congestion_level": "low",
      "congestion_label": "空いている"
    }
  ]
}
```


## ロケーションIDの一覧(`location`)
| location (ID) | 設置場所 | 対応するサイネージ表示 | 備考 |
| :--- | :--- | :--- | :--- |
| `cafeteria` | 学内食堂 | 左側「食堂の混雑状況」 | 食堂用の ESP32 から送信 |
| `bus_stop` | バス停留所 | 右下「バス停の混雑状況」 | バス停用の ESP32 から送信 |

---

## ローカル開発・テスト手順

### 1. 依存パッケージのインストール
```bash
npm install
```

### 2. ビルド
```bash
npm run build
```

### 3. ローカルでサーバーを起動
```bash
npm start
# または
node lib/index.js
```
`http://localhost:8080` で待ち受けます（`PORT`環境変数で変更可）。

### 4. 単体テストの実行
Firestoreエミュレータを自動起動してJestテストを実行します。
```bash
npm test
```
ローカルに `firebase` CLI（[`firebase-tools`](https://www.npmjs.com/package/firebase-tools)）が必要です。未インストールの場合は `npm install -g firebase-tools` するか、`npx firebase-tools ...` に置き換えてください。


## Dockerでのビルド・起動

```bash
cd functions
docker build -t fun-now-and-future-backend .
docker run -p 8080:8080 fun-now-and-future-backend
curl http://localhost:8080/health
```

## Cloud Runへのデプロイ

```bash
gcloud run deploy --source functions
```
