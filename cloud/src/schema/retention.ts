import { z } from "zod";
import { Timestamp } from "firebase-admin/firestore";

// 保持期間の下限。画面での打ち間違い(1日など)で、蓄積したデータがまとめて消えるのを防ぐ。
export const MIN_RETENTION_DAYS = 7;
export const MAX_RETENTION_DAYS = 3650;

// 画面から受け取る値。nullは無期限
export const RetentionInputSchema = z.object({
  scanEventsDays: z.number().int().min(MIN_RETENTION_DAYS).max(MAX_RETENTION_DAYS).nullable(),
});

export type RetentionInput = z.infer<typeof RetentionInputSchema>;

// BigQueryの保持期間の設定。実際の保持期間はBigQuery側のパーティションの有効期限で決まり、
// ここには最後に適用できた値を残す。
export const RetentionConfigSchema = RetentionInputSchema.extend({
  updatedAt: z.instanceof(Timestamp),
  updatedBy: z.string().nullable(), // 認証が入るまではnull
});
export type RetentionConfig = z.infer<typeof RetentionConfigSchema>;
