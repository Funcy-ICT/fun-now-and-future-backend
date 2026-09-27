import { serve } from "@hono/node-server";
import { app, getServiceRole } from "./app";
import { getHashKey } from "./lib/hash_key";
import { getScanEventsTopic } from "./lib/pubsub";
import { getApiKey } from "./lib/api_key";

const role = getServiceRole();
if (role === "all") {
  console.warn("SERVICE_ROLE is not set, so all routes are enabled.");
}

//受信を受け持つサービスは、鍵、トピック、APIキーが未設定のままデプロイされると、受信のたびに失敗してしまう。起動時に確認して防ぐ。
//処理側(worker)はmacをハッシュ化せず、publishもせず、APIキーで認証するルートも無いので、どれも要らない。
if (role !== "worker") {
  getHashKey();
  getScanEventsTopic();
  getApiKey();
}

//サーバー起動
const port = Number(process.env.PORT) || 8080;
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Server is running on port ${info.port}`);
});
