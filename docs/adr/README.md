# ADR（設計判断の記録）

fun-now-and-future-backendの設計判断を、1件1ファイルで残す。また、判断の要点と一次資料へのリンクをリポジトリ内のファイルとして持つ。議論の全文は元のissueに残っている。


## 一覧

| 番号 | 題名 | ステータス | 決定日 | 元のissue |
|---|---|---|---|---|
| [0001](0001-backend-language-and-framework.md) | バックエンドの言語にNode.js（TypeScript）、フレームワークにHonoを採用する | 採用 | 2026-07-06 | #10 |
| [0002](0002-cloud-run-and-layered-architecture.md) | Firebase FunctionsをやめてCloud Runで動かし、層に分ける | 採用 | 2026-07-28 | #2 |
| [0003](0003-pending-scans-one-document-per-post.md) | 受信データはPOST 1回分を1ドキュメントにまとめて保存する | 採用 | 2026-08-06 | #1 |
| [0004](0004-count-target-filter-and-accessory-exclusion.md) | 全デバイスを保存し、数える対象は集計時に絞る。アクセサリーは数えない | 採用 | 2026-09-05 | #11 |
| [0005](0005-admin-ui-library.md) | 管理画面のUIにHeroUI + Tailwind CSSを採用する | 採用 | 2026-09-07 | #14 |
| [0006](0006-signage-asset-delivery.md) | 広報アセットは公開バケットから直接配り、APIは一覧だけを返す | 一部を0011で置き換え | 2026-09-13 | #20 |
| [0007](0007-filter-pipeline.md) | フィルタの段構成を一か所にまとめ、設定で変えられるようにする | 一部を0012、0013で置き換え | 2026-09-14 | #22 |
| [0008](0008-congestion-level-and-baseline.md) | 混雑度は (location, 曜日) ごとの基準値に対する比で9段階にする | 一部を0009で置き換え | 2026-09-14 | #23 |
| [0009](0009-baseline-valid-days-and-lookback.md) | 基準値は、有効な日をN日集めるまで遡って計算する | 採用（実装は未マージ） | 2026-09-14 | #24 |
| [0010](0010-raw-data-to-bigquery-via-pubsub.md) | 生データはPub/Sub経由でBigQueryに貯め、表示用の値だけをFirestoreに置く | 採用 | 2026-09-20 | #36, #37 |
| [0011](0011-signage-asset-list-shape.md) | 広報アセットの一覧に、タグと説明を足し、ファイルのURLと種類をmediaにまとめる | 一部を0018で置き換え | 2026-10-15 | #64 |
| [0012](0012-filter-verification-in-bigquery.md) | フィルタの検証はBigQueryで行い、scan_diagnosticsは保持期間を超えて残すための控えにする | 採用 | 2026-10-11 | #22, #40 |
| [0013](0013-per-node-rssi-threshold.md) | RSSIの閾値をノードごとに持ち、どれか1つのノードで閾値を通った端末を数える | 採用（分析用のSQLは未実装） | 2026-10-11 | #72, #82 |
| [0014](0014-admin-config-version-and-history.md) | 管理画面から変える設定に、versionと変更の履歴を持たせる | 採用（一部実装） | 2026-10-11 | #69, #70, #71 |
| [0015](0015-node-down-alert.md) | ノードの停止は/aggregateで判定し、停止と復旧をメールで知らせる | 採用（メールのアラートは未実装） | 2026-10-11 | — |
| [0018](0018-signage-asset-images-only.md) | 広報アセットは画像だけにし、タグは1件に1つにする | 採用 | 2026-10-19 | #56 |

## 書き方

- 番号は決めた順に振る。issueの番号とは一致しない
- 1件に書くのは、1つの判断とその理由。作業の手順はissueやPRに書く
- 決定日と記録日が違う場合（事後記録）は、両方を書く。決定の時点の一次資料（Notionなど）があれば、リンクを貼る
- 後から判断を変えたときは、元のADRを書き換えずに新しいADRを足し、元のADRのステータスを「0009で置き換え」のように更新する
- 実装がADRと食い違っている箇所は、「実装との差分」に書く。どちらが正しいかを決めたら、ADRを足すか実装を直す

雛形は [template.md](template.md)。

## 注意

リポジトリは公開されている。認証の鍵の置き場所や、まだ直していない脆弱性等の詳細は、ADRに書かない。
