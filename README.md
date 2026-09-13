# Fun Now and Future - Backend

キャンパス内の混雑度リアルタイム可視化システム「Fun Now and Future」のバックエンド API です。
ESP32 から送信される BLE 検知データを処理し、Firestore への保存およびサイネージ・アプリ向けの混雑度データ提供を行います。


## お約束

### Github
#### Branch命名規則
- master
    - プロダクトとしてリリースするためのブランチ. 基本触らない
- develop(default)
    - 開発ブランチ． コードが安定し,リリース準備ができたら master へマージする. リリース前はこのブランチが最新バージョンとなる.
- feature
    - 機能の追加. develop から分岐し, develop にマージする.
    - feature-{任意で詳細}
- fix
    - 現在のプロダクトのバージョンに対する変更・修正用.
    - fix-{任意で詳細}
#### コミットメッセージ
- add:新機能
- fix:バグ修正
- wip:作業中（WIP：Work In Progress）
- clean:整理（削除も含む）

#### issue,Pull Requestのラベル(主に使って欲しいものを明記)
- bug バグの内容、解決したいことについて記述
- documentation ドキュメントの更新
- enhancement 新機能の開発
- help wanted 助けて欲しいこと(基本わからないことがあったらこれ書いて)
- question 質問、議論(わからないことではなく「これであっているのか不安だな」ということについて書いてください)



## 技術構成

