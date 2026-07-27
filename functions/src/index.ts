import {setGlobalOptions} from "firebase-functions";
import {onRequest} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { sensorRoute } from "./routes/sensor";
import { congestionRoute } from "./routes/congestion";

setGlobalOptions({ maxInstances: 10 });

const app = new Hono();

//corsの処理
app.use("*", cors({
  origin: "*",
  allowMethods: ["POST", "GET", "OPTIONS"],
  allowHeaders: ["Content-Type", "x-api-key"],
}));

app.get("/health", (c) => {
  logger.info("health endpoint called");

  return c.json({
    status: "ok",
    message: "Backend is running",
  });
});


app.route("/", sensorRoute);
app.route("/", congestionRoute);

//firebaseFunctions用のエクスポート
export const api = onRequest((req, res) => {
  app.fetch(req as any, res as any);
});
//テストなどのためのエクスポート
export default app;

