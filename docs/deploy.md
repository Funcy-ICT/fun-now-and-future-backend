# デプロイ

`ingest`（受信）と`worker`（処理）を、Google Cloudのプロジェクト`funcy2022`にデプロイする手順と、動いているかの確かめ方。`app`（投稿画面と管理画面向け）は、[appのデプロイ](#appのデプロイ)に分けて書く。

* サービスの分け方と環境変数は[configuration.md](configuration.md)、全体の構成は[overview.md](overview.md)
* 今どこまでデプロイしたかは、この文書ではなく #57 に書く
* リポジトリは公開なので、APIキーや鍵の値は、この文書にもissueやPRにも書かない

## どのプロジェクトに置くか

このシステムのリソースは、すべて`funcy2022`に置く。`fun-now-and-future-510007`には、投稿画面と管理画面のFirebase Hostingと、Auth0が使うGoogleのOAuthクライアントだけを置く。

* `510007`には請求先が無い。請求先が無いと、Cloud Run、Pub/Sub、BigQueryのストリーミングでの書き込み（BigQueryサブスクリプションが使う）、広報アセットのバケット（デフォルト以外のバケット）が使えない。BigQueryの表は60日で消える
* 請求先が無くても使えるFirestoreだけを`510007`に置くと、無料枠を超えたときにFirestoreが止まる。ノード10台が1分ごとに送ると、書き込みは1日に約1万9千回になり、無料枠（2万回）に近い。`GCLOUD_PROJECT`をFirestoreとほかで分けるコードの変更と、プロジェクトをまたぐ権限も要る

## 前提

* `gcloud`（`bq`も一緒に入る）、`git`、Node.js 24を使う。先に`gcloud auth login`でログインしておく
* コマンドは、macのターミナル、WindowsのPowerShell、コマンドプロンプトのどれでも動くよう、変数と行の継続（`\`や`` ` ``）を使わず1行で書く。カンマを含む値は`"`で囲む（PowerShellがカンマで引数を分けるため）
* 手元の`gcloud config`のプロジェクトに関係なく動くよう、すべてのコマンドに`--project=funcy2022`（`bq`では`--project_id=funcy2022`）を付ける
* サービスアカウント`fnaf-ingest`、`fnaf-worker`、`fnaf-invoker`と、それらへのプロジェクト単位のロールは、作ってある前提にする（[development.md](development.md#サービスアカウントとiamロール)）

デプロイする人に要るロール:

| 作業 | ロール |
| --- | --- |
| Cloud Runのデプロイと、呼べる人の設定 | `roles/run.admin`、`roles/iam.serviceAccountUser` |
| ビルド | `roles/cloudbuild.builds.builder`、`roles/artifactregistry.admin`（リポジトリを作るため） |
| 鍵 | `roles/secretmanager.admin` |
| Pub/Sub | `roles/pubsub.admin` |
| BigQuery | `roles/bigquery.admin` |
| Firestore | `roles/datastore.owner` |
| Cloud Scheduler | `roles/cloudscheduler.admin` |
| 広報アセットのバケット（`app`のとき） | `roles/storage.admin` |
| ログを読む | `roles/logging.viewer` |

## 作るもの

名前には、コードネームの`fnaf`を使う。Cloud Runのサービス名は、`SERVICE_ROLE`の値と揃える。

| 種類 | 名前 | 用途 |
| --- | --- | --- |
| Cloud Run | `ingest` | 受信とサイネージ向け。誰でも呼べる（APIキーはアプリの中で確かめる） |
| Cloud Run | `worker` | Pub/Subのプッシュの受け口、`/aggregate`、基準値のバッチ。`fnaf-invoker`だけが呼べる |
| Firestore | `(default)` | 東京（`asia-northeast1`）、ネイティブモード |
| BigQuery | `fnaf_analytics.scan_events` | 生データ（MACはハッシュ値） |
| Pub/Sub トピック | `scan-events` | 受信したデータ |
| Pub/Sub トピック | `fnaf-dead-letter` | 5回試しても届かなかったメッセージ |
| Pub/Sub サブスクリプション | `scan-events-bq` | `scan_events`に書く |
| Pub/Sub サブスクリプション | `scan-events-push` | `worker`の`/pubsub/scan-events`に送る |
| Pub/Sub サブスクリプション | `fnaf-dead-letter-sub` | デッドレターを残す |
| Secret Manager | `mac-hash-key`、`esp32-api-key` | `MAC_HASH_KEY`、`ESP32_API_KEY`の値 |
| Artifact Registry | `fnaf` | イメージ`backend` |
| Cloud Scheduler | `aggregate`、`calc-max-device` | 5分ごとの集計、日次の基準値のバッチ |

集計の履歴（`aggregate_runs`）は、最初は作らない。窓ごとの台数や各段の通過数は、生データ（`scan_events`）から後でも数え直せる（[集計の履歴を足すとき](#集計の履歴を足すとき)）。

URLは、Cloud Runの決まった形（`https://サービス名-プロジェクト番号.リージョン.run.app`）になる。

* `ingest`: `https://ingest-638313186296.asia-northeast1.run.app`
* `worker`: `https://worker-638313186296.asia-northeast1.run.app`

`service-638313186296@gcp-sa-pubsub.iam.gserviceaccount.com`は、Pub/Subのサービスエージェント（Googleが管理するサービスアカウント）。BigQueryへの書き込みと、デッドレターへの転送は、これの権限で行われる。

## 初回のデプロイ

0から順に行う。1〜4、7、9は初回だけで、2回目からは[コードを変えたとき](#コードを変えたとき)の手順になる。

### 0. デプロイするコードを用意する

作業中のブランチに触らず、手元の変更や追跡していないファイルを上げないよう、`origin/main`を別のディレクトリに出してから作業する。

```bash
git fetch origin
git worktree add ../fnaf-deploy origin/main
cd ../fnaf-deploy
git rev-parse --short HEAD
```

最後のコマンドが出したコミットのハッシュを、手順5、6、8の`COMMIT`に入れる。

### 1. Firestore

```bash
gcloud firestore databases create --project=funcy2022 --location=asia-northeast1 --type=firestore-native --delete-protection
gcloud firestore indexes composite create --project=funcy2022 --collection-group=congestion_records --query-scope=COLLECTION --field-config="field-path=location,order=ascending" --field-config="field-path=windowStart,order=descending"
gcloud firestore indexes composite create --project=funcy2022 --collection-group=congestion_records --query-scope=COLLECTION --field-config="field-path=location,order=ascending" --field-config="field-path=weekday,order=ascending" --field-config="field-path=windowStart,order=ascending"
```

* 場所は後から変えられない。BigQueryに合わせて東京にする
* 複合インデックスは、`firestore.indexes.json`と同じものを作る。`funcy2022`はFirebaseのプロジェクトではないので、`firebase deploy`ではなく`gcloud`で作る
* 1つ目は`/getCongestion`と`/getCongestionHistory`（`location`の等価と`windowStart`の降順）、2つ目は基準値のバッチ（`location`と`weekday`の等価と`windowStart`の範囲）が使う。エミュレータはインデックスが無くても動くので、`npm test`では気づけない

### 2. BigQuery

```bash
bq --project_id=funcy2022 --location=asia-northeast1 mk --dataset fnaf_analytics
bq --project_id=funcy2022 mk --table --time_partitioning_field=receivedAt --time_partitioning_type=DAY --require_partition_filter=true --clustering_fields="location,nodeId" fnaf_analytics.scan_events cloud/bigquery/scan_events.schema.json
bq --project_id=funcy2022 add-iam-policy-binding --member=serviceAccount:service-638313186296@gcp-sa-pubsub.iam.gserviceaccount.com --role=roles/bigquery.dataEditor fnaf_analytics.scan_events
```

* `scan_events`の設定は、ADR 0010のとおり（受信した日でパーティション、`location`と`nodeId`でクラスタリング、クエリにパーティションの指定を必須にする）
* 保持期間（パーティションの有効期限）は付けない（無期限）。変え方は[configuration.md](configuration.md)
* 最後の行は、BigQueryサブスクリプションがテーブルに書くための権限

### 3. 鍵（Secret Manager）

```bash
node -e "require('child_process').execSync('gcloud secrets create mac-hash-key --project=funcy2022 --data-file=-', {input: require('crypto').randomBytes(32).toString('hex'), stdio: ['pipe', 'inherit', 'inherit']})"
node -e "require('child_process').execSync('gcloud secrets create esp32-api-key --project=funcy2022 --data-file=-', {input: require('crypto').randomBytes(32).toString('hex'), stdio: ['pipe', 'inherit', 'inherit']})"
gcloud secrets add-iam-policy-binding mac-hash-key --project=funcy2022 --member=serviceAccount:fnaf-ingest@funcy2022.iam.gserviceaccount.com --role=roles/secretmanager.secretAccessor
gcloud secrets add-iam-policy-binding esp32-api-key --project=funcy2022 --member=serviceAccount:fnaf-ingest@funcy2022.iam.gserviceaccount.com --role=roles/secretmanager.secretAccessor
```

* 値（ランダムな64文字）は、画面にもファイルにも出さず、Node.jsから標準入力でSecret Managerに渡す。末尾に改行が入ると、ヘッダーで送られるAPIキーと一致しなくなるため
* `mac-hash-key`は作り直さない。変えると、同じ端末が別のハッシュ値になり、それまでのデータとつながらなくなる（ADR 0010）
* `esp32-api-key`は新しい値なので、リポジトリの履歴に残っている古いキーは通らない

### 4. Pub/Subのトピック

```bash
gcloud pubsub topics create scan-events --project=funcy2022
gcloud pubsub topics create fnaf-dead-letter --project=funcy2022
gcloud pubsub topics add-iam-policy-binding scan-events --project=funcy2022 --member=serviceAccount:fnaf-ingest@funcy2022.iam.gserviceaccount.com --role=roles/pubsub.publisher
gcloud pubsub topics add-iam-policy-binding fnaf-dead-letter --project=funcy2022 --member=serviceAccount:service-638313186296@gcp-sa-pubsub.iam.gserviceaccount.com --role=roles/pubsub.publisher
gcloud pubsub subscriptions create fnaf-dead-letter-sub --project=funcy2022 --topic=fnaf-dead-letter --message-retention-duration=31d --expiration-period=never
```

* デッドレターのトピックは、サブスクリプションどうしで1つを共有する。どのサブスクリプションで失敗したかは、メッセージの属性`CloudPubSubDeadLetterSourceSubscription`で分かる
* `fnaf-dead-letter-sub`が無いと、デッドレターに送られたメッセージは残らない。31日（上限）まで残す
* `--expiration-period=never`: 既定では、31日使われないサブスクリプションは消える。長い休みで止まっても消えないようにする

### 5. イメージのビルド

```bash
gcloud artifacts repositories create fnaf --project=funcy2022 --location=asia-northeast1 --repository-format=docker
gcloud builds submit cloud --project=funcy2022 --region=asia-northeast1 --tag=asia-northeast1-docker.pkg.dev/funcy2022/fnaf/backend:COMMIT
```

* 1行目（リポジトリを作る）は初回だけ
* 1回だけビルドし、`ingest`と`worker`（と`app`）で同じイメージを使う。どのコミットのイメージかは、タグで分かる
* `--tag`を使うときは、`cloud/Dockerfile`の名前が大文字小文字まで合っている必要がある（`gcloud`がファイル名を完全一致で探すため）
* このプロジェクトのビルドはログをCloud Loggingにだけ書くので、`gcloud builds submit`にはログが流れない。コマンドが出すURLから見る

### 6. worker

```bash
gcloud run deploy worker --project=funcy2022 --region=asia-northeast1 --image=asia-northeast1-docker.pkg.dev/funcy2022/fnaf/backend:COMMIT --service-account=fnaf-worker@funcy2022.iam.gserviceaccount.com --no-allow-unauthenticated --max-instances=2 --set-env-vars="SERVICE_ROLE=worker,GCLOUD_PROJECT=funcy2022"
gcloud run services add-iam-policy-binding worker --project=funcy2022 --region=asia-northeast1 --member=serviceAccount:fnaf-invoker@funcy2022.iam.gserviceaccount.com --role=roles/run.invoker
```

* `GCLOUD_PROJECT`は必ず渡す。Cloud Runは自動では入れないので、無いとコードの既定値（`fun-now-and-future`）のFirestoreとPub/Subにつなぎに行く
* `--service-account`を付け忘れると、編集者のロールを持つ既定のサービスアカウントで動いてしまう
* 2行目は初回だけ。`worker`を呼べるのは、Pub/SubのプッシュとCloud Schedulerが使う`fnaf-invoker`だけにする（ADR 0010）
* `--max-instances`は仮の値

### 7. サブスクリプション

```bash
gcloud pubsub subscriptions create scan-events-bq --project=funcy2022 --topic=scan-events --bigquery-table=funcy2022:fnaf_analytics.scan_events --use-table-schema --write-metadata --dead-letter-topic=fnaf-dead-letter --max-delivery-attempts=5 --expiration-period=never
gcloud pubsub subscriptions create scan-events-push --project=funcy2022 --topic=scan-events --push-endpoint=https://worker-638313186296.asia-northeast1.run.app/pubsub/scan-events --push-auth-service-account=fnaf-invoker@funcy2022.iam.gserviceaccount.com --push-auth-token-audience=https://worker-638313186296.asia-northeast1.run.app --ack-deadline=60 --min-retry-delay=10s --max-retry-delay=600s --dead-letter-topic=fnaf-dead-letter --max-delivery-attempts=5 --expiration-period=never
gcloud pubsub subscriptions add-iam-policy-binding scan-events-bq --project=funcy2022 --member=serviceAccount:service-638313186296@gcp-sa-pubsub.iam.gserviceaccount.com --role=roles/pubsub.subscriber
gcloud pubsub subscriptions add-iam-policy-binding scan-events-push --project=funcy2022 --member=serviceAccount:service-638313186296@gcp-sa-pubsub.iam.gserviceaccount.com --role=roles/pubsub.subscriber
```

* `--write-metadata`: `scan_events`の`message_id`などの列に、メッセージの情報を書く
* 5回試しても届かなかったメッセージは、`fnaf-dead-letter`に送る。最後の2行は、そのときに元のメッセージを確認済みにするための権限
* `--ack-deadline=60`: 止まっていた`worker`が起き上がるのを待つため
* サブスクリプションの無いトピックにpublishしたデータは消える。ESP32の送り先を変えるのは、ここまで済んでから

### 8. ingest

```bash
gcloud run deploy ingest --project=funcy2022 --region=asia-northeast1 --image=asia-northeast1-docker.pkg.dev/funcy2022/fnaf/backend:COMMIT --service-account=fnaf-ingest@funcy2022.iam.gserviceaccount.com --allow-unauthenticated --max-instances=3 --set-env-vars="SERVICE_ROLE=ingest,GCLOUD_PROJECT=funcy2022,SCAN_EVENTS_TOPIC=scan-events,PR_ASSET_BUCKET=funcy2022-fnaf-pr-assets" --set-secrets="MAC_HASH_KEY=mac-hash-key:1,ESP32_API_KEY=esp32-api-key:1"
```

* `SERVICE_ROLE=ingest`なので、`app`のルート（`/pr-assets`）と`worker`のルートは載らない
* 鍵は版（`:1`）を指定する。`latest`にすると、新しい版を足したときに、インスタンスによって違う鍵を読むことがある。ESP32のキーを替えるときは、新しい版を足し、ここの番号を変えてデプロイし直す
* `PR_ASSET_BUCKET`は、広報アセットの公開バケット。バケットは`app`のときに作る。それまでは承認済みのアセットが無いので、`/signage/assets`は空の一覧を返し、URLも作られない
* `--max-instances`は仮の値。誰でも呼べるサービスなので、叩かれたときの費用をここで抑える

### 9. Cloud Scheduler

```bash
gcloud scheduler jobs create http aggregate --project=funcy2022 --location=asia-northeast1 --schedule="1-59/5 * * * *" --time-zone=Etc/UTC --uri=https://worker-638313186296.asia-northeast1.run.app/aggregate --http-method=POST --oidc-service-account-email=fnaf-invoker@funcy2022.iam.gserviceaccount.com --oidc-token-audience=https://worker-638313186296.asia-northeast1.run.app
gcloud scheduler jobs create http calc-max-device --project=funcy2022 --location=asia-northeast1 --schedule="0 19 * * *" --time-zone=Etc/UTC --uri=https://worker-638313186296.asia-northeast1.run.app/internal/batch/calc-max-device --http-method=POST --oidc-service-account-email=fnaf-invoker@funcy2022.iam.gserviceaccount.com --oidc-token-audience=https://worker-638313186296.asia-northeast1.run.app
```

* `/aggregate`は、窓が閉じた1分後に呼ぶ（[configuration.md](configuration.md)）
* 基準値のバッチは、UTCの19時（日本時間の4時）に呼ぶ

### 10. 確かめて、片付ける

[動作の確認](#動作の確認)をすべて済ませてから、元のリポジトリのディレクトリに戻り（名前はクローンしたときのもの）、作業用のディレクトリを消す。

```bash
cd ../fun-now-and-future-backend
git worktree remove ../fnaf-deploy
```

## コードを変えたとき

手順0、5の2行目、6の1行目、8を行い、[動作の確認](#動作の確認)のスクリプトを実行してから、作業用のディレクトリを消す。

## 動作の確認

### スクリプト

```bash
node cloud/scripts/check-deploy.mjs
node cloud/scripts/check-deploy.mjs --send
```

| 確かめること | 中身 |
| --- | --- |
| 設定 | サービスアカウント、環境変数、誰が呼べるか（`ingest`は誰でも、`worker`は`fnaf-invoker`） |
| ルート | `ingest`に`/pr-assets`と`worker`のルートが無い（404）。`/doc`に`/pr-assets`が無い。`worker`に`ingest`と`app`のルートが無い |
| 認証 | `ingest`は、APIキーが無いか違うと401。`worker`は、トークンが無いと401か403、ログインしている人のトークンなら200 |
| Firestore | `/signage/assets`が200、存在しないlocationの`/getCongestion`と`/getCongestionHistory`が404。500なら、`GCLOUD_PROJECT`、`fnaf-ingest`の権限、複合インデックスのどれかを疑い、ログを見る |
| 受信から集計まで（`--send`） | テストのデータを1件送り、集計されて`/getCongestion`に出るまで待つ（最大10分）。Pub/Subのプッシュ、`fnaf-invoker`のトークン、Cloud Schedulerも通る |

* `--send`は、location、nodeIdとも`deploy_check`のデータを残す（[テストのデータの片付け](#テストのデータの片付け)）
* NGがあると、終了コードが1になる

### BigQuery

```bash
bq --project_id=funcy2022 query --use_legacy_sql=false "SELECT receivedAt, sendId, ARRAY_LENGTH(devices) AS devices FROM fnaf_analytics.scan_events WHERE receivedAt >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR) AND nodeId = 'deploy_check'"
```

* 行が出れば、`receivedAt`のISOの文字列を、TIMESTAMPの列が受け付けている（PR #42の「確認できていないこと」）
* 行が出ないときは、デッドレターを見る

### デッドレター

```bash
gcloud pubsub subscriptions pull fnaf-dead-letter-sub --project=funcy2022 --limit=5
```

* `Listed 0 items.`なら、失敗したメッセージは無い
* `--auto-ack`を付けていないので、見てもメッセージは消えない

### ログとCloud Scheduler

```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=(ingest OR worker) AND severity>=WARNING" --project=funcy2022 --freshness=1h --limit=20
gcloud scheduler jobs describe aggregate --project=funcy2022 --location=asia-northeast1 --format="yaml(state,lastAttemptTime,status)"
gcloud scheduler jobs run calc-max-device --project=funcy2022 --location=asia-northeast1
```

* `status`に`code`があれば、前回の呼び出しは失敗している
* 基準値のバッチは1日1回なので、3行目で今すぐ1回動かし、ログで結果と実行時間を見る（PR #49の「確認できていないこと」）

### テストのデータの片付け

`--send`のデータは、location、nodeIdとも`deploy_check`なので、本物の場所の台数や基準値には混ざらない。Firestoreのものは、[コンソール](https://console.cloud.google.com/firestore/databases/-default-/data?project=funcy2022)で消す。

* `status/node_last_seen`の`nodes.deploy_check`: 消す。残すと、送らなくなったテストのノードが、稼働時間帯に停止と判定され、ログに`node_down`が出る（ADR 0015）
* `congestion_records`、`node_health_stats`、`daily_summaries`、`excluded_records`の`deploy_check`のもの: 消してもよい
* BigQueryの`scan_events`の行: 残る。分析では`nodeId`と`location`で除く

## ESP32に渡すもの

[動作の確認](#動作の確認)がすべてOKになってから渡す。

* 送り先: `https://ingest-638313186296.asia-northeast1.run.app/receiveSensorData`（ヘッダー`x-api-key`にAPIキーを入れる）
* APIキー: 次のコマンドで表示し、公開されない方法で渡す。issue、PR、このリポジトリには書かない

```bash
gcloud secrets versions access 1 --secret=esp32-api-key --project=funcy2022
```

## appのデプロイ

投稿画面と管理画面向けの`app`は、認証のコードのレビューが済んでから、次の手順でデプロイする。`ingest`と`worker`のデプロイが済んでいる前提にする。

* Auth0のテナントと、API（識別子`https://fun-now-and-future/api`）、クレームを足すActionができている（[configuration.md](configuration.md)の`app`の説明）
* 投稿画面（と管理画面）のFirebase Hostingのサイトが、`fun-now-and-future-510007`にある
* `fnaf-app`のプロジェクト単位のロールが付いている（[development.md](development.md#サービスアカウントとiamロール)）

| 種類 | 名前 | 用途 |
| --- | --- | --- |
| Cloud Run | `app` | 投稿と、投稿した人のダッシュボード。誰でも呼べる（Auth0のアクセストークンはアプリの中で確かめる） |
| Cloud Storage | `funcy2022-fnaf-pr-assets` | 公開バケット。承認した画像を置き、サイネージが直接読む |
| Cloud Storage | `funcy2022-fnaf-pr-assets-private` | 非公開のバケット。投稿された画像を、承認の前に置く |

URLは`https://app-638313186296.asia-northeast1.run.app`になる。

### A1. バケット

```bash
gcloud storage buckets create gs://funcy2022-fnaf-pr-assets --project=funcy2022 --location=asia-northeast1 --uniform-bucket-level-access
gcloud storage buckets create gs://funcy2022-fnaf-pr-assets-private --project=funcy2022 --location=asia-northeast1 --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets add-iam-policy-binding gs://funcy2022-fnaf-pr-assets --member=allUsers --role=roles/storage.legacyObjectReader
gcloud storage buckets add-iam-policy-binding gs://funcy2022-fnaf-pr-assets --member=serviceAccount:fnaf-app@funcy2022.iam.gserviceaccount.com --role=roles/storage.objectUser
gcloud storage buckets add-iam-policy-binding gs://funcy2022-fnaf-pr-assets-private --member=serviceAccount:fnaf-app@funcy2022.iam.gserviceaccount.com --role=roles/storage.objectUser
```

* バケットの名前は世界で1つなので、頭にプロジェクトIDを付ける。公開バケットの名前は、手順8の`PR_ASSET_BUCKET`と同じにする
* 公開バケットの`allUsers`には、`roles/storage.legacyObjectReader`だけを付ける。名前を知っている画像だけを読める。`roles/storage.objectViewer`は一覧を見る権限を含むので付けない（ADR 0006）
* 非公開のバケットには`--public-access-prevention`を付け、誤って公開する設定を足せないようにする
* `fnaf-app`は、非公開のバケットに画像を置き、読み（承認のときのコピー元）、消す。公開バケットには、コピーし、消す（取り下げ）。どちらにも`roles/storage.objectUser`を付ける

### A2. 環境変数のファイル

`APP_ALLOWED_ORIGINS`の値はカンマを含むので、環境変数はファイルで渡す。`gcloud`で区切り文字を変える書き方（`^@^`）は、Windowsでは`^`を重ねる必要があり、同じ1行では動かないため。

作業用のディレクトリの外に、次の内容で`fnaf-app.env.yaml`を作る（`git worktree remove`は、追跡していないファイルがあると消せないため）。秘密の値は入らない。

```yaml
SERVICE_ROLE: "app"
GCLOUD_PROJECT: "funcy2022"
AUTH0_DOMAIN: "TENANT_DOMAIN"
AUTH0_AUDIENCE: "https://fun-now-and-future/api"
PR_ASSET_BUCKET: "funcy2022-fnaf-pr-assets"
PR_ASSET_PRIVATE_BUCKET: "funcy2022-fnaf-pr-assets-private"
APP_ALLOWED_ORIGINS: "https://POST_SITE.web.app,https://POST_SITE.firebaseapp.com"
```

| 置き換えるもの | 入れる値 |
| --- | --- |
| `TENANT_DOMAIN` | Auth0のテナントのドメイン（`https://`と末尾の`/`は付けない） |
| `POST_SITE` | 投稿画面のHostingのサイト名。管理画面のサイトができたら、そのオリジン2つもカンマで足す |

### A3. app

```bash
gcloud run deploy app --project=funcy2022 --region=asia-northeast1 --image=asia-northeast1-docker.pkg.dev/funcy2022/fnaf/backend:COMMIT --service-account=fnaf-app@funcy2022.iam.gserviceaccount.com --allow-unauthenticated --max-instances=2 --env-vars-file=../fnaf-app.env.yaml
```

* `COMMIT`は、`ingest`と`worker`と同じイメージのタグ（手順5）
* `--env-vars-file`で渡すと、環境変数はファイルにあるものだけになる
* 起動時に`AUTH0_DOMAIN`、`AUTH0_AUDIENCE`、`PR_ASSET_PRIVATE_BUCKET`、`APP_ALLOWED_ORIGINS`を確かめる。無いか、オリジンの形でなければ起動に失敗する（前のリビジョンがあれば、それが動き続ける）
* `--max-instances`は仮の値

### A4. 確かめる

```bash
node cloud/scripts/check-deploy.mjs --app
```

* `ingest`と`worker`の確認に加えて、`app`とバケットの設定、トークンが無いと401になること、`ingest`と`worker`のルートが無いこと、許したオリジンにだけCORSを返すことを確かめる
* ログインして投稿するところは、投稿画面から確かめる

### appでまだ決まっていないこと

* 非公開のバケットのライフサイクル（却下や取り下げをしたファイルを消す日数と、審査を待っているファイルを消さない方法）
* 公開バケットの画像のキャッシュ。取り下げても、配られた画像が最大1時間キャッシュに残ることがある（PR #104）
* 環境変数のファイルを、値が決まった後にリポジトリに入れるか

## 集計の履歴を足すとき

集計の履歴（`aggregate_runs`。窓ごとの台数、各段の通過数、使った設定）を貯めるときは、次を行ってから、手順6の1行目の`--set-env-vars`に`AGGREGATE_RUNS_TOPIC=aggregate-runs`を足して`worker`をデプロイし直す。

```bash
bq --project_id=funcy2022 mk --table --time_partitioning_field=windowStart --time_partitioning_type=DAY fnaf_analytics.aggregate_runs cloud/bigquery/aggregate_runs.schema.json
bq --project_id=funcy2022 add-iam-policy-binding --member=serviceAccount:service-638313186296@gcp-sa-pubsub.iam.gserviceaccount.com --role=roles/bigquery.dataEditor fnaf_analytics.aggregate_runs
gcloud pubsub topics create aggregate-runs --project=funcy2022
gcloud pubsub topics add-iam-policy-binding aggregate-runs --project=funcy2022 --member=serviceAccount:fnaf-worker@funcy2022.iam.gserviceaccount.com --role=roles/pubsub.publisher
gcloud pubsub subscriptions create aggregate-runs-bq --project=funcy2022 --topic=aggregate-runs --bigquery-table=funcy2022:fnaf_analytics.aggregate_runs --use-table-schema --dead-letter-topic=fnaf-dead-letter --max-delivery-attempts=5 --expiration-period=never
gcloud pubsub subscriptions add-iam-policy-binding aggregate-runs-bq --project=funcy2022 --member=serviceAccount:service-638313186296@gcp-sa-pubsub.iam.gserviceaccount.com --role=roles/pubsub.subscriber
```

* `aggregate_runs`にはメタデータの列が無いので、`--write-metadata`は付けない
* 入れ子の配列（`locations[].stageTrace[]`）をBigQueryサブスクリプションが受け付けるかは、まだ確かめていない（PR #46の「確認できていないこと」）。足した後に1回集計させて、行が入るか、デッドレターに入らないかを見る

## この文書でまだ扱っていないこと

* デッドレターと未確認のメッセージのアラート（ADR 0010）、ノードの停止のアラート（ADR 0015）
* 予算のアラート
* Artifact Registryの古いイメージの削除（クリーンアップポリシー）
