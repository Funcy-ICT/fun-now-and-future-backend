// .openapi() で swagger に出す名前を付けるため、z は @hono/zod-openapi から読む(zod を拡張した同じもの)
import { z } from "@hono/zod-openapi";

// エラーのときのレスポンス。400, 401, 404で共通の形
export const ErrorResponseSchema = z.object({
  status: z.literal("error"),
  message: z.string(),
}).openapi("ErrorResponse");
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  message: z.string(),
}).openapi("HealthResponse");
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
