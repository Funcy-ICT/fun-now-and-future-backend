import { storage, getPrAssetPrivateBucket, getPrAssetPublicBucket } from "../lib/storage";

// 公開バケットと同じobjects/{id}に置く。承認のときに、同じ名前で公開バケットへコピーする
export const prAssetObjectName = (id: string): string => `objects/${id}`;

// 画像は小さいので、再開可能なアップロードにしない
export const savePrivatePrAssetFile = async (id: string, data: Buffer, contentType: string): Promise<void> => {
  await storage
    .bucket(getPrAssetPrivateBucket())
    .file(prAssetObjectName(id))
    .save(data, { contentType, resumable: false });
};

// 投稿の保存に失敗したときに、置いたファイルを消す。無くてもよい
export const deletePrivatePrAssetFile = async (id: string): Promise<void> => {
  await storage
    .bucket(getPrAssetPrivateBucket())
    .file(prAssetObjectName(id))
    .delete({ ignoreNotFound: true });
};

// 承認したときに、非公開のバケットから公開バケットの同じ名前へコピーする。種類(contentType)も引き継がれる
export const copyPrAssetFileToPublic = async (id: string): Promise<void> => {
  await storage
    .bucket(getPrAssetPrivateBucket())
    .file(prAssetObjectName(id))
    .copy(storage.bucket(getPrAssetPublicBucket()).file(prAssetObjectName(id)));
};

// 取り下げたときに、公開バケットから消す。statusを変えるだけでは、直リンクで読めるため。無くてもよい
export const deletePublicPrAssetFile = async (id: string): Promise<void> => {
  await storage
    .bucket(getPrAssetPublicBucket())
    .file(prAssetObjectName(id))
    .delete({ ignoreNotFound: true });
};
