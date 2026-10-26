// .openapi() で swagger に出す名前を付けるため、z は @hono/zod-openapi から読む(zod を拡張した同じもの)
import { z } from "@hono/zod-openapi";
import { CONSENT_VERSION, PR_ASSET_CONTENT_TYPES, PR_ASSET_TAGS } from "../pr_asset";

// 上限はどれも仮。サイネージのカードに収まるかで、フロントと決める
export const PR_ASSET_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const PR_ASSET_TITLE_MAX_LENGTH = 30;
export const PR_ASSET_DESCRIPTION_MAX_LENGTH = 100;

// POST /pr-assets で受け取る形(multipart)。
// 投稿した人はアクセストークンから取る。本文に混ぜて送られても通さないよう、知らない項目は弾く
export const PrAssetSubmitInputSchema = z.strictObject({
  // ブラウザが付けた種類は偽れるので、ここでは早めに弾くだけ。中身での判定は、画像を処理するときに行う
  // z.file()はswaggerの型に直せないので、型を指定する
  file: z.file()
    .max(PR_ASSET_MAX_FILE_BYTES, "file must be 10MB or smaller")
    .mime([...PR_ASSET_CONTENT_TYPES], "file must be a JPEG or PNG image")
    .openapi({ type: "string", format: "binary", description: "画像。JPEGかPNGで、10MBまで" }),
  tag: z.enum(PR_ASSET_TAGS).openapi({ description: "掲示物の分類。1つ選ぶ", example: "イベント" }),
  title: z.string().trim()
    .min(1, "title is required")
    .max(PR_ASSET_TITLE_MAX_LENGTH, `title must be ${PR_ASSET_TITLE_MAX_LENGTH} characters or fewer`)
    .openapi({ description: `題名。前後の空白を除いて1〜${PR_ASSET_TITLE_MAX_LENGTH}字`, example: "秋のコンテスト告知" }),
  description: z.string().trim()
    .max(PR_ASSET_DESCRIPTION_MAX_LENGTH, `description must be ${PR_ASSET_DESCRIPTION_MAX_LENGTH} characters or fewer`)
    .default("")
    .openapi({ description: `説明。${PR_ASSET_DESCRIPTION_MAX_LENGTH}字まで。省略できる`, example: "10月31日まで作品を募集しています" }),
  publishFrom: z.iso.date("publishFrom must be YYYY-MM-DD").openapi({
    description: "掲載の開始日(日本時間)。その日の0:00から出る。今日より前の日付でもよい",
    example: "2026-10-01",
  }),
  publishUntil: z.iso.date("publishUntil must be YYYY-MM-DD").optional().openapi({
    description: "掲載の終了日(日本時間)。その日の23:59:59まで出る。省略すると無期限。今日より前の日付は400",
    example: "2026-10-31",
  }),
  consentVersion: z.literal(CONSENT_VERSION, "consentVersion is outdated. reload the page").openapi({
    description: "画面に出した掲載許諾の文言の版。今の版と違えば400(古い画面からの投稿を弾く)",
    example: CONSENT_VERSION,
  }),
}).refine(
  input => input.publishUntil === undefined || input.publishUntil >= input.publishFrom,
  { message: "publishUntil must not be before publishFrom", path: ["publishUntil"] },
);
export type PrAssetSubmitInput = z.infer<typeof PrAssetSubmitInputSchema>;

// POST /pr-assets のレスポンス(201)。審査を待つので、statusはいつもpending
export const PrAssetSubmitResponseSchema = z.object({
  id: z.uuid().openapi({ example: "550e8400-e29b-41d4-a716-446655440000" }),
  status: z.literal("pending").openapi({ description: "審査待ち。承認されるまでサイネージには出ない" }),
}).openapi("PrAssetSubmitResponse");
