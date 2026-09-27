import { Hono } from "hono";
import { calcMaxDevices } from "../services/max_devices_batch";

export const batchRoute = new Hono();

// 基準値(max_devices)を計算する日次バッチ。Cloud Schedulerから1日1回(04:00 JST想定)呼ぶ。
// 認証はコードに持たない。workerをCloud Runの認証必須にして、呼び出し元をCloud Schedulerのサービスアカウントだけに許可する。
batchRoute.post("/internal/batch/calc-max-device", async (c) => {
  const result = await calcMaxDevices(new Date());
  return c.json(result, 200);
});
