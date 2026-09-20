import { PubSub } from "@google-cloud/pubsub";

let client: PubSub | undefined;

// 呼ばれるまでクライアントを作らない。トピックを設定していないローカルやciで、gcpの認証を要求しないため。
export const getPubSub = (): PubSub => {
  client ??= new PubSub({
    projectId: process.env.GCLOUD_PROJECT ?? "fun-now-and-future",
  });
  return client;
};

// 受信したデータはpub/sub経由でしかfirestoreに届かないので、トピックが無いとデータが消える。未設定なら例外を投げる。
export const getScanEventsTopic = (): string => {
  const topic = process.env.SCAN_EVENTS_TOPIC;
  if (!topic) {
    throw new Error("SCAN_EVENTS_TOPIC is not set");
  }
  return topic;
};
