// .openapi() で swagger に出す名前を付けるため、z は @hono/zod-openapi から読む(zod を拡張した同じもの)
import { z } from "@hono/zod-openapi";

// POST /receiveSensorData のレスポンス(200)。リクエストはschema/sensor_data.tsのSensorDataSchema。
// 受信したデータの写しは返さない。esp32の送受信の時間を短くするため
export const ReceiveSensorDataResponseSchema = z.object({
  status: z.literal("success"),
  message: z.string(),
  received_at: z.iso.datetime(),
  sendId: z.string().nullable(), // リクエストで送られてきた値。無ければnull
}).openapi("ReceiveSensorDataResponse");
export type ReceiveSensorDataResponse = z.infer<typeof ReceiveSensorDataResponseSchema>;
