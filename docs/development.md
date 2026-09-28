# 開発

技術構成、ディレクトリの構成、ローカルでの起動とテスト、デプロイ。全体の構成は[overview.md](overview.md)。

## 技術構成

* Runtime - Node.js 24 / TypeScript
* Framework - [`Hono`](https://hono.dev/)（`@hono/node-server`でNode.jsのHTTPサーバーとして起動）
* Database - Firebase Firestore（`firebase-admin`経由でアクセス。Cloud Run上でもFirestore自体は独立して利用可能）
* Object Storage - Google Cloud Storage（公開バケット。広報アセット配信用。`allUsers`に`roles/storage.legacyObjectReader`のみ付与し、一覧表示権限は与えない）
* Validation - Zod
* API の仕様 - `@hono/zod-openapi`（Swagger）、Hono RPC（管理画面との型の共有）
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
│   ├── analysis_sql.ts    # フィルタの設定から、分析用のSQLを組み立てる
│   ├── analysis.ts        # 生データから、指定した設定で窓・locationごとの台数を数え直す
│   ├── retention.ts       # BigQueryの保持期間(パーティションの有効期限)の変更
│   ├── filter_config.ts   # フィルタの設定のJSON化とハッシュ(configHash)
│   ├── jst.ts             # 日本時間の日付・時・稼働時間帯の範囲
│   ├── statistics.ts      # 中央値・パーセンタイル(最近傍順位法)
│   ├── baseline_settings.ts # 基準値の設定の解決(locationの上書き→全体の既定値→コードの既定値)
│   ├── daily_summary.ts   # 1日分のcongestion_recordsのまとめ
│   ├── baseline.ts        # 有効日の判定(完全性・水準ゲート)とbaselineの算出
│   └── max_devices_batch.ts # 基準値(max_devices)の遡り方式での算出バッチ
├── repositories/          # Firestore, Pub/Sub, BigQueryへの読み書きのみ
│   ├── firestore.ts
│   ├── pubsub.ts          # メッセージをPub/Subのトピックにpublish
│   └── bigquery.ts        # 課金の上限を付けてクエリを実行
├── middlewares/           # 認証・エラーハンドリングなど横断的な処理
│   ├── sensor_auth.ts     # ESP32 / 集計・バッチエンドポイント向けAPIキー検証
│   ├── signage_auth.ts    # サイネージ向けAPIキー検証（Honoミドルウェア）
│   └── error_handler.ts   # 共通エラーハンドラー（app.onErrorに登録）
├── schema/                # Zodスキーマ・型定義
│   ├── api/               # 公開するエンドポイントのリクエストとレスポンス(swaggerとhono rpcで共有)
│   │   ├── common.ts      # エラーのレスポンス、/health
│   │   ├── signage.ts     # /getCongestion, /getCongestionHistory, /signage/assets
│   │   └── sensor.ts      # /receiveSensorData のレスポンス
│   ├── sensor_data.ts     # /receiveSensorData のリクエスト
│   ├── scan_event.ts      # Pub/Subに流すメッセージ(BigQueryのscan_eventsテーブルに対応)
│   ├── aggregate_run.ts   # 集計結果の履歴(BigQueryのaggregate_runsテーブルに対応)
│   ├── congestion_record.ts # congestion_records
│   ├── max_device.ts      # max_devices
│   ├── node_status.ts     # node_health_stats
│   ├── pr_asset.ts        # prAssets
│   ├── scan_diagnostics.ts # scan_diagnostics
│   ├── pending_scan_event.ts # pending_scans
│   ├── filter_pipeline.ts # フィルタの段の設定、config/filter_pipeline
│   ├── retention.ts       # BigQueryの保持期間の設定、config/retention
│   ├── baseline_settings.ts # 基準値の設定と、コードに書いた既定値
│   ├── daily_summary.ts   # daily_summaries
│   └── excluded_day.ts    # excluded_records
└── lib/
    ├── firebase.ts        # Firebase Admin SDKの初期化
    ├── hash_key.ts        # macアドレスのハッシュ化に使う鍵の読み込み
    ├── pubsub.ts          # Pub/Subクライアントの初期化
    └── bigquery.ts        # BigQueryクライアントの初期化、テーブル名と課金の上限
```

`cloud/bigquery/scan_events.schema.json`は、BigQueryのテーブル`scan_events`の列の定義。`ScanEventSchema`との突き合わせテストで使う。
BigQueryサブスクリプションでメタデータの書き込みを有効にするので、`message_id`などの列も含む。
`cloud/bigquery/`の`scan_events.schema.json`と`aggregate_runs.schema.json`は、BigQueryのテーブルの列の定義。
`ScanEventSchema`、`AggregateRunSchema`との突き合わせテスト（`src/testing/bq_schema.ts`）で使う。

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
`SERVICE_ROLE`が未設定だと受信のルートも載るので、`MAC_HASH_KEY`と`SCAN_EVENTS_TOPIC`、`ESP32_API_KEY`が無いと起動に失敗する。
ローカルでは、ダミーの値を渡す。
```bash
MAC_HASH_KEY=$(openssl rand -hex 32) SCAN_EVENTS_TOPIC=scan-events ESP32_API_KEY=local-dev-key npm start
```
`http://localhost:8080` で待ち受けます（`PORT`環境変数で変更可）。`/ui`でSwagger UIを開ける。
* 鍵は、起動のたびにランダムなダミーを作る。本物の鍵を、コマンドの履歴やファイルに残さないため
* `ESP32_API_KEY`は、ローカル用のダミー（`local-dev-key`）。Swagger UIで`/signage/assets`などを試すときは、
  「Authorize」にこの値を入れる。本物のキーは使わない
* Swagger UIの「Try it out」で、Firestoreを読むルート（`/getCongestion`など）を試すときは、エミュレータを起動して
  `FIRESTORE_EMULATOR_HOST`を渡す。エミュレータも8080番を使うので、サーバーは`PORT`を変える。渡さないと、本物の
  プロジェクトにつなぎに行くことがある
  ```bash
  firebase emulators:start --only firestore --project demo-fnaf
  # 別のターミナルで
  FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-fnaf PORT=3000 \
    MAC_HASH_KEY=$(openssl rand -hex 32) SCAN_EVENTS_TOPIC=scan-events ESP32_API_KEY=local-dev-key npm start
  ```
  このときのSwagger UIは`http://localhost:3000/ui`
* `/receiveSensorData`は、ローカルでは試せない。Pub/Subにpublishするが、`firebase.json`にPub/Subのエミュレータの
  設定が無いため

### 4. 単体テストの実行
Firestoreエミュレータを自動起動してJestテストを実行します。
```bash
npm test
```
ローカルに `firebase` CLI（[`firebase-tools`](https://www.npmjs.com/package/firebase-tools)）が必要です。未インストールの場合は `npm install -g firebase-tools` するか、`npx firebase-tools ...` に置き換えてください。

### 5. SQLの突き合わせテスト（本物のBigQueryを使う）
同じテストデータをTSの集計とSQLの両方に通し、窓・locationごとの台数と各段の通過数が一致するかを確かめる。
エミュレータが無いので、本物のBigQueryで実行する。`npm test`には含まれず、CIでも動かない。
```bash
gcloud auth application-default login
GCLOUD_PROJECT=fun-now-and-future BQ_DATASET=fnaf_analytics_test npm run test:sql
```
* `BQ_DATASET`は、名前が`_test`で終わるデータセットのときだけ実行する。本番のデータセットを誤って指定しないため
* テスト用のデータセットのテーブル`scan_events`は、実行のたびに作り直される
* `BQ_DATASET`が無いときは、テストデータの確認だけを行い、BigQueryを使う部分は飛ばす

## Dockerでのビルド・起動

```bash
cd cloud
docker build -t fun-now-and-future-backend .
docker run -p 8080:8080 -e MAC_HASH_KEY=$(openssl rand -hex 32) -e SCAN_EVENTS_TOPIC=scan-events \
  -e ESP32_API_KEY=local-dev-key fun-now-and-future-backend
curl http://localhost:8080/health
```

## Cloud Runへのデプロイ

```bash
gcloud run deploy --source cloud
```
