import { getStorage } from "firebase-admin/storage";
import "./firebase";

export const storage = getStorage();

// 承認の前の投稿を置く、公開しないバケット。未設定のまま投稿を受け付けると、保存のたびに失敗するので、例外を投げる
export const getPrAssetPrivateBucket = (): string => {
  const bucket = process.env.PR_ASSET_PRIVATE_BUCKET;
  if (!bucket) {
    throw new Error("PR_ASSET_PRIVATE_BUCKET is not set");
  }
  return bucket;
};