* Runtime - Node.js 24 / TypeScript
* Framework - [`Hono`](https://hono.dev/)（`@hono/node-server`でNode.jsのHTTPサーバーとして起動）
* Database - Firebase Firestore（`firebase-admin`経由でアクセス。Cloud Run上でもFirestore自体は独立して利用可能）
* Object Storage - Google Cloud Storage（公開バケット。広報アセット配信用。`allUsers`に`roles/storage.legacyObjectReader`のみ付与し、一覧表示権限は与えない）
* Validation - Zod
* Testing - Jest / Hono `app.request`（Firestoreエミュレータを使用）
* Deploy - Docker → Cloud Run

### アーキテクチャ（層構成）
```
src/
├── index.ts               # エントリーポイント（serve()でサーバー起動のみ）
├── app.ts                 # Honoアプリの組み立て（ルーティングの登録）
├── controllers/           # HTTPの受け口（リクエスト検証・レスポンス整形）
│   ├── sensor.ts          # /receiveSensorData, /aggregate
│   └── signage.ts         # /getCongestion, /getCongestionHistory, /signage/assets
├── services/              # ビジネスロジック
│   ├── congestion.ts      # 混雑度レベルの判定
│   ├── scan_service.ts    # BLEスキャンデータの正規化・集計・重複排除
│   ├── parseRawData.ts    # BLEアドバタイジング生データのパース
│   └── PublicRelations.ts # 広報アセットの掲載期間判定・公開URL組み立て
├── repositories/          # Firestoreへの読み書きのみ
│   └── firestore.ts
├── middlewares/           # 認証・エラーハンドリングなど横断的な処理
│   ├── sensor_auth.ts     # ESP32 / 集計エンドポイント向けAPIキー検証
│   ├── signage_auth.ts    # サイネージ向けAPIキー検証（Honoミドルウェア）
│   └── error_handler.ts   # 共通エラーハンドラー（app.onErrorに登録）
├── schema/                # Zodスキーマ・型定義
│   └── sensor_data.ts
└── lib/
    └── firebase.ts        # Firebase Admin SDKの初期化
```

## 環境変数

| 変数名 | 用途 | 例 |
| --- | --- | --- |
| `PORT` | HTTPサーバーの待受ポート | `8080` |
| `GCLOUD_PROJECT` | Firestore接続先プロジェクトID | `fun-now-and-future` |
| `PR_ASSET_BUCKET` | 広報アセット公開バケット名（`GET /signage/assets`のURL組み立てに必須） | `fun-now-and-future-pr-assets` |


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
- rawDataを送る場合（Wi-Fi環境を想定, クラウドで詳細にパースし分析可能）
```json
"nodeId": "esp32_cafeteria_01",
"location": "cafeteria",
"devices": [
	{ "format": "raw", "mac": "AA:BB:CC:DD:EE:01", "rssi": -60, "rawData": "02011a020a0c" }
	{ "format": "raw", "mac": "AA:BB:CC:DD:EE:02", "rssi": -60, "rawData": "02010605ffff" }
]
```

- パース済みデータを送る場合
```json
"nodeId": "esp32_cafeteria_01",
"location": "cafeteria",
"devices": [
	{ "format": "parsed", "mac": "AA:BB:CC:DD:EE:01", "rssi": -72, "companyId": "004C", "isNearbyInfo": true }
  { "format": "parsed", "mac": "AA:BB:CC:DD:EE:02", "rssi": -72, "companyId": "00E0", "isNearbyInfo": false }
]
```

* レスポンス例 (200 OK)
- rawDataを送る場合（Wi-Fi環境を想定, クラウドで詳細にパースし分析可能）
```json
"nodeId": "esp32_cafeteria_01",
"location": "cafeteria",
"devices": [
	{ "format": "raw", "mac": "AA:BB:CC:DD:EE:01", "rssi": -60, "rawData": "02011a020a0c" },
	{ "format": "raw", "mac": "AA:BB:CC:DD:EE:02", "rssi": -60, "rawData": "02010605fffffff"}
]
```

- パース済みデータを送る場合
```json
"nodeId": "esp32_cafeteria_01",
"location": "cafeteria",
"devices": [
	{ "format": "parsed", "mac": "AA:BB:CC:DD:EE:01", "rssi": -72, "companyId": "004C", "isNearbyInfo": true }
  { "format": "parsed", "mac": "AA:BB:CC:DD:EE:02", "rssi": -72, "companyId": "00E0", "isNearbyInfo": false }
]
```

### 3. POST /aggregate
`pending_scans`に溜まったBLEスキャンデータを集計し、ロケーションごとの混雑度（`congestion_records`）とノード監視
データ（`node_health_stats`）を書き込んで、`pending_scans`を空にする。Cloud Schedulerから5分間隔で呼び出される
ことを想定した内部エンドポイント。
* 認証 - **現状なし**。外部から直接呼び出せてしまうため、Cloud Scheduler以外からの呼び出しを防ぐ対策（OIDC認証
  など）が未実装の既知の課題
* リクエストボディ - なし
* レスポンス例 (200 OK)
```json
{
  "windowStart": "2026-07-28T07:25:00.000Z",
  "scanCount": 12,
  "locationCount": 2
}
```
* `pending_scans`が0件の場合は`{ "windowStart": "...", "scanCount": 0 }`のみを返し、集計処理自体は行わない

### 4. GET /getCongestion
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

### 5. GET /getCongestionHistory
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

### 6. GET /signage/assets
掲載中の広報アセット（画像・PDF）一覧を取得。実体は返さず、GCS公開バケット上のURLを返す。
* 認証 - ヘッダー `x-api-key: <API_KEY>`
* レスポンス例 (200 OK)
```json
{
  "assets": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "title": "秋のコンテスト告知",
      "contentType": "image/jpeg",
      "url": "https://storage.googleapis.com/<bucket>/objects/550e8400-...",
      "publishUntil": "2026-10-31T14:59:59.000Z"
    }
  ]
}
```
* 掲載期間内（`status: approved`かつ`publishFrom`〜`publishUntil`の範囲内、または`publishUntil`が`null`で無期限）
  のアセットのみ返す
* 投稿・承認の手段は未実装。確認用アセットはFirestoreコンソール・`gcloud storage cp`で手動投入する運用


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
cd cloud
docker build -t fun-now-and-future-backend .
docker run -p 8080:8080 fun-now-and-future-backend
curl http://localhost:8080/health
```

## Cloud Runへのデプロイ

```bash
gcloud run deploy --source cloud
```
