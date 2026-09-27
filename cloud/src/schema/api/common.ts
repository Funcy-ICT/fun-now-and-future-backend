import { z } from "zod";

// エラーのときのレスポンス。400, 401, 404で共通の形
export const ErrorResponseSchema = z.object({
  status: z.literal("error"),
  message: z.string(),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  message: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
