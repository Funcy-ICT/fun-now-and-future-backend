#!/bin/bash
# サイネージのページを Chromium の全画面（キオスクモード）で開く。デスクトップへのログイン時に自動で起動する。
# Chromium が落ちたら開き直す。毎朝、画面を点けるときにも開き直す（display_power.sh on）
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=/dev/null
source "$DIR/signage.env"

CHROMIUM="$(command -v chromium || command -v chromium-browser)"
if [ -z "$CHROMIUM" ]; then
  echo "chromium is not installed" >&2
  exit 1
fi

# ネットワークがつながるまで待つ。つながる前に開くと、エラーのページのまま止まる
until curl -s -o /dev/null --max-time 5 "$SIGNAGE_URL"; do
  echo "waiting for network: $SIGNAGE_URL"
  sleep 5
done

while true; do
  "$CHROMIUM" \
    --kiosk \
    --incognito \
    --noerrdialogs \
    --disable-infobars \
    --disable-session-crashed-bubble \
    --no-first-run \
    --password-store=basic \
    --check-for-update-interval=31536000 \
    --autoplay-policy=no-user-gesture-required \
    "$SIGNAGE_URL"
  echo "chromium exited ($?), restarting in 5s"
  sleep 5
done
