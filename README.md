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
├── app.ts                 # Honoアプリの組み立て（SERVICE_ROLEごとのルーティングの登録）
├── controllers/           # HTTPの受け口（リクエスト検証・レスポンス整形）
│   ├── sensor.ts          # /receiveSensorData, /aggregate
│   ├── pubsub_push.ts     # /pubsub/scan-events（Pub/Subのプッシュを受けてpending_scansに保存）
│   ├── signage.ts         # /getCongestion, /getCongestionHistory, /signage/assets
│   └── batch.ts           # /internal/batch/calc-max-device
├── services/              # ビジネスロジック
│   ├── congestion.ts      # 混雑度レベル(1〜9)の判定（toLevel）
│   ├── scan_service.ts    # BLEスキャンデータの正規化・集計・重複排除
│   ├── parseRawData.ts    # BLEアドバタイジング生データのパース
│   ├── PublicRelations.ts # 広報アセットの掲載期間判定・公開URL組み立て
│   ├── mac.ts             # macアドレスの正規化・ハッシュ化(HMAC-SHA256)・アドレス種別の推定
│   ├── scan_event.ts      # 受信したデータからPub/Subに流すメッセージ(ScanEvent)を組み立てる
│   └── max_devices_batch.ts # 基準値(max_devices)の遡り方式での算出バッチ
├── repositories/          # Firestore, Pub/Subへの読み書きのみ
│   ├── firestore.ts
│   └── pubsub.ts          # メッセージをPub/Subのトピックにpublish
├── middlewares/           # 認証・エラーハンドリングなど横断的な処理
│   ├── sensor_auth.ts     # ESP32 / 集計・バッチエンドポイント向けAPIキー検証
│   ├── signage_auth.ts    # サイネージ向けAPIキー検証（Honoミドルウェア）
│   └── error_handler.ts   # 共通エラーハンドラー（app.onErrorに登録）
├── schema/                # Zodスキーマ・型定義
│   ├── sensor_data.ts
│   └── scan_event.ts      # Pub/Subに流すメッセージ(BigQueryのscan_eventsテーブルに対応)
└── lib/
    ├── firebase.ts        # Firebase Admin SDKの初期化
    ├── hash_key.ts        # macアドレスのハッシュ化に使う鍵の読み込み
    └── pubsub.ts          # Pub/Subクライアントの初期化
