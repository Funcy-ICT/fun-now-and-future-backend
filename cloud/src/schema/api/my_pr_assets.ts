// .openapi() で swagger に出す名前を付けるため、z は @hono/zod-openapi から読む(zod を拡張した同じもの)
import { z } from "@hono/zod-openapi";

// GET /pr-assets/mine の1件。投稿した人のダッシュボードに出す。
// 画像は返さない(審査中の画像は非公開のバケットにあるため)。承認した人のメールアドレスも返さない
export const MyPrAssetDtoSchema = z.object({
  id: z.string().openapi({ example: "550e8400-e29b-41d4-a716-446655440000" }),
  tag: z.string().openapi({ example: "イベント" }),
  title: z.string().openapi({ example: "秋のコンテスト告知" }),
  description: z.string().openapi({ example: "10月31日まで作品を募集しています" }),
  status: z.enum(["pending", "approved", "rejected", "revoked"]).openapi({
    description: "pendingは審査中、approvedは承認(掲載期間内ならサイネージに出る)、rejectedは却下、revokedは取り下げ",
    example: "pending",
  }),
  publishFrom: z.iso.datetime().openapi({ description: "掲載の開始日時", example: "2026-09-30T15:00:00.000Z" }),
  publishUntil: z.iso.datetime().nullable().openapi({
    description: "掲載の終了日時。nullなら無期限",
    example: "2026-10-31T14:59:59.000Z",
  }),
  createdAt: z.iso.datetime().openapi({ description: "投稿した日時", example: "2026-10-26T03:00:00.000Z" }),
  reviewNote: z.string().nullable().openapi({ description: "却下の理由。却下でなければnull", example: null }),
  revokedBy: z.enum(["submitter", "admin"]).nullable().openapi({
    description: "取り下げた人。submitterは本人、adminは管理者。取り下げでなければnull",
    example: null,
  }),
}).openapi("MyPrAsset");
export type MyPrAssetDto = z.infer<typeof MyPrAssetDtoSchema>;

// GET /pr-assets/mine のレスポンス(200)。新しい順
export const MyPrAssetsResponseSchema = z.object({
  assets: z.array(MyPrAssetDtoSchema),
}).openapi("MyPrAssetsResponse");

// POST /pr-assets/{id}/withdraw のパス
export const PrAssetIdParamSchema = z.object({
  id: z.string().min(1, "id is required").openapi({
    param: { name: "id", in: "path" },
    example: "550e8400-e29b-41d4-a716-446655440000",
  }),
});

// POST /pr-assets/{id}/withdraw のレスポンス(200)
export const WithdrawPrAssetResponseSchema = z.object({
  id: z.string().openapi({ example: "550e8400-e29b-41d4-a716-446655440000" }),
  status: z.literal("revoked"),
}).openapi("WithdrawPrAssetResponse");
