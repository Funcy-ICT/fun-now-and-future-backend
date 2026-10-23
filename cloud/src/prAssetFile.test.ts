import sharp from "sharp";
import { InvalidPrAssetFileError, processPrAssetFile } from "./services/pr_asset_file";

const blank = (width: number, height: number) =>
	sharp({ create: { width, height, channels: 3, background: "#3366cc" } });

describe("processPrAssetFile", () => {
	test("GPSの入ったJPEGから、EXIFが消える", async () => {
		const input = await blank(40, 20)
			.jpeg()
			.withExif({ IFD3: { GPSLatitudeRef: "N", GPSLatitude: "41/1 50/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "140/1 46/1 0/1" } })
			.toBuffer();
		expect((await sharp(input).metadata()).exif).toBeDefined();

		const result = await processPrAssetFile(input);

		expect(result.contentType).toBe("image/jpeg");
		expect((await sharp(result.data).metadata()).exif).toBeUndefined();
		expect(result.size).toBe(result.data.length);
	});

	test("向き(Orientation)が画素に当たり、見た目の向きが保たれる", async () => {
		//横40, 縦20の画像に、時計回りに90度回して表示する指定(6)を付ける
		const input = await blank(40, 20).jpeg().withMetadata({ orientation: 6 }).toBuffer();

		const result = await processPrAssetFile(input);
		const meta = await sharp(result.data).metadata();

		expect(meta.width).toBe(20);
		expect(meta.height).toBe(40);
		expect(meta.orientation).toBeUndefined();
	});

	test("PNGはPNGのまま書き出す", async () => {
		const input = await blank(10, 10).png().toBuffer();

		const result = await processPrAssetFile(input);

		expect(result.contentType).toBe("image/png");
		expect((await sharp(result.data).metadata()).format).toBe("png");
	});

	test("中身がJPEGとPNG以外の画像は弾く", async () => {
		//拡張子やContent-Typeをjpegと偽っても、中身はwebp
		const input = await blank(10, 10).webp().toBuffer();

		await expect(processPrAssetFile(input)).rejects.toThrow(InvalidPrAssetFileError);
	});

	test("画像でないファイルは弾く", async () => {
		await expect(processPrAssetFile(Buffer.from("not an image"))).rejects.toThrow(InvalidPrAssetFileError);
	});

	test("途中で切れたJPEGは弾く", async () => {
		const input = await blank(200, 200).jpeg().toBuffer();

		await expect(processPrAssetFile(input.subarray(0, 200))).rejects.toThrow(InvalidPrAssetFileError);
	});
});
