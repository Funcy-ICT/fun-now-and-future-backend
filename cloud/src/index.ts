import { serve } from "@hono/node-server";
import { app } from "./app";

//サーバー起動
const port = Number(process.env.PORT) || 8080;
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Server is running on port ${info.port}`);
});
