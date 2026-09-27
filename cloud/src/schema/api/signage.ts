import { z } from "zod";

// GET /getCongestion のクエリ
export const LocationQuerySchema = z.object({
  location: z.string().min(1, "location query parameter is required"),
});

// GET /getCongestionHistory のクエリ
export const HistoryQuerySchema = LocationQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(50).default(50),
});

// 混雑度。levelは基準値に対する比率で1から9。基準値が無い(キャリブレーション中)か、
// データが古い(stale)ときはnull。同じlocation・同じ曜日の中でのみ意味を持つ相対値
export const CongestionStatusSchema = z.object({
  location: z.string(),
  windowStart: z.iso.datetime(),
  uniqueDeviceCount: z.number().int().nonnegative(),
  level: z.number().int().min(1).max(9).nullable(),
  stale: z.boolean(), // 直近15分以内にデータが更新されていなければtrue
});
export type CongestionStatus = z.infer<typeof CongestionStatusSchema>;

// GET /getCongestion のレスポンス(200)
export const CongestionResponseSchema = z.object({
  status: z.literal("success"),
  data: CongestionStatusSchema,
});

// 履歴の1件。過去のデータに同じ意味を持たないので、staleは含めない
export const CongestionHistoryEntrySchema = CongestionStatusSchema.omit({ stale: true });
export type CongestionHistoryEntry = z.infer<typeof CongestionHistoryEntrySchema>;

// GET /getCongestionHistory のレスポンス(200)
export const CongestionHistoryResponseSchema = z.object({
  status: z.literal("success"),
  count: z.number().int().nonnegative(),
  data: z.array(CongestionHistoryEntrySchema),
});

// 掲載中の広報アセット。実体は返さず、公開バケット上のURLを返す
export const PrAssetDtoSchema = z.object({
  id: z.string(),
  title: z.string(),
  contentType: z.string(),
  url: z.url(),
  publishUntil: z.iso.datetime().nullable(), // nullなら無期限
});
export type PrAssetDto = z.infer<typeof PrAssetDtoSchema>;

// GET /signage/assets のレスポンス(200)
export const SignageAssetsResponseSchema = z.object({
  assets: z.array(PrAssetDtoSchema),
});
