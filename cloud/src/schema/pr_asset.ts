import { z } from "zod";
import { Timestamp } from "firebase-admin/firestore";

// 扱うファイルの種類。サイネージは<img>で表示するので、画像だけにする(ADR 0018)。
// 増やすときは、ここに足してフロントの表示も分ける
export const PR_ASSET_CONTENT_TYPES = ["image/jpeg", "image/png"] as const;

// サイネージに出す広報アセット
export const PrAssetSchema = z.object({
  id: z.string().min(1, "id is required"),
  // 後続フェーズ（投稿・承認フロー）の値も含めて定義しておく。今回読むのはapprovedのみ。
  status: z.enum(["pending", "approved", "rejected", "revoked"]),
  // 1件に1つ。値の決め方(自由な文字列か、決まった値か)はまだ決まっていない
  tag: z.string().min(1, "tag is required"),
  title: z.string().min(1, "title is required"),
  description: z.string(),
  contentType: z.enum(PR_ASSET_CONTENT_TYPES),
  size: z.number().min(0, "size must be 0 or greater"),
  publishFrom: z.instanceof(Timestamp),
  publishUntil: z.instanceof(Timestamp).nullable(),
  createdAt: z.instanceof(Timestamp),
});

export type PrAsset = z.infer<typeof PrAssetSchema>;
