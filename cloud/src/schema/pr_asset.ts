import { z } from "zod";
import { Timestamp } from "firebase-admin/firestore";

// 扱うファイルの種類。サイネージは<img>で表示するので、画像だけにする(ADR 0018)。
// 増やすときは、ここに足してフロントの表示も分ける
export const PR_ASSET_CONTENT_TYPES = ["image/jpeg", "image/png"] as const;

// 投稿で選べるタグ。新しいタグが求められたら、ここに足す。
// 保存する形のtagは文字列のままにする。値を変えたときに、前の投稿が検証で一覧から外れないため
export const PR_ASSET_TAGS = ["お知らせ", "イベント", "募集", "その他"] as const;

// 投稿画面に出す掲載許諾の文言の版。文言を変えたら、版も変える。文言は版ごとにdocs/consent.mdに残す。
// 文言はまだ決まっていないので、仮の版にしている。学生に公開する前に、本番の版にする
export const CONSENT_VERSION = "2026-10-draft";

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
  // 投稿した人。uidはAuth0のsub。メールアドレスは連絡先として持つ。サイネージには返さない
  submittedBy: z.object({
    uid: z.string().min(1, "submittedBy.uid is required"),
    email: z.email(),
  }),
  // 同意した掲載許諾の文言の版と、同意した時刻(サーバーの時刻)
  consent: z.object({
    version: z.string().min(1, "consent.version is required"),
    agreedAt: z.instanceof(Timestamp),
  }),
});

export type PrAsset = z.infer<typeof PrAssetSchema>;
