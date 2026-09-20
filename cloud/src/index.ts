import { serve } from "@hono/node-server";
import { app } from "./app";
import { getHashKey } from "./lib/hash_key";

//鍵が未設定のままデプロイされて、受信のたびに失敗するのを防ぐため、起動時に確認する
getHashKey();

//サーバー起動
const port = Number(process.env.PORT) || 8080;
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Server is running on port ${info.port}`);
});
