#!/bin/bash
# 画面を点ける（on）、消す（off）。cron から呼ぶ（install.sh が登録する）。
# Raspberry Pi OS（Bookworm）の Wayland（labwc）を前提に、wlr-randr で出力を切り替える
set -eu
DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=/dev/null
source "$DIR/signage.env"

# cron からはデスクトップの環境変数が見えないので、補う
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-0}"

OUTPUT="${DISPLAY_OUTPUT:-}"
if [ -z "$OUTPUT" ]; then
  OUTPUT="$(wlr-randr | awk 'NR==1 {print $1}')"
fi

case "${1:-}" in
  on)
    wlr-randr --output "$OUTPUT" --on
    # 一晩開いたままのページで、表示が古くなったり止まったりしないよう、開き直す（kiosk.sh が起動し直す）
    pkill -f -- "--kiosk" || true
    ;;
  off)
    wlr-randr --output "$OUTPUT" --off
    ;;
  *)
    echo "usage: $0 on|off" >&2
    exit 1
    ;;
esac
