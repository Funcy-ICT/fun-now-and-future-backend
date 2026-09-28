// .openapi() で swagger に出す名前を付けるため、z は @hono/zod-openapi から読む(zod を拡張した同じもの)
import { z } from "@hono/zod-openapi";

// GET /getCongestion のクエリ
export const LocationQuerySchema = z.object({
  location: z.string().min(1, "location query parameter is required").openapi({
    description: "場所のID。一覧はdocs/configuration.mdの「ロケーションIDの一覧」",
    example: "cafeteria",
  }),
});

// GET /getCongestionHistory のクエリ
export const HistoryQuerySchema = LocationQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(50).default(50).openapi({
    description: "返す件数。1から50まで。省略すると50",
    example: 10,
  }),
});

// 混雑度。levelは基準値に対する比率で1から9。基準値が無い(キャリブレーション中)か、
// データが古い(stale)ときはnull。同じlocation・同じ曜日の中でのみ意味を持つ相対値
export const CongestionStatusSchema = z.object({
  location: z.string().openapi({ example: "cafeteria" }),
  windowStart: z.iso.datetime().openapi({
    description: "集計した5分間の窓の開始時刻(UTC)",
    example: "2026-07-28T07:30:00.000Z",
  }),
  uniqueDeviceCount: z.number().int().nonnegative().openapi({
    description: "窓の中で検出した端末の数(重複と、対象外の端末を除いたもの)",
    example: 12,
  }),
  level: z.number().int().min(1).max(9).nullable().openapi({
    description: "1(空いている)から9(非常に混雑)。同じ場所、同じ曜日の中でだけ意味を持つ相対値で、"
      + "別の場所どうしは比べられない。nullの意味は、staleで区別する。"
      + "staleがtrueならデータが古い(センサーが止まっている可能性)。"
      + "falseなら、基準値がまだ計算できていない(運用開始直後や、長期休業明けのキャリブレーション中)",
    example: 3,
  }),
  stale: z.boolean().openapi({
    description: "直近15分以内にデータが更新されていなければtrue",
    example: false,
  }),
}).openapi("CongestionStatus");
export type CongestionStatus = z.infer<typeof CongestionStatusSchema>;

// GET /getCongestion のレスポンス(200)
export const CongestionResponseSchema = z.object({
  status: z.literal("success"),
  data: CongestionStatusSchema,
}).openapi("CongestionResponse");

// 履歴の1件。過去のデータに同じ意味を持たないので、staleは含めない
export const CongestionHistoryEntrySchema = CongestionStatusSchema.omit({ stale: true }).openapi("CongestionHistoryEntry");
export type CongestionHistoryEntry = z.infer<typeof CongestionHistoryEntrySchema>;

// GET /getCongestionHistory のレスポンス(200)
export const CongestionHistoryResponseSchema = z.object({
  status: z.literal("success"),
  count: z.number().int().nonnegative(),
  data: z.array(CongestionHistoryEntrySchema),
}).openapi("CongestionHistoryResponse");

// 掲載中の広報アセット。実体は返さず、公開バケット上のURLを返す
export const PrAssetDtoSchema = z.object({
  id: z.string().openapi({ example: "550e8400-e29b-41d4-a716-446655440000" }),
  title: z.string().openapi({ example: "秋のコンテスト告知" }),
  contentType: z.string().openapi({ description: "画像かPDF", example: "image/jpeg" }),
  url: z.url().openapi({
    description: "公開バケット上のURL。実体は、ここから取得する",
    example: "https://storage.googleapis.com/<bucket>/objects/550e8400-e29b-41d4-a716-446655440000",
  }),
  publishUntil: z.iso.datetime().nullable().openapi({
    description: "掲載の終了日時。nullなら無期限",
    example: "2026-10-31T14:59:59.000Z",
  }),
}).openapi("PrAsset");
export type PrAssetDto = z.infer<typeof PrAssetDtoSchema>;

// GET /signage/assets のレスポンス(200)
export const SignageAssetsResponseSchema = z.object({
  assets: z.array(PrAssetDtoSchema),
}).openapi("SignageAssetsResponse");
