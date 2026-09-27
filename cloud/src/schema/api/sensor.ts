// .openapi() で swagger に出す名前を付けるため、z は @hono/zod-openapi から読む(zod を拡張した同じもの)
import { z } from "@hono/zod-openapi";

// POST /receiveSensorData のレスポンス(200)。リクエストはschema/sensor_data.tsのSensorDataSchema。
// 受信したデータの写しは返さない。esp32の送受信の時間を短くするため
export const ReceiveSensorDataResponseSchema = z.object({
  status: z.literal("success"),
  message: z.string().openapi({ example: "Data received successfully" }),
  received_at: z.iso.datetime().openapi({ description: "受信した時刻", example: "2026-09-20T12:00:00.000Z" }),
  sendId: z.string().nullable().openapi({ description: "リクエストで送られてきた値。無ければnull", example: null }),
}).openapi("ReceiveSensorDataResponse");
export type ReceiveSensorDataResponse = z.infer<typeof ReceiveSensorDataResponseSchema>;
