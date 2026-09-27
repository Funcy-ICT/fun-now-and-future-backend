import { z } from "zod";

// 保持期間の下限。画面での打ち間違い(1日など)で、蓄積したデータがまとめて消えるのを防ぐ。
export const MIN_RETENTION_DAYS = 7;
export const MAX_RETENTION_DAYS = 3650;

// 画面から受け取る値。nullは無期限
export const RetentionInputSchema = z.object({
  scanEventsDays: z.number().int().min(MIN_RETENTION_DAYS).max(MAX_RETENTION_DAYS).nullable(),
});

export type RetentionInput = z.infer<typeof RetentionInputSchema>;
