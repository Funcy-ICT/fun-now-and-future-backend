import { z } from "zod";
import { Timestamp } from "firebase-admin/firestore";

// 1日分のcongestion_recordsをまとめたもの。基準値のバッチが毎日26週分を読み直さずに済むようにする。
// countsは稼働時間帯の台数を昇順に並べたもので、p95のプールにそのまま使う。
// どの稼働時間帯で作ったかを持たせ、設定が変わったら作り直す。
export const DailySummarySchema = z.object({
  location: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // JST
  weekday: z.number().int().min(0).max(6),       // JST基準
  slotCount: z.number().int().nonnegative(),
  dayMedian: z.number().nullable(),              // 記録が1件も無ければnull
  counts: z.array(z.number().int().nonnegative()),
  operatingStartHour: z.number().int(),
  operatingEndHour: z.number().int(),
  computedAt: z.instanceof(Timestamp),
});

export type DailySummary = z.infer<typeof DailySummarySchema>;
export type DailySummaryInput = Omit<DailySummary, "computedAt">;
