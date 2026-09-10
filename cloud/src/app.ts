import { Hono } from "hono";
import { sensorRoute } from "./controllers/sensor";
import { congestionRoute } from "./controllers/signage";
import { errorHandler } from "./middlewares/error_handler";

//ルートを一つにまとめる
export const app = new Hono();

//アプリ全体のエラーハンドラーとして登録
app.onError(errorHandler);

app.get("/health", (c) => c.json({ status: "ok", message: "Backend is running" }));
app.route("/", sensorRoute);
app.route("/", congestionRoute);