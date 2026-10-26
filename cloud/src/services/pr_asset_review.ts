import { Timestamp } from "firebase-admin/firestore";
import { AuthUser } from "../schema/api/auth";
import { PrAsset, PrAssetNotFoundError, PrAssetStatusConflictError } from "../schema/pr_asset";
import { getPrAsset, updatePrAsset } from "../repositories/firestore";
import { copyPrAssetFileToPublic, deletePublicPrAssetFile } from "../repositories/storage";

const person = (user: AuthUser) => ({ uid: user.uid, email: user.email });

// 承認する。画像を公開バケットへコピーしてから、statusをapprovedにする。
// 先にstatusを書くと、コピーが終わるまで、サイネージに画像の無いアセットが出るため
export const approvePrAsset = async (id: string, reviewer: AuthUser, now: Date = new Date()): Promise<PrAsset> => {
  const asset = await getPrAsset(id);
  if (asset === null) throw new PrAssetNotFoundError(`prAssets/${id} is not found`);
  if (asset.status !== "pending") throw new PrAssetStatusConflictError(asset.status);

  await copyPrAssetFileToPublic(id);
  try {
    return await updatePrAsset(id, (current) => {
      if (current.status !== "pending") throw new PrAssetStatusConflictError(current.status);
      return { status: "approved", reviewedBy: person(reviewer), reviewedAt: Timestamp.fromDate(now) };
    });
  } catch (err) {
    //コピーの間に取り下げや却下をされていたら、公開したファイルを消す。
    //別の承認が先に通っていたときは、そちらが使うファイルなので消さない
    const approvedByOther = err instanceof PrAssetStatusConflictError && err.status === "approved";
    if ((err instanceof PrAssetStatusConflictError || err instanceof PrAssetNotFoundError) && !approvedByOther) {
      await deletePublicPrAssetFile(id);
    }
    throw err;
  }
};

