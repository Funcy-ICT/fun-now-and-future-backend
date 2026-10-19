# 0012. フィルタの検証はBigQueryで行い、scan_diagnosticsは保持期間を超えて残すための控えにする

- ステータス: 採用
- 決定日: 2026-10-11
- 起票: chirushiyo
- 関連: ADR 0007（決定5の位置づけを置き換える）, ADR 0010, ADR 0013, ADR 0014, #22, #40

## 背景

ADR 0007では、`/aggregate`のたびに生データが消えるため、フィルタの前提（Appleに限る、RSSIの閾値）を確かめる元データとして`scan_diagnostics`を作った。診断モード（`config/filter_pipeline.debugModeEnabled`）が有効な間だけ、重複排除の直後の端末（使い捨てのUUID、RSSI、Company ID、Nearby Infoの有無、検出回数）を、locationと5分窓ごとに保存する。設計メモ2.7でも、RSSIの閾値は、このモードで数週間分溜めたデータを見ながら調整すると決めていた。

その後、ADR 0010で、生データをすべてBigQueryの`scan_events`に貯めるようになった。`scan_events`は検出1件ずつに`nodeId`、`macHash`、RSSI、Company ID、`rawData`を持ち、`scan_diagnostics`より情報が多い。分析用のSQL（`services/analysis_sql.ts`）で、任意の設定での台数と各段の通過数も出せる。

一方、`scan_events`にはハッシュ化したMACと`rawData`が入るので、保持期間は費用ではなくプライバシーの方針で決める（#40）。今は無期限だが、短くすると、それより古い期間はBigQueryでは調べられなくなる。`scan_diagnostics`には、MACもそのハッシュも`rawData`も無い。

管理画面に閾値の調整や分析の画面を作るにあたり、どちらを読むかを決める必要があった。

## 決定

1. フィルタの検証と閾値の調整（RSSIの分布、設定を変えたときの台数）は、BigQueryの`scan_events`から行う。管理画面のこれらの画面も、BigQueryを読む
2. `scan_diagnostics`は、`scan_events`の保持期間を超えて残すための控えと位置づける。書き込む処理と`debugModeEnabled`は残す
3. 診断モードは既定のオフのままにし、デプロイのときもオンにしない。オンにするときは、Firestoreコンソールで切り替える。管理画面には出さない

## 理由

- 保持期間の中なら、BigQueryで`scan_diagnostics`と同じことができる。さらに、重複排除の前の検出、窓をまたいだ同じ端末、`rawData`の読み直しもできる
- 管理画面からのクエリの費用は、パーティションの指定（ADR 0010）と、課金の上限（`BQ_MAX_BYTES_BILLED`、既定5GiB）で抑えられる
- `scan_diagnostics`はMACもハッシュも含まず、UUIDは窓ごとの使い捨てなので、プライバシーの方針で`scan_events`を短くしても長く残せる。役に立つのは、保持期間を短くしたあとに、それより古い期間を調べるときになる
- オンにしない: 今の保持期間は無期限で、同じ情報がBigQueryに残る
- 画面に出さない: 切り替える場面は、保持期間を短くするときくらいで、頻度が低い

## 検討した選択肢

| **選択肢** | **採用しなかった理由** |
|---|---|
| 診断モードのデータで閾値を調整する（設計メモ2.7の決定） | BigQueryの方が情報が多い。BigQueryにはデプロイのときから溜まるので、診断モードをオンにして数週間待つ必要もない |
| 診断モードをやめる（書き込む処理と設定を消す） | 保持期間を短くしたときに、MACを含まない形で長く残す手段がなくなる |
| デプロイのときから診断モードをオンにする | 保持期間が無期限の間は、同じ情報がBigQueryに残る。Firestoreの書き込みと保存量が増える |

## 結果

- 保持期間を短くすると、管理画面で調べられる期間も短くなる。それより古い期間も調べたいなら、短くする前に診断モードをオンにしておく。オフだった期間の分は、BigQueryにデータが残っているうちなら、SQLで後から作れる（作る処理は別に書く）
- `debugModeEnabled`という名前は、この位置づけと合わない。変えても`configHash`は変わらない（ハッシュは`stages`だけから作る）が、急がない
- 管理画面でフィルタの設定を保存するときは、`debugModeEnabled`を受け取らず、サーバーが今の値を引き継ぐ（ADR 0014）

## 残っている課題

- `scan_diagnostics`の保持期間（TTL）。長く残すための控えなので、付けるとしても年単位にする。`devices`は検索に使わないので、自動のインデックスから外す
- ノードごとのRSSIを入れたあとの`scan_diagnostics`の形（ADR 0013）
- 保持期間を短くする前に診断モードをオンにする、という手順を、`docs/configuration.md`の保持期間の節に書く

## 実装

- 決定2、3は、今のコードのまま
- `docs/configuration.md`（Firestoreの設定ドキュメントの表）、`docs/api.md`、`schema/scan_diagnostics.ts`のコメントは、診断モードの切り替えを`config/diagnostics`と書いていた。実際のコードが読む`config/filter_pipeline.debugModeEnabled`（ADR 0007の「実装」の表のとおり）に直した
- 決定5の端末ごとの検出（`detections`）は、ADR 0013の実装（#83）で`scan_diagnostics`に足した

## 一次資料

- 2026-10-11の検討（記録はこのADR）
- 設計メモ「FNaF 管理画面・データ基盤 設計メモ」2.7、3.5（2026-09-20、リポジトリの外）
- issue #22, #40
