import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { sensorRoute } from "./controllers/sensor";
import { congestionRoute } from "./controllers/signage";
import { errorHandler } from "./middlewares/error_handler";
import { aggregateRoute } from "./controllers/sensor";
import { pubsubPushRoute } from "./controllers/pubsub_push";
import { batchRoute } from "./controllers/batch";
import { prAssetRoute } from "./controllers/pr_asset";
import { appCorsMiddleware } from "./middlewares/app_cors";
import { HealthResponseSchema } from "./schema/api/common";

export type ServiceRole = "ingest" | "worker" | "app" | "all";

//受信(ingest)、処理(worker)、投稿画面と管理画面向け(app)を別のCloud Runサービスとしてデプロイするための切り替え。未設定なら全部のルートを載せる(ローカル, テスト)。
//綴りの間違いで全部のルートが公開されないよう、知らない値は例外にする。
export const getServiceRole = (): ServiceRole => {
  const role = process.env.SERVICE_ROLE;
  if (!role) return "all";
  if (role === "ingest" || role === "worker" || role === "app") return role;
  throw new Error(`Unknown SERVICE_ROLE: ${role}`);
};

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  summary: "死活監視",
  responses: {
    200: { content: { "application/json": { schema: HealthResponseSchema } }, description: "動いている" },
  },
});

const healthRoutes = new OpenAPIHono()
  .openapi(healthRoute, (c) => c.json({ status: "ok" as const, message: "Backend is running" }, 200));

//管理画面からhono rpcで呼ぶルート。ルートの型を残すため、メソッドチェーンでつなぐ。
//esp32から呼ぶ/receiveSensorDataと、内部用のルートは入れない
const clientRoutes = new OpenAPIHono()
  .route("/", healthRoutes)
  .route("/", congestionRoute);

export type AppType = typeof clientRoutes;

//サービスごとに、/docに載るルートが違うので、説明も分ける
const DOC_DESCRIPTIONS: Record<Exclude<ServiceRole, "worker">, string> = {
  ingest: "esp32からの受信と、サイネージ向けのエンドポイント",
  app: "投稿画面と管理画面向けのエンドポイント",
  all: "全部のエンドポイント(ローカル, テスト用)",
};

//ルートを一つにまとめる。swaggerの定義をまとめられるよう、OpenAPIHonoにする
export const createApp = (role: ServiceRole): OpenAPIHono => {
  const app = new OpenAPIHono();

  //アプリ全体のエラーハンドラーとして登録
  app.onError(errorHandler);

  app.route("/", healthRoutes);

  //役を足したときに載る先が漏れないよう、条件は「載せる役」を並べて書く(!==にすると、新しい役にも載る)

  //公開するサービス。esp32とサイネージからのリクエストを受ける
  if (role === "ingest" || role === "all") {
    app.route("/", sensorRoute);
    app.route("/", congestionRoute);
    app.openAPIRegistry.registerComponent("securitySchemes", "ApiKeyAuth", {
      type: "apiKey",
      in: "header",
      name: "x-api-key",
    });
  }

  //投稿画面と管理画面から呼ぶサービス。Auth0のアクセストークンで認証する
  if (role === "app" || role === "all") {
    //画面はFirebase Hostingの別のオリジンにあるので、corsを付ける。ingestのルートには付けない
    app.use("/pr-assets/*", appCorsMiddleware);
    app.route("/", prAssetRoute);
    app.openAPIRegistry.registerComponent("securitySchemes", "BearerAuth", {
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
    });
  }

  //swaggerは公開するルートだけを載せる。内部用のルート(workerのもの)はOpenAPIHonoで定義していないので、ここには出ない
  if (role === "ingest" || role === "app" || role === "all") {
    app.doc("/doc", {
      openapi: "3.0.0",
      info: {
        title: "Fun Now and Future API",
        version: "1.0.0",
        description: DOC_DESCRIPTIONS[role],
      },
    });
    app.get("/ui", swaggerUI({ url: "/doc" }));
  }

  //Cloud Runの認証必須にするサービス。Pub/SubとCloud Schedulerだけが呼べるようにする
  if (role === "worker" || role === "all") {
    app.route("/", aggregateRoute);
    app.route("/", pubsubPushRoute);
    app.route("/", batchRoute);
  }

  return app;
};

export const app = createApp(getServiceRole());
