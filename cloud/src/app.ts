import { Hono } from "hono";
import { sensorRoute } from "./controllers/sensor";
import { congestionRoute } from "./controllers/signage";
import { errorHandler } from "./middlewares/error_handler";
import { aggregateRoute } from "./controllers/sensor";
import { pubsubPushRoute } from "./controllers/pubsub_push";

export type ServiceRole = "ingest" | "worker" | "all";

//受信(ingest)と処理(worker)を別のCloud Runサービスとしてデプロイするための切り替え。未設定なら全部のルートを載せる(ローカル, テスト)。
//綴りの間違いで全部のルートが公開されないよう、知らない値は例外にする。
export const getServiceRole = (): ServiceRole => {
  const role = process.env.SERVICE_ROLE;
  if (!role) return "all";
  if (role === "ingest" || role === "worker") return role;
  throw new Error(`Unknown SERVICE_ROLE: ${role}`);
};

//ルートを一つにまとめる
export const createApp = (role: ServiceRole): Hono => {
  const app = new Hono();

  //アプリ全体のエラーハンドラーとして登録
  app.onError(errorHandler);

  app.get("/health", (c) => c.json({ status: "ok", message: "Backend is running" }));

  //公開するサービス。esp32とサイネージからのリクエストを受ける
  if (role !== "worker") {
    app.route("/", sensorRoute);
    app.route("/", congestionRoute);
  }

  //Cloud Runの認証必須にするサービス。Pub/SubとCloud Schedulerだけが呼べるようにする
  if (role !== "ingest") {
    app.route("/", aggregateRoute);
    app.route("/", pubsubPushRoute);
  }

  return app;
};

export const app = createApp(getServiceRole());
