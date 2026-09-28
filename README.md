# Fun Now and Future - Backend

キャンパス内の混雑度リアルタイム可視化システム「Fun Now and Future」のバックエンド API です。
ESP32 から送信される BLE 検知データを処理し、Firestore への保存およびサイネージ・アプリ向けの混雑度データ提供を行います。


## 読む人ごとの入口
全体の構成図と、仕様がどこに書いてあるかは、[docs/overview.md](docs/overview.md) にまとめている。

| 読む人 | 最初に読むもの | そのあと |
| --- | --- | --- |
| バックエンド | [docs/overview.md](docs/overview.md) | このREADMEの「ローカル開発・テスト手順」、[ADRの一覧](docs/adr/README.md) |
| フロント（サイネージ） | [docs/overview.md](docs/overview.md) | [#25](https://github.com/Funcy-ICT/fun-now-and-future-backend/issues/25)（レスポンスの読み方）、Swagger（`/ui`）、フロント向けの[#56](https://github.com/Funcy-ICT/fun-now-and-future-backend/issues/56) |
| フロント（管理画面） | [docs/overview.md](docs/overview.md) | このREADMEの「管理画面との型の共有（Hono RPC）」、[ADR 0005](docs/adr/0005-admin-ui-library.md) |
| ハード（ESP32） | [docs/overview.md](docs/overview.md) | Swaggerの`POST /receiveSensorData`、[#35](https://github.com/Funcy-ICT/fun-now-and-future-backend/issues/35) |


## API の仕様（Swagger）
公開するエンドポイントの仕様は、コードの定義（`@hono/zod-openapi`）から自動で作られる。

* `GET /doc` - OpenAPI（3.0）の JSON
* `GET /ui` - Swagger UI。ブラウザで開くと、仕様を見て、その場で試せる。ローカルなら `http://localhost:8080/ui`
  （起動の仕方は「ローカル開発・テスト手順」）
* 載るのは公開するサービス（`ingest`とローカル）のルートだけ。内部用のルート（`/aggregate`、`/pubsub/scan-events`、
  `/internal/batch/calc-max-device`）は載らず、`worker`には`/doc`も`/ui`も無い
* リクエストとレスポンスのスキーマは`src/schema/api/`にある。レスポンスがスキーマに合っているかは、エンドポイントの
  テストで確かめている
* `/receiveSensorData`は、仕様への登録だけで、処理はこれまでどおり。APIキーの確認より先にボディの検証が動かないよう
  にするため


## 管理画面との型の共有（Hono RPC）
管理画面（`admin/`）などのフロントからは、`hono/client`の`hc`で呼ぶ。バックエンドのルートの型から、パス、クエリ、
レスポンスの型が決まる。バックエンドとずれると、フロントの型チェックでエラーになる。

* 型は`src/app.ts`の`AppType`。入っているのは`/health`とサイネージ向けのルートだけで、`/receiveSensorData`と内部用の
  ルートは入れていない
* ルートを足すときは、`.openapi(...)`をメソッドチェーンでつなぐ。`app.openapi(...)`を別の文で書くと、型に残らない
* `npm run build:types`で、`types/`に型定義（`.d.ts`）を出力する。フロントが読むのは`types/app.d.ts`だけで、ほかの
  ファイルは出力のついでにできるもの。`types/`はgitに入れない

### フロントから使うとき
`types/app.d.ts`の`AppType`を、型だけ読む（例: `admin/src/lib/api.ts`）。

```ts
import { hc } from "hono/client";
import type { AppType } from "../../../cloud/types/app"; // .d.tsは書かない

const api = hc<AppType>(import.meta.env.VITE_API_BASE_URL);
const res = await api.getCongestion.$get({ query: { location: "cafeteria" } });
if (res.status === 200) {
  const json = await res.json(); // 200のレスポンスの型になる
}
```

* 最初に`cloud/`で`npm install`と`npm run build:types`を実行する。`types/`がgitに無いので、しないと型が見つからない
* 管理画面の`npm run build`は、先に`build:types`を実行する。`npm run dev`で開発するときは、バックエンドのルートを
  変えたら`npm run build:types`をやり直す。やり直さないと、型が古いまま
* `import type`で読む。型だけなので、フロントのバンドルには何も入らない
* `hono`のバージョンは、`cloud/`とフロントで揃える
* レスポンスの型に名前を付けたいときは、自分で書かずに`hono/client`の`InferResponseType`を使う
  （例: `InferResponseType<typeof api.getCongestion.$get, 200>`）
* 相対パスで読むので、使えるのは同じリポジトリの中のフロントだけ。別のリポジトリからは、`/doc`のOpenAPIから型を作る
* CORSはまだ設定していない。ブラウザで別のオリジンから呼ぶには、バックエンドに`hono/cors`を入れるか、開発中は
  Viteのproxyを使う（未定）


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

## 環境変数

| 変数名 | 用途 | 例 |
| --- | --- | --- |
| `PORT` | HTTPサーバーの待受ポート | `8080` |
| `GCLOUD_PROJECT` | Firestore接続先プロジェクトID | `fun-now-and-future` |
| `PR_ASSET_BUCKET` | 広報アセット公開バケット名（`GET /signage/assets`のURL組み立てに必須） | `fun-now-and-future-pr-assets` |
| `MAC_HASH_KEY` | macアドレスをハッシュ化(HMAC-SHA256)する鍵。32文字以上。Secret Managerの値を環境変数にマウントして渡す。未設定や短すぎる場合は起動に失敗する | （値はリポジトリに置かない） |
| `ESP32_API_KEY` | ESP32とサイネージが、ヘッダー`x-api-key`で送るAPIキー。Secret Managerの値を環境変数にマウントして渡す。受信のサービスでは必須で、未設定だと起動に失敗する | （値はリポジトリに置かない） |
| `SCAN_EVENTS_TOPIC` | 受信したデータをpublishするPub/Subのトピック名。受信のサービスでは必須で、未設定だと起動に失敗する | `scan-events` |
| `BQ_DATASET` | BigQueryのデータセット名。テストではテスト用のデータセットに切り替える | `fnaf_analytics` |
| `BQ_MAX_BYTES_BILLED` | 1回のクエリで課金されるバイト数の上限。未設定なら5GiB。超えるクエリは実行されずに失敗する | `5368709120` |
| `AGGREGATE_RUNS_TOPIC` | 集計結果の履歴をpublishするPub/Subのトピック名。未設定なら履歴をpublishしない（トピックを作る前でもデプロイできる） | `aggregate-runs` |
| `SERVICE_ROLE` | `ingest`（受信）か`worker`（処理）。未設定なら全部のルートを載せる（ローカル、テスト用）。知らない値だと起動に失敗する | `ingest` |

## サービスの分け方（SERVICE_ROLE）

同じコード・同じイメージを、環境変数`SERVICE_ROLE`を変えて、2つのCloud Runサービスとしてデプロイする。

| SERVICE_ROLE | 役割 | ルート | 公開 |
| --- | --- | --- | --- |
| `ingest` | 受信 | `/receiveSensorData`, サイネージ用のルート, `/health` | 公開（ESP32とサイネージが呼ぶ） |
| `worker` | 処理 | `/pubsub/scan-events`, `/aggregate`, `/internal/batch/calc-max-device`, `/health` | Cloud Runの認証必須。呼び出しをPub/SubとCloud Schedulerのサービスアカウントだけに許可する |
| （未設定） | ローカル、テスト用 | 全部 | 起動時に警告を出す |

* `ingest`は`MAC_HASH_KEY`と`SCAN_EVENTS_TOPIC`、`ESP32_API_KEY`が無いと起動に失敗する。`worker`はどれも要らない
* `SERVICE_ROLE`に知らない値を入れると起動に失敗する。綴りの間違いで全部のルートが公開されるのを防ぐため
* Pub/Subのプッシュサブスクリプションは、`worker`の`/pubsub/scan-events`にOIDCトークン付きで送る。再試行ポリシーとデッドレタートピックを付ける
* Cloud Schedulerは、`worker`の`/aggregate`にOIDCトークン付きで、`1-59/5 * * * *`（窓が閉じた1分後）で呼ぶ
* 基準値のバッチも、`worker`の`/internal/batch/calc-max-device`にOIDCトークン付きで、`0 19 * * *`（日本時間の
  04:00）で呼ぶ

## Firestore設定ドキュメント

環境変数とは別に、以下のFirestoreドキュメントを事前に用意する必要がある。

| ドキュメント | 用途 | 必須/任意 |
| --- | --- | --- |
| `config/locations` | location一覧（`{ ids: string[] }`）。現在はどの処理も読んでいない。`/aggregate`はデータが届いたlocationを、基準値計算バッチは直近24時間の`congestion_records`を使う | 不要 |
| `config/diagnostics` | `{ enabled: boolean }`。フィルタ通過状況の診断データ（`scan_diagnostics`）への書き込みON/OFF | 任意。無ければOFF扱い（安全側） |
| `config/retention` | BigQueryの保持期間（`scanEventsDays`。`null`は無期限）。最後に適用できた値を残すもので、実際の保持期間はBigQuery側のパーティションの有効期限で決まる | 任意。無ければ未設定（無期限） |
| `config/academic_calendar` | 学期期間・休業日の一覧。基準値計算バッチの統計的な有効日判定より優先して適用される | 任意。**未実装**（統計判定のみで動作する） |
| `config/baseline` | 基準値計算バッチの設定。`defaults`（全体）と`locations.{location}`（locationごとの上書き）を持つ | 任意。無ければコードに書いた既定値を使う |

`max_devices/{location}_{weekday}` は、基準値計算バッチが自動生成するまでの間（運用開始直後・長期休業明けなど）、手動でFirestoreコンソールから投入する必要がある場合がある（下記「基準値の手動投入」参照）。


## 主な機能・エンドポイント

> Base URL: `まだデプロイしてない`

### 公開するエンドポイント
リクエストとレスポンスの形、値の範囲、`level`の読み方などの詳細は、Swagger UI（`/ui`）で見る（上記「API の仕様（Swagger）」）。
説明はコード（`src/schema/api/`、`src/schema/sensor_data.ts`、`src/controllers/`）に書いてあり、ここには書かない。

| ルート | 呼ぶもの | 認証 | 内容 |
| --- | --- | --- | --- |
| `GET /health` | 死活監視 | なし | 動いているか |
| `POST /receiveSensorData` | ESP32 | `x-api-key` | BLEの検出データを受け取り、Pub/Subにpublishする |
| `GET /getCongestion` | サイネージ、アプリ | なし | 指定したlocationの最新の混雑度 |
| `GET /getCongestionHistory` | サイネージ、アプリ | なし | 指定したlocationの混雑度の履歴 |
| `GET /signage/assets` | サイネージ | `x-api-key` | 掲載中の広報アセットの一覧 |

* `level`が`null`のときの読み方など、フロント向けの説明は[#25](https://github.com/Funcy-ICT/fun-now-and-future-backend/issues/25)

### 内部用のエンドポイント
`worker`だけに載る。Swaggerには載らないので、ここに書く。

#### 1. POST /aggregate
窓（5分）の範囲に受信した`pending_scans`のデータを集計し、ロケーションごとの混雑度（`congestion_records`）と
ノード監視データ（`node_health_stats`）を書き込んで、読んだドキュメントだけを削除する。窓が閉じた1分後に、
Cloud Schedulerから`1-59/5 * * * *`で呼び出されることを想定した内部エンドポイント。
* 認証 - コードには無い。`worker`をCloud Runの認証必須にして、呼び出しをCloud Schedulerのサービスアカウントだけに
  許可する。`SERVICE_ROLE`が未設定のローカルでは、認証なしで呼び出せる
* リクエストボディ - なし
* 窓は`received_at`（受信エンドポイントが付けた受信時刻）で決める。猶予の1分は、pub/sub経由でFirestoreに書かれる
  までの遅れを待つため。窓に間に合わず遅れて届いたデータは数えず、24時間より古いものを消す
* レスポンス例 (200 OK)
```json
{
  "windowStart": "2026-07-28T07:25:00.000Z",
  "scanCount": 12,
  "locationCount": 2
}
```
* その回にスキャンデータが届いたlocation分だけ`congestion_records`を書く。ESP32は検出0件でも`devices: []`で
  POSTしてくる前提で、その場合は`uniqueDeviceCount: 0`で記録される。ノードが全て止まって何も届かなかった
  locationは記録されない（欠測。基準値計算バッチで「誰もいなかった」と区別するために必要）
* `config/diagnostics.enabled`が`true`の場合、location単位でフィルタ通過状況を`scan_diagnostics`に記録する。
  記録される内容にmacアドレスは含まれない（1回の集計run限りのランダムUUIDに置き換えられる）
* そのとき使ったフィルタの設定のハッシュ（`configHash`）を、`congestion_records`に記録する。設定を変えると台数の
  意味が変わるため、どの設定で数えた値かを後から見分けられるようにする。この項目が無い既存のレコードも読める
* 集計結果の履歴を、`AGGREGATE_RUNS_TOPIC`にpublishする（BigQueryの`aggregate_runs`用）。1回の集計につき1件で、
  locationごとの台数と各段の通過数、ノードごとの受信件数、`configHash`、そのとき使った設定（`stagesJson`）を持つ。
  publishに失敗しても集計は止めず、ログに残す

#### 2. POST /pubsub/scan-events
Pub/Subのプッシュサブスクリプションからメッセージを受け取り、`pending_scans`に保存する。
* 認証 - コードには無い。`worker`をCloud Runの認証必須にして、呼び出しをPub/Subのサービスアカウントだけに許可する
* リクエストボディ - Pub/Subの封筒。`message.data`にScanEventのJSONがbase64で入り、`message.messageId`がある
* 保存 - ドキュメントIDは`{nodeId}__{sendId}`。`sendId`が無ければ`msg__{messageId}`。同じメッセージが2回届いても、
  同じドキュメントに上書きされて二重に数えない
* `received_at`には、受信エンドポイントが付けた`receivedAt`を使う。処理側で書き込んだ時刻は使わない
* レスポンス - 成功したら204。封筒やメッセージが不正なら400で、再試行のあとデッドレターに入る

#### 3. POST /internal/batch/calc-max-device
`congestion_records`の履歴から、locationごと・曜日ごとの基準値（`max_devices`）を算出する日次バッチ。Cloud
Schedulerから1日1回（04:00 JST想定）呼び出されることを想定した内部エンドポイント。
* 認証 - コードには無い。`worker`をCloud Runの認証必須にして、呼び出しをCloud Schedulerのサービスアカウントだけに
  許可する
* リクエストボディ - なし
* レスポンス例 (200 OK)。`(location, weekday)`の件数
```json
{ "succeeded": 33, "failed": 2, "frozen": 14 }
```

##### 計算の手順（`(location, weekday)`ごと）

1. `refMedian`を出す。直近`refMedianWeeks`週の同じ曜日について、その日の稼働時間帯の台数の中央値を求め、その中央値
   を取る。ゲートは通さない。除外した日だけで作ると、出力が入力を決める循環になるため
2. 直近の同じ曜日から1週ずつ遡り、次の2つを両方通った日を`targetDays`日集める
   * 完全性ゲート - 稼働時間帯に記録がある窓の数 ≧ 全窓数 × `completenessRatio`。ノード停止を弾く
   * 水準ゲート - その日の中央値 ≧ `refMedian` × `gateRatio`。休業日を弾く
3. `maxLookbackWeeks`週まで遡っても揃わなければ、`max_devices`を書き換えない（凍結）
4. 揃えば、その日の窓の台数をすべてプールして`percentile`の位置を`baseline`にする。`p50`と`p05`も記録する
5. `baseline`が9未満なら書き換えない。9段階が成立する最小条件のため
6. 書き換えない場合、未発行ならドキュメントが無いまま（`level: null`）、発行済みなら既存の値が残る

パーセンタイルは、昇順に並べた n 個の `ceil(p × n)` 番目（補間しない）。

* `(location, weekday)`単位で独立して実行され、1件の失敗が他のlocation・曜日に影響しない
* 対象のlocationは、直近24時間の`congestion_records`から重複を除いて取る
* 弾いた日は、理由（`incomplete` / `statistical`）と判定に使った数値を`excluded_records`に残す。閾値を実データで
  後から較正するため

##### 設定（`config/baseline`）

| 項目 | 既定値 | 意味 |
| --- | --- | --- |
| `operatingStartHour` / `operatingEndHour` | 7 / 22 | 稼働時間帯（JSTの時）。センサーが夜間に止まる場合はlocationごとに変える |
| `completenessRatio` | 0.8 | 完全性ゲート |
| `gateRatio` | 0.5 | 水準ゲート |
| `refMedianWeeks` | 26 | `refMedian`を作る期間。最長の休業が少数派に収まる長さ |
| `targetDays` | 4 | 集める有効日数 |
| `maxLookbackWeeks` | 12 | 遡りの上限 |
| `percentile` | 0.95 | `baseline`に使う位置 |

```json
{
  "defaults": { "operatingEndHour": 20 },
  "locations": { "cafeteria": { "operatingStartHour": 9, "gateRatio": 0.4 } }
}
```

* 優先順は、`locations.{location}` → `defaults` → コードに書いた既定値。項目ごとに解決する
* 範囲を外れた項目は、その項目だけ無視してログに残す。1か所の打ち間違いで他の設定まで戻らないようにするため
* 値の変更に再デプロイは要らない。バッチは実行のたびに設定を読む
* `baseline >= 9`は設定にしない。9段階の定義から決まる条件のため
* locationは事前登録しないので、設定に無いlocationは既定値で動く

##### 日ごとのまとめ（`daily_summaries`）

毎日26週分の`congestion_records`を読み直すと、読み取りが1日16万件になり無料枠を超える。1日分を1ドキュメントに
まとめて、2回目からはそれを読む（1日1,000件程度）。

* `counts`（稼働時間帯の台数を昇順に並べたもの）も持たせるので、`baseline`の計算でも元の記録を読み直さない
* まとめの稼働時間帯が設定と違う場合は作り直す。設定を変えたときと、過去の台数を書き換えたときのため
* 1回のバッチで作り直す数には上限（120日分）がある。初回は数日かけて埋まる

## BigQueryの保持期間

`scan_events`に溜めた生データを、何日残すかの設定。費用ではなく、プライバシーの方針で決める（ハッシュ化した
macアドレスと`rawData`が入るため）。

* 設定は`config/retention`の`scanEventsDays`（`null`は無期限）。初期値は未設定（無期限）
* 反映は、バックエンドが`ALTER TABLE ... SET OPTIONS (partition_expiration_days = N)`を実行する。
  **BigQueryに適用してから、Firestoreに保存する。**順序を逆にすると、設定は変わったのに実際の保持期間が変わらない
* 下限は7日。画面での打ち間違いで、蓄積したデータがまとめて消えるのを防ぐため
* **期限を過ぎたパーティションは削除される。短くすると元に戻せない**
* 設定できるのはテーブル単位。`rawData`だけ短くはできない
* 更新には、テーブルを編集できる権限が要る。閲覧だけのサービスアカウントとは分ける
* 変更用のエンドポイントと画面は未実装。認証（Cloudflare Access）が入ってから作る。それまではFirestoreコンソールと
  BigQueryコンソールで設定する

## ロケーションIDの一覧(`location`)
| location (ID) | 設置場所 | 対応するサイネージ表示 | 備考 |
| :--- | :--- | :--- | :--- |
| `cafeteria` | 学内食堂 | 左側「食堂の混雑状況」 | 食堂用の ESP32 から送信 |
| `bus_stop` | バス停留所 | 右下「バス停の混雑状況」 | バス停用の ESP32 から送信 |

`config/locations`は現状どの処理にも読まれないので、この一覧の反映は不要。

## 基準値（max_devices）の手動投入

基準値計算バッチが初めて成功するまでの間（運用開始直後・長期休業明け直後）は、`GET /getCongestion`が
`level: null`（キャリブレーション中）を返し続ける。デモ等で暫定的にlevelを出したい場合は、Firestoreコンソール
から`max_devices/{location}_{weekday}`を手動で作成する。フィールド構成は`MaxDeviceSchema`
（`repositories/firestore.ts`）の形式（`baseline`, `percentile`, `p50`, `p05`, `windowStartHour`, `windowEndHour`, `sampleDays`,
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
