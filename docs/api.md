# API

公開するエンドポイントと内部用のエンドポイント、フロントとの型の共有。全体の構成は[overview.md](overview.md)。

## API の仕様（Swagger）
公開するエンドポイントの仕様は、コードの定義（`@hono/zod-openapi`）から自動で作られる。

* `GET /doc` - OpenAPI（3.0）の JSON
* `GET /ui` - Swagger UI。ブラウザで開くと、仕様を見て、その場で試せる。ローカルなら `http://localhost:8080/ui`
  （起動の仕方は[development.md](development.md)の「ローカル開発・テスト手順」）
* 載るのは公開するサービス（`ingest`とローカル）のルートだけ。内部用のルート（`/aggregate`、`/pubsub/scan-events`、
  `/internal/batch/calc-max-device`）は載らず、`worker`には`/doc`も`/ui`も無い
* リクエストとレスポンスのスキーマは`src/schema/api/`にある。レスポンスがスキーマに合っているかは、エンドポイントの
  テストで確かめている
* `/receiveSensorData`は、仕様への登録だけで、処理はこれまでどおり。APIキーの確認より先にボディの検証が動かないよう
  にするため

## 公開するエンドポイント
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

## 内部用のエンドポイント
`worker`だけに載る。Swaggerには載らないので、ここに書く。

### 1. POST /aggregate
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

### 2. POST /pubsub/scan-events
Pub/Subのプッシュサブスクリプションからメッセージを受け取り、`pending_scans`に保存する。
* 認証 - コードには無い。`worker`をCloud Runの認証必須にして、呼び出しをPub/Subのサービスアカウントだけに許可する
* リクエストボディ - Pub/Subの封筒。`message.data`にScanEventのJSONがbase64で入り、`message.messageId`がある
* 保存 - ドキュメントIDは`{nodeId}__{sendId}`。`sendId`が無ければ`msg__{messageId}`。同じメッセージが2回届いても、
  同じドキュメントに上書きされて二重に数えない
* `received_at`には、受信エンドポイントが付けた`receivedAt`を使う。処理側で書き込んだ時刻は使わない
* レスポンス - 成功したら204。封筒やメッセージが不正なら400で、再試行のあとデッドレターに入る

### 3. POST /internal/batch/calc-max-device
`congestion_records`の履歴から、locationごと・曜日ごとの基準値（`max_devices`）を算出する日次バッチ。Cloud
Schedulerから1日1回（04:00 JST想定）呼び出されることを想定した内部エンドポイント。
* 認証 - コードには無い。`worker`をCloud Runの認証必須にして、呼び出しをCloud Schedulerのサービスアカウントだけに
  許可する
* リクエストボディ - なし
* レスポンス例 (200 OK)。`(location, weekday)`の件数
```json
{ "succeeded": 33, "failed": 2, "frozen": 14 }
```

#### 計算の手順（`(location, weekday)`ごと）

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

#### 日ごとのまとめ（`daily_summaries`）

毎日26週分の`congestion_records`を読み直すと、読み取りが1日16万件になり無料枠を超える。1日分を1ドキュメントに
まとめて、2回目からはそれを読む（1日1,000件程度）。

* `counts`（稼働時間帯の台数を昇順に並べたもの）も持たせるので、`baseline`の計算でも元の記録を読み直さない
* まとめの稼働時間帯が設定と違う場合は作り直す。設定を変えたときと、過去の台数を書き換えたときのため
* 1回のバッチで作り直す数には上限（120日分）がある。初回は数日かけて埋まる

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
