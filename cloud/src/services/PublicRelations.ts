import { PrAsset } from "../repositories/firestore";


export const isPublished = (asset: PrAsset, now: Date): boolean => {
  if (asset.status !== "approved") return false;
  if (now < asset.publishFrom.toDate()) return false;
  if (asset.publishUntil !== null && now > asset.publishUntil.toDate()) return false;
  return true;
};