import { serve } from "@hono/node-server";
import { app, getServiceRole } from "./app";
import { getHashKey } from "./lib/hash_key";
import { getScanEventsTopic } from "./lib/pubsub";
import { getApiKey } from "./lib/api_key";
import { getAuth0Config } from "./lib/auth0";
import { getPrAssetPrivateBucket } from "./lib/storage";
import { getAppAllowedOrigins } from "./lib/app_origins";

const role = getServiceRole();
if (role === "all") {
  console.warn("SERVICE_ROLE is not set, so all routes are enabled.");
}

//受信を受け持つサービスは、鍵、トピック、APIキーが未設定のままデプロイされると、受信のたびに失敗してしまう。起動時に確認して防ぐ。
//処理側(worker)はmacをハッシュ化せず、publishもせず、APIキーで認証するルートも無いので、どれも要らない。
if (role === "ingest" || role === "all") {
  getHashKey();
  getScanEventsTopic();
  getApiKey();
}

//投稿画面と管理画面向けのサービスは、auth0の設定が無いと、どのリクエストも通らない。非公開のバケットが無いと、投稿のたびに失敗する。
//画面のオリジンが無いと、ブラウザからは呼べない。
//ローカル(all)では、auth0とバケットを使わないルートを試せるよう、確かめない
if (role === "app") {
  getAuth0Config();
  getPrAssetPrivateBucket();
  getAppAllowedOrigins();
}

//サーバー起動
const port = Number(process.env.PORT) || 8080;
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Server is running on port ${info.port}`);
});
