import { z } from "zod";
import { Timestamp } from "firebase-admin/firestore";

// /aggregateが書く、locationごと・5分窓ごとの台数
export type CongestionRecordInput = {
  location: string;
  weekday: number;
  uniqueDeviceCount: number;
};

export const CongestionRecordSchema = z.object({
  location: z.string().min(1),
  weekday: z.number().int().min(0).max(6), // JST基準
  windowStart: z.instanceof(Timestamp),
  uniqueDeviceCount: z.number().int().nonnegative(),
  // どの設定で数えた値かを見分けるためのハッシュ。この項目が無い既存のレコードも読めるよう、任意にする
  configHash: z.string().optional(),
});
export type CongestionRecord = z.infer<typeof CongestionRecordSchema>;
