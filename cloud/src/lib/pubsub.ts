import { PubSub } from "@google-cloud/pubsub";

let client: PubSub | undefined;

// 呼ばれるまでクライアントを作らない。トピックを設定していないローカルやciで、gcpの認証を要求しないため。
export const getPubSub = (): PubSub => {
  client ??= new PubSub({
    projectId: process.env.GCLOUD_PROJECT ?? "fun-now-and-future",
  });
  return client;
};
