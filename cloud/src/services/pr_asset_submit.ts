import { randomUUID } from "crypto";
import { Timestamp } from "firebase-admin/firestore";
import { AuthUser } from "../schema/api/auth";
import { PrAssetSubmitInput } from "../schema/api/pr_asset_submit";
import { PrAsset, PrAssetSchema } from "../schema/pr_asset";
import { createPrAsset } from "../repositories/firestore";
import { deletePrivatePrAssetFile, savePrivatePrAssetFile } from "../repositories/storage";
import { processPrAssetFile } from "./pr_asset_file";
import { toPublishPeriod } from "./PublicRelations";

// 投稿を受け付ける。審査を待つpendingで保存するので、承認されるまでサイネージには出ない。
// 投稿した人はアクセストークンから取る。同意した時刻と作った時刻は、サーバーの時刻にする
export const submitPrAsset = async (
  input: PrAssetSubmitInput,
  user: AuthUser,
  now: Date = new Date(),
): Promise<{ id: string; status: "pending" }> => {
  //終わりが過去なら、画像を処理しても無駄になるので、先に確かめる
  const period = toPublishPeriod(input.publishFrom, input.publishUntil, now);
  const file = await processPrAssetFile(Buffer.from(await input.file.arrayBuffer()));
  const id = randomUUID();
  const at = Timestamp.fromDate(now);

  //読む側と同じスキーマで確かめてから書く。通らない形で書くと、一覧から外れるだけで気づけないため
  const asset: PrAsset = PrAssetSchema.parse({
    id,
    status: "pending",
    tag: input.tag,
    title: input.title,
    description: input.description,
    contentType: file.contentType,
    size: file.size,
    ...period,
    createdAt: at,
    submittedBy: { uid: user.uid, email: user.email },
    consent: { version: input.consentVersion, agreedAt: at },
  });

  //ファイルを先に置く。ドキュメントだけがあってファイルが無いと、承認のときにコピーできないため
  await savePrivatePrAssetFile(id, file.data, file.contentType);
  try {
    await createPrAsset(asset);
  } catch (err) {
    //どのドキュメントからも指されないファイルを残さないよう、消してから失敗を返す
    await deletePrivatePrAssetFile(id).catch(deleteErr =>
      console.error(`Failed to delete the private file of prAssets/${id}:`, deleteErr));
    throw err;
  }
  return { id, status: "pending" };
};
