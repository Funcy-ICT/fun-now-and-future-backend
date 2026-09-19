import { getPubSub } from "../lib/pubsub";
import { ScanEvent, ScanEventSchema } from "../schema/scan_event";

// BigQueryサブスクリプションが書き込みに失敗するメッセージを流さないよう、publishの前に検証する。
// publishの完了を待つ。先に返すと、esp32は送れたと思っているのにデータが消えることがあるため。
export const publishScanEvent = async (event: ScanEvent): Promise<void> => {
  const topicName = process.env.SCAN_EVENTS_TOPIC;
  if (!topicName) return; // gcpの準備前にデプロイできるよう、未設定ならpublishしない

  const validated = ScanEventSchema.parse(event);
  await getPubSub().topic(topicName).publishMessage({ json: validated });
};
