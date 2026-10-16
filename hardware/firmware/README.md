# センサーノードのファームウェア（ESP32-S3）

周りの BLE 端末を1分ごとにスキャンし、役割に応じて送る。1つのスケッチを、`config.h`の`NODE_ROLE`で切り替えて
全部のノードに書き込む。構成は[systemConfigurationDiagram.md](../systemConfigurationDiagram.md)、作業と未定のことは
[hardware/README.md](../README.md)、送る形はバックエンドの[sensor_data.ts](../../cloud/src/schema/sensor_data.ts)。

| 役割（`NODE_ROLE`） | 置く場所 | すること |
| --- | --- | --- |
| `ROLE_WIFI` | 食堂① | スキャンし、Wi-Fi で`POST /receiveSensorData`へ`raw`形式で送る |
| `ROLE_GATEWAY` | 食堂② | `ROLE_WIFI`と同じことに加えて、LoRa で受けたバス停の分を`parsed`形式で送る |
| `ROLE_LORA_SENDER` | バス停② | スキャンし、自分の分と、UART で受けたバス停①の分を LoRa で送る |
| `ROLE_UART_SENDER` | バス停① | スキャンし、UART でバス停②へ渡す |

```
バス停①(UART_SENDER) ──UART──▶ バス停②(LORA_SENDER) ~~LoRa~~▶ 食堂②(GATEWAY) ──Wi-Fi──▶ クラウド
                                                         食堂①(WIFI)    ──Wi-Fi──▶ クラウド
```

| ファイル | 中身 |
| --- | --- |
| `fnaf_node/fnaf_node.ino` | スケッチ本体。周期、役割ごとの動き |
| `fnaf_node/config.example.h` | 設定のひな形。`config.h`にコピーして使う（`config.h`は git に入れない） |
| `fnaf_node/scan.*` | BLE のスキャン（非同期） |
| `fnaf_node/uploader.*` | Wi-Fi、送信、送れなかった分の再送 |
| `fnaf_node/adv_parse.*` | アドバタイズのパース。バックエンドの`parseRawData.ts`と同じ規則 |
| `fnaf_node/frame.*` | LoRa と UART で送るバイナリの形式 |
| `fnaf_node/e220.*` | LoRa モジュール E220-900T22S(JP) の設定と送信 |
| `fnaf_node/gateway.*` | LoRa で受けたフレームを1スキャン分にまとめ直して送る |
| `tools/mock_server.mjs` | 動作確認用の簡易な受け口。`GET /counts`で台数を見られる |
| `tools/parse_raw_data.mjs` | 受け口が使うパース。バックエンドの`parseRawData.ts`を JavaScript にしたもの |

## 準備（Arduino IDE）

1. ボードマネージャで「esp32 by Espressif Systems」（3.x）を入れる。3.3.10で確かめた
2. ライブラリマネージャで「NimBLE-Arduino」（2.x）を入れる。2.5.0で確かめた。1.x は API が違うので通らない
3. ツールメニュー
   - ボード: ESP32S3 Dev Module
   - USB CDC On Boot: Enabled（USB で`Serial`のログを見るため。ボードの USB ポートによる）
   - Partition Scheme: 既定のままで入る（ゲートウェイでフラッシュの93%）。足りなくなったら Huge APP にする
4. `fnaf_node/config.example.h`を`fnaf_node/config.h`にコピーし、`NODE_ROLE`と、その役割で使う項目を書く
5. `fnaf_node/fnaf_node.ino`を開いて書き込む。シリアルモニタは 115200 bps

ノードごとに変える項目

| 項目 | 食堂① | 食堂② | バス停① | バス停② |
| --- | --- | --- | --- | --- |
| `NODE_ROLE` | `ROLE_WIFI` | `ROLE_GATEWAY` | `ROLE_UART_SENDER` | `ROLE_LORA_SENDER` |
| `NODE_ID` / `LOCATION` | 書く | 書く | 使わない | 使わない |
| `LORA_NODE_NUMBER` | 使わない | 使わない | `1` | `2` |
| Wi-Fi、`API_URL`、`API_KEY` | 書く | 書く | 使わない | 使わない |
| `LORA_NODES` | 使わない | バス停の番号と nodeId の対応 | 使わない | 使わない |
| `LORA_CHANNEL`など | 使わない | バス停②と同じ値 | 使わない | 食堂②と同じ値 |

