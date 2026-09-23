# 0002. Firebase FunctionsをやめてCloud Runで動かし、層に分ける

- ステータス: 採用
- 決定日: 2026-07-28（実施したコミットの日付）
- 記録日: 2026-08-06（事後記録）
- 起票: chirushiyo
- 関連: #2, #12, ADR 0001

## 背景

バックエンドはFirebase Functionsの上で動いていたが、Functions特有の機能（トリガー、`onCall`など）は使っておらず、単なるHTTP APIとして使っていただけだった。Notionの構成図（ADR 0001）では、もともとCloud Runを想定していた。

また、すべての処理が`index.ts`に集まっていた。

## 決定

1. Firebase Functionsをやめ、`@hono/node-server`の`serve()`で起動するコンテナとしてCloud Runで動かす
2. コードを次の層に分ける
   - `controllers/`: HTTPの受け口（リクエストの検証、レスポンスの組み立て）
   - `services/`: 業務の処理（混雑度の計算など）
   - `repositories/`: Firestoreなどへの読み書き
   - `middlewares/`: 認証などの横断的な処理
3. `index.ts`を、アプリの組み立て（`app.ts`）とサーバーの起動（`index.ts`）に分ける

2と3は、実行環境の移行に必須ではない。別の判断として同時に行った。

## 理由

- Functionsの機能を使っていないので、Functionsに縛られる理由がない。Cloud Runなら、コンテナとして動かせ、ローカルと本番の差も小さい
- 層に分けると、Firestoreに依存しない処理（`services/`）をエミュレータなしでテストできる
- `app.ts`と`index.ts`の分割については、テストから`index.ts`を読み込むと`serve()`が走り、テストごとにポート8080を取り合ったため

## 結果

- 移行の手間が小さかったのは、Functions特有の機能に依存していなかったからで、フレームワークのおかげではない。Honoの寄与は、ルートの定義を書き換えずに済んだことに限られる
- 層の境界は、その後も何度か直している（#30: サービス層がHonoの`Context`を受け取っていたのを、コントローラー層へ移した）

記録の時点で残っていた課題と、その後の状況:

| **課題** | **その後** |
|---|---|
| `ble_device_count`の食い違い（受信側が送らなくなったのに、混雑度の計算が依存していた） | #28で`congestion_records`を読む形に書き換えて解消 |
| リポジトリ層がFirestoreの`QuerySnapshot`をそのまま返していた | その後の書き換えで、サービス層に`QuerySnapshot`は出てこなくなった |
| `controllers/signage.ts`などがスタブのまま | #20, #28で実装 |
| Dockerfileの多段ビルド（本番のイメージからdevDependenciesを外す） | 未対応（`cloud/dockerfile`は1段のまま） |
| Cloud Runへの実際のデプロイ | 記録の時点では未実施 |

## 実装

- `113fbb4`レイヤー分離（2026-07-28）
- `57cc9af` Cloud Run用の変更（loggerの置き換え、appのexport、`app.ts`と`index.ts`の分離、テストの書き直し）
- `62cbfe1` Dockerfileと`.dockerignore`の追加
- `86f864e`テストのスクリプトのWindows専用の構文を修正
- `cf2196b` `routes`ディレクトリの削除（2026-07-29）
- `1b6b1d8`サービス層に残っていたエンドポイントをコントローラー層へ移動（2026-08-01）
- `ee99c7d`, `54803d2`, `cd4e936`ディレクトリ名を`functions`から`cloud`に変更し、Functions用のスクリプトを削除（2026-09-06, #12）

## 一次資料

- issue #2
- issue #10「その後の経緯」
