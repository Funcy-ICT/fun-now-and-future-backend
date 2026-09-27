import { z } from "zod";
import { Timestamp } from "firebase-admin/firestore";

// ゲートで弾いた日の記録。閾値(completenessRatio, gateRatio)に根拠が無いので、実データで後から較正するために残す。
// congestion_recordsはコピーしない。除外は母集団に入れないだけで、元の記録は消えないため。
export const ExcludedDaySchema = z.object({
  location: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // JST
  weekday: z.number().int().min(0).max(6),
  reason: z.enum(["incomplete", "statistical"]), // 学事暦による除外(calendar)は未実装
  slotCount: z.number().int().nonnegative(),
  dayMedian: z.number().nullable(),
  refMedian: z.number(),
  ratio: z.number().nullable(), // dayMedian / refMedian
  evaluatedAt: z.instanceof(Timestamp),
});

export type ExcludedDay = z.infer<typeof ExcludedDaySchema>;
export type ExcludedDayInput = Omit<ExcludedDay, "evaluatedAt">;
