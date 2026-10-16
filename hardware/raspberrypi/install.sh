#!/bin/bash
# サイネージ用の Raspberry Pi を設定する。ラズパイの上で、表示に使うユーザーで実行する（sudo は付けない）。
#   ./install.sh
# 何度実行してもよい。設定（signage.env）は、すでにあれば上書きしない
set -eu
SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/fnaf-signage"

echo "== パッケージ"
sudo apt-get update
sudo apt-get install -y wlr-randr curl
if ! command -v chromium >/dev/null && ! command -v chromium-browser >/dev/null; then
  sudo apt-get install -y chromium-browser || sudo apt-get install -y chromium
fi

echo "== スクリプトを $DEST に置く"
mkdir -p "$DEST"
install -m 755 "$SRC/kiosk.sh" "$SRC/display_power.sh" "$DEST/"
if [ ! -f "$DEST/signage.env" ]; then
  install -m 644 "$SRC/signage.env.example" "$DEST/signage.env"
  echo "   $DEST/signage.env を作った。SIGNAGE_URL を書き換えること"
fi

echo "== 時刻帯（cron の点灯と消灯は、この時刻帯で動く）"
sudo timedatectl set-timezone Asia/Tokyo

echo "== 自動ログインと、画面が暗くならない設定"
# B4 = デスクトップに自動ログイン。blanking 1 = 画面のブランク（省電力で暗くなる）を無効にする
sudo raspi-config nonint do_boot_behaviour B4
sudo raspi-config nonint do_blanking 1

echo "== ログイン時に kiosk.sh を起動する（labwc の autostart）"
AUTOSTART="$HOME/.config/labwc/autostart"
mkdir -p "$(dirname "$AUTOSTART")"
touch "$AUTOSTART"
LINE="$DEST/kiosk.sh > $DEST/kiosk.log 2>&1 &"
grep -qF "$DEST/kiosk.sh" "$AUTOSTART" || echo "$LINE" >> "$AUTOSTART"

echo "== 画面の点灯と消灯を cron に登録する"
# shellcheck source=/dev/null
source "$DEST/signage.env"
cron_line() {  # $1 = 時:分, $2 = on|off
  local h="${1%%:*}" m="${1##*:}"
  echo "$((10#$m)) $((10#$h)) * * * $DEST/display_power.sh $2 >> $DEST/display.log 2>&1"
}
{
  crontab -l 2>/dev/null | grep -v "$DEST/display_power.sh" || true
  cron_line "$DISPLAY_ON" on
  cron_line "$DISPLAY_OFF" off
} | crontab -

echo "== 完了。sudo reboot で再起動すると、サイネージが開く"
echo "   点灯と消灯の時刻を変えたら、もう一度 ./install.sh を実行する"
