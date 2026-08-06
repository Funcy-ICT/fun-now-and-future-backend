import { Hono } from "hono";
import { sensorRoute } from "./controllers/sensor";
import { congestionRoute } from "./controllers/congestion";

//ルートを一つにまとめる
const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok", message: "Backend is running" }));
app.route("/", sensorRoute);
app.route("/", congestionRoute);

export default app;