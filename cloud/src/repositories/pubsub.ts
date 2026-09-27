import { getPubSub, getScanEventsTopic } from "../lib/pubsub";
import { ScanEvent, ScanEventSchema } from "../schema/scan_event";
import { AggregateRun, AggregateRunSchema } from "../schema/aggregate_run";

// BigQueryサブスクリプションが書き込みに失敗するメッセージを流さないよう、publishの前に検証する。
// publishの完了を待つ。先に返すと、esp32は送れたと思っているのにデータが消えることがあるため。
export const publishScanEvent = async (event: ScanEvent): Promise<void> => {
  const topicName = getScanEventsTopic();
  const validated = ScanEventSchema.parse(event);
  await getPubSub().topic(topicName).publishMessage({ json: validated });
};

// 集計結果の履歴は分析にしか使わない。トピックが未設定なら何もしないので、トピックを作る前でもデプロイできる。
export const publishAggregateRun = async (run: AggregateRun): Promise<void> => {
  const topicName = process.env.AGGREGATE_RUNS_TOPIC;
  if (!topicName) return;

  const validated = AggregateRunSchema.parse(run);
  await getPubSub().topic(topicName).publishMessage({ json: validated });
};
