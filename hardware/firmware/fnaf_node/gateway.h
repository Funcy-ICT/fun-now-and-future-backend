// ゲートウェイ（食堂②）: LoRa で受けたバス停のフレームを1スキャン分にまとめ直し、parsed 形式でクラウドへ送る
#pragma once

// loop() から何度も呼ぶ。E220 は Serial1 につなぎ、先に e220Begin(Serial1) を呼んでおく
void gatewayPoll();
