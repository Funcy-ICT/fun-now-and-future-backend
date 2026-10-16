# サイネージの Raspberry Pi

3階玄関付近のディスプレイに、サイネージのページを全画面で表示する。表示する画面（混雑度と広報の画像）はフロント担当が
Web ページとして作り、ラズパイはそのページを開いておくだけ。構成は[systemConfigurationDiagram.md](../systemConfigurationDiagram.md)。

| ファイル | 中身 |
| --- | --- |
| `install.sh` | 設定をまとめて行う。ラズパイの上で1回実行する |
| `kiosk.sh` | Chromium をキオスクモード（全画面）で開く。落ちたら開き直す |
| `display_power.sh` | 画面を点ける（`on`）、消す（`off`）。cron から呼ぶ |
| `signage.env.example` | 設定のひな形（表示する URL、点灯と消灯の時刻） |

## 前提

- Raspberry Pi 4、Raspberry Pi OS（Bookworm、デスクトップ付き、64bit）
- 画面の表示は Wayland（labwc）。2024年10月以降の Raspberry Pi OS の既定
- ネットワーク（Wi-Fi か有線 LAN）は、OS を入れるときに Raspberry Pi Imager で設定しておく

## 設定の手順

1. Raspberry Pi Imager で OS を書き込む。ユーザー名、Wi-Fi、SSH を設定しておく
2. このフォルダをラズパイにコピーする（例: `scp -r hardware/raspberrypi <ユーザー>@<ラズパイ>:~/`）
3. ラズパイの上で実行する
   ```bash
   cd ~/raspberrypi
   ./install.sh
   ```
4. `~/fnaf-signage/signage.env`の`SIGNAGE_URL`を、表示するページの URL に書き換える
5. `sudo reboot`で再起動する。デスクトップに自動でログインし、ページが全画面で開く

`install.sh`がすること
- `chromium`、`wlr-randr`、`curl`を入れる
- `kiosk.sh`と`display_power.sh`を`~/fnaf-signage/`に置き、設定のひな形をコピーする
- 時刻帯を日本時間にする
- デスクトップに自動でログインし、画面が暗くならない（ブランクしない）ようにする
- ログイン時に`kiosk.sh`を起動する（`~/.config/labwc/autostart`）
- `DISPLAY_ON`と`DISPLAY_OFF`の時刻に、画面を点けて消すよう cron に登録する

## 動き

- 起動すると、ページの URL につながるまで待ってから Chromium を開く。つながる前に開くと、エラーのページのまま止まるため
- Chromium が落ちたら、5秒後に開き直す
- 毎朝、画面を点けるときに Chromium を開き直す。一晩開いたままのページで、表示が古くなったり止まったりしないため
- ページの中の更新（混雑度を取り直す間隔など）は、ページ側（フロント）が行う
- ログは`~/fnaf-signage/kiosk.log`と`~/fnaf-signage/display.log`

## 手で操作するとき

```bash
~/fnaf-signage/display_power.sh off   # 画面を消す
~/fnaf-signage/display_power.sh on    # 画面を点けて、ページを開き直す
```

SSH から実行してもよい（Wayland の環境変数はスクリプトが補う）。

## 決まっていないこと

- 表示するページの URL。フロント担当が作る。まだ無い（[hardware/README.md](../README.md)の22）
- 画面を点ける時刻と消す時刻（仮に7時〜22時）
- マウスのカーソルが画面に残ることがある。Wayland では隠す方法が限られるので、実機で確かめる
- 実機ではまだ動かしていない。スクリプトは文法の確認だけ
