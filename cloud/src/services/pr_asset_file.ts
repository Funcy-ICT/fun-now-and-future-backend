import sharp from "sharp";
import { PR_ASSET_CONTENT_TYPES } from "../schema/pr_asset";

type PrAssetContentType = (typeof PR_ASSET_CONTENT_TYPES)[number];

// 読めない画像か、JPEGとPNG以外のときに投げる。投稿のエンドポイントで400にする
export class InvalidPrAssetFileError extends Error {}

const FORMAT_TO_CONTENT_TYPE: Partial<Record<string, PrAssetContentType>> = {
  jpeg: "image/jpeg",
  png: "image/png",
};

export type ProcessedPrAssetFile = {
  data: Buffer;
  contentType: PrAssetContentType;
  size: number;
};

// ブラウザが付けた種類は偽れるので、中身から判定する。
// スマホの写真には撮った場所の座標がEXIFに残っていることがあるので、メタデータを消して書き出す。
// メタデータを消すと向き(Orientation)も消えるので、先にrotate()で画素に当てる
export const processPrAssetFile = async (input: Buffer): Promise<ProcessedPrAssetFile> => {
  try {
    const { format } = await sharp(input).metadata();
    const contentType = format === undefined ? undefined : FORMAT_TO_CONTENT_TYPE[format];
    if (contentType === undefined) {
      throw new InvalidPrAssetFileError(`unsupported image format: ${format}`);
    }

    //sharpは、withMetadata()などを呼ばなければ、EXIFもICCも書き出さない
    const image = sharp(input).rotate();
    const data = contentType === "image/jpeg"
      ? await image.jpeg({ quality: 90 }).toBuffer()
      : await image.png().toBuffer();
    return { data, contentType, size: data.length };
  } catch (err) {
    if (err instanceof InvalidPrAssetFileError) throw err;
    //途中で切れたファイルなどは、metadata()が通ってもtoBuffer()で失敗する
    throw new InvalidPrAssetFileError("file is not a readable image");
  }
};
