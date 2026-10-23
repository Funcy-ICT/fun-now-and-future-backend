# 設定

環境変数、サービスの分け方、Firestoreの設定ドキュメント。全体の構成は[overview.md](overview.md)。

## 環境変数

| 変数名 | 用途 | 例 |
| --- | --- | --- |
| `PORT` | HTTPサーバーの待受ポート | `8080` |
| `GCLOUD_PROJECT` | Firestore接続先プロジェクトID | `fun-now-and-future` |
| `PR_ASSET_BUCKET` | 広報アセット公開バケット名（`GET /signage/assets`のURL組み立てに必須） | `fun-now-and-future-pr-assets` |
| `PR_ASSET_PRIVATE_BUCKET` | 投稿された広報アセットを、承認の前に置く非公開のバケット名。公開しない。投稿を保存するときに必須で、未設定だと保存に失敗する | `fun-now-and-future-pr-assets-private` |
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
| `config/filter_pipeline` | フィルタの段の設定（`stages`）と、診断データ（`scan_diagnostics`）への書き込みのON/OFF（`debugModeEnabled`） | 任意。無いか検証に通らなければ、既定の構成（Appleの本体端末に絞り、RSSIの閾値-100、診断OFF）で動く |
| `config/retention` | BigQueryの保持期間（`scanEventsDays`。`null`は無期限）。最後に適用できた値を残すもので、実際の保持期間はBigQuery側のパーティションの有効期限で決まる | 任意。無ければ未設定（無期限） |
| `config/academic_calendar` | 学期期間・休業日の一覧。基準値計算バッチの統計的な有効日判定より優先して適用される | 任意。**未実装**（統計判定のみで動作する） |
| `config/baseline` | 基準値計算バッチの設定。`defaults`（全体）と`locations.{location}`（locationごとの上書き）を持つ | 任意。無ければコードに書いた既定値を使う |
| `config/nodes` | ノードの表示名（`displayName`）と撤去済みの印（`retired`）。キーは`nodeId`。台数には影響しない | 任意。無ければ空として扱う |

`max_devices/{location}_{weekday}` は、基準値計算バッチが自動生成するまでの間（運用開始直後・長期休業明けなど）、手動でFirestoreコンソールから投入する必要がある場合がある（下記「基準値の手動投入」参照）。

## 設定の変更の履歴

管理画面から変える設定（`config/filter_pipeline`、`config/baseline`、`config/retention`、`config/nodes`）は、値と同じドキュメントに`version`、`updatedAt`、`updatedBy`を持つ。

* 保存のたびに`version`を1つ増やし、`config_history/{設定名}__{version}`に、変更の前と後の値、日時、変更した人を残す。設定と履歴は1つのトランザクションで書く
* 画面が読んだときの`version`と、保存するときの`version`が違えば、保存しない（別の保存が先に入っている）
* `version`が無いドキュメント（コンソールで作ったもの）は、0とみなす
* Firestoreコンソールで直接変えた分は、`version`も履歴も変わらない
* フィルタの設定は、管理画面から保存するとき、`dedupe`が先頭にあること、同じ段が1回だけであること、rssiが-127から0の整数、companyIdが大文字の16進4桁であることを確かめる。`debugModeEnabled`は画面から受け取らず、今の値を引き継ぐ
* ノードごとのrssiの閾値（`rssiFilter.nodeThresholds`、location → nodeId → 閾値）は、`/aggregate`の判定に使う。分析用のSQLはまだ同じ判定をしていないので、管理画面からは保存できない（Firestoreコンソールで入れた値は、`/aggregate`にだけ効く）
* 今あるのは保存の処理だけ。管理画面から呼ぶエンドポイントは、認証（Cloudflare Access）が入ってから作る

## 基準値の計算バッチの設定（`config/baseline`）
| 項目 | 既定値 | 意味 |
| --- | --- | --- |
| `operatingStartHour` / `operatingEndHour` | 7 / 22 | 稼働時間帯（JSTの時）。センサーが夜間に止まる場合はlocationごとに変える。ノードの停止の判定にも使う |
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
