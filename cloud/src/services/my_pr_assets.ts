import { PrAsset } from "../schema/pr_asset";
import { MyPrAssetDto } from "../schema/api/my_pr_assets";
import { getPrAssetsBySubmitter } from "../repositories/firestore";

const toMyDto = (asset: PrAsset): MyPrAssetDto => ({
  id: asset.id,
  tag: asset.tag,
  title: asset.title,
  description: asset.description,
  status: asset.status,
  publishFrom: asset.publishFrom.toDate().toISOString(),
  publishUntil: asset.publishUntil === null ? null : asset.publishUntil.toDate().toISOString(),
  createdAt: asset.createdAt.toDate().toISOString(),
  //却下の後に取り下げはできないので、理由は却下のときだけ返す
  reviewNote: asset.status === "rejected" ? asset.reviewNote ?? null : null,
  revokedBy: asset.status === "revoked" ? asset.revokedBy?.role ?? null : null,
});

// 投稿した人のダッシュボードに出す、自分の投稿の一覧。新しい順
export const listMyPrAssets = async (uid: string): Promise<MyPrAssetDto[]> => {
  const assets = await getPrAssetsBySubmitter(uid);
  return assets
    .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())
    .map(toMyDto);
};