```

`cloud/bigquery/scan_events.schema.json`は、BigQueryのテーブル`scan_events`の列の定義。`ScanEventSchema`との突き合わせテストで使う。

## 環境変数

| 変数名 | 用途 | 例 |
| --- | --- | --- |
| `PORT` | HTTPサーバーの待受ポート | `8080` |
| `GCLOUD_PROJECT` | Firestore接続先プロジェクトID | `fun-now-and-future` |
| `PR_ASSET_BUCKET` | 広報アセット公開バケット名（`GET /signage/assets`のURL組み立てに必須） | `fun-now-and-future-pr-assets` |
| `MAC_HASH_KEY` | macアドレスをハッシュ化(HMAC-SHA256)する鍵。32文字以上。Secret Managerの値を環境変数にマウントして渡す。未設定や短すぎる場合は起動に失敗する | （値はリポジトリに置かない） |
| `SCAN_EVENTS_TOPIC` | 受信したデータをpublishするPub/Subのトピック名。受信のサービスでは必須で、未設定だと起動に失敗する | `scan-events` |
| `SERVICE_ROLE` | `ingest`（受信）か`worker`（処理）。未設定なら全部のルートを載せる（ローカル、テスト用）。知らない値だと起動に失敗する | `ingest` |

## Firestore設定ドキュメント

環境変数とは別に、以下のFirestoreドキュメントを事前に用意する必要がある。

| ドキュメント | 用途 | 必須/任意 |
| --- | --- | --- |
| `config/locations` | 集計対象のlocation一覧（`{ ids: string[] }`）。`/aggregate`と基準値計算バッチが、どのlocationを処理対象とするかをここから読む | **必須**。無いと`/aggregate`がどのlocationも処理せず、`congestion_records`が一切書かれなくなる |
| `config/diagnostics` | `{ enabled: boolean }`。フィルタ通過状況の診断データ（`scan_diagnostics`）への書き込みON/OFF | 任意。無ければOFF扱い（安全側） |
| `config/academic_calendar` | 学期期間・休業日の一覧。基準値計算バッチの統計的な有効日判定より優先して適用される | 任意。無ければ統計判定のみで動作する |

`max_devices/{location}_{weekday}` は、基準値計算バッチが自動生成するまでの間（運用開始直後・長期休業明けなど）、手動でFirestoreコンソールから投入する必要がある場合がある（下記「基準値の手動投入」参照）。


## 主な機能・エンドポイント

> Base URL: `まだデプロイしてない`

### 1. GET /health
死活監視用のエンドポイント。
```json
{ "status": "ok", "message": "Backend is running" }
```

### 2. POST /receiveSensorData
ESP32（センサー端末）から BLE 検知データを受信し、Firestore に保存。
macアドレスは受信の時点でハッシュ化（HMAC-SHA256）し、Firestoreにもハッシュ化した値だけを保存する。
併せて、ハッシュ化した検出データ（rawの場合はパース結果と`rawData`も含む）をPub/Subのトピックにpublishする（BigQueryへの蓄積用）。
publishに失敗しても、Firestoreへの保存が入口の間は200を返し、ログに残す。
* 認証 - ヘッダー `x-api-key: <API_KEY>`
* 受け付ける値
  * `sendId`（任意） - 送信ごとのUUID。再送のときは同じ値を使う。64文字以下
  * `mac` - 区切り文字と大文字小文字は問わない。12桁の16進数でなければ400（`mac is invalid`）
  * `rssi` - -127から20まで。範囲外が1台でも含まれると400になり、そのPOST全体が捨てられる
  * `devices` - 256件まで。0件でもよい
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

* レスポンス例 (200 OK)。受信したデータの写しは返さない。ESP32の送受信の時間を短くするため
```json
{
  "status": "success",
  "message": "Data received successfully",
  "received_at": "2026-09-20T12:00:00.000Z",
  "sendId": null
}
```
`sendId`は、リクエストで送られてきた値。無ければ`null`。

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
* `config/locations`に登録されている全location分の`congestion_records`を毎回必ず書く。デバイスが1台も検出され
  なかったlocationについても`uniqueDeviceCount: 0`で明示的に記録する（後続の基準値計算バッチが、ノード停止によ
  る欠測と「誰もいなかった」を区別するために必要）
* `config/diagnostics.enabled`が`true`の場合、location単位でフィルタ通過状況を`scan_diagnostics`に記録する。
  記録される内容にmacアドレスは含まれない（1回の集計run限りのランダムUUIDに置き換えられる）

### 4. POST /internal/batch/calc-max-device
`congestion_records`の履歴から、locationごと・曜日ごとの基準値（`max_devices`）を算出する日次バッチ。Cloud
Schedulerから1日1回（04:00 JST想定）呼び出されることを想定した内部エンドポイント。
* 認証 - **現状なし**（`/aggregate`と同じ既知の課題）
* リクエストボディ - なし
* レスポンス例 (200 OK)
```json
{ "succeeded": 33, "failed": 2 }
```
* 直近の同一曜日から遡り、ノード停止や長期休業の影響を受けていない「有効な日」を規定日数集めてから基準値を算出
  する。有効な日が集まらない場合は、既存の基準値を書き換えずに据え置く（凍結）
* `(location, weekday)`単位で独立して実行され、1件の失敗が他のlocation・曜日に影響しない

### 5. GET /getCongestion
指定したロケーションの最新の混雑度データを取得します。
* クエリパラメータ: `location`（必須）
* レスポンス例 (200 OK)
```json
{
  "status": "success",
  "data": {
    "location": "cafeteria",
    "windowStart": "2026-07-28T07:30:00.000Z",
    "uniqueDeviceCount": 12,
    "level": 3,
    "stale": false
  }
}
```
* `level`: `1`（空いている）〜`9`（非常に混雑）の整数、または`null`。**同じ場所・同じ曜日の中でのみ意味を持つ
  相対値であり、別の場所同士を比較することはできない**
* `level: null`には2つの意味があり、`stale`で区別する: `stale: true`なら直近15分以内にデータが更新されていな
  い（センサー停止の可能性）、`stale: false`なら最新データは取れているが基準値がまだ計算できていない（運用開
  始直後・長期休業明け直後のキャリブレーション中）
* レスポンス契約の詳細は`api_contract_congestion_endpoints.md`（フロント向け）を参照

### 6. GET /getCongestionHistory
指定したロケーションの**混雑度の履歴データ**を取得。
* クエリパラメータ: `location`（必須）, `limit`（任意 / デフォルト50件, 最大50件）
* レスポンス例 (200 OK)
```json
{
  "status": "success",
  "count": 2,
  "data": [
    {
      "location": "cafeteria",
      "windowStart": "2026-07-28T07:30:00.000Z",
      "uniqueDeviceCount": 12,
      "level": 3
    }
  ]
}
```
* 履歴の各要素に`stale`は含まれない（過去のデータに対して同じ意味を持たないため）

### 7. GET /signage/assets
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

`config/locations`にもこの一覧を反映させること（デプロイ前必須）。

## 基準値（max_devices）の手動投入

基準値計算バッチが初めて成功するまでの間（運用開始直後・長期休業明け直後）は、`GET /getCongestion`が
`level: null`（キャリブレーション中）を返し続ける。デモ等で暫定的にlevelを出したい場合は、Firestoreコンソール
から`max_devices/{location}_{weekday}`を手動で作成する。フィールド構成は`max_devices_batch.ts`が書き込む
形式（`baseline`, `percentile`, `p50`, `p05`, `windowStartHour`, `windowEndHour`, `sampleDays`,
`sampleCount`, `lookbackWeeks`, `oldestSampleDate`, `refMedian`, `computedAt`）に合わせ、手動投入である
ことが分かるよう`sampleDays: 0`とする。

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