## 配線

ピンは`config.h`で変えられる。下は既定値（ESP32-S3 の GPIO 番号）。

E220-900T22S(JP)（食堂②、バス停②）

| E220 | ESP32-S3 | |
| --- | --- | --- |
| VCC | 5V | 3.3〜5.5V。データシートの標準は5V。送信時に約43mA |
| GND | GND | E220 の GND は全部つなぐ |
| RXD | GPIO17（`E220_TX_PIN`） | ESP32 の TX |
| TXD | GPIO18（`E220_RX_PIN`） | ESP32 の RX |
| M0 | GPIO5（`E220_M0_PIN`） | |
| M1 | GPIO6（`E220_M1_PIN`） | |
| AUX | GPIO7（`E220_AUX_PIN`） | |
| ANT | アンテナ | 金属のケースの中に入れない。上向きに立てる |

バス停①→②の UART

| バス停① | バス停② |
| --- | --- |
| GPIO16（`LINK_TX_PIN`） | GPIO15（`LINK_RX_PIN`） |
| GND | GND |

TTL の UART なので、線は数 m まで。離れるなら RS-485 の変換モジュールを挟む（[hardware/README.md](../README.md)の18）。

## LoRa で送る形

LoRa は1回200バイトまでなので、バス停ではパースしてバイナリに詰める（`frame.h`に詳しく書いてある）。

- 1台10バイト（MAC 6、RSSI 1、フラグ 1、Company ID 2）。1フレームに18台まで
- 1スキャンを複数のフレームに分け、ゲートウェイでスキャン ID ごとにまとめ直す。30秒待っても揃わなければ、届いた分で送る
- 1スキャンで送るのは72台まで（4フレーム）。超えたら RSSI の強い（近い）順に残す。値は仮
- 0台でもフレームを1つ送る。ゲートウェイが`devices: []`で送り、ノードが止まったのと区別できるようにする
- CRC-16 で壊れたフレームを捨てる。LoRa には再送が無いので、届かなかったフレームの分は数えられない
- `rawData`は送らない。Company ID と Nearby Info の有無は、バス停の ESP32 で`parseRawData.ts`と同じ規則でパースする

E220 は起動時に設定する（チャンネル`LORA_CHANNEL`、伝送速度 5,469bps、送信出力 13dBm、透過送信）。出荷時の送信出力は
「使用不可」なので、設定しないと送れない。シリアルモニタに`E220: config ok`と出れば設定できている。

## 動作確認

本物のサーバー（`cloud/`）は、受信のたびに Pub/Sub へ publish する。ローカルで Pub/Sub のエミュレータ（Java が要る）を
動かさないと 500 を返すので、デプロイまでは簡易な受け口で確かめる。

```bash
node hardware/firmware/tools/mock_server.mjs
```

- Mac の IP アドレス（`ipconfig getifaddr en0`）を調べ、`config.h`の`API_URL`を`http://<IP>:8080/receiveSensorData`にする。
  ESP32 と Mac は同じネットワークにつなぐ
- 受け口は、API キー、MAC の書式、RSSI の範囲、台数の上限、`parsed`の項目を調べ、受け取ったら形式、台数、`sendId`を
  ログに出す（MAC は出さない）。Apple の端末らしいものの数も出す
- 台数は、別のターミナルで`curl -s localhost:8080/counts`を実行して見る（`?limit=20`で行数を変えられる）。
  送信ごとの台数と、location ごとの5分の窓の台数（MAC の重複を除く。サーバーの集計と同じ区切り）を表で返す。
  「全部」は検出した端末、「Apple」は Company ID が 004C のもの、「対象」はサーバーが数える Apple の Nearby Info のもの。
  サーバーはさらに RSSI の閾値で絞るので、本物の台数は「対象」より少なくなることがある。記録はメモリだけで、受け口を
  止めると消える
