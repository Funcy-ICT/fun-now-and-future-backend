import { PrAsset } from "../schema/pr_asset";
import { getApprovedPrAssets } from "../repositories/firestore";
import { PrAssetDto } from "../schema/api/signage";
import { Timestamp } from "firebase-admin/firestore";
import { jstDate, jstDateStartMs } from "./jst";


export const isPublished = (asset: PrAsset, now: Date): boolean => {
  if (asset.status !== "approved") return false;
  if (now < asset.publishFrom.toDate()) return false;
  if (asset.publishUntil !== null && now > asset.publishUntil.toDate()) return false;
  return true;
};

const buildAssetUrl = (id: string): string => {
  const bucket = process.env.PR_ASSET_BUCKET;
  if (!bucket) {
    throw new Error("PR_ASSET_BUCKET is not set");
  }
  return `https://storage.googleapis.com/${bucket}/objects/${id}`;
};

const toDto = (asset: PrAsset): PrAssetDto => ({
  id: asset.id,
  tag: asset.tag,
  title: asset.title,
  description: asset.description,
  media: {
    url: buildAssetUrl(asset.id),
    contentType: asset.contentType,
  },
  publishUntil: asset.publishUntil === null ? null : asset.publishUntil.toDate().toISOString(),
});

export const listPublishedPrAssets = async (now: Date = new Date()): Promise<PrAssetDto[]> => {
  const assets = await getApprovedPrAssets();
  return assets.filter(asset => isPublished(asset, now)).map(toDto);
};

// 終わりの日が今日(日本時間)より前のときに投げる。承認しても一覧に出ないので、投稿のエンドポイントで400にする
export class PublishPeriodEndedError extends Error {}

const DAY_MS = 24 * 60 * 60 * 1000;

// 投稿画面からは日付だけを受け取る。始まりはその日の日本時間0:00、終わりはその日の日本時間23:59:59にする。
// 終わりを省略したら無期限(null)。始まりは今日より前でもよい
export const toPublishPeriod = (
  publishFrom: string,
  publishUntil: string | undefined,
  now: Date,
): { publishFrom: Timestamp; publishUntil: Timestamp | null } => {
  if (publishUntil !== undefined && publishUntil < jstDate(now.getTime())) {
    throw new PublishPeriodEndedError("publishUntil must not be before today");
  }
  return {
    publishFrom: Timestamp.fromMillis(jstDateStartMs(publishFrom)),
    publishUntil: publishUntil === undefined ? null : Timestamp.fromMillis(jstDateStartMs(publishUntil) + DAY_MS - 1000),
  };
};
