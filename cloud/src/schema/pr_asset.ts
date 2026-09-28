import { z } from "zod";
import { Timestamp } from "firebase-admin/firestore";

// サイネージに出す広報アセット
export const PrAssetSchema = z.object({
  id: z.string().min(1, "id is required"),
  // 後続フェーズ（投稿・承認フロー）の値も含めて定義しておく。今回読むのはapprovedのみ。
  status: z.enum(["pending", "approved", "rejected", "revoked"]),
  title: z.string().min(1, "title is required"),
  contentType: z.string().min(1, "contentType is required"),
  size: z.number().min(0, "size must be 0 or greater"),
  publishFrom: z.instanceof(Timestamp),
  publishUntil: z.instanceof(Timestamp).nullable(),
  createdAt: z.instanceof(Timestamp),
});

export type PrAsset = z.infer<typeof PrAssetSchema>;