- `FAIL_RATE=0.5 node ...`で、半分の確率で 500 を返す。再送で同じ`sendId`が届くと、ログに`(duplicate sendId)`と出る
- 検証は本物のサーバーの一部をまねただけ。正しさの基準は本物のサーバー

確かめる順番
1. 食堂①（`ROLE_WIFI`）だけで、受け口に`format=raw`で届くこと
2. 食堂②（`ROLE_GATEWAY`）とバス停②（`ROLE_LORA_SENDER`）を机の上で動かし、受け口に`node=esp32_busstop_02`、`format=parsed`で届くこと
3. バス停①（`ROLE_UART_SENDER`）を UART でつなぎ、`esp32_busstop_01`の分も届くこと
4. バス停と校舎の実際の距離で、LoRa が届くこと

シリアルモニタの例

```
scan: 23 found          ← どの役割でも
send: 200               ← 食堂①②
lora: node 2, 31 devices, 2/2 frames   ← 食堂②がバス停の分を受けた
link: frame from node 1 (1/2)          ← バス停②がバス停①の分を受けた
```

## 確かめたこと

- 4つの役割とも、Arduino ESP32 3.3.10 と NimBLE-Arduino 2.5.0 でコンパイルが通る
- フレームの組み立てとまとめ直し（40台を3フレームに分けて戻す、ゴミや壊れたフレームを読み飛ばす、0台）を、Mac の上の
  テストで確かめた
- アドバタイズのパースが、バックエンドの`parseRawData.ts`と同じ結果になることを、テストのデータ17件で確かめた
- 実機（ESP32、E220）ではまだ動かしていない

## #35 の依頼への対応

| 依頼 | 状態 |
| --- | --- |
| `sendId`（UUID）、再送で同じ値 | 対応。組み立てた JSON をそのままためるので、再送でも同じ値になる。バス停の分はゲートウェイが振る |
| ノードごとの API キー | 未対応。サーバーがまだ1つのキーだけ。`config.h`の`API_KEY`をノードごとに変えれば済む形にしてある |
| 4xx は再送しない | 対応。捨ててログに出す |
| 5xx と接続の失敗で再送、ためる量に上限 | 対応。次の送信のときに古い順で再送する。上限は 64KB（仮の値）で、超えたら古いものから捨てる |
| 応答のパース | 本文は読まず、ステータスだけで判断する |
| 送信のタイミングをずらす | 対応。ノードごとに0〜15秒ずらす |
| 証明書の検証を切らない | 対応。https で`ROOT_CA`が空なら送らない。`setInsecure()`は使わない |
| MAC の書式 | `AA:BB:CC:DD:EE:FF`（大文字、コロン区切り、先頭が最上位のバイト）。`raw`と`parsed`で同じ。並び順がサーバーの想定と合うかは、実機のデータで確かめる |
| `raw`で送る | 食堂は対応。バス停は LoRa の容量のため`parsed`（[hardware/README.md](../README.md)の15） |
| 1分ごと、keep-alive | 対応（`HTTPClient::setReuse(true)`） |
| アドレス種別（public / random） | 未対応。NimBLE の`getAddress().getType()`で取れるが、サーバーのスキーマに欄が無い。フィールド名を決めてから足す |

ほかに決めていないこと
- スキャンは10秒のパッシブスキャン（スキャン応答は取らない）。仮の設定
- Wi-Fi は WPA2-Personal だけ。eduroam のような企業認証には対応していない

## https で送るとき

デプロイ後に`API_URL`を`https://...`にしたら、`config.h`の`ROOT_CA`にルート証明書（PEM）を入れる。Cloud Run の
証明書は Google Trust Services が発行しているので、[https://pki.goog/repository/](https://pki.goog/repository/) から
ルート証明書（GTS Root R1 など）を取る。どのルートでつながるかは、デプロイ後に
`openssl s_client -showcerts -connect <ホスト>:443 </dev/null`で確かめる。ルート証明書には期限があるので、
差し替えの方法は別に決める。
