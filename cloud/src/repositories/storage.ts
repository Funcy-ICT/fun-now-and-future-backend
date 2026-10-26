import { storage, getPrAssetPrivateBucket } from "../lib/storage";

// 公開バケットと同じobjects/{id}に置く。承認のときに、同じ名前で公開バケットへコピーする
export const prAssetObjectName = (id: string): string => `objects/${id}`;

// 画像は小さいので、再開可能なアップロードにしない
export const savePrivatePrAssetFile = async (id: string, data: Buffer, contentType: string): Promise<void> => {
  await storage
    .bucket(getPrAssetPrivateBucket())
    .file(prAssetObjectName(id))
    .save(data, { contentType, resumable: false });
};
