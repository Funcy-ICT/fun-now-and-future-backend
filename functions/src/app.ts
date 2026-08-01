import { Hono } from "hono";
import { sensorRoute } from "./controllers/sensor";
import { congestionRoute } from "./controllers/signage";

//ルートを一つにまとめる
export const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok", message: "Backend is running" }));
app.route("/", sensorRoute);
app.route("/", congestionRoute);