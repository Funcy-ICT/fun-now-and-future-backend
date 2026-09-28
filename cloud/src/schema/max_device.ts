import { z } from "zod";
import { Timestamp } from "firebase-admin/firestore";

// location・曜日ごとの基準値。基準値のバッチ(max_devices_batch.ts)が書き、サイネージへの応答でlevelの計算に使う
export const MaxDeviceSchema = z.object({
  location: z.string().min(1, "location is required"),
  weekday: z.number().int().min(0).max(6, "weekday must be between 0 and 6"),
  baseline: z.number().min(9, "baseline must be at least 9"), // 9段階のlevelが成立する最小値
  percentile: z.number(),
  p50: z.number(),
  p05: z.number(),
  windowStartHour: z.number().int(),
  windowEndHour: z.number().int(),
  sampleDays: z.number().int().positive(),
  sampleCount: z.number().int().positive(),
  lookbackWeeks: z.number().int().positive(),
  oldestSampleDate: z.string(),
  refMedian: z.number(),
  computedAt: z.instanceof(Timestamp),
});

export type MaxDeviceData = z.infer<typeof MaxDeviceSchema>;

export type MaxDeviceInput = Omit<MaxDeviceData, "computedAt">;
