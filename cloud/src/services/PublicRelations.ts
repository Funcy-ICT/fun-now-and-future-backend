import { PrAsset } from "../schema/pr_asset";
import { getApprovedPrAssets } from "../repositories/firestore";
import { PrAssetDto } from "../schema/api/signage";


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
  title: asset.title,
  contentType: asset.contentType,
  url: buildAssetUrl(asset.id),
  publishUntil: asset.publishUntil === null ? null : asset.publishUntil.toDate().toISOString(),
});

export const listPublishedPrAssets = async (now: Date = new Date()): Promise<PrAssetDto[]> => {
  const assets = await getApprovedPrAssets();
  return assets.filter(asset => isPublished(asset, now)).map(toDto);
};