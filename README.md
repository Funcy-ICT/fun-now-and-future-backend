# Fun Now and Future - Backend

キャンパス内の混雑度リアルタイム可視化システム「Fun Now and Future」のバックエンド。
ESP32 から送信される BLE 検知データを受け取り、混雑度を計算して、サイネージに返す。
Hono（TypeScript）を Cloud Run で動かし、Firestore、Pub/Sub、BigQuery を使う。

![構成図](docs/images/architecture.svg)

全体の構成と、仕様がどこに書いてあるかは、[docs/overview.md](docs/overview.md) にまとめている。


## 読む人ごとの入口

| 読む人 | 最初に読むもの | そのあと |
| --- | --- | --- |
| バックエンド | [docs/overview.md](docs/overview.md) | [開発の手順](docs/development.md)、[設定](docs/configuration.md)、[ADRの一覧](docs/adr/README.md) |
| フロント（サイネージ） | [docs/overview.md](docs/overview.md) | [#25](https://github.com/Funcy-ICT/fun-now-and-future-backend/issues/25)（レスポンスの読み方）、Swagger（下記）、フロント向けの[#56](https://github.com/Funcy-ICT/fun-now-and-future-backend/issues/56) |
| フロント（管理画面） | [docs/overview.md](docs/overview.md) | [管理画面との型の共有（Hono RPC）](docs/api.md#管理画面との型の共有hono-rpc)、[ADR 0005](docs/adr/0005-admin-ui-library.md) |
| ハード（ESP32） | [docs/overview.md](docs/overview.md) | Swagger（下記）の`POST /receiveSensorData`、[#35](https://github.com/Funcy-ICT/fun-now-and-future-backend/issues/35) |


## API の仕様（Swagger）
リクエストとレスポンスの形は、Swagger UI で見る。コードの定義から自動で作られるので、一番新しい。

* ローカル: [http://localhost:8080/ui](http://localhost:8080/ui)（先にサーバーを起動する。下の「ローカルで動かす」）
* OpenAPI の JSON: [http://localhost:8080/doc](http://localhost:8080/doc)
* Base URL: まだデプロイしてない

エンドポイントの一覧と、Swagger に載らない内部用のエンドポイントは、[docs/api.md](docs/api.md)。


## ローカルで動かす

```bash
cd cloud
npm install
npm run build
MAC_HASH_KEY=$(openssl rand -hex 32) SCAN_EVENTS_TOPIC=scan-events ESP32_API_KEY=local-dev-key npm start
```

* `http://localhost:8080` で待ち受ける。値はどれもローカル用のダミー。本物の鍵やキーは使わない
* Swagger UI で`/signage/assets`などを試すときは、「Authorize」に`local-dev-key`を入れる
* Firestore を読むルート（`/getCongestion`など）を試すには、Firestore のエミュレータが要る。手順とテストの実行は
  [docs/development.md](docs/development.md)


## ディレクトリ

| ディレクトリ | 中身 |
| --- | --- |
| `cloud/` | バックエンド（Cloud Run で動かすもの） |
| `admin/` | 管理画面（Vite + React。まだ初期状態） |
| `docs/` | 文書。[overview.md](docs/overview.md)（全体）、[api.md](docs/api.md)（API）、[configuration.md](docs/configuration.md)（環境変数と設定）、[development.md](docs/development.md)（開発とデプロイ）、[adr/](docs/adr/README.md)（設計判断の記録） |


## 今の状態と、残っている作業
[#57](https://github.com/Funcy-ICT/fun-now-and-future-backend/issues/57) にまとめている。
